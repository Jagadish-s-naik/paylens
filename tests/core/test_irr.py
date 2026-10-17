"""
tests/core/test_irr.py
Unit tests for app.core.irr module.
Verifies bisection IRR solver, true 0% interest detection, and hidden markup calculation.
"""

import pytest
from app.core.irr import effective_annual_rate, safe_emi, loan_capacity

def test_safe_emi():
    assert safe_emi(100_000, ratio=0.35, existing_emis=10_000) == 25_000.0
    assert safe_emi(50_000, ratio=0.35, existing_emis=20_000) == 0.0

def test_loan_capacity():
    cap = loan_capacity(10_000, annual_rate=12.0, months=36)
    assert 300_000 < cap < 310_000

def test_effective_annual_rate_true_zero():
    """When EMI * months == cash price and fee is 0, EAR must be 0%."""
    res = effective_annual_rate(
        listed_price=30_000,
        monthly_emi=5_000,
        months=6,
        processing_fee=0.0,
        upfront_discount=0.0
    )
    assert res["is_truly_zero_cost"] is True
    assert res["effective_annual_rate"] == 0.0
    assert res["nominal_annual_rate"] == 0.0
    assert res["total_extra_cost"] == 0.0

def test_effective_annual_rate_hidden_interest():
    """
    Item: 30,000. Upfront discount: 2,000 -> Cash price: 28,000.
    EMI: 5,000 x 6 = 30,000. Processing fee: 199 (+18% GST = 234.82).
    Forfeiting 2,000 discount over 6 months must result in substantial EAR (>25%).
    """
    res = effective_annual_rate(
        listed_price=30_000,
        monthly_emi=5000,
        months=6,
        processing_fee=199.0,
        upfront_discount=2000.0
    )
    assert res["is_truly_zero_cost"] is False
    assert res["effective_annual_rate"] > 25.0
    assert res["nominal_annual_rate"] > 20.0
    assert res["total_extra_cost"] > 2200.0
