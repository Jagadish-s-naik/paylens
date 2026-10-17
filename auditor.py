"""
Paylens Payslip Auditor Module (Month-over-Month Anomaly Detector)
Compares 2 or 3 payslips and identifies payroll discrepancies:
- Sudden TDS tax jumps without gross change
- PF deducted on the wrong wage base (12% of basic vs 15k cap)
- Professional tax deviations
- Drop-offs in recurring allowances
"""

from typing import List, Dict, Any
from pydantic import BaseModel
from extract import PayslipData

class AnomalyFlag(BaseModel):
    category: str       # "TAX_SPIKE", "PF_MISMATCH", "PT_ANOMALY", "ALLOWANCE_DROP", "NET_DROP"
    severity: str       # "CRITICAL", "WARNING", "INFO"
    title: str
    message: str
    difference: float

class AuditReport(BaseModel):
    months_audited: List[str]
    total_anomalies_found: int
    health_score: int               # 0-100 (100 = 0 payroll errors)
    anomalies: List[AnomalyFlag]
    summary_advice: str

def audit_monthly_payslips(payslips: List[PayslipData], state: str = "KA") -> AuditReport:
    """
    Audits a sequence of 2 or more payslips sorted chronologically.
    """
    if len(payslips) < 2:
        return AuditReport(
            months_audited=[p.pay_period for p in payslips],
            total_anomalies_found=0,
            health_score=100,
            anomalies=[],
            summary_advice="Upload at least 2 payslips to perform month-over-month payroll audit."
        )

    anomalies: List[AnomalyFlag] = []
    
    # 1. Single-Slip Compliance Checks (Audit each slip individually)
    for p in payslips:
        # EPF Base Check: Employee PF must either be 12% of Basic OR capped at 12% of 15,000 (Rs 1,800)
        expected_pf_full = round(p.basic * 0.12, 2)
        statutory_cap_pf = 1800.0
        
        if p.pf_employee > 0:
            diff_from_actual = abs(p.pf_employee - expected_pf_full)
            diff_from_cap = abs(p.pf_employee - statutory_cap_pf)
            
            if diff_from_actual > 5.0 and diff_from_cap > 5.0:
                anomalies.append(AnomalyFlag(
                    category="PF_MISMATCH",
                    severity="WARNING",
                    title=f"PF Deduction Mismatch ({p.pay_period})",
                    message=f"PF deducted is ₹{p.pf_employee:,.0f}, but 12% of your Basic (₹{p.basic:,.0f}) is ₹{expected_pf_full:,.0f} (or ₹1,800 statutory cap). Check with payroll.",
                    difference=round(p.pf_employee - expected_pf_full, 2)
                ))
                
        # Professional Tax Check (e.g. Karnataka: Rs 200/mo flat, Feb can be Rs 300)
        if state == "KA" and p.gross_monthly >= 15000:
            if p.professional_tax not in [200.0, 300.0, 0.0]:
                anomalies.append(AnomalyFlag(
                    category="PT_ANOMALY",
                    severity="INFO",
                    title=f"Professional Tax Variance ({p.pay_period})",
                    message=f"PT deducted is ₹{p.professional_tax:,.0f}. Karnataka standard PT is flat ₹200/month.",
                    difference=round(p.professional_tax - 200.0, 2)
                ))

    # 2. Month-over-Month Delta Checks
    for i in range(len(payslips) - 1):
        prev = payslips[i]
        curr = payslips[i + 1]
        
        # Check TDS Spike
        tds_diff = curr.tds - prev.tds
        gross_diff = curr.gross_monthly - prev.gross_monthly
        
        # If TDS spiked by > ₹2,000 without a proportional gross hike
        if tds_diff >= 2000.0 and gross_diff < tds_diff:
            anomalies.append(AnomalyFlag(
                category="TAX_SPIKE",
                severity="CRITICAL",
                title=f"Sudden TDS Tax Jump ({curr.pay_period})",
                message=f"TDS jumped by ₹{tds_diff:,.0f} from {prev.pay_period} (₹{prev.tds:,.0f} → ₹{curr.tds:,.0f}) while gross salary only changed by ₹{gross_diff:,.0f}. Often occurs if investment declaration proofs were missed by HR.",
                difference=round(tds_diff, 2)
            ))
            
        # Check Missing Recurring Allowance (Special Allowance dropped by > 10%)
        if prev.special_allowance > 0 and curr.special_allowance < (prev.special_allowance * 0.85):
            allowance_drop = prev.special_allowance - curr.special_allowance
            anomalies.append(AnomalyFlag(
                category="ALLOWANCE_DROP",
                severity="WARNING",
                title=f"Special Allowance Drop ({curr.pay_period})",
                message=f"Special allowance decreased by ₹{allowance_drop:,.0f} (from ₹{prev.special_allowance:,.0f} to ₹{curr.special_allowance:,.0f}). Confirm whether LOP (loss of pay) was deducted.",
                difference=round(allowance_drop, 2)
            ))
            
        # Check Net Pay Drop despite Gross staying flat/rising
        if curr.gross_monthly >= prev.gross_monthly and curr.net_pay < prev.net_pay:
            net_drop = prev.net_pay - curr.net_pay
            if net_drop > 500:
                anomalies.append(AnomalyFlag(
                    category="NET_DROP",
                    severity="WARNING",
                    title=f"Take-Home Dropped ({curr.pay_period})",
                    message=f"Your in-hand salary dropped by ₹{net_drop:,.0f} despite your gross salary remaining stable.",
                    difference=round(net_drop, 2)
                ))

    # Compute Health Score (Deduct 20 for CRITICAL, 10 for WARNING, 5 for INFO)
    penalty = sum(25 if a.severity == "CRITICAL" else 15 if a.severity == "WARNING" else 5 for a in anomalies)
    health_score = max(0, 100 - penalty)
    
    if health_score == 100:
        summary_advice = "✅ Payroll Health: Excellent! Your deductions and allowances are fully consistent."
    elif health_score >= 70:
        summary_advice = "⚠️ Payroll Health: Minor discrepancies found. Review the flagged deductions with HR."
    else:
        summary_advice = "🚨 Payroll Health: Action Required! Unexplained tax spikes or PF mismatches detected."

    return AuditReport(
        months_audited=[p.pay_period for p in payslips],
        total_anomalies_found=len(anomalies),
        health_score=health_score,
        anomalies=anomalies,
        summary_advice=summary_advice
    )
