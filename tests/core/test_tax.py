"""
tests/core/test_tax.py
Unit tests for app.core.tax module.
Verifies FY 2025-26 New & Old Tax Regime slabs, Section 87A rebate, standard deduction, and marginal relief.
"""

import pytest
from app.core.tax import (
    calculate_new_regime_tax,
    calculate_old_regime_tax,
    calculate_hra_exemption,
    compare_tax_regimes,
    TaxInput
)

def test_new_regime_10_lakhs_zero_tax():
    """Gross Rs 10,00,000 -> Taxable 9,25,000 -> Tax is Rs 0 (87A rebate applies)."""
    res = calculate_new_regime_tax(10_00_000)
    assert res["taxable_income"] == 9_25_000
    assert res["total_annual_tax"] == 0.0

def test_new_regime_15_lakhs_sanity():
    """Gross Rs 15,00,000 -> Taxable 14,25,000 -> Tax before cess 93,750 -> Total 97,500."""
    res = calculate_new_regime_tax(15_00_000)
    assert res["taxable_income"] == 14_25_000
    assert res["tax_before_cess"] == 93_750
    assert res["cess"] == 3_750
    assert res["total_annual_tax"] == 97_500

def test_new_regime_marginal_relief():
    """Tests marginal relief immediately above 12L taxable."""
    # Gross 12.9L -> Taxable 12.15L (15k above 12L) -> Tax before cess capped at 15,000
    res = calculate_new_regime_tax(12_90_000)
    assert res["taxable_income"] == 12_15_000
    assert res["tax_before_cess"] == 15_000
    assert res["cess"] == 600.0
    assert res["total_annual_tax"] == 15_600

def test_hra_exemption_metro():
    """Tests HRA exemption Section 10(13A) metro calculation."""
    hra = calculate_hra_exemption(basic_annual=6_00_000, hra_annual=2_40_000, rent_annual=2_40_000, is_metro=True)
    assert hra == 1_80_000

def test_old_regime_rebate_5_lakhs():
    """Tests Old Regime 87A rebate for taxable <= 5L."""
    res = calculate_old_regime_tax(
        gross_annual=5_50_000,
        basic_annual=2_50_000,
        hra_annual=1_00_000,
        rent_annual=0,
        is_metro=False,
        pf_employee_annual=0
    )
    assert res["taxable_income"] == 5_00_000
    assert res["total_annual_tax"] == 0.0
