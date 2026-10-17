import pytest
from tax import (
    calculate_new_regime_tax,
    calculate_old_regime_tax,
    calculate_hra_exemption,
    compare_tax_regimes,
    TaxInput
)

def test_sanity_check_15_lakhs_new_regime():
    """
    Sanity check required by spec:
    Gross Rs 15,00,000/year, new regime -> taxable 14,25,000 -> tax before cess 93,750 -> total 97,500.
    """
    res = calculate_new_regime_tax(15_00_000)
    assert res["taxable_income"] == 14_25_000
    assert res["tax_before_cess"] == 93_750
    assert res["cess"] == 3_750
    assert res["total_annual_tax"] == 97_500
    assert res["monthly_tax"] == round(97_500 / 12, 2)

def test_sanity_check_10_lakhs_new_regime():
    """
    Sanity check required by spec:
    Gross Rs 10,00,000, new regime -> 0 tax (Section 87A rebate applies).
    """
    res = calculate_new_regime_tax(10_00_000)
    assert res["taxable_income"] == 9_25_000
    assert res["total_annual_tax"] == 0.0

def test_new_regime_marginal_relief():
    """
    Tests marginal relief just above Rs 12,00,000 taxable income.
    Tax cannot exceed the excess income above 12L.
    """
    # Gross 12,90,000 -> Taxable = 12,15,000 (15,000 above 12L)
    res = calculate_new_regime_tax(12_90_000)
    assert res["taxable_income"] == 12_15_000
    # Raw tax would be 62,250, but excess is only 15,000
    assert res["tax_before_cess"] == 15_000
    assert res["cess"] == 600.0
    assert res["total_annual_tax"] == 15_600

def test_hra_exemption_metro():
    """Tests HRA exemption under Section 10(13A) for metro."""
    # Basic: 6L, Actual HRA: 2.4L, Rent: 2.4L -> Rent - 10% basic = 2.4L - 60k = 1.8L
    # Metro cap = 50% of 6L = 3L
    # Min(2.4L, 1.8L, 3.0L) = 1.8L
    hra = calculate_hra_exemption(basic_annual=6_00_000, hra_annual=2_40_000, rent_annual=2_40_000, is_metro=True)
    assert hra == 1_80_000

def test_old_regime_rebate():
    """Tests Section 87A rebate in Old Regime for taxable income <= 5L."""
    res = calculate_old_regime_tax(
        gross_annual=5_50_000,
        basic_annual=2_50_000,
        hra_annual=1_00_000,
        rent_annual=0,
        is_metro=False,
        pf_employee_annual=0
    )
    # Taxable = 5,50,000 - 50,000 standard deduction = 5,00,000 -> Tax = 0
    assert res["taxable_income"] == 5_00_000
    assert res["total_annual_tax"] == 0.0

def test_compare_tax_regimes():
    """Tests comparative output and take-home pay."""
    data = TaxInput(
        gross_monthly=1_00_000,
        basic_monthly=50_000,
        hra_monthly=20_000,
        pf_employee_monthly=6_000,
        professional_tax_monthly=200,
        rent_monthly=15_000,
        is_metro=True,
        other_80c_annual=50_000
    )
    result = compare_tax_regimes(data)
    assert result["gross_annual"] == 12_00_000
    assert result["better_regime"] in ["NEW", "OLD"]
    assert result["annual_savings"] >= 0
    assert result["recommended_take_home"] > 0
