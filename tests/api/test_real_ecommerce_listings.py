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


def test_generic_croma_listing_via_api(sample_rahul_profile):
    """Verifies that universal e-commerce listings (e.g. Croma, Myntra, etc.) evaluate cleanly."""
    croma_listing = Listing(
        product_id="CROMA_TV_55",
        title="Sony Bravia 55 inch 4K Ultra HD Smart LED TV",
        category="Television",
        retailer="Croma",
        upfront_cash_price=57990.0,
        cash_discount=2500.0,
        effective_cash_price=55490.0,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label="Full Payment Upfront",
                tenure_months=1,
                monthly_installment=55490.0,
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
                monthly_installment=9665.0,
                upfront_downpayment=0.0,
                processing_fee=199.0,
                lost_cash_discount=2500.0,
                stated_interest_rate=0.0,
            ),
        ]
    )

    install_id = str(uuid.uuid4())
    res = client.post(
        "/api/afford",
        headers={"X-Install-Id": install_id},
        json={
            "profile": sample_rahul_profile.model_dump(),
            "listing": croma_listing.model_dump(),
            "selected_option_id": "nocost_6m"
        }
    )

    assert res.status_code == 200
    data = res.json()
    assert data["selected_option"]["option_id"] == "nocost_6m"
    assert data["true_cost"]["effective_annual_rate"] > 10.0
    assert data["true_cost"]["hidden_markup"] >= 2500.0


def test_ecommerce_pdp_url_classification():
    """Validates URL gating logic across Amazon, Flipkart, Croma, Myntra, and generic Shopify stores."""
    def is_ecommerce_pdp(url: str) -> bool:
        u = url.lower()
        known_stores = [
            "amazon.", "flipkart.com", "myntra.com", "croma.com",
            "reliancedigital.in", "tatacliq.com", "ajio.com",
            "meesho.com", "nykaa.com", "vijaysales.com", "ebay.", "mock-shop"
        ]
        if any(store in u for store in known_stores):
            if any(slug in u for slug in ["/p/", "/p-", "/dp/", "/product/", "/products/", "/item/", "/itm/", "/pd/", "/buy", "?pid=", "?sku="]):
                return True
            if "mock-shop" in u:
                return True
        return False

    # Non-store & non-product URLs must return False
    assert is_ecommerce_pdp("https://jagadish.linklee.in") is False
    assert is_ecommerce_pdp("https://google.com") is False
    assert is_ecommerce_pdp("https://github.com/Jagadish-s-naik/paylens") is False
    assert is_ecommerce_pdp("https://www.amazon.in/s?k=laptop&ref=nb_sb_noss") is False
    assert is_ecommerce_pdp("https://www.amazon.in/gp/cart/view.html") is False
    assert is_ecommerce_pdp("https://www.flipkart.com/account/orders") is False

    # Valid PDP URLs on all stores must return True
    assert is_ecommerce_pdp("https://www.amazon.in/Apple-iPhone-16/dp/B0CHX1W1XY") is True
    assert is_ecommerce_pdp("https://www.flipkart.com/apple-iphone-15/p/itm6ac6485515ae4") is True
    assert is_ecommerce_pdp("https://www.croma.com/apple-iphone-16-pro/p/309228") is True
    assert is_ecommerce_pdp("https://www.myntra.com/smart-watches/noise/noise-colorfit-pulse/24021200/buy") is True
    assert is_ecommerce_pdp("https://www.tatacliq.com/apple-iphone-15-128gb-black/p-mp000000019918231") is True
    assert is_ecommerce_pdp("https://www.ebay.com/itm/227151714164") is True
    assert is_ecommerce_pdp("http://localhost:8000/mock-shop/") is True


def test_multi_currency_classification_usd():
    """Validates that USD listings are classified as USD and converted to INR at FX rate, avoiding treating $999 as ₹999."""
    from app.api.routes_listing import fallback_regex_parse

    snippet = "Apple iPhone 16 Pro (128 GB) - Natural Titanium Price: $999.00 in stock"
    listing = fallback_regex_parse(snippet, page_title="Apple iPhone 16 Pro")

    assert listing.currency == "USD"
    assert listing.currency_symbol == "$"
    assert listing.original_currency_price == 999.0
    assert listing.exchange_rate_to_inr == 84.0
    # Price must be 83,916 INR, NEVER 999 INR!
    assert listing.upfront_cash_price == 83916.0
    assert listing.effective_cash_price == 83916.0
    assert "999.00" in listing.payment_options[0].label
    assert "83,916.00" in listing.payment_options[0].label


def test_multi_currency_classification_eur():
    """Validates EUR currency classification and conversion."""
    from app.api.routes_listing import fallback_regex_parse

    snippet = "Sony WH-1000XM5 Wireless Headphones Special Price: €850.00 VAT included"
    listing = fallback_regex_parse(snippet, page_title="Sony WH-1000XM5")

    assert listing.currency == "EUR"
    assert listing.currency_symbol == "€"
    assert listing.original_currency_price == 850.0
    assert listing.exchange_rate_to_inr == 91.5
    assert listing.upfront_cash_price == 77775.0


def test_multi_currency_classification_gbp():
    """Validates GBP currency classification and conversion."""
    from app.api.routes_listing import fallback_regex_parse

    snippet = "Dyson V15 Detect Vacuum Cleaner Only £750.00 Order now"
    listing = fallback_regex_parse(snippet, page_title="Dyson V15")

    assert listing.currency == "GBP"
    assert listing.currency_symbol == "£"
    assert listing.original_currency_price == 750.0
    assert listing.exchange_rate_to_inr == 109.0
    assert listing.upfront_cash_price == 81750.0


def test_multi_currency_classification_aed():
    """Validates AED currency classification and conversion."""
    from app.api.routes_listing import fallback_regex_parse

    snippet = "Samsung Galaxy S24 Ultra Price: AED 3,500 Prime Fast Delivery"
    listing = fallback_regex_parse(snippet, page_title="Samsung Galaxy S24 Ultra")

    assert listing.currency == "AED"
    assert listing.currency_symbol == "AED "
    assert listing.original_currency_price == 3500.0
    assert listing.exchange_rate_to_inr == 22.9
    assert listing.upfront_cash_price == 80150.0


def test_multi_currency_affordability_evaluation_usd():
    """Validates that foreign currency listings evaluated through /api/afford use INR converted value for payslips."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.routes_listing import fallback_regex_parse

    client = TestClient(app)
    snippet = "Apple iPhone 16 Pro 128GB Price: $999.00"
    listing = fallback_regex_parse(snippet, "Apple iPhone 16 Pro")

    # Rahul profile: in_hand 85000, savings 40000.
    # $999 converted to INR is 83,916.
    # Since Rahul has only 40,000 savings, cash purchase is INFEASIBLE / RISKY (NOT comfortable as ₹999 would be)!
    rahul_profile = {
        "profile_id": "test_rahul_usd",
        "in_hand_verified": 85000.0,
        "gross_monthly": 100000.0,
        "basic_monthly": 45000.0,
        "current_savings": 40000.0,
        "rent_monthly": 18000.0,
        "existing_emis": [],
        "tax_regime": "NEW"
    }

    resp = client.post(
        "/api/afford",
        json={
            "profile": rahul_profile,
            "listing": listing.model_dump(),
            "selected_option_id": "cash_full"
        },
        headers={"X-Paylens-Install-ID": "test_currency_suite"}
    )
    assert resp.status_code == 200
    data = resp.json()

    # The evaluation correctly recognizes that 83,916 exceeds 40,000 savings!
    assert data["verdict_level"] == "RISKY"
    assert "Risky" in data["badge"]


def test_myntra_oneplus_four_digit_price_extraction():
    """Validates that 4-digit unformatted prices like ₹1799 are correctly extracted as 1799.0, not truncated to 179.0."""
    from app.api.routes_listing import fallback_regex_parse

    snippet = "OnePlus Nord Buds 2r True Wireless In-Ear Earbuds ₹1799 inclusive of all taxes MRP ₹2999"
    listing = fallback_regex_parse(snippet, page_title="OnePlus Nord Buds 2r")

    assert listing.upfront_cash_price == 1799.0
    assert listing.effective_cash_price == 1799.0
    # Must never be 179!
    assert listing.upfront_cash_price != 179.0
    assert "OnePlus" in listing.title


def test_myntra_hdfc_exact_emi_installments():
    """Verifies that a ₹2,549 Myntra product generates exact bank EMI installments matching the site table down to the rupee."""
    def calc_emi(principal: float, annual_rate: float, months: int) -> float:
        monthly_r = (annual_rate / 12.0) / 100.0
        num = principal * monthly_r * ((1.0 + monthly_r) ** months)
        den = ((1.0 + monthly_r) ** months) - 1.0
        return float(round(num / den))

    price = 2549.0
    rate = 15.0

    # 1. Verify exact mathematical match against the Myntra screenshot table
    assert calc_emi(price, rate, 3) == 871.0
    assert calc_emi(price, rate, 6) == 444.0
    assert calc_emi(price, rate, 9) == 301.0
    assert calc_emi(price, rate, 12) == 230.0
    assert calc_emi(price, rate, 18) == 159.0
    assert calc_emi(price, rate, 24) == 124.0

    # 2. Verify interest amounts in parentheses in the Myntra screenshot
    assert (871.0 * 3) - price == 64.0
    assert (444.0 * 6) - price == 115.0
    assert (301.0 * 9) - price == 160.0
    assert (230.0 * 12) - price == 211.0
    assert (159.0 * 18) - price == 313.0
    assert (124.0 * 24) - price == 427.0


def test_myntra_real_bank_emi_affordability_evaluation(sample_rahul_profile):
    """Verifies that evaluating real bank EMI options (HDFC 3M @ ₹871/mo) computes true cost and FOIR accurately."""
    list_price = 2549.0
    std_fee = 199.0

    myntra_listing = Listing(
        product_id="myntra_shoe_2549",
        title="Nike Air Pegasus Running Shoes",
        category="Footwear",
        retailer="Myntra",
        upfront_cash_price=list_price,
        cash_discount=0.0,
        effective_cash_price=list_price,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label="Full Payment Upfront",
                tenure_months=1,
                monthly_installment=list_price,
                upfront_downpayment=0.0,
                processing_fee=0.0,
                lost_cash_discount=None,
                stated_interest_rate=0.0
            ),
            PaymentOption(
                option_id="std_hdfc_3m",
                type=PaymentType.STANDARD_EMI,
                label="HDFC Bank EMI (3M @ ₹871/mo • 15.0% APR)",
                tenure_months=3,
                monthly_installment=871.0,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=0.0,
                stated_interest_rate=15.0
            ),
            PaymentOption(
                option_id="std_hdfc_6m",
                type=PaymentType.STANDARD_EMI,
                label="HDFC Bank EMI (6M @ ₹444/mo • 15.0% APR)",
                tenure_months=6,
                monthly_installment=444.0,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=0.0,
                stated_interest_rate=15.0
            ),
            PaymentOption(
                option_id="std_icici_3m",
                type=PaymentType.STANDARD_EMI,
                label="ICICI Bank EMI (3M @ ₹871/mo • 15.0% APR)",
                tenure_months=3,
                monthly_installment=871.0,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=0.0,
                stated_interest_rate=15.0
            )
        ]
    )

    # Evaluate HDFC 3M
    resp = client.post(
        "/api/afford",
        json={
            "profile": sample_rahul_profile.model_dump(),
            "listing": myntra_listing.model_dump(),
            "selected_option_id": "std_hdfc_3m"
        },
        headers={"X-Paylens-Install-ID": "test_bank_emi"}
    )
    assert resp.status_code == 200
    data = resp.json()

    # Total outflow: (871 * 3) + (199 * 1.18) = 2613 + 234.82 = 2847.82
    expected_outflow = round((871.0 * 3) + (std_fee * 1.18), 2)
    assert abs(data["true_cost"]["total_outflow"] - expected_outflow) < 0.1

    # Hidden markup vs upfront cash price (2549) = 298.82
    assert abs(data["true_cost"]["hidden_markup"] - 298.82) < 0.1
    assert data["true_cost"]["nominal_annual_rate"] > 0
    assert data["verdict_level"] == "COMFORTABLE"

    # Evaluate switching to Cash Full
    resp_cash = client.post(
        "/api/afford",
        json={
            "profile": sample_rahul_profile.model_dump(),
            "listing": myntra_listing.model_dump(),
            "selected_option_id": "cash_full"
        },
        headers={"X-Paylens-Install-ID": "test_bank_emi"}
    )
    assert resp_cash.status_code == 200
    data_cash = resp_cash.json()
    assert data_cash["true_cost"]["total_outflow"] == 2549.0
    assert data_cash["true_cost"]["hidden_markup"] == 0.0


def test_amazon_url_and_listing_variations(sample_rahul_profile):
    """
    Verifies that Amazon listings across standard /dp/, short /d/, and mobile layouts
    evaluate correctly with instant bank discounts and No-Cost EMI options.
    """
    amazon_variations = [
        # 1. Short URL (/d/B0...) format
        Listing(
            product_id="B09XS7JWHH",
            title="Sony WH-1000XM5 Wireless Headphones",
            category="Audio",
            retailer="Amazon",
            upfront_cash_price=26990.0,
            cash_discount=2000.0,
            effective_cash_price=24990.0,
            payment_options=[
                PaymentOption(
                    option_id="cash_full",
                    type=PaymentType.CASH,
                    label="Full Payment (Includes ₹2,000 Bank Discount)",
                    tenure_months=1,
                    monthly_installment=24990.0,
                    upfront_downpayment=0.0,
                    processing_fee=0.0,
                    lost_cash_discount=None,
                    stated_interest_rate=0.0
                ),
                PaymentOption(
                    option_id="nocost_6m",
                    type=PaymentType.NO_COST_EMI,
                    label="No-Cost EMI (6 Months)",
                    tenure_months=6,
                    monthly_installment=4498.33,
                    upfront_downpayment=0.0,
                    processing_fee=199.0,
                    lost_cash_discount=2000.0,
                    stated_interest_rate=0.0
                )
            ]
        ),
        # 2. Mobile / Deal layout format
        Listing(
            product_id="B0CHX1W1XY",
            title="Apple iPhone 16 (128 GB) - Ultramarine",
            category="Smartphones",
            retailer="Amazon",
            upfront_cash_price=79900.0,
            cash_discount=5000.0,
            effective_cash_price=74900.0,
            payment_options=[
                PaymentOption(
                    option_id="cash_full",
                    type=PaymentType.CASH,
                    label="Full Payment (Includes ₹5,000 Bank Offer)",
                    tenure_months=1,
                    monthly_installment=74900.0,
                    upfront_downpayment=0.0,
                    processing_fee=0.0,
                    lost_cash_discount=None,
                    stated_interest_rate=0.0
                ),
                PaymentOption(
                    option_id="nocost_6m",
                    type=PaymentType.NO_COST_EMI,
                    label="No-Cost EMI (6 Months)",
                    tenure_months=6,
                    monthly_installment=13316.67,
                    upfront_downpayment=0.0,
                    processing_fee=199.0,
                    lost_cash_discount=5000.0,
                    stated_interest_rate=0.0
                )
            ]
        )
    ]

    for listing in amazon_variations:
        resp = client.post(
            "/api/afford",
            json={
                "profile": sample_rahul_profile.model_dump(),
                "listing": listing.model_dump(),
                "selected_option_id": "nocost_6m"
            },
            headers={"X-Paylens-Install-ID": "test_amz_variations"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["verdict_level"] in ["COMFORTABLE", "STRETCH"]
        assert data["true_cost"]["effective_annual_rate"] > 0
        assert data["true_cost"]["hidden_markup"] > 0



