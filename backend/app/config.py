import os
import logging
from typing import List, Union, Any, Dict
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from .secrets.base import BaseSecretProvider
from .secrets.providers import SecretManager

logger = logging.getLogger("agentguard.config")


class Settings(BaseSettings):
    """
    Robust enterprise configuration for AgentGuard.
    Built with Pydantic V2 & pydantic-settings.
    Supports environment variables, .env files, and external Secret Managers
    (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Core Application Metadata
    APP_NAME: str = "AgentGuard"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: Union[List[str], str] = ["*"]

    # SQLite Database Path
    SQLITE_DB_PATH: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agentguard.db"
    )

    # Secret Provider Architecture ('env', 'vault', 'aws', 'gcp')
    SECRET_PROVIDER: str = "env"

    # Vault Settings (used if SECRET_PROVIDER == 'vault')
    VAULT_ADDR: str = ""
    VAULT_TOKEN: str = ""
    VAULT_PATH: str = "secret/data/agentguard"

    # AWS Secrets Manager Settings (used if SECRET_PROVIDER == 'aws')
    AWS_REGION: str = "us-east-1"
    AWS_SECRET_ID: str = "agentguard/production"

    # GCP Secret Manager Settings (used if SECRET_PROVIDER == 'gcp')
    GCP_PROJECT_ID: str = ""
    GCP_SECRET_PREFIX: str = "agentguard_"

    # Moss Credentials
    MOSS_PROJECT_ID: str = ""
    MOSS_PROJECT_KEY: str = ""
    MOSS_MOCK_FALLBACK: bool = True

    # Optional Secondary LLM Arbiter
    GEMINI_API_KEY: str = ""

    # Moss Index Names
    POLICY_INDEX_NAME: str = "agentguard-policies"
    INCIDENT_INDEX_NAME: str = "agentguard-incidents"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            parts = [part.strip() for part in v.split(",") if part.strip()]
            return parts if parts else ["*"]
        if isinstance(v, list):
            return v
        return ["*"]

    def model_post_init(self, __context: Any) -> None:
        """
        Dynamically query external Secret Manager if configured.
        """
        if self.SECRET_PROVIDER != "env":
            logger.info("Initializing external secret provider: %s", self.SECRET_PROVIDER)
            manager = SecretManager(
                provider_type=self.SECRET_PROVIDER,
                vault_config={
                    "vault_addr": self.VAULT_ADDR,
                    "vault_token": self.VAULT_TOKEN,
                    "vault_path": self.VAULT_PATH,
                },
                aws_config={
                    "secret_id": self.AWS_SECRET_ID,
                    "region_name": self.AWS_REGION,
                },
                gcp_config={
                    "project_id": self.GCP_PROJECT_ID,
                    "secret_prefix": self.GCP_SECRET_PREFIX,
                },
            )

            # Resolve sensitive keys if not already provided
            if not self.MOSS_PROJECT_ID:
                self.MOSS_PROJECT_ID = manager.get("MOSS_PROJECT_ID") or ""
            if not self.MOSS_PROJECT_KEY:
                self.MOSS_PROJECT_KEY = manager.get("MOSS_PROJECT_KEY") or ""
            if not self.GEMINI_API_KEY:
                self.GEMINI_API_KEY = manager.get("GEMINI_API_KEY") or ""

    def get_sanitized_config(self) -> Dict[str, Any]:
        """
        Returns a dictionary of configuration with sensitive secrets masked.
        Safe for diagnostics, health logs, and admin console telemetry.
        """
        return {
            "app_name": self.APP_NAME,
            "version": self.VERSION,
            "environment": self.ENVIRONMENT,
            "debug": self.DEBUG,
            "host": self.HOST,
            "port": self.PORT,
            "cors_origins": self.CORS_ORIGINS,
            "sqlite_db_path": self.SQLITE_DB_PATH,
            "secret_provider": self.SECRET_PROVIDER,
            "moss_project_id": self.MOSS_PROJECT_ID or "<not-configured>",
            "moss_project_key_masked": BaseSecretProvider.mask_secret(self.MOSS_PROJECT_KEY),
            "moss_mock_fallback": self.MOSS_MOCK_FALLBACK,
            "gemini_api_key_masked": BaseSecretProvider.mask_secret(self.GEMINI_API_KEY),
            "policy_index": self.POLICY_INDEX_NAME,
            "incident_index": self.INCIDENT_INDEX_NAME,
        }


settings = Settings()
