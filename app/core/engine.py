"""
app/core/engine.py
Paylens Affordability Scoring Engine.
100% Pure Python. Zero Network, Zero External Dependencies.
Computes FOIR, Free Cash, Runway, and determines the Verdict via worst-tier resolution.
"""

from typing import Dict, Any, List
from app.config import settings
from app.core.schemas import (
    VerifiedProfile,
    Listing,
    PaymentOption,
    PaymentType,
    Verdict,
    TrueCost,
    FinancialImpact,
    StressTestResult,
    AlternativeOption
)
from app.core.irr import effective_annual_rate

SEVERITY_ORDER = {"COMFORTABLE": 1, "STRETCH": 2, "RISKY": 3}
BADGE_MAP = {
    "COMFORTABLE": "🟢 Safe to Buy",
    "STRETCH": "🟡 Budget Stretch",
    "RISKY": "🔴 Risky Debt"
}

def get_tier(value: float, safe_bound: float, stretch_bound: float, higher_is_worse: bool = True) -> str:
    if higher_is_worse:
        if value <= safe_bound:
            return "COMFORTABLE"
        elif value <= stretch_bound:
            return "STRETCH"
        else:
            return "RISKY"
    else: # Higher is better (e.g., runway, free cash ratio)
        if value >= safe_bound:
            return "COMFORTABLE"
        elif value >= stretch_bound:
            return "STRETCH"
        else:
            return "RISKY"

def worst_tier(tiers: List[str]) -> str:
    """Core Verdict is strictly the worst tier across the foundation metrics."""
    return max(tiers, key=lambda t: SEVERITY_ORDER[t])

def evaluate_core_math(
    in_hand: float,
    current_savings: float,
    rent_monthly: float,
    existing_emi_total: float,
    monthly_installment: float,
    downpayment: float,
    tenure_months: int,
    effective_cash_price: float,
    processing_fee: float = 0.0,
    lost_cash_discount: float = 0.0,
    is_cash_option: bool = False
) -> Dict[str, Any]:
    """
    Unified calculation used to score both listings and generated alternatives.
    """
    essentials = rent_monthly + (in_hand * 0.30)
    
    foir_before = round(existing_emi_total / in_hand, 4) if in_hand > 0 else 1.0
    foir_after = round((existing_emi_total + monthly_installment) / in_hand, 4) if in_hand > 0 else 1.0
    
    free_cash_before = round(in_hand - existing_emi_total - essentials, 2)
    free_cash_after = round(in_hand - (existing_emi_total + monthly_installment) - essentials, 2)
    free_cash_ratio_after = round(free_cash_after / in_hand, 4) if in_hand > 0 else 0.0
    
    savings_after = max(0.0, current_savings - downpayment)
    runway_before = round(current_savings / essentials, 2) if essentials > 0 else 0.0
    runway_after = round(savings_after / essentials, 2) if essentials > 0 else 0.0
    
    if is_cash_option or tenure_months <= 1:
        ear = 0.0
        nominal_apr = 0.0
        total_outflow = round(downpayment + monthly_installment, 2)
        hidden_markup = 0.0
        is_truly_zero = True
    else:
        apr_res = effective_annual_rate(
            listed_price=effective_cash_price + lost_cash_discount,
            monthly_emi=monthly_installment,
            months=tenure_months,
            processing_fee=processing_fee,
            upfront_discount=lost_cash_discount
        )
        ear = apr_res["effective_annual_rate"]
        nominal_apr = apr_res["nominal_annual_rate"]
        total_outflow = round((monthly_installment * tenure_months) + downpayment + (processing_fee * 1.18), 2)
        hidden_markup = round(total_outflow - effective_cash_price, 2)
        is_truly_zero = apr_res["is_truly_zero_cost"]
        
    tier_foir = get_tier(foir_after, settings.SAFE_FOIR_MAX, settings.STRETCH_FOIR_MAX, higher_is_worse=True)
    tier_free_cash = get_tier(free_cash_ratio_after, settings.SAFE_FREE_CASH_RATIO, settings.STRETCH_FREE_CASH_RATIO, higher_is_worse=False)
    tier_runway = get_tier(runway_after, settings.EMERGENCY_CUSHION_MONTHS, settings.MIN_RUNWAY_STRETCH, higher_is_worse=False)
    
    verdict_level = worst_tier([tier_foir, tier_free_cash, tier_runway])
    has_high_apr = (ear > settings.HIGH_APR_THRESHOLD) and (hidden_markup >= settings.SIGNIFICANT_MARKUP_RUPEES)
    
    return {
        "monthly_installment": monthly_installment,
        "downpayment": downpayment,
        "tenure_months": tenure_months,
        "total_outflow": total_outflow,
        "hidden_markup": hidden_markup,
        "effective_annual_rate": ear,
        "nominal_annual_rate": nominal_apr,
        "is_truly_zero_cost": is_truly_zero,
        "has_high_apr_alert": has_high_apr,
        "foir_before": foir_before,
        "foir_after": foir_after,
        "free_cash_before": free_cash_before,
        "free_cash_after": free_cash_after,
        "free_cash_ratio_after": free_cash_ratio_after,
        "runway_before": runway_before,
        "runway_after": runway_after,
        "tier_foir": tier_foir,
        "tier_free_cash": tier_free_cash,
        "tier_runway": tier_runway,
        "verdict_level": verdict_level,
        "badge": BADGE_MAP[verdict_level]
    }

def evaluate_affordability(
    profile: VerifiedProfile,
    listing: Listing,
    selected_option_id: str
) -> Verdict:
    """
    Evaluates a specific payment option for a listing against user's verified profile.
    Generates deterministic verdict, stress tests, and re-scored alternatives.
    """
    # Find selected option
    selected_opt = next((o for o in listing.payment_options if o.option_id == selected_option_id), None)
    if not selected_opt:
        selected_opt = listing.payment_options[0]
        
    in_hand = profile.in_hand_verified
    savings = profile.current_savings
    rent = profile.rent_monthly
    existing_emi_total = sum(e.monthly_amount for e in profile.existing_emis)
    effective_cash_price = listing.effective_cash_price
    
    # Core math
    core = evaluate_core_math(
        in_hand=in_hand,
        current_savings=savings,
        rent_monthly=rent,
        existing_emi_total=existing_emi_total,
        monthly_installment=selected_opt.monthly_installment,
        downpayment=selected_opt.upfront_downpayment,
        tenure_months=selected_opt.tenure_months,
        effective_cash_price=effective_cash_price,
        processing_fee=selected_opt.processing_fee,
        lost_cash_discount=selected_opt.lost_cash_discount or 0.0,
        is_cash_option=(selected_opt.type == PaymentType.CASH)
    )
    
    # Generate Headline Reason
    vl = core["verdict_level"]
    if vl == "COMFORTABLE":
        if core["has_high_apr_alert"]:
            reason = f"Budget-safe ({round(core['foir_after']*100, 1)}% FOIR), but financing costs {core['effective_annual_rate']}% EAR markup (₹{core['hidden_markup']:,.0f} lost)."
        else:
            reason = f"Fits comfortably inside your 35% safe debt allowance ({round(core['foir_after']*100, 1)}% FOIR)."
    elif vl == "STRETCH":
        reason = f"Budget stretch: consumes {round(core['foir_after']*100, 1)}% of your salary and shrinks free cash to ₹{core['free_cash_after']:,.0f}."
    else:
        if core["free_cash_after"] < 0:
            reason = f"Risky: triggers an immediate monthly cash-flow deficit of ₹{abs(core['free_cash_after']):,.0f}/month."
        elif core["tier_runway"] == "RISKY":
            reason = f"Risky: emergency cushion is dangerously low ({core['runway_after']:.1f} months of expenses)."
        else:
            reason = f"Risky: fixed debt obligations exceed 50% of your take-home pay ({round(core['foir_after']*100, 1)}% FOIR)."
            
    # Import stress tests and alternatives
    from app.core.stress import run_stress_tests
    from app.core.alternatives import generate_alternatives
    
    stress_results = run_stress_tests(profile, selected_opt, core["free_cash_after"])
    alternatives = generate_alternatives(profile, listing, selected_opt)
    
    return Verdict(
        verdict_level=core["verdict_level"],
        badge=core["badge"],
        headline_reason=reason,
        selected_option=selected_opt,
        true_cost=TrueCost(
            effective_annual_rate=core["effective_annual_rate"],
            nominal_annual_rate=core["nominal_annual_rate"],
            total_outflow=core["total_outflow"],
            hidden_markup=core["hidden_markup"],
            is_truly_zero_cost=core["is_truly_zero_cost"],
            has_high_apr_alert=core["has_high_apr_alert"]
        ),
        impact=FinancialImpact(
            foir_before=core["foir_before"],
            foir_after=core["foir_after"],
            free_cash_before=core["free_cash_before"],
            free_cash_after=core["free_cash_after"],
            free_cash_ratio_after=core["free_cash_ratio_after"],
            runway_months_before=core["runway_before"],
            runway_months_after=core["runway_after"]
        ),
        stress_tests=stress_results,
        alternatives=alternatives,
        explanation_bullets=None
    )
