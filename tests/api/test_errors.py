"""
tests/api/test_errors.py
Unit tests for API Error Envelope, Custom Exceptions, and Rate Limiting Dependencies.
"""

import uuid
import pytest
from starlette.requests import Request
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from fastapi.exceptions import RequestValidationError

from app.api.errors import (
    PaylensAPIException,
    ValidationException,
    OptionNotFoundException,
    MissingInstallIdException,
    RateLimitedException,
    AIUnavailableException,
    paylens_exception_handler,
    validation_exception_handler,
    generic_exception_handler,
    make_error_envelope,
)
from app.api.deps import (
    require_install_id,
    optional_install_id,
    check_ai_rate_limit,
    reset_rate_limits,
)
from app.config import settings


@pytest.fixture(autouse=True)
def clean_rate_limits():
    reset_rate_limits()
    yield
    reset_rate_limits()


def create_test_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(PaylensAPIException, paylens_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    @app.get("/test/option/{option_id}")
    def test_option(option_id: str):
        if option_id == "missing":
            raise OptionNotFoundException(option_id)
        return {"status": "ok", "option_id": option_id}

    @app.get("/test/validation")
    def test_validation():
        raise ValidationException("Conflicting cash price figures.", {"field": "effective_cash_price"})

    @app.get("/test/ai-route")
    def test_ai_route(install_id: str = Depends(check_ai_rate_limit)):
        return {"status": "ok", "install_id": install_id}

    @app.get("/test/crash")
    def test_crash():
        raise RuntimeError("Secret internal database password or stack trace")

    return app


def test_make_error_envelope_structure():
    env = make_error_envelope("VALIDATION", "Invalid input", {"field": "rent"})
    assert "error" in env
    assert env["error"]["code"] == "VALIDATION"
    assert env["error"]["message"] == "Invalid input"
    assert env["error"]["details"]["field"] == "rent"


def test_option_not_found_envelope():
    client = TestClient(create_test_app())
    res = client.get("/test/option/missing")
    assert res.status_code == 404
    data = res.json()
    assert data["error"]["code"] == "OPTION_NOT_FOUND"
    assert data["error"]["details"]["selected_option_id"] == "missing"


def test_validation_error_envelope():
    client = TestClient(create_test_app())
    res = client.get("/test/validation")
    assert res.status_code == 422
    data = res.json()
    assert data["error"]["code"] == "VALIDATION"
    assert data["error"]["details"]["field"] == "effective_cash_price"


def test_generic_exception_hides_stack_trace():
    client = TestClient(create_test_app(), raise_server_exceptions=False)
    res = client.get("/test/crash")
    assert res.status_code == 500
    data = res.json()
    assert data["error"]["code"] == "INTERNAL"
    assert "Secret internal" not in data["error"]["message"]
    assert "stack" not in str(data)


def test_missing_install_id_header():
    client = TestClient(create_test_app())
    # No X-Install-Id header
    res = client.get("/test/ai-route")
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "MISSING_INSTALL_ID"

    # Malformed non-UUID header
    res = client.get("/test/ai-route", headers={"X-Install-Id": "not-a-uuid"})
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "MISSING_INSTALL_ID"


def test_valid_install_id_passes():
    client = TestClient(create_test_app())
    valid_id = str(uuid.uuid4())
    res = client.get("/test/ai-route", headers={"X-Install-Id": valid_id})
    assert res.status_code == 200
    assert res.json()["install_id"] == valid_id


def test_sliding_window_rate_limiting():
    client = TestClient(create_test_app())
    valid_id = str(uuid.uuid4())
    headers = {"X-Install-Id": valid_id}

    # Consume up to RATE_LIMIT_PER_HOUR
    for _ in range(settings.RATE_LIMIT_PER_HOUR):
        res = client.get("/test/ai-route", headers=headers)
        assert res.status_code == 200

    # Next call exceeds rate limit
    res = client.get("/test/ai-route", headers=headers)
    assert res.status_code == 429
    data = res.json()
    assert data["error"]["code"] == "RATE_LIMITED"
    assert "Retry-After" in res.headers
    assert int(res.headers["Retry-After"]) > 0


def test_daily_global_cap():
    client = TestClient(create_test_app())
    headers = {"X-Install-Id": str(uuid.uuid4())}

    # Set daily count to cap
    from app.api.deps import _daily_ai_counter
    _daily_ai_counter["count"] = settings.GEMINI_DAILY_CAP

    res = client.get("/test/ai-route", headers=headers)
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "RATE_LIMITED"
    assert "daily" in res.json()["error"]["message"].lower()
