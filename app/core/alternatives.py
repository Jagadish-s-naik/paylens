"""
app/core/alternatives.py
Paylens Deterministic Alternatives Engine.
100% Pure Python. Zero Network, Zero External Dependencies.
Re-scores every alternative through the exact same evaluate_core_math function.
"""

from typing import List, Dict, Any
from app.config import settings
from app.core.schemas import VerifiedProfile, Listing, PaymentOption, AlternativeOption

def generate_alternatives(
    profile: VerifiedProfile,
    listing: Listing,
    selected_option: PaymentOption
) -> List[AlternativeOption]:
    """
    Generates and re-scores 3 deterministic alternatives:
    1. Buy in Cash Today (re-scored; marked infeasible if price > savings)
    2. Wait & Save (with dynamic EMI roll-off and emergency cushion protection)
    3. Hypothetical Downpayment Boost (strictly capped at surplus above 3m cushion)
    """
    from app.core.engine import evaluate_core_math
    
    in_hand = profile.in_hand_verified
    savings = profile.current_savings
    rent = profile.rent_monthly
    existing_emis = profile.existing_emis
    existing_emi_total = sum(e.monthly_amount for e in existing_emis)
    essentials = rent + (in_hand * 0.30)
    effective_cash_price = listing.effective_cash_price
    target_cushion = essentials * settings.EMERGENCY_CUSHION_MONTHS
    
    # Calculate regular monthly free cash
    free_cash_monthly = in_hand - essentials - existing_emi_total
    
    alternatives: List[AlternativeOption] = []
    
    # -----------------------------------------------------------------
    # Alternative 1: Buy in Cash Today
    # -----------------------------------------------------------------
    if savings < effective_cash_price:
        # Infeasible: not enough liquid savings to buy in cash
        alternatives.append(AlternativeOption(
            strategy="BUY_CASH",
            title="Buy in Cash Today (Full Payment)",
            description=f"Not possible today: upfront price (₹{effective_cash_price:,.0f}) exceeds total savings (₹{savings:,.0f}).",
            suggested_monthly_emi=0.0,
            suggested_tenure_months=1,
            rescore_verdict="RISKY",
            rescore_badge="🔴 Not Feasible",
            runway_after=round(savings / essentials, 2) if essentials > 0 else 0.0,
            money_saved=0.0,
            is_feasible=False
        ))
    else:
        cash_eval = evaluate_core_math(
            in_hand=in_hand,
            current_savings=savings,
            rent_monthly=rent,
            existing_emi_total=existing_emi_total,
            monthly_installment=0.0,
            downpayment=effective_cash_price,
            tenure_months=1,
            effective_cash_price=effective_cash_price,
            is_cash_option=True
        )
        savings_left = round(savings - effective_cash_price, 2)
        money_saved = selected_option.monthly_installment * selected_option.tenure_months + selected_option.processing_fee * 1.18 - effective_cash_price
        
        alternatives.append(AlternativeOption(
            strategy="BUY_CASH",
            title="Buy in Cash Today (Full Payment)",
            description=f"Pay ₹{effective_cash_price:,.0f} upfront. Post-purchase runway is {cash_eval['runway_after']:.2f} months (₹{savings_left:,.0f} savings left).",
            suggested_monthly_emi=0.0,
            suggested_tenure_months=1,
            rescore_verdict=cash_eval["verdict_level"],
            rescore_badge=cash_eval["badge"],
            runway_after=cash_eval["runway_after"],
            money_saved=max(0.0, round(money_saved, 2)),
            is_feasible=True
        ))
        
    # -----------------------------------------------------------------
    # Alternative 2: Wait & Save (with dynamic EMI roll-off)
    # -----------------------------------------------------------------
    # Case A: User has less than 3.0 months emergency cushion today (e.g. Amit)
    if savings < target_cushion:
        cushion_shortfall = round(target_cushion - savings, 2)
        alternatives.append(AlternativeOption(
            strategy="WAIT_AND_SAVE",
            title="Build 3-Month Emergency Cushion First",
            description=f"Your current cushion is low ({round(savings/essentials, 2)}m). Save ₹{cushion_shortfall:,.0f} to build a 3-month safety fund before major discretionary purchases.",
            suggested_monthly_emi=0.0,
            suggested_tenure_months=0,
            rescore_verdict="COMFORTABLE",
            rescore_badge="🟢 Safe Goal",
            runway_after=settings.EMERGENCY_CUSHION_MONTHS,
            money_saved=0.0,
            is_feasible=True
        ))
    else:
        # Case B: User has >= 3 months cushion. Can use surplus savings + free cash
        surplus_savings = max(0.0, savings - target_cushion)
        shortfall = max(0.0, effective_cash_price - surplus_savings)
        
        if shortfall == 0:
            months_needed = 0
        else:
            accumulated = 0.0
            months_needed = 0
            while accumulated < shortfall and months_needed < 36:
                months_needed += 1
                # Check EMI roll-off: add back any EMI whose remaining tenure < months_needed
                active_emi_this_month = sum(e.monthly_amount for e in existing_emis if e.tenure_remaining_months >= months_needed)
                monthly_saving_power = in_hand - essentials - active_emi_this_month
                if monthly_saving_power <= 0:
                    months_needed = 999
                    break
                accumulated += monthly_saving_power
                
        money_saved = selected_option.monthly_installment * selected_option.tenure_months + selected_option.processing_fee * 1.18 - effective_cash_price
        
        if months_needed == 0:
            desc = f"You already have ₹{surplus_savings:,.0f} surplus above your 3-month cushion. You can buy today in cash and save ₹{round(money_saved, 2):,.0f}!"
        else:
            desc = f"Wait {months_needed} months: save your uncommitted cash (₹{free_cash_monthly:,.0f}/mo) to buy in cash, saving ₹{round(money_saved, 2):,.0f} while keeping your 3-month emergency cushion intact."
            
        alternatives.append(AlternativeOption(
            strategy="WAIT_AND_SAVE",
            title=f"Wait {months_needed} Months & Buy in Cash" if months_needed > 0 else "Buy with Surplus Savings Today",
            description=desc,
            suggested_monthly_emi=0.0,
            suggested_tenure_months=months_needed,
            rescore_verdict="COMFORTABLE",
            rescore_badge="🟢 Safe Goal",
            runway_after=settings.EMERGENCY_CUSHION_MONTHS,
            money_saved=max(0.0, round(money_saved, 2)),
            is_feasible=True
        ))
        
    # -----------------------------------------------------------------
    # Alternative 3: Hypothetical Downpayment Boost (Part-Payment)
    # -----------------------------------------------------------------
    # Strictly capped at surplus above 3.0m emergency cushion
    surplus_for_downpayment = max(0.0, savings - target_cushion)
    
    if surplus_for_downpayment >= 5000:
        boosted_downpayment = min(surplus_for_downpayment, effective_cash_price * 0.40)
        financed_amount = effective_cash_price - boosted_downpayment
        monthly_recomputed = round(financed_amount / selected_option.tenure_months, 2)
        
        dp_eval = evaluate_core_math(
            in_hand=in_hand,
            current_savings=savings,
            rent_monthly=rent,
            existing_emi_total=existing_emi_total,
            monthly_installment=monthly_recomputed,
            downpayment=boosted_downpayment,
            tenure_months=selected_option.tenure_months,
            effective_cash_price=effective_cash_price,
            processing_fee=selected_option.processing_fee,
            lost_cash_discount=0.0
        )
        
        alternatives.append(AlternativeOption(
            strategy="DOWNPAYMENT_BOOST",
            title=f"Hypothetical Part-Payment (₹{boosted_downpayment:,.0f} Downpayment)",
            description=f"If the retailer supports split payment: pay ₹{boosted_downpayment:,.0f} upfront from surplus savings. Drops monthly EMI to ₹{monthly_recomputed:,.0f}/mo while keeping 3-month runway.",
            suggested_monthly_emi=monthly_recomputed,
            suggested_tenure_months=selected_option.tenure_months,
            rescore_verdict=dp_eval["verdict_level"],
            rescore_badge=dp_eval["badge"],
            runway_after=dp_eval["runway_after"],
            money_saved=0.0,
            is_feasible=True
        ))
        
    return alternatives
