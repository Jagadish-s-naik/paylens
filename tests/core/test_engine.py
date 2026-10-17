"""
tests/core/test_engine.py
Unit tests for app.core.engine module.
Tests worst-tier resolution and the 3 primary scenarios (Comfortable, Stretch, Risky).
"""

import pytest
from app.core.schemas import (
    VerifiedProfile,
    Listing,
    PaymentOption,
    PaymentType,
    ActiveEMI
)
from app.core.engine import get_tier, worst_tier, evaluate_affordability

def test_worst_tier_resolution():
    assert worst_tier(["COMFORTABLE", "COMFORTABLE", "COMFORTABLE"]) == "COMFORTABLE"
    assert worst_tier(["COMFORTABLE", "STRETCH", "COMFORTABLE"]) == "STRETCH"
    assert worst_tier(["COMFORTABLE", "STRETCH", "RISKY"]) == "RISKY"
    assert worst_tier(["RISKY", "COMFORTABLE"]) == "RISKY"

def test_scenario_1_comfortable():
    """Rahul buying Sony Headphones on 6m No-Cost EMI -> COMFORTABLE with High APR alert."""
    profile = VerifiedProfile(
        profile_id="prof_rahul",
        employer_name="Acme Tech",
        pay_period="March 2026",
        gross_monthly=80000.0,
        basic_monthly=40000.0,
        in_hand_verified=75000.0,
        rent_monthly=18000.0,
        current_savings=150000.0,
        existing_emis=[ActiveEMI(name="Old Phone", monthly_amount=3500.0, tenure_remaining_months=3)]
    )
    listing = Listing(
        product_id="sony_wh",
        title="Sony Headphones",
        upfront_cash_price=29990.0,
        cash_discount=2000.0,
        effective_cash_price=27990.0,
        payment_options=[
            PaymentOption(
                option_id="opt_6m",
                type=PaymentType.NO_COST_EMI,
                label="No-Cost EMI 6m",
                tenure_months=6,
                monthly_installment=4998.33,
                processing_fee=199.0,
                lost_cash_discount=2000.0
            )
        ]
    )
    v = evaluate_affordability(profile, listing, "opt_6m")
    assert v.verdict_level == "COMFORTABLE"
    assert v.true_cost.has_high_apr_alert is True
    assert v.true_cost.effective_annual_rate > 30.0
    assert v.impact.foir_after < 0.35
    assert v.impact.free_cash_after > 20000

def test_scenario_2_stretch():
    """Rahul buying iPhone 16 Pro on 6m No-Cost EMI -> STRETCH (driven by free cash)."""
    profile = VerifiedProfile(
        profile_id="prof_rahul",
        employer_name="Acme Tech",
        pay_period="March 2026",
        gross_monthly=80000.0,
        basic_monthly=40000.0,
        in_hand_verified=75000.0,
        rent_monthly=18000.0,
        current_savings=150000.0,
        existing_emis=[ActiveEMI(name="Old Phone", monthly_amount=3500.0, tenure_remaining_months=3)]
    )
    listing = Listing(
        product_id="ip16p",
        title="iPhone 16 Pro",
        upfront_cash_price=119900.0,
        cash_discount=5000.0,
        effective_cash_price=114900.0,
        payment_options=[
            PaymentOption(
                option_id="opt_6m",
                type=PaymentType.NO_COST_EMI,
                label="No-Cost EMI 6m",
                tenure_months=6,
                monthly_installment=19983.33,
                processing_fee=199.0,
                lost_cash_discount=5000.0
            )
        ]
    )
    v = evaluate_affordability(profile, listing, "opt_6m")
    assert v.verdict_level == "STRETCH"
    assert v.impact.foir_after <= 0.35 # FOIR is comfortable (31.3%)
    assert v.impact.free_cash_ratio_after < 0.20 # But free cash is stretch (14.7%)!

def test_scenario_3_risky():
    """Amit buying Gaming Laptop on 12m EMI -> RISKY (cash deficit)."""
    profile = VerifiedProfile(
        profile_id="prof_amit",
        employer_name="Infosol",
        pay_period="March 2026",
        gross_monthly=50000.0,
        basic_monthly=25000.0,
        in_hand_verified=46800.0,
        rent_monthly=14000.0,
        current_savings=25000.0,
        existing_emis=[ActiveEMI(name="Bike Loan", monthly_amount=8000.0, tenure_remaining_months=8)]
    )
    listing = Listing(
        product_id="laptop",
        title="Gaming Laptop",
        upfront_cash_price=145000.0,
        cash_discount=5000.0,
        effective_cash_price=140000.0,
        payment_options=[
            PaymentOption(
                option_id="opt_12m",
                type=PaymentType.STANDARD_EMI,
                label="Standard EMI 12m",
                tenure_months=12,
                monthly_installment=13160.0,
                processing_fee=999.0,
                lost_cash_discount=5000.0,
                stated_interest_rate=15.0
            )
        ]
    )
    v = evaluate_affordability(profile, listing, "opt_12m")
    assert v.verdict_level == "RISKY"
    assert v.impact.free_cash_after < 0 # Triggers deficit!
