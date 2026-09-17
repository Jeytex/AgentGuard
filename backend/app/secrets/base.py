from abc import ABC, abstractmethod
from typing import Optional


class BaseSecretProvider(ABC):
    """
    Abstract base class for secret management providers in AgentGuard.
    Standardizes retrieval of sensitive credentials (Moss keys, LLM keys, etc.)
    across local environment, HashiCorp Vault, AWS Secrets Manager, and GCP Secret Manager.
    """

    @abstractmethod
    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """
        Retrieve secret value for the specified key.
        """
        pass

    @staticmethod
    def mask_secret(value: Optional[str]) -> str:
        """
        Safely mask a secret for logging and diagnostic displays.
        Example: 'moss_proj_123456789' -> 'mos...789'
        """
        if not value:
            return "<not-set>"
        val_str = str(value)
        if len(val_str) <= 6:
            return "***"
        return f"{val_str[:3]}...{val_str[-3:]}"
