"""
tests/api/test_routes_listing.py
Unit tests for /api/listing/parse route.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings

client = TestClient(app)


def test_parse_listing_missing_install_id():
    res = client.post(
        "/api/listing/parse",
        json={"page_title": "MacBook Air", "text": "Price is ₹99,900 on Amazon."},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "MISSING_INSTALL_ID"


def test_parse_listing_offline_regex(monkeypatch):
    monkeypatch.setattr(settings, "PAYLENS_OFFLINE", 1)
    install_id = str(uuid.uuid4())
    res = client.post(
        "/api/listing/parse",
        headers={"X-Install-Id": install_id},
        json={
            "page_title": "Sony Headphones WH-1000XM5",
            "text": "Buy Sony Headphones for ₹29,990 with bank discounts available today.",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["upfront_cash_price"] == 29990.0
    assert data["effective_cash_price"] == 29990.0
    assert len(data["payment_options"]) >= 1
    assert data["payment_options"][0]["monthly_installment"] == 29990.0
