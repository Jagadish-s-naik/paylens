import pytest
from emi import safe_emi, loan_capacity, effective_annual_rate

def test_safe_emi():
    """Tests safe EMI formula: (take_home * ratio) - existing_emis."""
    # Take home 80,000, 35% ratio = 28,000. Existing EMI = 8,000 -> Safe = 20,000
    res = safe_emi(take_home_monthly=80_000, ratio=0.35, existing_emis=8_000)
    assert res == 20_000.0

    # Negative edge case capped at 0
    res_neg = safe_emi(take_home_monthly=50_000, ratio=0.20, existing_emis=20_000)
    assert res_neg == 0.0

def test_loan_capacity():
    """Tests loan principal capacity calculation."""
    # 0% rate annuity check: emi * months
    assert loan_capacity(emi=10_000, annual_rate=0.0, months=12) == 120_000.0

    # Standard 12% loan over 24 months with EMI 15,000
    cap = loan_capacity(emi=15_000, annual_rate=12.0, months=24)
    # Expected PV ~ 3,18,650
    assert 315_000 < cap < 325_000

def test_effective_annual_rate_true_zero():
    """Tests true zero-cost EMI with no fee and no lost cash discount."""
    res = effective_annual_rate(
        listed_price=60_000,
        monthly_emi=10_000,
        months=6,
        processing_fee=0.0,
        upfront_discount=0.0
    )
    assert res["effective_annual_rate"] == 0.0
    assert res["is_truly_zero_cost"] is True

def test_effective_annual_rate_hidden_interest():
    """
    Tests No-Cost EMI that hides cost via processing fee and lost upfront discount.
    E.g. Phone listed at Rs 50,000.
    Cash price today = Rs 46,000 (Rs 4,000 upfront discount if paid in full).
    EMI scheme: 6 months @ Rs 8,333.33 + Rs 999 processing fee.
    Effective rate must be positive and substantial.
    """
    res = effective_annual_rate(
        listed_price=50_000,
        monthly_emi=8_333.33,
        months=6,
        processing_fee=999.0,
        upfront_discount=4_000.0
    )
    assert res["is_truly_zero_cost"] is False
    assert res["effective_annual_rate"] > 20.0 # Significant hidden interest revealed!
    assert res["total_extra_cost"] > 4_000
