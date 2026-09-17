import json
import logging
import os
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List

from .base import BaseSecretProvider

logger = logging.getLogger("agentguard.secrets")


class EnvSecretProvider(BaseSecretProvider):
    """
    Reads secrets directly from system environment variables or .env file.
    Default provider for local development, CI pipelines, and container environments.
    """

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return os.getenv(key, default)


class VaultSecretProvider(BaseSecretProvider):
    """
    HashiCorp Vault Secret Provider.
    Retrieves credentials from Vault's KV Secrets Engine (v1 or v2) via HTTP REST API.
    Does not require external libraries (uses Python standard urllib).
    """

    def __init__(
        self,
        vault_addr: str,
        vault_token: str,
        vault_path: str = "secret/data/agentguard",
        timeout: float = 3.0,
    ):
        self.vault_addr = vault_addr.rstrip("/")
        self.vault_token = vault_token
        self.vault_path = vault_path.strip("/")
        self.timeout = timeout
        self._cache: Dict[str, str] = {}
        self._initialized: bool = False

    def _load_vault_data(self) -> None:
        if self._initialized:
            return

        if not self.vault_addr or not self.vault_token:
            logger.warning(
                "VaultSecretProvider: VAULT_ADDR or VAULT_TOKEN not configured. Skipping Vault lookup."
            )
            self._initialized = True
            return

        url = f"{self.vault_addr}/v1/{self.vault_path}"
        req = urllib.request.Request(
            url=url,
            headers={
                "X-Vault-Token": self.vault_token,
                "Content-Type": "application/json",
            },
            method="GET",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                if response.status == 200:
                    payload = json.loads(response.read().decode("utf-8"))
                    # Support KV v2 (data.data) and KV v1 (data)
                    data_obj = payload.get("data", {})
                    if isinstance(data_obj, dict) and "data" in data_obj and isinstance(data_obj["data"], dict):
                        self._cache = data_obj["data"]
                    elif isinstance(data_obj, dict):
                        self._cache = data_obj
                    logger.info("VaultSecretProvider: Successfully loaded secrets from %s", self.vault_path)
                else:
                    logger.warning("VaultSecretProvider: Received HTTP status %d from Vault", response.status)
        except urllib.error.HTTPError as e:
            logger.error("VaultSecretProvider: HTTP error connecting to Vault: %s %s", e.code, e.reason)
        except Exception as e:
            logger.error("VaultSecretProvider: Failed to load secrets from Vault: %s", str(e))
        finally:
            self._initialized = True

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        self._load_vault_data()
        if key in self._cache:
            return self._cache[key]
        # Fall back to env if key not found in Vault path
        return os.getenv(key, default)


class AWSSecretsManagerProvider(BaseSecretProvider):
    """
    AWS Secrets Manager Provider.
    Dynamically attempts boto3 client lookup. Falls back to environment variables.
    """

    def __init__(self, secret_id: str = "agentguard/production", region_name: str = "us-east-1"):
        self.secret_id = secret_id
        self.region_name = region_name
        self._cache: Dict[str, str] = {}
        self._initialized: bool = False

    def _load_aws_secrets(self) -> None:
        if self._initialized:
            return

        try:
            import boto3  # type: ignore
            client = boto3.client("secretsmanager", region_name=self.region_name)
            response = client.get_secret_value(SecretId=self.secret_id)
            if "SecretString" in response:
                self._cache = json.loads(response["SecretString"])
            logger.info("AWSSecretsManagerProvider: Successfully retrieved secrets for %s", self.secret_id)
        except ImportError:
            logger.debug("boto3 not installed; AWS Secrets Manager provider falling back to environment variables.")
        except Exception as e:
            logger.warning("AWSSecretsManagerProvider lookup failed: %s; falling back to environment.", str(e))
        finally:
            self._initialized = True

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        self._load_aws_secrets()
        if key in self._cache:
            return self._cache[key]
        return os.getenv(key, default)


class GCPSecretManagerProvider(BaseSecretProvider):
    """
    GCP Secret Manager Provider.
    Dynamically attempts google-cloud-secret-manager client lookup. Falls back to environment variables.
    """

    def __init__(self, project_id: str = "", secret_prefix: str = "agentguard_"):
        self.project_id = project_id
        self.secret_prefix = secret_prefix
        self._cache: Dict[str, str] = {}

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        if key in self._cache:
            return self._cache[key]

        if not self.project_id:
            return os.getenv(key, default)

        try:
            from google.cloud import secretmanager  # type: ignore
            client = secretmanager.SecretManagerServiceClient()
            name = f"projects/{self.project_id}/secrets/{self.secret_prefix}{key.lower()}/versions/latest"
            response = client.access_secret_version(request={"name": name})
            val = response.payload.data.decode("UTF-8")
            self._cache[key] = val
            return val
        except ImportError:
            logger.debug("google-cloud-secretmanager not installed; falling back to environment.")
        except Exception as e:
            logger.warning("GCPSecretManagerProvider lookup failed for %s: %s; falling back to env.", key, str(e))

        return os.getenv(key, default)


class SecretManager:
    """
    Centralized secret manager orchestrator.
    Manages provider lifecycle, caching, secret resolution, and diagnostic reporting.
    """

    def __init__(
        self,
        provider_type: str = "env",
        vault_config: Optional[Dict[str, Any]] = None,
        aws_config: Optional[Dict[str, Any]] = None,
        gcp_config: Optional[Dict[str, Any]] = None,
    ):
        self.provider_type = provider_type.lower().strip()
        vault_cfg = vault_config or {}
        aws_cfg = aws_config or {}
        gcp_cfg = gcp_config or {}

        if self.provider_type == "vault":
            self.provider: BaseSecretProvider = VaultSecretProvider(
                vault_addr=vault_cfg.get("vault_addr", os.getenv("VAULT_ADDR", "")),
                vault_token=vault_cfg.get("vault_token", os.getenv("VAULT_TOKEN", "")),
                vault_path=vault_cfg.get("vault_path", os.getenv("VAULT_PATH", "secret/data/agentguard")),
                timeout=float(vault_cfg.get("timeout", os.getenv("VAULT_TIMEOUT", "3.0"))),
            )
        elif self.provider_type == "aws":
            self.provider = AWSSecretsManagerProvider(
                secret_id=aws_cfg.get("secret_id", os.getenv("AWS_SECRET_ID", "agentguard/production")),
                region_name=aws_cfg.get("region_name", os.getenv("AWS_REGION", "us-east-1")),
            )
        elif self.provider_type == "gcp":
            self.provider = GCPSecretManagerProvider(
                project_id=gcp_cfg.get("project_id", os.getenv("GCP_PROJECT_ID", "")),
                secret_prefix=gcp_cfg.get("secret_prefix", os.getenv("GCP_SECRET_PREFIX", "agentguard_")),
            )
        else:
            self.provider = EnvSecretProvider()

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        val = self.provider.get_secret(key, default=default)
        if val is None or val == "":
            return default
        return val

    def resolve(self, keys: List[str]) -> Dict[str, Optional[str]]:
        return {k: self.get(k) for k in keys}

    def get_provider_info(self) -> Dict[str, str]:
        return {
            "provider_type": self.provider_type,
            "provider_class": self.provider.__class__.__name__,
        }
