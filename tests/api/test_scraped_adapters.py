"""
tests/api/test_scraped_adapters.py
Tests verifying reverse-engineered Buyhatke extraction payloads (Amazon InEMI & Flipkart EMI schemes)
integrated into the Paylens true-cost engine and API routes.
"""

import pytest
from app.core.schemas import VerifiedProfile, Listing, PaymentOption, PaymentType
from app.core.engine import evaluate_affordability


@pytest.fixture
def profile_rahul():
    return VerifiedProfile(
        profile_id="prof_rahul_buyhatke_test",
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
def amazon_scraped_inemi_listing():
    """Simulates Amazon listing extracted via Buyhatke selectors + InEMI live rates endpoint."""
    list_price = 84999.0
    cash_discount = 5000.0  # Instant Bank Offer
    effective_cash = list_price - cash_discount  # 79999.0
    std_fee = 199.0

    return Listing(
        product_id="B0CHX1W1XY",
        title="Apple iPhone 16 Pro (128 GB) - Natural Titanium",
        category="Smartphones",
        retailer="Amazon",
        upfront_cash_price=list_price,
        cash_discount=cash_discount,
        effective_cash_price=effective_cash,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label="Full Payment (Includes ₹5,000 Bank Discount)",
                tenure_months=1,
                monthly_installment=effective_cash,
                upfront_downpayment=0.0,
                processing_fee=0.0,
                lost_cash_discount=None,
                stated_interest_rate=0.0
            ),
            PaymentOption(
                option_id="nocost_6m",
                type=PaymentType.NO_COST_EMI,
                label="No-Cost EMI (6 Months — HDFC/SBI/ICICI)",
                tenure_months=6,
                monthly_installment=round(list_price / 6, 2),
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=0.0
            ),
            PaymentOption(
                option_id="nocost_hdfc_6m",
                type=PaymentType.NO_COST_EMI,
                label="HDFC Bank No-Cost EMI (6 Months)",
                tenure_months=6,
                monthly_installment=14166.50,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=0.0
            ),
            PaymentOption(
                option_id="std_icici_12m",
                type=PaymentType.STANDARD_EMI,
                label="ICICI Bank Standard EMI (12 Months @ 15% APR)",
                tenure_months=12,
                monthly_installment=7673.80,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=15.0
            )
        ]
    )


@pytest.fixture
def flipkart_scraped_widget_listing():
    """Simulates Flipkart listing extracted via Buyhatke selectors + EMI_OFFER_PILL."""
    list_price = 72990.0
    cash_discount = 4000.0
    effective_cash = list_price - cash_discount  # 68990.0
    std_fee = 199.0

    return Listing(
        product_id="MOBGTAGV7SZGFZHH",
        title="Google Pixel 9 (Peony, 256 GB)",
        category="Smartphones",
        retailer="Flipkart",
        upfront_cash_price=list_price,
        cash_discount=cash_discount,
        effective_cash_price=effective_cash,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label="Full Payment (Includes ₹4,000 Bank Offer)",
                tenure_months=1,
                monthly_installment=effective_cash,
                upfront_downpayment=0.0,
                processing_fee=0.0,
                lost_cash_discount=None,
                stated_interest_rate=0.0
            ),
            PaymentOption(
                option_id="nocost_6m",
                type=PaymentType.NO_COST_EMI,
                label="No-Cost EMI (6 Months — SBI/ICICI/Kotak)",
                tenure_months=6,
                monthly_installment=round(list_price / 6, 2),
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=0.0
            ),
            PaymentOption(
                option_id="nocost_axis_3m",
                type=PaymentType.NO_COST_EMI,
                label="Flipkart Axis Bank No-Cost EMI (3 Months)",
                tenure_months=3,
                monthly_installment=24330.0,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=0.0
            ),
            PaymentOption(
                option_id="std_sbi_12m",
                type=PaymentType.STANDARD_EMI,
                label="SBI Card Standard EMI (12 Months @ 14.5% APR)",
                tenure_months=12,
                monthly_installment=6571.20,
                upfront_downpayment=0.0,
                processing_fee=std_fee,
                lost_cash_discount=cash_discount,
                stated_interest_rate=14.5
            )
        ]
    )


def test_amazon_buyhatke_hdfc_nocost_evaluation(profile_rahul, amazon_scraped_inemi_listing):
    """Verifies that reverse-engineered HDFC No-Cost EMI accurately detects lost cash discount and APR markup."""
    verdict = evaluate_affordability(
        profile=profile_rahul,
        listing=amazon_scraped_inemi_listing,
        selected_option_id="nocost_hdfc_6m"
    )

    assert verdict.selected_option.option_id == "nocost_hdfc_6m"
    assert verdict.selected_option.type == PaymentType.NO_COST_EMI
    # Total outflow includes monthly installments + processing fee (+ 18% GST)
    expected_outflow = 84999.0 + (199.0 * 1.18)
    assert verdict.true_cost.total_outflow == pytest.approx(expected_outflow, abs=1.0)
    # Hidden markup should be total outflow minus effective cash price
    assert verdict.true_cost.hidden_markup == pytest.approx(verdict.true_cost.total_outflow - 79999.0, abs=1.0)
    # Effective annual rate must reflect hidden APR > 0 due to ₹5,000 lost cash discount
    assert verdict.true_cost.effective_annual_rate > 10.0


def test_amazon_buyhatke_standard_icici_evaluation(profile_rahul, amazon_scraped_inemi_listing):
    """Verifies ICICI Standard 12M EMI evaluation."""
    verdict = evaluate_affordability(
        profile=profile_rahul,
        listing=amazon_scraped_inemi_listing,
        selected_option_id="std_icici_12m"
    )

    assert verdict.selected_option.option_id == "std_icici_12m"
    assert verdict.selected_option.tenure_months == 12
    assert verdict.true_cost.total_outflow > amazon_scraped_inemi_listing.upfront_cash_price


def test_flipkart_buyhatke_axis_nocost_evaluation(profile_rahul, flipkart_scraped_widget_listing):
    """Verifies Flipkart Axis Bank 3M No-Cost EMI evaluation."""
    verdict = evaluate_affordability(
        profile=profile_rahul,
        listing=flipkart_scraped_widget_listing,
        selected_option_id="nocost_axis_3m"
    )

    assert verdict.selected_option.option_id == "nocost_axis_3m"
    assert verdict.selected_option.tenure_months == 3
    assert verdict.true_cost.hidden_markup == pytest.approx(verdict.true_cost.total_outflow - 68990.0, abs=1.0)
    assert verdict.true_cost.effective_annual_rate > 10.0


def test_flipkart_buyhatke_sbi_standard_evaluation(profile_rahul, flipkart_scraped_widget_listing):
    """Verifies Flipkart SBI 12M Standard EMI evaluation."""
    verdict = evaluate_affordability(
        profile=profile_rahul,
        listing=flipkart_scraped_widget_listing,
        selected_option_id="std_sbi_12m"
    )

    assert verdict.selected_option.option_id == "std_sbi_12m"
    assert verdict.selected_option.tenure_months == 12
    expected_outflow = (12 * 6571.20) + (199.0 * 1.18)
    assert verdict.true_cost.total_outflow == pytest.approx(expected_outflow, abs=1.0)
