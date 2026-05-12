from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # ─────────────────────────────
    # DATABASE
    # ─────────────────────────────
    DATABASE_URL: str
    SQL_ECHO: bool = False

    # ─────────────────────────────
    # JWT
    # ─────────────────────────────
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─────────────────────────────
    # FRONTEND URLS (CORS)
    # ─────────────────────────────
    FRONTEND_PME_URL: str
    FRONTEND_DOC_TRACKING_URL: Optional[str] = None
    FRONTEND_CLEARANCE_URL: Optional[str] = None

    # ─────────────────────────────
    # EXTERNAL SERVICES
    # ─────────────────────────────
    DOCUMENT_TRACKING_API_BASE_URL: Optional[str] = None
    DOCUMENT_TRACKING_API_KEY: Optional[str] = None

    LOCATIONAL_CLEARANCE_API_BASE_URL: Optional[str] = None
    LOCATIONAL_CLEARANCE_API_KEY: Optional[str] = None

    EXTERNAL_API_TIMEOUT_SECONDS: int = 10

    class Config:
        env_file = ".env"


settings = Settings()