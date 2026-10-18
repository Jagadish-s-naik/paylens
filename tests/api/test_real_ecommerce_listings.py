"""
tests/api/test_real_ecommerce_listings.py
Automated tests verifying real e-commerce listing integration (Amazon, Flipkart, Generic).
Validates end-to-end evaluation of real-world scraped payloads against the core engine.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.core.schemas import VerifiedProfile, Listing, PaymentOption, PaymentType
from app.core.engine import evaluate_affordability

client = TestClient(app)


@pytest.fixture
def sample_rahul_profile():
    return VerifiedProfile(
        profile_id="prof_rahul_test",
        employer_name="Acme Cloud Tech India Pvt Ltd",
        pay_period="March 2026",
        gross_monthly=80000.0,
        basic_monthly=40000.0,
        hra_monthly=20000.0,
        pf_employee_monthly=4800.0,
        professional_tax_monthly=200.0,
        tds_monthly=0.0,
        tax_regime="NEW",
        in_hand_verified=75000.0,
        annual_variable_bonus=182400.0,
        rent_monthly=18000.0,
        is_metro=True,
        existing_emis=[
            {"name": "Previous Phone", "monthly_amount": 3500.0, "tenure_remaining_months": 3}
        ],
        current_savings=150000.0,
        language_pref="en"
    )


@pytest.fixture
def amazon_iphone_listing():
    """Simulates real scraped listing from Amazon India."""
    list_price = 79900.0
    cash_discount = 4000.0  # Instant HDFC Card Discount
    effective_cash = list_price - cash_discount  # 75900.0
    std_fee = 199.0

    return Listing(
        product_id="B0CHX1W1XY",
        title="Apple iPhone 16 (128 GB) - Ultramarine",
        category="Smartphones",
        retailer="Amazon",
        upfront_cash_price=list_price,
        cash_discount=cash_discount,
        effective_cash_price=effective_cash,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label="Full Payment (Includes ₹4,000 HDFC Instant Discount)",
                tenure_months=1,
                monthly_installment=effective_cash,
                upfront_downpayment=0.0,
                processing_fee=0.0,
                lost_cash_discount=None,
                stated_interest_rate=0.0,
            ),
            PaymentOption(
                option_id="nocost_6m",
                type=PaymentType.NO_COST_EMI,
                label="No-Cost EMI (6 Months)",
                tenure_months=6,
                monthly_installment=round(list_price / 6, 2),
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=0.0,
            ),
            PaymentOption(
                option_id="std_12m",
                type=PaymentType.STANDARD_EMI,
                label="Standard EMI (12 Months @ 15% APR)",
                tenure_months=12,
                monthly_installment=7214.35,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=15.0,
            ),
        ]
    )


@pytest.fixture
def flipkart_laptop_listing():
    """Simulates real scraped listing from Flipkart."""
    list_price = 64990.0
    cash_discount = 3000.0
    effective_cash = list_price - cash_discount  # 61990.0
    std_fee = 199.0

    return Listing(
        product_id="COMGG9Z3YJ5GHYZW",
        title="ASUS Vivobook 15 Intel Core i5 13th Gen",
        category="Laptops",
        retailer="Flipkart",
        upfront_cash_price=list_price,
        cash_discount=cash_discount,
        effective_cash_price=effective_cash,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label="Full Payment (Includes ₹3,000 Instant Discount)",
                tenure_months=1,
                monthly_installment=effective_cash,
                upfront_downpayment=0.0,
                processing_fee=0.0,
                lost_cash_discount=None,
                stated_interest_rate=0.0,
            ),
            PaymentOption(
                option_id="nocost_6m",
                type=PaymentType.NO_COST_EMI,
                label="No-Cost EMI (6 Months)",
                tenure_months=6,
                monthly_installment=round(list_price / 6, 2),
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=0.0,
            ),
        ]
    )


def test_amazon_real_listing_afford_cash(sample_rahul_profile, amazon_iphone_listing):
    """Verifies cash option evaluation for Amazon listing."""
    verdict = evaluate_affordability(
        profile=sample_rahul_profile,
        listing=amazon_iphone_listing,
        selected_option_id="cash_full"
    )

    assert verdict.verdict_level in ["COMFORTABLE", "STRETCH", "RISKY"]
    assert verdict.selected_option.option_id == "cash_full"
    assert verdict.true_cost.effective_annual_rate == 0.0
    assert verdict.true_cost.hidden_markup == 0.0
    assert verdict.true_cost.total_outflow == amazon_iphone_listing.effective_cash_price


def test_amazon_real_listing_afford_nocost_emi(sample_rahul_profile, amazon_iphone_listing):
    """Verifies that No-Cost EMI on Amazon reveals hidden EAR markup due to lost cash discount."""
    verdict = evaluate_affordability(
        profile=sample_rahul_profile,
        listing=amazon_iphone_listing,
        selected_option_id="nocost_6m"
    )

    # Forfeiting ₹4,000 discount + ₹199 fee means effective APR > 0%
    assert verdict.true_cost.effective_annual_rate > 15.0
    assert verdict.true_cost.hidden_markup > 4000.0
    assert verdict.true_cost.has_high_apr_alert is True
    assert verdict.impact.foir_after > verdict.impact.foir_before
    assert len(verdict.stress_tests) >= 1
    assert len(verdict.alternatives) >= 1


def test_flipkart_real_listing_via_api(sample_rahul_profile, flipkart_laptop_listing):
    """Verifies /api/afford HTTP endpoint handles Flipkart listings cleanly."""
    install_id = str(uuid.uuid4())
    res = client.post(
        "/api/afford",
        headers={"X-Install-Id": install_id},
        json={
            "profile": sample_rahul_profile.model_dump(),
            "listing": flipkart_laptop_listing.model_dump(),
            "selected_option_id": "nocost_6m"
        }
    )

    assert res.status_code == 200
    data = res.json()
    assert data["selected_option"]["option_id"] == "nocost_6m"
    assert data["true_cost"]["hidden_markup"] >= 3000.0
    assert "badge" in data
    assert "impact" in data


def test_fallback_listing_parse_real_amazon_text(monkeypatch):
    """Tests /api/listing/parse extracting price and creating Listing from real text snippet."""
    monkeypatch.setattr(settings, "PAYLENS_OFFLINE", 1)
    install_id = str(uuid.uuid4())
    raw_text = (
        "Apple iPhone 15 (128 GB) - Blue. "
        "M.R.P.: ₹69,900. Deal of the Day: ₹58,999. "
        "Save extra with No Cost EMI available on select cards. "
        "Flat ₹3000 Instant Discount on ICICI Bank Cards."
    )
    res = client.post(
        "/api/listing/parse",
        headers={"X-Install-Id": install_id},
        json={
            "page_title": "Apple iPhone 15 (128 GB) - Blue : Amazon.in: Electronics",
            "text": raw_text
        }
    )

    assert res.status_code == 200
    data = res.json()
    assert data["upfront_cash_price"] == 69900.0 or data["upfront_cash_price"] == 58999.0
    assert len(data["payment_options"]) >= 1


def test_ecommerce_pdp_url_classification():
    """Validates URL gating logic to ensure non-store sites are rejected and PDPs are accepted."""
    def is_ecommerce_pdp(url: str) -> bool:
        u = url.lower()
        if ("amazon.in" in u or "amazon.com" in u or "amazon." in u) and ("/dp/" in u or "/gp/product/" in u or "/gp/aw/d/" in u):
            return True
        if "flipkart.com" in u and ("/p/" in u or "pid=" in u or "/itm" in u):
            return True
        if "/mock-shop/" in u or "mock-shop" in u:
            return True
        return False

    # Non-store & non-product URLs must return False
    assert is_ecommerce_pdp("https://jagadish.linklee.in") is False
    assert is_ecommerce_pdp("https://google.com") is False
    assert is_ecommerce_pdp("https://github.com/Jagadish-s-naik/paylens") is False
    assert is_ecommerce_pdp("https://www.amazon.in/s?k=laptop&ref=nb_sb_noss") is False
    assert is_ecommerce_pdp("https://www.amazon.in/gp/cart/view.html") is False
    assert is_ecommerce_pdp("https://www.flipkart.com/account/orders") is False

    # Valid PDP URLs must return True
    assert is_ecommerce_pdp("https://www.amazon.in/Apple-iPhone-16/dp/B0CHX1W1XY") is True
    assert is_ecommerce_pdp("https://www.amazon.in/gp/product/B0CHX1W1XY") is True
    assert is_ecommerce_pdp("https://www.flipkart.com/apple-iphone-15/p/itm6ac6485515ae4") is True
    assert is_ecommerce_pdp("https://www.flipkart.com/product/p/item?pid=MOB12345") is True
    assert is_ecommerce_pdp("http://localhost:8000/mock-shop/") is True

