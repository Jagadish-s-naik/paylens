"""
app/config.py
System-wide configuration matching ARCHITECTURE.md §13.
"""

import os
from typing import List
from pydantic import BaseModel, Field


class Settings(BaseModel):
    # Gemini & Google Cloud
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    GOOGLE_CLOUD_PROJECT: str = os.getenv(
        "GOOGLE_CLOUD_PROJECT",
        os.getenv("GCP_PROJECT", "paylens-fintech"),
    )
    GOOGLE_CLOUD_LOCATION: str = os.getenv(
        "GOOGLE_CLOUD_LOCATION",
        os.getenv("GCP_REGION", "asia-south1"),
    )
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Mode & Fallback
    PAYLENS_OFFLINE: int = int(os.getenv("PAYLENS_OFFLINE", "0"))

    # Security & Rate Limiting (AI routes)
    RATE_LIMIT_PER_HOUR: int = int(os.getenv("RATE_LIMIT_PER_HOUR", "20"))
    GEMINI_DAILY_CAP: int = int(os.getenv("GEMINI_DAILY_CAP", "300"))
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "5"))

    # CORS
    CORS_ORIGINS_RAW: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000,chrome-extension://*",
    )

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


settings = Settings()
