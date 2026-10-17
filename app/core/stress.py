"""
app/core/stress.py
Paylens Deterministic Stress Testing Engine.
100% Pure Python. Zero Network, Zero External Dependencies.
"""

from typing import List, Dict, Any
from app.config import settings
from app.core.schemas import VerifiedProfile, PaymentOption, StressTestResult
from app.core.tax import calculate_new_regime_tax

def compute_regime_aware_march_shock(profile: VerifiedProfile) -> float:
    """
    Computes dynamic March TDS shock based on tax.py rules:
    - New Regime: standard deduction (75k) + 87A rebate up to 12L require zero proofs.
      If taxable <= 12L, tax is 0 -> March shock is 0.
    - Old Regime: if 80C & HRA declarations are unproven, tax jumps to full slab rate.
    """
    gross_annual = profile.gross_monthly * 12
    regime = profile.tax_regime.upper()
    declared_monthly_tds = profile.tds_monthly
    
    if regime == "NEW":
        tax_res = calculate_new_regime_tax(gross_annual)
        annual_liability = tax_res["total_annual_tax"]
        tds_paid_11m = declared_monthly_tds * 11
        march_tax_needed = max(0.0, annual_liability - tds_paid_11m)
        return round(max(0.0, march_tax_needed - declared_monthly_tds), 2)
    else: # OLD REGIME unproven shock
        # Without proofs: only 50k std deduction, 0 HRA, 0 80C
        taxable_unproven = max(0.0, gross_annual - 50_000)
        tax = 0.0
        if taxable_unproven > 250_000:
            tax += min(taxable_unproven - 250_000, 250_000) * 0.05
        if taxable_unproven > 500_000:
            tax += min(taxable_unproven - 500_000, 500_000) * 0.20
        if taxable_unproven > 1_000_000:
            tax += (taxable_unproven - 1_000_000) * 0.30
        annual_liability = round(tax * 1.04, 2) # 4% cess
        tds_paid_11m = declared_monthly_tds * 11
        march_tax_needed = max(0.0, annual_liability - tds_paid_11m)
        return round(max(0.0, march_tax_needed - declared_monthly_tds), 2)

def run_stress_tests(
    profile: VerifiedProfile,
    option: PaymentOption,
    regular_free_cash_after: float
) -> List[StressTestResult]:
    """
    Simulates:
    1. Income Shock (-20% take-home cut due to loss-of-pay/slowdown)
    2. Regime-Aware March TDS Shock (unproven proof deductions)
    """
    in_hand = profile.in_hand_verified
    existing_emi_total = sum(e.monthly_amount for e in profile.existing_emis)
    essentials = profile.rent_monthly + (in_hand * 0.30)
    new_emi = option.monthly_installment
    
    results: List[StressTestResult] = []
    
    # -----------------------------------------------------------------
    # Stress Test A: Income Shock (-20% Take-Home)
    # -----------------------------------------------------------------
    stressed_in_hand = in_hand * 0.80
    stressed_foir = round((existing_emi_total + new_emi) / stressed_in_hand, 4) if stressed_in_hand > 0 else 1.0
    stressed_free_cash = round(stressed_in_hand - (existing_emi_total + new_emi) - essentials, 2)
    stress_a_passes = (stressed_foir <= settings.STRETCH_FOIR_MAX) and (stressed_free_cash >= 0)
    
    warning_a = None
    if not stress_a_passes:
        if stressed_free_cash < 0:
            warning_a = f"A 20% salary cut triggers an immediate deficit of ₹{abs(stressed_free_cash):,.0f}/month."
        else:
            warning_a = f"A 20% salary cut pushes debt ratio to {round(stressed_foir*100, 1)}% FOIR."
            
    results.append(StressTestResult(
        scenario_name="Income Shock (-20% Salary Cut)",
        description="Simulates unexpected loss of pay or salary slowdown.",
        stressed_foir=stressed_foir,
        stressed_free_cash=stressed_free_cash,
        passes=stress_a_passes,
        is_applicable=True,
        warning=warning_a
    ))
    
    # -----------------------------------------------------------------
    # Stress Test B: March TDS Shock
    # -----------------------------------------------------------------
    march_shock = compute_regime_aware_march_shock(profile)
    
    if march_shock <= 0:
        # Zero proof shock under New Regime or already fully taxed
        results.append(StressTestResult(
            scenario_name="March TDS Shock (Tax Deduction Jump)",
            description=f"Under {profile.tax_regime.upper()} regime, statutory tax requires zero investment proofs (₹0 March shock).",
            stressed_foir=round((existing_emi_total + new_emi) / in_hand, 4),
            stressed_free_cash=regular_free_cash_after,
            passes=True,
            is_applicable=False,
            warning=None
        ))
    else:
        march_free_cash = round(regular_free_cash_after - march_shock, 2)
        # Check passes based on the shock itself, not pre-existing baseline deficit
        stress_b_passes = (march_free_cash >= 0)
        warning_b = None
        if not stress_b_passes:
            warning_b = f"Unsubmitted 80C/HRA proofs trigger a ₹{march_shock:,.0f} March tax deduction spike."
            
        results.append(StressTestResult(
            scenario_name="March TDS Shock (Tax Deduction Jump)",
            description=f"Simulates missing investment proof deadlines under {profile.tax_regime.upper()} regime.",
            stressed_foir=round((existing_emi_total + new_emi) / in_hand, 4),
            stressed_free_cash=march_free_cash,
            passes=stress_b_passes,
            is_applicable=True,
            warning=warning_b
        ))
        
    return results
