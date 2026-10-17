"""
tests/core/test_alternatives.py
Unit tests for app.core.alternatives module.
Verifies honest re-scoring of alternatives, wait-and-save with roll-off, and savings protection.
"""

import pytest
from app.core.schemas import VerifiedProfile, Listing, PaymentOption, PaymentType, ActiveEMI
from app.core.alternatives import generate_alternatives

def test_alternatives_rahul_iphone():
    """Rahul has Rs 150k savings, Rs 18k rent, essentials Rs 40.5k (3m cushion = 121.5k)."""
    profile = VerifiedProfile(
        profile_id="prof_rahul",
        employer_name="Acme",
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
    alts = generate_alternatives(profile, listing, listing.payment_options[0])
    
    # 1. Buy in cash today must be re-scored as RISKY because post-purchase runway is 0.87m (< 2.0m)!
    cash_alt = next(a for a in alts if a.strategy == "BUY_CASH")
    assert cash_alt.is_feasible is True
    assert cash_alt.rescore_verdict == "RISKY"
    assert cash_alt.runway_after < 1.0
    
    # 2. Wait & Save: should take 3 months and preserve 3-month cushion
    wait_alt = next(a for a in alts if a.strategy == "WAIT_AND_SAVE")
    assert wait_alt.is_feasible is True
    assert wait_alt.suggested_tenure_months == 3
    assert wait_alt.money_saved > 5000

def test_alternatives_amit_infeasible_cash():
    """Amit has Rs 25k savings, price is Rs 140k -> Cash option is marked not possible."""
    profile = VerifiedProfile(
        profile_id="prof_amit",
        employer_name="Infosol",
        gross_monthly=50000.0,
        basic_monthly=25000.0,
        in_hand_verified=46800.0,
        rent_monthly=14000.0,
        current_savings=25000.0,
        existing_emis=[ActiveEMI(name="Bike", monthly_amount=8000.0, tenure_remaining_months=8)]
    )
    listing = Listing(
        product_id="laptop",
        title="Laptop",
        upfront_cash_price=145000.0,
        cash_discount=5000.0,
        effective_cash_price=140000.0,
        payment_options=[
            PaymentOption(
                option_id="opt_12m",
                type=PaymentType.STANDARD_EMI,
                label="EMI 12m",
                tenure_months=12,
                monthly_installment=13160.0
            )
        ]
    )
    alts = generate_alternatives(profile, listing, listing.payment_options[0])
    cash_alt = next(a for a in alts if a.strategy == "BUY_CASH")
    assert cash_alt.is_feasible is False
    assert "Not possible" in cash_alt.description
