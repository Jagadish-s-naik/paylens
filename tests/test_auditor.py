import pytest
from auditor import audit_monthly_payslips
from extract import PayslipData

def test_audit_tds_spike():
    """Tests detection of sudden TDS jump between Month 1 and Month 2."""
    slip1 = PayslipData(
        pay_period="April 2026",
        gross_monthly=80_000,
        basic=40_000,
        special_allowance=16_000,
        pf_employee=4_800,
        professional_tax=200,
        tds=1_000,
        net_pay=74_000
    )
    slip2 = PayslipData(
        pay_period="May 2026",
        gross_monthly=80_000,
        basic=40_000,
        special_allowance=16_000,
        pf_employee=4_800,
        professional_tax=200,
        tds=6_500, # Sudden spike!
        net_pay=68_500
    )
    report = audit_monthly_payslips([slip1, slip2])
    assert report.total_anomalies_found >= 1
    categories = [a.category for a in report.anomalies]
    assert "TAX_SPIKE" in categories
    assert report.health_score < 100

def test_audit_pf_mismatch():
    """Tests detection of wrong PF deduction amount."""
    slip = PayslipData(
        pay_period="June 2026",
        gross_monthly=80_000,
        basic=40_000,
        pf_employee=2_500, # Expected 4,800 or 1,800
        professional_tax=200,
        tds=1_000,
        net_pay=76_300
    )
    slip_prev = PayslipData(
        pay_period="May 2026",
        gross_monthly=80_000,
        basic=40_000,
        pf_employee=2_500,
        professional_tax=200,
        tds=1_000,
        net_pay=76_300
    )
    report = audit_monthly_payslips([slip_prev, slip])
    pf_anomalies = [a for a in report.anomalies if a.category == "PF_MISMATCH"]
    assert len(pf_anomalies) > 0
