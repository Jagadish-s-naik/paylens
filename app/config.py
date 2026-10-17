import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_ID: str = os.getenv("GCP_PROJECT", os.getenv("GOOGLE_CLOUD_PROJECT", "paylens-fintech"))
    REGION: str = os.getenv("GCP_REGION", "asia-south1")
    VERTEX_LOCATION: str = os.getenv("VERTEX_LOCATION", "us-central1")
    AI_BACKEND: str = os.getenv("AI_BACKEND", "vertex")  # "vertex" or "aistudio"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # Guardrails & Budgets
    MAX_UPLOAD_SIZE_BYTES: int = 5 * 1024 * 1024
    MAX_EXPLANATION_TOKENS: int = 2048
    MAX_EXTRACTION_TOKENS: int = 2048
    RATE_LIMIT_PER_HOUR: int = 20
    DAILY_GEMINI_CALL_LIMIT: int = 300

    # Affordability Engine Thresholds
    SAFE_FOIR_MAX: float = 0.35
    STRETCH_FOIR_MAX: float = 0.50
    SAFE_FREE_CASH_RATIO: float = 0.20
    STRETCH_FREE_CASH_RATIO: float = 0.05
    EMERGENCY_CUSHION_MONTHS: float = 3.0
    MIN_RUNWAY_STRETCH: float = 2.0
    HIGH_APR_THRESHOLD: float = 18.0
    SIGNIFICANT_MARKUP_RUPEES: float = 1500.0

settings = Settings()
