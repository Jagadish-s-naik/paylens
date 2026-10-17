"""
Paylens EMI & Affordability Engine
Calculates safe monthly EMI limits, maximum loan borrowing capacity,
and uncovers hidden interest rates in "No-Cost EMI" financing offers using IRR bisection.
"""

from typing import Dict, Any

GST_RATE = 0.18 # 18% GST on processing fees

def safe_emi(take_home_monthly: float, ratio: float = 0.35, existing_emis: float = 0.0) -> float:
    """
    Computes safe monthly EMI allowance.
    safe_emi = (take_home * ratio) - existing_emis
    """
    if take_home_monthly <= 0:
        return 0.0
    safe = (take_home_monthly * ratio) - existing_emis
    return max(0.0, round(safe, 2))

def loan_capacity(emi: float, annual_rate: float, months: int) -> float:
    """
    Computes maximum supported loan principal using the standard annuity formula:
    PV = EMI * [1 - (1 + r)^(-n)] / r
    Handles 0% interest edge cases.
    """
    if emi <= 0 or months <= 0:
        return 0.0
    
    if annual_rate <= 0:
        return round(emi * months, 2)
    
    monthly_r = (annual_rate / 100.0) / 12.0
    pv = emi * (1.0 - (1.0 + monthly_r) ** (-months)) / monthly_r
    return round(pv, 2)

def effective_annual_rate(
    listed_price: float,
    monthly_emi: float,
    months: int,
    processing_fee: float = 0.0,
    upfront_discount: float = 0.0
) -> Dict[str, Any]:
    """
    Reveals hidden interest in 'No-Cost EMI' deals via bisection IRR solver.
    
    Financial Model:
    - Cash Baseline (buying upfront today) = listed_price - upfront_discount
    - Total Upfront EMI Cost = Processing Fee + 18% GST on Fee
    - Net Principal Financed = Baseline Cash Price - Upfront Fee
    - Repayment = `months` monthly installments of `monthly_emi`
    
    Solves for monthly rate `m` where:
    Net Principal = sum_{t=1}^{n} (monthly_emi / (1 + m)^t)
    Effective Annual Rate (EAR) = ((1 + m)^12 - 1) * 100
    """
    fee_with_gst = processing_fee * (1.0 + GST_RATE)
    cash_price_today = max(0.0, listed_price - upfront_discount)
    total_paid_via_emi = fee_with_gst + (monthly_emi * months)
    total_extra_cost = round(total_paid_via_emi - cash_price_today, 2)
    
    # If taking EMI costs less than or equal to upfront cash price, true 0% interest
    if total_paid_via_emi <= cash_price_today or monthly_emi <= 0 or months <= 0:
        return {
            "effective_annual_rate": 0.0,
            "monthly_rate": 0.0,
            "cash_price_today": round(cash_price_today, 2),
            "fee_with_gst": round(fee_with_gst, 2),
            "total_paid_via_emi": round(total_paid_via_emi, 2),
            "total_extra_cost": 0.0,
            "is_truly_zero_cost": True,
            "warning": "This deal is genuinely 0% interest with zero hidden markup."
        }
    
    net_financed = cash_price_today - fee_with_gst
    if net_financed <= 0:
        # Fee exceeds cash price
        return {
            "effective_annual_rate": 99.99,
            "monthly_rate": 8.33,
            "cash_price_today": round(cash_price_today, 2),
            "fee_with_gst": round(fee_with_gst, 2),
            "total_paid_via_emi": round(total_paid_via_emi, 2),
            "total_extra_cost": total_extra_cost,
            "is_truly_zero_cost": False,
            "warning": "Processing fee is extremely high relative to the item price."
        }

    # Bisection solver for monthly IRR m
    # f(m) = sum(monthly_emi / (1+m)^t) - net_financed
    def npv_diff(m: float) -> float:
        if m == 0:
            pv = monthly_emi * months
        else:
            pv = monthly_emi * (1.0 - (1.0 + m) ** (-months)) / m
        return pv - net_financed

    low_m = 0.000001
    high_m = 1.0 # 100% per month upper bound
    
    # If even at low_m PV < net_financed, monthly interest is negative or 0
    if npv_diff(low_m) <= 0:
        monthly_m = 0.0
    else:
        # Bisection iterations
        for _ in range(60):
            mid_m = (low_m + high_m) / 2.0
            diff = npv_diff(mid_m)
            if abs(diff) < 1e-5:
                break
            if diff > 0:
                low_m = mid_m
            else:
                high_m = mid_m
        monthly_m = (low_m + high_m) / 2.0
    
    # Annualized rate: ((1 + m)^12 - 1) * 100
    ear = ((1.0 + monthly_m) ** 12 - 1.0) * 100.0
    
    return {
        "effective_annual_rate": round(ear, 2),
        "monthly_rate": round(monthly_m * 100.0, 2),
        "cash_price_today": round(cash_price_today, 2),
        "fee_with_gst": round(fee_with_gst, 2),
        "total_paid_via_emi": round(total_paid_via_emi, 2),
        "total_extra_cost": total_extra_cost,
        "is_truly_zero_cost": False,
        "benchmark_comparison": "Typical personal loan: 11-16%"
    }

def evaluate_affordability_lens(
    item_name: str,
    upfront_price: float,
    monthly_emi: float,
    months: int,
    processing_fee: float,
    upfront_discount: float,
    monthly_in_hand: float,
    existing_emis: float = 0.0,
    emi_ratio: float = 0.35,
    financing_type: str = "NO_COST_EMI"
) -> Dict[str, Any]:
    """
    Evaluates an item purchase / EMI quote against user's personal salary.
    Returns:
    - Traffic-Light Verdict: 'AFFORDABLE' (Green), 'STRETCH' (Yellow), 'DONT' (Red)
    - Salary Burn: months of salary consumed by the purchase
    - True APR / EAR computed via IRR bisection
    - Actionable recommendation for first-job employees
    """
    ear_result = effective_annual_rate(
        listed_price=upfront_price,
        monthly_emi=monthly_emi,
        months=months,
        processing_fee=processing_fee,
        upfront_discount=upfront_discount
    )
    
    safe_allowance = safe_emi(monthly_in_hand, ratio=emi_ratio, existing_emis=existing_emis)
    salary_months_burned = round(upfront_price / monthly_in_hand, 1) if monthly_in_hand > 0 else 0.0
    emi_burn_pct = round((monthly_emi / safe_allowance) * 100, 1) if safe_allowance > 0 else 999.0
    ear = ear_result["effective_annual_rate"]
    
    # Verdict Decision Matrix
    if monthly_emi <= (safe_allowance * 0.40) and ear <= 12.0:
        verdict = "AFFORDABLE"
        verdict_color = "GREEN"
        verdict_badge = "🟢 Safe to Buy"
        guidance = f"Easily fits inside your budget. Consumes only {emi_burn_pct}% of your safe monthly debt limit."
    elif monthly_emi <= safe_allowance and ear <= 18.0:
        verdict = "STRETCH"
        verdict_color = "YELLOW"
        verdict_badge = "🟡 Budget Stretch"
        guidance = f"Doable, but consumes {emi_burn_pct}% of your monthly debt capacity. Pause non-essential purchases."
    else:
        verdict = "DONT"
        verdict_color = "RED"
        verdict_badge = "🔴 Don't Do It"
        if monthly_emi > safe_allowance:
            guidance = f"Exceeds your safe EMI allowance by ₹{(monthly_emi - safe_allowance):,.0f}/month. High risk of debt spiral."
        else:
            guidance = f"Hidden interest rate ({ear}% EAR) is predatory — higher than a personal bank loan (11-16%)."

    return {
        "item_name": item_name or "Item",
        "financing_type": financing_type,
        "upfront_price": round(upfront_price, 2),
        "monthly_emi": round(monthly_emi, 2),
        "tenure_months": months,
        "salary_months_burned": salary_months_burned,
        "emi_burn_percentage": emi_burn_pct,
        "safe_monthly_allowance": safe_allowance,
        "effective_annual_rate": ear,
        "is_truly_zero_cost": ear_result["is_truly_zero_cost"],
        "total_extra_cost": ear_result["total_extra_cost"],
        "verdict": verdict,
        "verdict_color": verdict_color,
        "verdict_badge": verdict_badge,
        "guidance": guidance
    }

