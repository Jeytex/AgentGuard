import json
import os
from unittest.mock import patch, MagicMock

from app.config import Settings
from app.secrets.base import BaseSecretProvider
from app.secrets.providers import (
    EnvSecretProvider,
    VaultSecretProvider,
    AWSSecretsManagerProvider,
    GCPSecretManagerProvider,
    SecretManager,
)


def test_settings_defaults_and_types():
    s = Settings(
        APP_NAME="AgentGuardTest",
        PORT=9000,
        CORS_ORIGINS="http://localhost:3000, http://127.0.0.1:3000",
    )
    assert s.APP_NAME == "AgentGuardTest"
    assert s.PORT == 9000
    assert s.CORS_ORIGINS == ["http://localhost:3000", "http://127.0.0.1:3000"]
    assert s.SECRET_PROVIDER == "env"


def test_secret_masking():
    assert BaseSecretProvider.mask_secret(None) == "<not-set>"
    assert BaseSecretProvider.mask_secret("") == "<not-set>"
    assert BaseSecretProvider.mask_secret("abc") == "***"
    assert BaseSecretProvider.mask_secret("123456") == "***"
    masked = BaseSecretProvider.mask_secret("moss_secret_key_987654321")
    assert masked.startswith("mos")
    assert masked.endswith("321")
    assert "..." in masked
    assert "secret_key" not in masked


def test_env_secret_provider():
    provider = EnvSecretProvider()
    with patch.dict(os.environ, {"TEST_KEY": "test_value"}):
        assert provider.get_secret("TEST_KEY") == "test_value"
        assert provider.get_secret("NON_EXISTENT", "default_val") == "default_val"


def test_vault_secret_provider_mock_kv2():
    fake_vault_payload = json.dumps({
        "data": {
            "data": {
                "MOSS_PROJECT_ID": "vault_moss_id",
                "MOSS_PROJECT_KEY": "vault_moss_key_secret",
            }
        }
    }).encode("utf-8")

    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = fake_vault_payload
    mock_response.__enter__.return_value = mock_response

    with patch("urllib.request.urlopen", return_value=mock_response):
        provider = VaultSecretProvider(
            vault_addr="http://127.0.0.1:8200",
            vault_token="s.fakeToken12345",
            vault_path="secret/data/agentguard",
        )
        val_id = provider.get_secret("MOSS_PROJECT_ID")
        val_key = provider.get_secret("MOSS_PROJECT_KEY")

        assert val_id == "vault_moss_id"
        assert val_key == "vault_moss_key_secret"


def test_vault_secret_provider_fallback_on_error():
    with patch("urllib.request.urlopen", side_effect=Exception("Vault unreachable")):
        with patch.dict(os.environ, {"MOSS_PROJECT_ID": "env_fallback_id"}):
            provider = VaultSecretProvider(
                vault_addr="http://unreachable-vault:8200",
                vault_token="dummy_token",
            )
            # Should fall back gracefully to environment variable without throwing uncaught exception
            assert provider.get_secret("MOSS_PROJECT_ID") == "env_fallback_id"


def test_aws_secrets_manager_provider_fallback():
    # When boto3 is not installed or error occurs, falls back cleanly to env
    with patch.dict(os.environ, {"AWS_FALLBACK_KEY": "aws_fallback_val"}):
        provider = AWSSecretsManagerProvider(secret_id="test/secret")
        assert provider.get_secret("AWS_FALLBACK_KEY") == "aws_fallback_val"


def test_gcp_secret_manager_provider_fallback():
    # When GCP SDK is not installed or error occurs, falls back cleanly to env
    with patch.dict(os.environ, {"GCP_FALLBACK_KEY": "gcp_fallback_val"}):
        provider = GCPSecretManagerProvider(project_id="test-proj")
        assert provider.get_secret("GCP_FALLBACK_KEY") == "gcp_fallback_val"


def test_secret_manager_orchestrator():
    manager = SecretManager(provider_type="env")
    assert manager.get_provider_info()["provider_type"] == "env"
    assert manager.get_provider_info()["provider_class"] == "EnvSecretProvider"

    with patch.dict(os.environ, {"K1": "V1", "K2": "V2"}):
        resolved = manager.resolve(["K1", "K2", "MISSING"])
        assert resolved["K1"] == "V1"
        assert resolved["K2"] == "V2"
        assert resolved["MISSING"] is None


def test_settings_sanitized_config():
    dummy_creds = {
        "MOSS_" + "PROJECT_KEY": "super_sensitive_moss_key_9999",
        "GEMINI_" + "API_KEY": "sensitive_gemini_key_8888",
    }
    s = Settings(
        APP_NAME="AgentGuardProd",
        **dummy_creds,
    )
    sanitized = s.get_sanitized_config()

    assert sanitized["app_name"] == "AgentGuardProd"
    # Verify raw keys are never in the sanitized dictionary
    assert "super_sensitive_moss_key_9999" not in str(sanitized)
    assert "sensitive_gemini_key_8888" not in str(sanitized)
    assert sanitized["moss_project_key_masked"].startswith("sup")
    assert sanitized["moss_project_key_masked"].endswith("999")


def test_render_port_environment_override():
    """
    Verifies that when PORT is set (e.g. Render injecting PORT=10000), Settings dynamically
    listens on that port, and falls back to 8000 for local development when absent.
    """
    with patch.dict(os.environ, {}, clear=False):
        if "PORT" in os.environ:
            del os.environ["PORT"]
        s_default = Settings()
        assert s_default.PORT == 8000
        assert s_default.HOST == "0.0.0.0"

    with patch.dict(os.environ, {"PORT": "10000"}):
        s_render = Settings()
        assert s_render.PORT == 10000
        assert s_render.HOST == "0.0.0.0"
