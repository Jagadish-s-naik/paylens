"""
Paylens Offer Letter Decoder & Comparer
Deterministically breaks down CTC into guaranteed monthly in-hand salary,
month-by-month cash flow projections, and exposes the 7 common fresher traps.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from tax import calculate_new_regime_tax

class OfferInput(BaseModel):
    offer_id: str = "A"
    company_name: str = "Tech Corp"
    role_title: str = "Associate Software Engineer"
    location: str = "Bengaluru"
    annual_ctc: float = 12_00_000.0
    fixed_base: float = 8_00_000.0  # Base salary + allowances
    basic_salary_annual: Optional[float] = None  # If None, defaults to 50% of fixed_base
    variable_pay_annual: float = 2_00_000.0      # Performance bonus
    joining_bonus: float = 1_00_000.0           # Sign-on bonus
    joining_bonus_clawback_months: int = 12     # Period before bonus is non-refundable
    stocks_esops_annual: float = 1_00_000.0     # Stock vesting (paper wealth)
    employer_pf_inside_ctc: bool = True         # Whether 12% employer PF is subtracted from CTC
    gratuity_inside_ctc: bool = True            # Whether 4.81% gratuity is included in CTC
    insurance_deduction_annual: float = 15_000.0
    service_bond_months: int = 0                # e.g., 24 months
    bond_penalty_amount: float = 0.0            # e.g., ₹2,00,000
    notice_period_days: int = 90                # Standard notice period

class OfferAnalysisResult(BaseModel):
    company_name: str
    role_title: str
    location: str
    annual_ctc: float
    guaranteed_annual_gross: float
    guaranteed_monthly_in_hand: float
    paper_wealth_annual: float                  # Stocks + gratuity
    variable_at_risk_annual: float
    first_month_in_hand: float                 # Includes sign-on bonus net of TDS
    regular_month_in_hand: float
    traps_detected: List[Dict[str, str]]
    month_by_month_projections: List[float]     # 12 months in-hand forecast
    summary_verdict: str

def decode_offer(offer: OfferInput) -> OfferAnalysisResult:
    """
    Decodes an Indian CTC offer letter into real in-hand cash and reveals hidden traps.
    """
    basic_annual = offer.basic_salary_annual if offer.basic_salary_annual is not None else (offer.fixed_base * 0.50)
    
    # Hidden components inside CTC
    employer_pf_annual = basic_annual * 0.12 if offer.employer_pf_inside_ctc else 0.0
    gratuity_annual = basic_annual * (15.0 / 26.0) / 12.0 * 12.0 if offer.gratuity_inside_ctc else 0.0 # ~4.81%
    
    # Real Employee Gross Salary per year (what generates monthly paycheck)
    real_employee_gross_annual = max(0.0, offer.fixed_base - (employer_pf_annual if not offer.employer_pf_inside_ctc else 0.0))
    gross_monthly = real_employee_gross_annual / 12.0
    
    # Employee statutory deductions
    pf_employee_monthly = basic_annual * 0.12 / 12.0
    prof_tax_monthly = 200.0  # Standard INR 200/mo
    
    # Income Tax via deterministic FY 2025-26 New Regime engine
    tax_info = calculate_new_regime_tax(real_employee_gross_annual)
    monthly_tax = tax_info["monthly_tax"]
    
    # Regular monthly in-hand
    regular_in_hand = round(gross_monthly - pf_employee_monthly - prof_tax_monthly - monthly_tax, 2)
    
    # Joining Bonus (Taxed at approx standard 20% slab deduction upfront)
    net_joining_bonus = round(offer.joining_bonus * 0.80, 2)
    first_month_in_hand = round(regular_in_hand + net_joining_bonus, 2)
    
    # 12-Month Projections (Month 1 has joining bonus, Month 12 has 50% conservative variable payout)
    month_projections = []
    for m in range(1, 13):
        if m == 1:
            month_projections.append(first_month_in_hand)
        elif m == 12:
            # Conservative 50% variable payout in Month 12 after performance review
            net_var = round((offer.variable_pay_annual * 0.50) * 0.80, 2)
            month_projections.append(round(regular_in_hand + net_var, 2))
        else:
            month_projections.append(regular_in_hand)
            
    # Traps & Warnings Detector
    traps: List[Dict[str, str]] = []
    
    # Trap 1: Variable pay ratio
    var_ratio = (offer.variable_pay_annual / offer.annual_ctc) * 100 if offer.annual_ctc > 0 else 0
    if var_ratio >= 15:
        traps.append({
            "severity": "HIGH",
            "title": f"Inflated CTC: {var_ratio:.0f}% Variable Pay",
            "description": f"₹{offer.variable_pay_annual:,.0f} of your ₹{offer.annual_ctc:,.0f} CTC is performance-contingent and not guaranteed in your monthly paycheck."
        })
        
    # Trap 2: Service Bond & Penalty
    if offer.service_bond_months > 0:
        traps.append({
            "severity": "CRITICAL",
            "title": f"Service Bond Lock-in ({offer.service_bond_months} Months)",
            "description": f"Leaving the company before {offer.service_bond_months} months carries a ₹{offer.bond_penalty_amount:,.0f} penalty plus potential legal friction."
        })
        
    # Trap 3: Joining Bonus Clawback
    if offer.joining_bonus > 0 and offer.joining_bonus_clawback_months > 0:
        traps.append({
            "severity": "MEDIUM",
            "title": f"Joining Bonus Clawback ({offer.joining_bonus_clawback_months} Months)",
            "description": f"You must return the full ₹{offer.joining_bonus:,.0f} sign-on bonus if you resign within {offer.joining_bonus_clawback_months} months."
        })
        
    # Trap 4: Employer PF in CTC
    if offer.employer_pf_inside_ctc:
        traps.append({
            "severity": "INFO",
            "title": "Employer PF Subtracted from CTC",
            "description": f"₹{employer_pf_annual:,.0f}/year is company retirement contribution, not liquid in-hand cash."
        })
        
    # Trap 5: Gratuity Counted in CTC
    if offer.gratuity_inside_ctc:
        traps.append({
            "severity": "MEDIUM",
            "title": "Gratuity Included in CTC (5-Year Lock-in)",
            "description": f"₹{gratuity_annual:,.0f}/year is counted in your CTC, but Indian law requires 5 continuous years of service before you can claim a single rupee."
        })
        
    # Trap 6: Notice Period
    if offer.notice_period_days >= 90:
        traps.append({
            "severity": "LOW",
            "title": f"Long Notice Period ({offer.notice_period_days} Days)",
            "description": "A 90-day notice period makes future job switches difficult as many Indian startups prefer immediate joiners (30 days)."
        })
        
    # Trap 7: Paper Wealth (Stocks/ESOPs)
    if offer.stocks_esops_annual > 0:
        traps.append({
            "severity": "INFO",
            "title": f"Paper Wealth: ₹{offer.stocks_esops_annual:,.0f}/year",
            "description": "Stock units/ESOPs are typically locked behind a 1-year cliff and depend on future company valuation."
        })

    # Summary Verdict
    in_hand_ratio = (regular_in_hand * 12 / offer.annual_ctc) * 100 if offer.annual_ctc > 0 else 0
    if in_hand_ratio >= 75:
        summary_verdict = f"Clean Offer ({in_hand_ratio:.0f}% In-Hand). Low CTC inflation."
    elif in_hand_ratio >= 60:
        summary_verdict = f"Moderate CTC Inflation ({in_hand_ratio:.0f}% In-Hand). Substantial variable/perks."
    else:
        summary_verdict = f"Heavy CTC Cushioning (Only {in_hand_ratio:.0f}% In-Hand). Paper wealth & variable heavy."

    return OfferAnalysisResult(
        company_name=offer.company_name,
        role_title=offer.role_title,
        location=offer.location,
        annual_ctc=round(offer.annual_ctc, 2),
        guaranteed_annual_gross=round(real_employee_gross_annual, 2),
        guaranteed_monthly_in_hand=regular_in_hand,
        paper_wealth_annual=round(offer.stocks_esops_annual + gratuity_annual, 2),
        variable_at_risk_annual=round(offer.variable_pay_annual, 2),
        first_month_in_hand=first_month_in_hand,
        regular_month_in_hand=regular_in_hand,
        traps_detected=traps,
        month_by_month_projections=month_projections,
        summary_verdict=summary_verdict
    )

def compare_two_offers(offer_a: OfferInput, offer_b: OfferInput) -> Dict[str, Any]:
    """
    Side-by-side comparison scorecard between Offer A and Offer B.
    """
    res_a = decode_offer(offer_a)
    res_b = decode_offer(offer_b)
    
    # Financial difference
    in_hand_diff_monthly = round(res_a.guaranteed_monthly_in_hand - res_b.guaranteed_monthly_in_hand, 2)
    in_hand_diff_annual = round(in_hand_diff_monthly * 12, 2)
    
    # Recommendation logic
    if abs(in_hand_diff_monthly) < 2000:
        if len(res_a.traps_detected) < len(res_b.traps_detected):
            verdict = f"Offer A ({offer_a.company_name}) is cleaner with fewer traps and bonds."
        else:
            verdict = f"Offer B ({offer_b.company_name}) is cleaner with fewer traps and bonds."
    elif in_hand_diff_monthly > 0:
        verdict = f"Offer A ({offer_a.company_name}) provides ₹{abs(in_hand_diff_monthly):,.0f}/month more guaranteed in-hand salary."
    else:
        verdict = f"Offer B ({offer_b.company_name}) provides ₹{abs(in_hand_diff_monthly):,.0f}/month more guaranteed in-hand salary."

    return {
        "offer_a": res_a.model_dump(),
        "offer_b": res_b.model_dump(),
        "monthly_in_hand_difference": in_hand_diff_monthly,
        "annual_in_hand_difference": in_hand_diff_annual,
        "better_guaranteed_offer": "A" if in_hand_diff_monthly >= 0 else "B",
        "comparer_verdict": verdict
    }
