"""
tests/api/test_routes_profile.py
Unit and integration tests for /api/profile/build route under offline and fallback modes.
"""

import io
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings

client = TestClient(app)


@pytest.fixture(autouse=True)
def set_offline_mode(monkeypatch):
    monkeypatch.setattr(settings, "PAYLENS_OFFLINE", 1)


def test_build_profile_success_offline():
    install_id = str(uuid.uuid4())
    fake_pdf = io.BytesIO(b"%PDF-1.4 Mock PDF content for payslip test")

    response = client.post(
        "/api/profile/build",
        headers={"X-Install-Id": install_id},
        files={"file": ("sample_1_demo_user.pdf", fake_pdf, "application/pdf")},
        data={
            "tax_regime": "NEW",
            "rent_monthly": 15000.0,
            "current_savings": 100000.0,
            "is_metro": "true",
            "annual_variable_bonus": "50000.0",
            "language_pref": "en",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "profile" in data
    assert "extraction" in data
    assert "validation" in data

    profile = data["profile"]
    assert profile["gross_monthly"] == 80000.0
    assert profile["in_hand_verified"] == 72000.0
    assert profile["rent_monthly"] == 15000.0
    assert profile["current_savings"] == 100000.0
    assert profile["essentials_monthly"] == 15000.0 + (72000.0 * 0.30)
    assert profile["free_cash_monthly"] == 72000.0 - profile["essentials_monthly"]
    assert "passed" in data["validation"]
    assert "health_score" in data["validation"]
    assert data["validation"]["health_score"] > 0


def test_build_profile_missing_install_id():
    fake_pdf = io.BytesIO(b"%PDF-1.4 Mock PDF content")
    response = client.post(
        "/api/profile/build",
        files={"file": ("payslip.pdf", fake_pdf, "application/pdf")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "MISSING_INSTALL_ID"


def test_build_profile_unsupported_file_format():
    install_id = str(uuid.uuid4())
    fake_doc = io.BytesIO(b"Hello world text file")
    response = client.post(
        "/api/profile/build",
        headers={"X-Install-Id": install_id},
        files={"file": ("payslip.txt", fake_doc, "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE"


def test_build_profile_file_too_large(monkeypatch):
    install_id = str(uuid.uuid4())
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 1)

    # 1.5 MB payload
    large_payload = io.BytesIO(b"0" * int(1.5 * 1024 * 1024))
    response = client.post(
        "/api/profile/build",
        headers={"X-Install-Id": install_id},
        files={"file": ("payslip.pdf", large_payload, "application/pdf")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_build_profile_with_existing_emis():
    install_id = str(uuid.uuid4())
    fake_pdf = io.BytesIO(b"%PDF-1.4 Mock PDF content")
    emis_json = '[{"name": "Laptop Loan", "monthly_amount": 4000.0, "tenure_remaining_months": 6}]'

    response = client.post(
        "/api/profile/build",
        headers={"X-Install-Id": install_id},
        files={"file": ("sample_1_demo_user.pdf", fake_pdf, "application/pdf")},
        data={
            "rent_monthly": 10000.0,
            "existing_emis_json": emis_json,
        },
    )

    assert response.status_code == 200
    profile = response.json()["profile"]
    assert len(profile["existing_emis"]) == 1
    assert profile["total_existing_emi_monthly"] == 4000.0
