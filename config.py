import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_ID: str = os.getenv("GCP_PROJECT", os.getenv("GOOGLE_CLOUD_PROJECT", "paylens-fintech"))
    REGION: str = os.getenv("GCP_REGION", "asia-south1")
    VERTEX_LOCATION: str = os.getenv("VERTEX_LOCATION", "us-central1")
    AI_BACKEND: str = os.getenv("AI_BACKEND", "vertex")  # "vertex" or "aistudio"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    
    # Cost & Rate Limits (Rs 0 Free Tier Guardrails)
    MAX_UPLOAD_SIZE_BYTES: int = 5 * 1024 * 1024  # 5MB max file
    MAX_EXPLANATION_TOKENS: int = 2048            # Accommodates reasoning + 5 localized bullets
    MAX_EXTRACTION_TOKENS: int = 2048             # Accommodates reasoning + structured JSON
    RATE_LIMIT_PER_HOUR: int = 20                 # IP rate limit
    DAILY_GEMINI_CALL_LIMIT: int = 300            # Daily circuit breaker

settings = Settings()
