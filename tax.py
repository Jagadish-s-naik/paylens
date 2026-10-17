"""
Paylens Tax Engine — FY 2025-26 Indian Income Tax Calculator
Deterministically computes taxes and take-home pay under New and Old Tax Regimes.
IMPORTANT: Slabs and rules are configured below for FY 2025-26 defaults.
Reference: Income Tax Department of India (incometax.gov.in).
"""

from typing import Dict, Any
from pydantic import BaseModel

# =====================================================================
# CONFIGURATION BLOCK: FY 2025-26 TAX SLABS & THRESHOLDS
# NOTE: Must be verified against incometax.gov.in for the target financial year.
# =====================================================================
FY_YEAR = "2025-26 (AY 2026-27)"

# New Tax Regime Config
NEW_REGIME_STANDARD_DEDUCTION = 75_000
NEW_REGIME_REBATE_87A_LIMIT = 12_00_000 # Full rebate if taxable income <= 12L
NEW_REGIME_SLABS = [
    (0, 4_00_000, 0.00),
    (4_00_000, 8_00_000, 0.05),
    (8_00_000, 12_00_000, 0.10),
    (12_00_000, 16_00_000, 0.15),
    (16_00_000, 20_00_000, 0.20),
    (20_00_000, 24_00_000, 0.25),
    (24_00_000, float("inf"), 0.30),
]

# Old Tax Regime Config
OLD_REGIME_STANDARD_DEDUCTION = 50_000
OLD_REGIME_REBATE_87A_LIMIT = 5_00_000 # Full rebate if taxable income <= 5L
OLD_REGIME_80C_MAX = 1_50_000
OLD_REGIME_80D_MAX = 25_000
OLD_REGIME_SLABS = [
    (0, 2_50_000, 0.00),
    (2_50_000, 5_00_000, 0.05),
    (5_00_000, 10_00_000, 0.20),
    (10_00_000, float("inf"), 0.30),
]

HEALTH_AND_EDUCATION_CESS_RATE = 0.04

class TaxInput(BaseModel):
    gross_monthly: float
    basic_monthly: float = 0.0
    hra_monthly: float = 0.0
    pf_employee_monthly: float = 0.0
    professional_tax_monthly: float = 0.0
    rent_monthly: float = 0.0
    is_metro: bool = True
    other_80c_annual: float = 0.0
    other_80d_annual: float = 0.0

def calculate_slab_tax(taxable_income: float, slabs: list) -> float:
    """Helper to calculate progressive slab tax before rebate and cess."""
    tax = 0.0
    for lower, upper, rate in slabs:
        if taxable_income > lower:
            taxable_chunk = min(taxable_income, upper) - lower
            tax += taxable_chunk * rate
        else:
            break
    return tax

def calculate_new_regime_tax(gross_annual: float) -> Dict[str, float]:
    """Calculates New Regime tax with standard deduction, Section 87A rebate & marginal relief."""
    taxable_income = max(0.0, gross_annual - NEW_REGIME_STANDARD_DEDUCTION)
    
    # Progressive slab tax
    raw_tax = calculate_slab_tax(taxable_income, NEW_REGIME_SLABS)
    
    # Section 87A Rebate & Marginal Relief
    if taxable_income <= NEW_REGIME_REBATE_87A_LIMIT:
        tax_after_rebate = 0.0
    else:
        # Marginal relief: Tax payable cannot exceed income exceeding Rs 12,00,000
        excess_income = taxable_income - NEW_REGIME_REBATE_87A_LIMIT
        tax_after_rebate = min(raw_tax, excess_income)
        
    cess = tax_after_rebate * HEALTH_AND_EDUCATION_CESS_RATE
    total_tax = round(tax_after_rebate + cess, 2)
    
    return {
        "taxable_income": round(taxable_income, 2),
        "tax_before_cess": round(tax_after_rebate, 2),
        "cess": round(cess, 2),
        "total_annual_tax": total_tax,
        "monthly_tax": round(total_tax / 12, 2),
        "standard_deduction": NEW_REGIME_STANDARD_DEDUCTION
    }

def calculate_hra_exemption(basic_annual: float, hra_annual: float, rent_annual: float, is_metro: bool) -> float:
    """Calculates annual HRA exemption under Section 10(13A)."""
    if rent_annual <= 0 or hra_annual <= 0 or basic_annual <= 0:
        return 0.0
    
    rent_minus_10_basic = max(0.0, rent_annual - (0.10 * basic_annual))
    basic_percentage_cap = 0.50 * basic_annual if is_metro else 0.40 * basic_annual
    
    exemption = min(hra_annual, rent_minus_10_basic, basic_percentage_cap)
    return round(max(0.0, exemption), 2)

def calculate_old_regime_tax(
    gross_annual: float,
    basic_annual: float,
    hra_annual: float,
    rent_annual: float,
    is_metro: bool,
    pf_employee_annual: float,
    other_80c_annual: float = 0.0,
    other_80d_annual: float = 0.0
) -> Dict[str, float]:
    """Calculates Old Regime tax with HRA exemption, 80C, 80D, and Section 87A rebate."""
    hra_exemption = calculate_hra_exemption(basic_annual, hra_annual, rent_annual, is_metro)
    deduction_80c = min(OLD_REGIME_80C_MAX, pf_employee_annual + other_80c_annual)
    deduction_80d = min(OLD_REGIME_80D_MAX, other_80d_annual)
    
    total_deductions = OLD_REGIME_STANDARD_DEDUCTION + hra_exemption + deduction_80c + deduction_80d
    taxable_income = max(0.0, gross_annual - total_deductions)
    
    raw_tax = calculate_slab_tax(taxable_income, OLD_REGIME_SLABS)
    
    # Section 87A Rebate in Old Regime (taxable <= 5 Lakhs)
    if taxable_income <= OLD_REGIME_REBATE_87A_LIMIT:
        tax_after_rebate = 0.0
    else:
        tax_after_rebate = raw_tax
        
    cess = tax_after_rebate * HEALTH_AND_EDUCATION_CESS_RATE
    total_tax = round(tax_after_rebate + cess, 2)
    
    return {
        "taxable_income": round(taxable_income, 2),
        "hra_exemption": hra_exemption,
        "deduction_80c": deduction_80c,
        "deduction_80d": deduction_80d,
        "total_deductions": total_deductions,
        "tax_before_cess": round(tax_after_rebate, 2),
        "cess": round(cess, 2),
        "total_annual_tax": total_tax,
        "monthly_tax": round(total_tax / 12, 2),
        "standard_deduction": OLD_REGIME_STANDARD_DEDUCTION
    }

def compare_tax_regimes(data: TaxInput) -> Dict[str, Any]:
    """
    Compares New vs Old Tax Regimes and computes monthly take-home pay.
    Formula: Monthly Take-Home = Gross - PF - Prof Tax - (Annual Tax / 12)
    """
    gross_annual = data.gross_monthly * 12
    basic_annual = data.basic_monthly * 12
    hra_annual = data.hra_monthly * 12
    rent_annual = data.rent_monthly * 12
    pf_annual = data.pf_employee_monthly * 12
    
    new_reg = calculate_new_regime_tax(gross_annual)
    old_reg = calculate_old_regime_tax(
        gross_annual=gross_annual,
        basic_annual=basic_annual,
        hra_annual=hra_annual,
        rent_annual=rent_annual,
        is_metro=data.is_metro,
        pf_employee_annual=pf_annual,
        other_80c_annual=data.other_80c_annual,
        other_80d_annual=data.other_80d_annual
    )
    
    # Monthly Take-Home calculations
    fixed_monthly_deductions = data.pf_employee_monthly + data.professional_tax_monthly
    take_home_new = round(data.gross_monthly - fixed_monthly_deductions - new_reg["monthly_tax"], 2)
    take_home_old = round(data.gross_monthly - fixed_monthly_deductions - old_reg["monthly_tax"], 2)
    
    # Comparison & Savings
    if new_reg["total_annual_tax"] <= old_reg["total_annual_tax"]:
        better_regime = "NEW"
        annual_savings = round(old_reg["total_annual_tax"] - new_reg["total_annual_tax"], 2)
        recommended_take_home = take_home_new
    else:
        better_regime = "OLD"
        annual_savings = round(new_reg["total_annual_tax"] - old_reg["total_annual_tax"], 2)
        recommended_take_home = take_home_old
        
    return {
        "financial_year": FY_YEAR,
        "gross_monthly": round(data.gross_monthly, 2),
        "gross_annual": round(gross_annual, 2),
        "new_regime": {
            **new_reg,
            "monthly_take_home": take_home_new
        },
        "old_regime": {
            **old_reg,
            "monthly_take_home": take_home_old
        },
        "better_regime": better_regime,
        "annual_savings": annual_savings,
        "monthly_savings": round(annual_savings / 12, 2),
        "recommended_take_home": recommended_take_home
    }
