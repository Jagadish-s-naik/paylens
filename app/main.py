"""
app/main.py
Paylens FastAPI Application Assembly.
Strictly implements ARCHITECTURE.md §7 & §14 and PLAN.md Sub-stage A.3.
"""

import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.api.errors import (
    PaylensAPIException,
    make_error_envelope,
    paylens_exception_handler,
    validation_exception_handler,
    http_exception_handler,
    generic_exception_handler,
)
from app.api.routes_afford import router as afford_router
from app.api.routes_profile import router as profile_router
from app.api.routes_listing import router as listing_router
from app.api.routes_legacy import router as legacy_router

app = FastAPI(
    title="Paylens API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------
# 1. CORS CONFIGURATION (§7.4)
# ---------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------
# 2. REQUEST SIZE LIMITER MIDDLEWARE (6 MB Cap per §7.2)
# ---------------------------------------------------------------------
MAX_BODY_SIZE = 6 * 1024 * 1024


@app.middleware("http")
async def enforce_payload_size_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE:
        return JSONResponse(
            status_code=400,
            content=make_error_envelope(
                code="FILE_TOO_LARGE",
                message="Request payload exceeds 6 MB limit.",
                details={"max_bytes": MAX_BODY_SIZE},
            ),
        )
    return await call_next(request)


# ---------------------------------------------------------------------
# 3. EXCEPTION HANDLERS (§7.3)
# ---------------------------------------------------------------------
app.add_exception_handler(PaylensAPIException, paylens_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)


# ---------------------------------------------------------------------
# ---------------------------------------------------------------------
# 4. STATIC DIRECTORY SETUP & ROOT
# ---------------------------------------------------------------------
root_path = Path(__file__).resolve().parent.parent
mock_shop_dir = root_path / "mock-shop"
static_dir = root_path / "static"


# ---------------------------------------------------------------------
# 5. HEALTH ROUTE (§7.1)
# ---------------------------------------------------------------------
@app.get("/api/health", tags=["System"])
@app.get("/health", tags=["System"], include_in_schema=False)
async def health_check():
    ai_available = (settings.PAYLENS_OFFLINE == 0) and bool(
        settings.GEMINI_API_KEY or settings.GOOGLE_CLOUD_PROJECT
    )
    return {
        "status": "ok",
        "version": "1.0.0",
        "ai_available": ai_available,
    }


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_root():
    """Serves the Paylens web interface or documentation landing."""
    static_index = static_dir / "index.html"
    if static_index.is_file():
        return HTMLResponse(content=static_index.read_text(encoding="utf-8"))
    return HTMLResponse(
        content="""
        <!DOCTYPE html>
        <html>
            <head><title>Paylens API</title></head>
            <body style="font-family: system-ui, sans-serif; text-align: center; padding: 60px;">
                <h1>Paylens Affordability Copilot API</h1>
                <p>The backend service is healthy and operational.</p>
                <p><a href="/docs">View Interactive Swagger Docs (/docs)</a> &bull; <a href="/api/health">Health (/api/health)</a></p>
            </body>
        </html>
        """
    )


# ---------------------------------------------------------------------
# 6. ROUTE REGISTRATION
# ---------------------------------------------------------------------
app.include_router(afford_router)
app.include_router(profile_router)
app.include_router(listing_router)
app.include_router(legacy_router)

# ---------------------------------------------------------------------
# 7. STATIC MOUNTS (Graceful for mock-shop & demo)
# ---------------------------------------------------------------------
if mock_shop_dir.is_dir():
    app.mount("/mock-shop", StaticFiles(directory=str(mock_shop_dir), html=True), name="mock-shop")

if static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

