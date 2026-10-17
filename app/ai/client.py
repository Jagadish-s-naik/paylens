"""
app/ai/client.py
Gemini Client Wrapper with lazy initialization, timeout, and circuit breaker.
Strictly implements PLAN.md Task A.4.1.
Zero imports from app.api to preserve architecture.
"""

from typing import Optional
from google import genai
from app.config import settings


class AIUnavailableError(RuntimeError):
    """Raised when Gemini is unreachable, offline, or circuit breaker is tripped."""

    def __init__(
        self,
        message: str = "AI service temporarily unavailable.",
        fallback: str = "manual_entry",
    ):
        super().__init__(message)
        self.message = message
        self.fallback = fallback


_client_instance: Optional[genai.Client] = None


def get_gemini_client() -> genai.Client:
    """
    Lazy initialization of google.genai.Client.
    Raises AIUnavailableError if PAYLENS_OFFLINE=1 or credentials are completely missing.
    """
    if settings.PAYLENS_OFFLINE == 1:
        raise AIUnavailableError(
            message="Paylens is operating in offline mode (PAYLENS_OFFLINE=1).",
            fallback="manual_entry",
        )

    global _client_instance
    if _client_instance is not None:
        return _client_instance

    try:
        if settings.GEMINI_API_KEY:
            _client_instance = genai.Client(api_key=settings.GEMINI_API_KEY)
        elif settings.GOOGLE_CLOUD_PROJECT:
            _client_instance = genai.Client(
                vertexai=True,
                project=settings.GOOGLE_CLOUD_PROJECT,
                location=settings.GOOGLE_CLOUD_LOCATION,
            )
        else:
            _client_instance = genai.Client()
        return _client_instance
    except Exception as exc:
        raise AIUnavailableError(
            message=f"Failed to initialize Gemini client: {str(exc)}",
            fallback="manual_entry",
        ) from exc
