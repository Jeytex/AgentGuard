import os
from typing import Optional, List
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME: str = "AgentGuard"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")

    # Moss Credentials
    MOSS_PROJECT_ID: str = os.getenv("MOSS_PROJECT_ID", "")
    MOSS_PROJECT_KEY: str = os.getenv("MOSS_PROJECT_KEY", "")
    MOSS_MOCK_FALLBACK: bool = os.getenv("MOSS_MOCK_FALLBACK", "true").lower() in ("true", "1", "yes")

    # Optional LLM Arbiter
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Server Settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    CORS_ORIGINS: List[str] = ["*"]

    # SQLite Database Path
    SQLITE_DB_PATH: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agentguard.db"
    )

    # Moss Indexes
    POLICY_INDEX_NAME: str = "agentguard-policies"
    INCIDENT_INDEX_NAME: str = "agentguard-incidents"


settings = Settings()
