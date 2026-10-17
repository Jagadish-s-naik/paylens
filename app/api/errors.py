"""
app/api/errors.py
Standardized API Error Envelope and Custom Exceptions.
Strictly implements ARCHITECTURE.md §7.3.
"""

from typing import Any, Dict, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


def make_error_envelope(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generates the canonical Paylens error response envelope."""
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details if details is not None else {},
        }
    }


class PaylensAPIException(Exception):
    """Base exception for all domain and API errors."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.headers = headers or {}


class ValidationException(PaylensAPIException):
    """422 Validation error: conflicting or invalid payload figures."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            code="VALIDATION",
            message=message,
            status_code=422,
            details=details,
        )


class UnsupportedSchemaException(PaylensAPIException):
    """422 Unsupported schema version or format."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            code="UNSUPPORTED_SCHEMA",
            message=message,
            status_code=422,
            details=details,
        )


class OptionNotFoundException(PaylensAPIException):
    """404 Payment option not found in listing payment options."""

    def __init__(self, option_id: str, message: Optional[str] = None):
        super().__init__(
            code="OPTION_NOT_FOUND",
            message=message or f"Payment option '{option_id}' was not found in listing payment options.",
            status_code=404,
            details={"selected_option_id": option_id},
        )


class MissingInstallIdException(PaylensAPIException):
    """400 Required X-Install-Id header is missing or malformed on AI routes."""

    def __init__(self, message: str = "Missing or invalid X-Install-Id header on AI route."):
        super().__init__(
            code="MISSING_INSTALL_ID",
            message=message,
            status_code=400,
            details={"header": "X-Install-Id"},
        )


class FileTooLargeException(PaylensAPIException):
    """400 Uploaded payslip exceeds file size limit."""

    def __init__(self, message: str = "Uploaded file exceeds maximum allowed size.", max_mb: int = 5):
        super().__init__(
            code="FILE_TOO_LARGE",
            message=message,
            status_code=400,
            details={"max_mb": max_mb},
        )


class UnsupportedFileException(PaylensAPIException):
    """400 Uploaded payslip format is not supported."""

    def __init__(self, message: str = "Unsupported file type. Supported formats: PDF, PNG, JPG."):
        super().__init__(
            code="UNSUPPORTED_FILE",
            message=message,
            status_code=400,
            details={"allowed_formats": ["pdf", "png", "jpg", "jpeg"]},
        )


class RateLimitedException(PaylensAPIException):
    """429 Rate limit exceeded for install ID or global budget."""

    def __init__(self, message: str = "Rate limit exceeded.", retry_after: int = 60):
        super().__init__(
            code="RATE_LIMITED",
            message=message,
            status_code=429,
            details={"retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


class AIUnavailableException(PaylensAPIException):
    """503 AI service unavailable or offline mode enabled."""

    def __init__(
        self,
        message: str = "AI service temporarily unavailable.",
        fallback: str = "manual_entry",
    ):
        super().__init__(
            code="AI_UNAVAILABLE",
            message=message,
            status_code=503,
            details={"fallback": fallback},
        )


# =====================================================================
# FASTAPI EXCEPTION HANDLERS
# =====================================================================

async def paylens_exception_handler(_request: Request, exc: PaylensAPIException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=make_error_envelope(exc.code, exc.message, exc.details),
        headers=exc.headers,
    )


async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Extract first error field if available for details
    errors = exc.errors()
    first_field = ""
    if errors and "loc" in errors[0]:
        first_field = ".".join(str(part) for part in errors[0]["loc"] if part != "body")
    message = errors[0].get("msg", "Validation error") if errors else "Validation error"

    return JSONResponse(
        status_code=422,
        content=make_error_envelope(
            code="VALIDATION",
            message=message,
            details={"field": first_field, "errors": errors},
        ),
    )


async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code_map = {
        400: "BAD_REQUEST",
        404: "NOT_FOUND",
        422: "VALIDATION",
        429: "RATE_LIMITED",
        503: "SERVICE_UNAVAILABLE",
    }
    code = code_map.get(exc.status_code, "HTTP_ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content=make_error_envelope(
            code=code,
            message=str(exc.detail),
            details={},
        ),
    )


async def generic_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    # Never leak stack traces in response per ARCHITECTURE.md §7.3
    return JSONResponse(
        status_code=500,
        content=make_error_envelope(
            code="INTERNAL",
            message="An unexpected internal server error occurred.",
            details={},
        ),
    )
