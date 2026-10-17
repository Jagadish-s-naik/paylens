"""
tests/api/test_routes_afford.py
Integration tests for /api/afford, /api/demo/profiles, and /api/health routes.
Tests against golden fixture numbers from scripts/compute_fixtures.py.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes_profile import get_canonical_personas
from app.core.schemas import Listing, PaymentOption, PaymentType

client = TestClient(app)


def test_health_route():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.0.0"
    assert "ai_available" in data


def test_demo_profiles_route():
    res = client.get("/api/demo/profiles")
    assert res.status_code == 200
    data = res.json()
    assert "profiles" in data
    assert "rahul" in data["profiles"]
    assert "amit" in data["profiles"]
    assert "vikram" in data["profiles"]
    assert data["profiles"]["rahul"]["in_hand_verified"] == 75000.0


def test_afford_rahul_sony_comfortable():
    personas = get_canonical_personas()
    rahul = personas["rahul"]

    listing_sony = {
        "product_id": "sony_wh1000xm5",
        "title": "Sony WH-1000XM5 Wireless Headphones",
        "category": "Audio",
        "retailer": "MockStore",
        "upfront_cash_price": 29990.0,
        "cash_discount": 2000.0,
        "effective_cash_price": 27990.0,
        "payment_options": [
            {
                "option_id": "cash_full",
                "type": "CASH",
                "label": "Full Payment",
                "tenure_months": 1,
                "monthly_installment": 27990.0,
                "upfront_downpayment": 0.0,
                "processing_fee": 0.0,
                "lost_cash_discount": None,
                "stated_interest_rate": 0.0,
            },
            {
                "option_id": "sony_nocost_6m",
                "type": "NO_COST_EMI",
                "label": "No-Cost EMI (6 Months)",
                "tenure_months": 6,
                "monthly_installment": 4998.33,
                "upfront_downpayment": 0.0,
                "processing_fee": 199.0,
                "lost_cash_discount": 2000.0,
                "stated_interest_rate": 0.0,
            },
        ],
    }

    payload = {
        "profile": rahul.model_dump(),
        "listing": listing_sony,
        "selected_option_id": "sony_nocost_6m",
    }

    res = client.post("/api/afford", json=payload)
    assert res.status_code == 200
    verdict = res.json()

    assert verdict["verdict_level"] == "COMFORTABLE"
    assert "🟢" in verdict["badge"]
    assert verdict["true_cost"]["has_high_apr_alert"] is True
    assert pytest.approx(verdict["true_cost"]["effective_annual_rate"], 0.1) == 30.74
    assert len(verdict["alternatives"]) >= 1


def test_afford_rahul_iphone_stretch():
    personas = get_canonical_personas()
    rahul = personas["rahul"]

    listing_iphone = {
        "product_id": "iphone_16_pro",
        "title": "Apple iPhone 16 Pro 128GB",
        "category": "Smartphone",
        "retailer": "MockStore",
        "upfront_cash_price": 119900.0,
        "cash_discount": 5000.0,
        "effective_cash_price": 114900.0,
        "payment_options": [
            {
                "option_id": "iphone_nocost_6m",
                "type": "NO_COST_EMI",
                "label": "No-Cost EMI (6 Months)",
                "tenure_months": 6,
                "monthly_installment": 19983.33,
                "upfront_downpayment": 0.0,
                "processing_fee": 199.0,
                "lost_cash_discount": 5000.0,
                "stated_interest_rate": 0.0,
            }
        ],
    }

    payload = {
        "profile": rahul.model_dump(),
        "listing": listing_iphone,
        "selected_option_id": "iphone_nocost_6m",
    }

    res = client.post("/api/afford", json=payload)
    assert res.status_code == 200
    verdict = res.json()

    assert verdict["verdict_level"] == "STRETCH"
    assert "🟡" in verdict["badge"]
    # Check income cut stress test fails
    income_cut = next((s for s in verdict["stress_tests"] if "Income" in s["scenario_name"]), None)
    assert income_cut is not None
    assert income_cut["passes"] is False


def test_afford_option_not_found():
    personas = get_canonical_personas()
    rahul = personas["rahul"]

    listing = {
        "product_id": "item1",
        "title": "Test Item",
        "category": "Misc",
        "retailer": "MockStore",
        "upfront_cash_price": 1000.0,
        "cash_discount": 0.0,
        "effective_cash_price": 1000.0,
        "payment_options": [
            {
                "option_id": "cash_full",
                "type": "CASH",
                "label": "Cash",
                "tenure_months": 1,
                "monthly_installment": 1000.0,
            }
        ],
    }

    res = client.post(
        "/api/afford",
        json={
            "profile": rahul.model_dump(),
            "listing": listing,
            "selected_option_id": "non_existent_option",
        },
    )
    assert res.status_code == 404
    data = res.json()
    assert data["error"]["code"] == "OPTION_NOT_FOUND"


def test_afford_conflicting_effective_cash_price():
    personas = get_canonical_personas()
    rahul = personas["rahul"]

    # Fraudulent/tampered effective_cash_price
    listing = {
        "product_id": "item1",
        "title": "Test Item",
        "category": "Misc",
        "retailer": "MockStore",
        "upfront_cash_price": 10000.0,
        "cash_discount": 1000.0,
        "effective_cash_price": 5000.0,  # Expected 9000.0
        "payment_options": [
            {
                "option_id": "cash_full",
                "type": "CASH",
                "label": "Cash",
                "tenure_months": 1,
                "monthly_installment": 5000.0,
            }
        ],
    }

    res = client.post(
        "/api/afford",
        json={
            "profile": rahul.model_dump(),
            "listing": listing,
            "selected_option_id": "cash_full",
        },
    )
    assert res.status_code == 422
    data = res.json()
    assert data["error"]["code"] == "VALIDATION"
    assert data["error"]["details"]["field"] == "listing.effective_cash_price"


def test_explain_verdict_route():
    import uuid
    personas = get_canonical_personas()
    rahul = personas["rahul"]

    listing_sony = {
        "product_id": "sony_wh1000xm5",
        "title": "Sony Headphones",
        "category": "Audio",
        "retailer": "MockStore",
        "upfront_cash_price": 29990.0,
        "cash_discount": 2000.0,
        "effective_cash_price": 27990.0,
        "payment_options": [
            {
                "option_id": "sony_nocost_6m",
                "type": "NO_COST_EMI",
                "label": "No-Cost EMI",
                "tenure_months": 6,
                "monthly_installment": 4998.33,
                "processing_fee": 199.0,
                "lost_cash_discount": 2000.0,
            }
        ],
    }
    afford_res = client.post(
        "/api/afford",
        json={
            "profile": rahul.model_dump(),
            "listing": listing_sony,
            "selected_option_id": "sony_nocost_6m",
        },
    )
    verdict = afford_res.json()

    # Missing X-Install-Id header -> 400
    res_no_header = client.post("/api/afford/explain", json={"verdict": verdict, "language": "en"})
    assert res_no_header.status_code == 400
    assert res_no_header.json()["error"]["code"] == "MISSING_INSTALL_ID"

    # Valid X-Install-Id header -> 200
    install_id = str(uuid.uuid4())
    res = client.post(
        "/api/afford/explain",
        headers={"X-Install-Id": install_id},
        json={"verdict": verdict, "language": "en"},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["bullets"]) >= 4
    assert data["source"] in ["gemini", "template"]

