"""
app/api/deps.py
FastAPI Dependencies for Install-ID Validation and In-Memory Rate Limiting.
Strictly implements ARCHITECTURE.md §7.2 and PLAN.md Task A.1.3.
"""

import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import Request

from app.config import settings
from app.api.errors import MissingInstallIdException, RateLimitedException


# In-memory sliding-window state
_install_request_timestamps: Dict[str, List[float]] = defaultdict(list)
_daily_ai_counter: Dict[str, Any] = {
    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    "count": 0,
}


def reset_rate_limits() -> None:
    """Reset rate limiter state (used in testing)."""
    _install_request_timestamps.clear()
    _daily_ai_counter["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    _daily_ai_counter["count"] = 0


def require_install_id(request: Request) -> str:
    """
    Enforces that X-Install-Id is present and is a valid UUID on AI routes.
    Missing or invalid -> 400 MISSING_INSTALL_ID. Never falls back to IP.
    """
    header_val = request.headers.get("x-install-id")
    if not header_val:
        raise MissingInstallIdException("Missing required X-Install-Id header.")
    try:
        parsed = uuid.UUID(header_val.strip())
        return str(parsed)
    except (ValueError, AttributeError):
        raise MissingInstallIdException("Invalid X-Install-Id header format; must be a valid UUID.")


def optional_install_id(request: Request) -> Optional[str]:
    """Retrieves X-Install-Id for telemetry/logging on non-AI routes."""
    header_val = request.headers.get("x-install-id")
    if not header_val:
        return None
    try:
        return str(uuid.UUID(header_val.strip()))
    except (ValueError, AttributeError):
        return None


def check_ai_rate_limit(request: Request) -> str:
    """
    FastAPI dependency for AI routes:
    1. Validates and extracts X-Install-Id.
    2. Enforces global daily Gemini circuit breaker cap.
    3. Enforces sliding-window 20 req/hour limit per install ID.
    """
    install_id = require_install_id(request)
    now = time.time()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Global daily circuit breaker check
    if _daily_ai_counter["date"] != today_str:
        _daily_ai_counter["date"] = today_str
        _daily_ai_counter["count"] = 0

    if _daily_ai_counter["count"] >= settings.GEMINI_DAILY_CAP:
        raise RateLimitedException(
            message="Global daily AI budget cap exceeded. System is in conservation mode.",
            retry_after=3600,
        )

    # Hourly sliding window per install ID
    history = _install_request_timestamps[install_id]
    recent = [ts for ts in history if now - ts < 3600]

    if len(recent) >= settings.RATE_LIMIT_PER_HOUR:
        oldest = min(recent)
        retry_after = max(1, int(3600 - (now - oldest)))
        raise RateLimitedException(
            message=f"Rate limit exceeded: maximum {settings.RATE_LIMIT_PER_HOUR} AI requests per hour.",
            retry_after=retry_after,
        )

    recent.append(now)
    _install_request_timestamps[install_id] = recent
    _daily_ai_counter["count"] += 1

    return install_id
