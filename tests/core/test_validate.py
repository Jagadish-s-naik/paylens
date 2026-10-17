"""
tests/core/test_validate.py
Unit tests for deterministic payslip sanity gates G1–G3.
"""

from app.core.validate import validate_payslip_data
from app.core.schemas import PayslipData

def test_validate_healthy_payslip():
    data = PayslipData(
        employee_name="Rahul Sharma",
        company_name="Acme Tech",
        pay_period="March 2026",
        basic=40000.0,
        hra=20000.0,
        special_allowance=20000.0,
        gross_monthly=80000.0,
        pf_employee=4800.0,
        professional_tax=200.0,
        tds=0.0,
        other_deductions=0.0,
        net_pay=75000.0
    )
    result = validate_payslip_data(data)
    assert result.passed is True
    assert result.health_score == 100
    assert len(result.warnings) == 0
    assert len(result.needs_review_fields) == 0

def test_gate_g1_gross_mismatch():
    # Earnings sum = 40k + 20k + 10k = 70k, but Gross declared is 80k (10k diff > 2%)
    data = {
        "basic": 40000.0,
        "hra": 20000.0,
        "special_allowance": 10000.0,
        "gross_monthly": 80000.0,
        "pf_employee": 4800.0,
        "professional_tax": 200.0,
        "net_pay": 75000.0
    }
    result = validate_payslip_data(data)
    assert result.passed is False
    assert "gross_monthly" in result.needs_review_fields
    assert any("Gate G1 Mismatch" in w for w in result.warnings)
    assert result.health_score < 100

def test_gate_g2_net_mismatch():
    # Gross 80k - Deductions 5k = expected 75k, but Net is declared as 65k (10k diff > 2%)
    data = {
        "basic": 40000.0,
        "hra": 20000.0,
        "special_allowance": 20000.0,
        "gross_monthly": 80000.0,
        "pf_employee": 4800.0,
        "professional_tax": 200.0,
        "net_pay": 65000.0
    }
    result = validate_payslip_data(data)
    assert result.passed is False
    assert "net_pay" in result.needs_review_fields
    assert any("Gate G2 Mismatch" in w for w in result.warnings)

def test_gate_g3_net_exceeds_gross():
    data = {
        "basic": 40000.0,
        "gross_monthly": 50000.0,
        "net_pay": 60000.0  # Net exceeds Gross!
    }
    result = validate_payslip_data(data)
    assert result.passed is False
    assert "net_pay" in result.needs_review_fields
    assert any("Gate G3 Violation" in w for w in result.warnings)
