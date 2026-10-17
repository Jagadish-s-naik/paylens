"""
tests/core/test_stress.py
Unit tests for app.core.stress module.
Verifies Income Shock (-20%) and Regime-Aware March TDS Shock.
"""

import pytest
from app.core.schemas import VerifiedProfile, PaymentOption, PaymentType
from app.core.stress import run_stress_tests, compute_regime_aware_march_shock

def test_march_shock_new_regime_is_zero():
    """Rahul on New Regime with gross Rs 80k/mo (9.6 LPA) has Rs 0 March TDS shock."""
    profile = VerifiedProfile(
        profile_id="prof_rahul",
        employer_name="Acme",
        gross_monthly=80000.0,
        basic_monthly=40000.0,
        in_hand_verified=75000.0,
        tax_regime="NEW",
        tds_monthly=0.0
    )
    shock = compute_regime_aware_march_shock(profile)
    assert shock == 0.0

def test_march_shock_old_regime_unproven():
    """Vikram on Old Regime with gross Rs 1,00,000/mo has massive March shock if 80C/HRA proofs fail."""
    profile = VerifiedProfile(
        profile_id="prof_vikram",
        employer_name="Enterprise",
        gross_monthly=100000.0,
        basic_monthly=50000.0,
        in_hand_verified=88000.0,
        tax_regime="OLD",
        tds_monthly=3000.0
    )
    shock = compute_regime_aware_march_shock(profile)
    assert shock > 100_000 # Unproven tax on 11.5L is ~163k minus 33k paid = ~127k

def test_income_shock_minus_20():
    profile = VerifiedProfile(
        profile_id="prof_rahul",
        employer_name="Acme",
        gross_monthly=80000.0,
        basic_monthly=40000.0,
        in_hand_verified=75000.0,
        rent_monthly=18000.0
    )
    opt = PaymentOption(
        option_id="opt_1",
        type=PaymentType.NO_COST_EMI,
        label="EMI",
        tenure_months=6,
        monthly_installment=19983.33
    )
    results = run_stress_tests(profile, opt, regular_free_cash_after=11016.67)
    income_shock = next(r for r in results if "Income Shock" in r.scenario_name)
    assert income_shock.passes is False # -20% pay cut causes deficit with 20k EMI
    assert income_shock.stressed_free_cash < 0
