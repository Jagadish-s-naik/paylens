"""
app/core/validate.py
Deterministic sanity gates G1-G3 and health scoring for extracted payslip data.
Pure Python. Zero external dependencies beyond app.core.
"""

from typing import List, Dict, Any, Union
from app.core.schemas import PayslipData

class ValidationResult:
    def __init__(
        self,
        passed: bool,
        health_score: int,
        warnings: List[str],
        needs_review_fields: List[str]
    ):
        self.passed = passed
        self.health_score = health_score
        self.warnings = warnings
        self.needs_review_fields = needs_review_fields

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "health_score": self.health_score,
            "warnings": self.warnings,
            "needs_review_fields": self.needs_review_fields
        }

def validate_payslip_data(data: Union[PayslipData, Dict[str, Any]]) -> ValidationResult:
    """
    Applies deterministic gates G1–G3 to verify internal arithmetic of a payslip:
    - G1: Basic + HRA + Allowances ≈ Gross Monthly (within 2%)
    - G2: Gross Monthly - Deductions ≈ Net Pay (within 2%)
    - G3: 0 < Net Pay <= Gross Monthly
    Calculates a health/confidence score (0-100).
    """
    if isinstance(data, PayslipData):
        d = data.model_dump()
    else:
        d = dict(data)

    gross = float(d.get("gross_monthly", 0.0))
    basic = float(d.get("basic", 0.0))
    hra = float(d.get("hra", 0.0))
    special = float(d.get("special_allowance", 0.0))
    other_earn = float(d.get("other_earnings", 0.0))

    pf = float(d.get("pf_employee", 0.0))
    pt = float(d.get("professional_tax", 0.0))
    tds = float(d.get("tds", 0.0))
    other_ded = float(d.get("other_deductions", 0.0))
    net = float(d.get("net_pay", 0.0))

    warnings: List[str] = []
    needs_review: List[str] = []
    score = 100

    # Sanity checks on non-zero gross
    if gross <= 0:
        warnings.append("Gross monthly earnings must be greater than zero.")
        needs_review.append("gross_monthly")
        score -= 40

    if basic <= 0 and gross > 0:
        warnings.append("Basic salary component is missing or zero.")
        needs_review.append("basic")
        score -= 15

    # Gate G1: Gross Consistency (earnings sum vs gross)
    earnings_sum = basic + hra + special + other_earn
    if gross > 0 and earnings_sum > 0:
        discrepancy = abs(earnings_sum - gross)
        if discrepancy > (0.02 * gross) and discrepancy > 10.0:
            warnings.append(
                f"Gate G1 Mismatch: Sum of earnings components (₹{earnings_sum:,.2f}) "
                f"differs from Gross Monthly (₹{gross:,.2f}) by ₹{discrepancy:,.2f}."
            )
            needs_review.append("gross_monthly")
            score -= 25

    # Gate G2: Deductions & Net Consistency (gross - deductions vs net)
    deductions_sum = pf + pt + tds + other_ded
    expected_net = gross - deductions_sum
    if gross > 0 and net > 0:
        net_discrepancy = abs(expected_net - net)
        if net_discrepancy > (0.02 * gross) and net_discrepancy > 10.0:
            warnings.append(
                f"Gate G2 Mismatch: Gross minus deductions yields ₹{expected_net:,.2f}, "
                f"which differs from Net Pay (₹{net:,.2f}) by ₹{net_discrepancy:,.2f}."
            )
            needs_review.append("net_pay")
            score -= 25

    # Gate G3: Take-Home Boundary
    if net <= 0:
        warnings.append("Gate G3 Violation: Net pay must be strictly positive.")
        needs_review.append("net_pay")
        score -= 30
    elif gross > 0 and net > gross:
        warnings.append("Gate G3 Violation: Net pay cannot exceed Gross monthly pay.")
        needs_review.append("net_pay")
        score -= 30

    final_score = max(0, min(100, score))
    passed = len(needs_review) == 0

    return ValidationResult(
        passed=passed,
        health_score=final_score,
        warnings=warnings,
        needs_review_fields=list(set(needs_review))
    )
