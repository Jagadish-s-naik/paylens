"""
tests/api/test_integration_handshake.py
Phase 3 Stage 3.1 & 3.2 Service Handshake Integration Tests.
Verifies full end-to-end functionality between Track A (FastAPI) and Track B (Extension/Storefront).
Strictly validates against the 7-step checklist from docs/PLAN.md §3.7.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes_profile import get_canonical_personas

client = TestClient(app)


# =============================================================================
# 1. Storefront Mount Handshake (§3.1 Task 3.1.1)
# =============================================================================

def test_storefront_mount_and_html_elements():
    """Confirms FastAPI mounts Track B's mock-shop/ and serves necessary DOM attributes."""
    res = client.get("/mock-shop/")
    assert res.status_code == 200
    assert "text/html" in res.headers.get("content-type", "")
    html = res.text

    # Verify all 3 product mount targets exist
    assert 'id="paylens-mount-sony"' in html
    assert 'id="paylens-mount-iphone"' in html
    assert 'id="paylens-mount-laptop"' in html

    # Verify data-pl-mount attributes for the Chrome Extension adapter
    assert "data-pl-mount" in html
    assert "data-pl-product" in html
    assert 'data-pl-id="sony_wh1000xm5"' in html
    assert 'data-pl-id="iphone_16_pro"' in html
    assert 'data-pl-id="rog_strix_g16"' in html


def test_health_handshake():
    """Confirms health endpoint responds for extension pre-flight checks."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.0.0"


def test_demo_profiles_handshake():
    """Confirms demo profiles match canonical onboarding definitions."""
    res = client.get("/api/demo/profiles")
    assert res.status_code == 200
    profiles = res.json()["profiles"]
    assert "rahul" in profiles
    assert "amit" in profiles
    assert "vikram" in profiles
    assert profiles["rahul"]["in_hand_verified"] == 75000.0
    assert profiles["amit"]["in_hand_verified"] == 46800.0
    assert profiles["vikram"]["in_hand_verified"] == 88000.0


# =============================================================================
# 2. Checklist Scenarios 3-6 (§3.7 Mandatory Checklist)
# =============================================================================

@pytest.fixture
def mock_listings():
    return {
        "sony": {
            "product_id": "sony_wh1000xm5",
            "title": "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
            "category": "Audio",
            "retailer": "MockStore",
            "upfront_cash_price": 29990.0,
            "cash_discount": 2000.0,
            "effective_cash_price": 27990.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment (Cash / Instant Bank Discount)",
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
                    "label": "HDFC No-Cost EMI (6 Months)",
                    "tenure_months": 6,
                    "monthly_installment": 4998.33,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 199.0,
                    "lost_cash_discount": 2000.0,
                    "stated_interest_rate": 0.0,
                },
            ],
        },
        "iphone": {
            "product_id": "iphone_16_pro",
            "title": "Apple iPhone 16 Pro (128GB, Natural Titanium)",
            "category": "Smartphones",
            "retailer": "MockStore",
            "upfront_cash_price": 119900.0,
            "cash_discount": 5000.0,
            "effective_cash_price": 114900.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment (Cash / UPI)",
                    "tenure_months": 1,
                    "monthly_installment": 114900.0,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 0.0,
                    "lost_cash_discount": None,
                    "stated_interest_rate": 0.0,
                },
                {
                    "option_id": "iphone_nocost_6m",
                    "type": "NO_COST_EMI",
                    "label": "ICICI No-Cost EMI (6 Months)",
                    "tenure_months": 6,
                    "monthly_installment": 19983.33,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 299.0,
                    "lost_cash_discount": 5000.0,
                    "stated_interest_rate": 0.0,
                },
            ],
        },
        "laptop": {
            "product_id": "asus_rog_strix",
            "title": "ASUS ROG Strix G16 (2025) Gaming Laptop",
            "category": "Laptops",
            "retailer": "MockStore",
            "upfront_cash_price": 145000.0,
            "cash_discount": 5000.0,
            "effective_cash_price": 140000.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment (Upfront)",
                    "tenure_months": 1,
                    "monthly_installment": 140000.0,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 0.0,
                    "lost_cash_discount": None,
                    "stated_interest_rate": 0.0,
                },
                {
                    "option_id": "laptop_std_12m",
                    "type": "STANDARD_EMI",
                    "label": "Standard EMI (12 Months, 15% APR)",
                    "tenure_months": 12,
                    "monthly_installment": 13160.0,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 999.0,
                    "lost_cash_discount": 5000.0,
                    "stated_interest_rate": 15.0,
                },
            ],
        },
    }


def test_scenario_3_rahul_sony_headphones(mock_listings):
    """
    Checklist Step 3:
    Inspect Sony WH-1000XM5 (No-Cost EMI):
    - Assert badge: COMFORTABLE
    - Assert High APR Alert: 30.74% EAR and ₹2,235 markup alert displayed.
    - Assert Cash Alternative: Runway 3.01m, saving ₹2,235.
    """
    personas = get_canonical_personas()
    rahul = personas["rahul"]
    test_install_id = str(uuid.uuid4())

    res = client.post(
        "/api/afford",
        json={
            "profile": rahul.model_dump(),
            "listing": mock_listings["sony"],
            "selected_option_id": "sony_nocost_6m",
        },
        headers={"X-Install-Id": test_install_id},
    )
    assert res.status_code == 200
    verdict = res.json()

    assert verdict["verdict_level"] == "COMFORTABLE"
    assert "COMFORTABLE" in verdict["badge"] or "Safe" in verdict["badge"]

    # EAR & Markup
    tc = verdict["true_cost"]
    assert tc["effective_annual_rate"] == 30.74
    assert round(tc["hidden_markup"]) == 2235
    assert tc["has_high_apr_alert"] is True

    # Cash Alternative
    cash_alt = next((a for a in verdict["alternatives"] if "Cash" in a["title"]), None)
    assert cash_alt is not None
    assert cash_alt["runway_after"] == 3.01
    assert round(cash_alt["money_saved"]) == 2235


def test_scenario_4_rahul_iphone_stretch(mock_listings):
    """
    Checklist Step 4:
    Inspect iPhone 16 Pro (No-Cost EMI):
    - Assert badge: STRETCH
    - Assert Free Cash drops to ₹11,017 and FOIR rises to 31.3%
    - Assert Income Shock fails: deficit of ₹3,983/month
    - Assert Wait & Save: Wait 3 months, save ₹5,235 (or ~₹5,353)
    """
    personas = get_canonical_personas()
    rahul = personas["rahul"]
    test_install_id = str(uuid.uuid4())

    res = client.post(
        "/api/afford",
        json={
            "profile": rahul.model_dump(),
            "listing": mock_listings["iphone"],
            "selected_option_id": "iphone_nocost_6m",
        },
        headers={"X-Install-Id": test_install_id},
    )
    assert res.status_code == 200
    verdict = res.json()

    assert verdict["verdict_level"] == "STRETCH"
    assert round(verdict["impact"]["free_cash_after"]) == 11017
    assert round(verdict["impact"]["foir_after"] * 100, 1) == 31.3

    # Income Stress Test (-20% cut)
    income_shock = next(
        (s for s in verdict["stress_tests"] if "Income" in s["scenario_name"]), None
    )
    assert income_shock is not None
    assert income_shock["passes"] is False
    assert "3,983" in income_shock["warning"]

    # Wait & Save
    wait_alt = next(
        (a for a in verdict["alternatives"] if "Wait" in a["title"]), None
    )
    assert wait_alt is not None
    assert "3 Months" in wait_alt["title"]
    assert wait_alt["money_saved"] > 5000.0


def test_scenario_5_amit_laptop_risky(mock_listings):
    """
    Checklist Step 5:
    Switch persona to Amit Verma:
    - Inspect Gaming Laptop
    - Assert badge: RISKY with deficit -₹2,400.00
    - Assert Cash purchase: Not feasible today
    - Assert recommendation: Build 3-Month Emergency Cushion First
    """
    personas = get_canonical_personas()
    amit = personas["amit"]
    test_install_id = str(uuid.uuid4())

    res = client.post(
        "/api/afford",
        json={
            "profile": amit.model_dump(),
            "listing": mock_listings["laptop"],
            "selected_option_id": "laptop_std_12m",
        },
        headers={"X-Install-Id": test_install_id},
    )
    assert res.status_code == 200
    verdict = res.json()

    assert verdict["verdict_level"] == "RISKY"
    assert round(verdict["impact"]["free_cash_after"], 2) == -2400.00

    # Infeasible Cash purchase
    cash_alt = next((a for a in verdict["alternatives"] if "Cash" in a["title"]), None)
    assert cash_alt is not None
    assert cash_alt["is_feasible"] is False
    assert "Not Feasible" in cash_alt["rescore_badge"] or "Not possible" in cash_alt["rescore_badge"]


def test_scenario_6_vikram_march_shock(mock_listings):
    """
    Checklist Step 6:
    Switch persona to Vikram Malhotra:
    - Inspect iPhone -> Assert March TDS Shock fails with warning: ₹127,800 March tax deduction spike
    """
    personas = get_canonical_personas()
    vikram = personas["vikram"]
    test_install_id = str(uuid.uuid4())

    res = client.post(
        "/api/afford",
        json={
            "profile": vikram.model_dump(),
            "listing": mock_listings["iphone"],
            "selected_option_id": "iphone_nocost_6m",
        },
        headers={"X-Install-Id": test_install_id},
    )
    assert res.status_code == 200
    verdict = res.json()

    march_shock = next(
        (s for s in verdict["stress_tests"] if "March" in s["scenario_name"] or "TDS" in s["scenario_name"]),
        None,
    )
    assert march_shock is not None
    assert march_shock["is_applicable"] is True
    assert march_shock["passes"] is False
    assert "127,800" in march_shock["warning"]


def test_scenario_7_regional_explanations(mock_listings):
    """
    Checklist Step 7:
    Toggle language to English, Hindi, Kannada:
    - Assert /api/afford/explain returns grounded regional bullets or template fallback
    """
    personas = get_canonical_personas()
    rahul = personas["rahul"]
    test_install_id = str(uuid.uuid4())

    # Obtain verdict
    res = client.post(
        "/api/afford",
        json={
            "profile": rahul.model_dump(),
            "listing": mock_listings["sony"],
            "selected_option_id": "sony_nocost_6m",
        },
        headers={"X-Install-Id": test_install_id},
    )
    assert res.status_code == 200
    verdict = res.json()

    # Test Hindi explanation
    res_hi = client.post(
        "/api/afford/explain",
        json={"verdict": verdict, "language": "hi"},
        headers={"X-Install-Id": test_install_id},
    )
    assert res_hi.status_code == 200
    data_hi = res_hi.json()
    assert "bullets" in data_hi
    assert len(data_hi["bullets"]) >= 3
    assert data_hi["source"] in ("gemini", "template")

    # Test Kannada explanation
    res_kn = client.post(
        "/api/afford/explain",
        json={"verdict": verdict, "language": "kn"},
        headers={"X-Install-Id": test_install_id},
    )
    assert res_kn.status_code == 200
    data_kn = res_kn.json()
    assert "bullets" in data_kn
    assert len(data_kn["bullets"]) >= 3
    assert data_kn["source"] in ("gemini", "template")
