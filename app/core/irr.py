"""
app/core/irr.py
Paylens Bisection IRR Solver & True APR / EAR Engine.
100% Pure Python. Zero Network, Zero External Dependencies.
"""

from typing import Dict, Any

GST_RATE = 0.18 # 18% GST on processing fees in India

def safe_emi(take_home_monthly: float, ratio: float = 0.35, existing_emis: float = 0.0) -> float:
    """Computes safe monthly EMI allowance = (take_home * ratio) - existing_emis."""
    if take_home_monthly <= 0:
        return 0.0
    safe = (take_home_monthly * ratio) - existing_emis
    return max(0.0, round(safe, 2))

def loan_capacity(emi: float, annual_rate: float, months: int) -> float:
    """Computes maximum supported loan principal using annuity PV formula."""
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
    Reveals hidden interest in 'No-Cost EMI' and installment deals via bisection IRR solver.
    Returns:
    - effective_annual_rate (EAR): Annualized compounded rate = ((1+m)^12 - 1) * 100
    - nominal_annual_rate (APR): Simple annualized rate = (m * 12) * 100
    - total_extra_cost: Hidden markup vs buying upfront today
    - is_truly_zero_cost: True if total paid <= upfront cash price
    """
    fee_with_gst = processing_fee * (1.0 + GST_RATE)
    cash_price_today = max(0.0, listed_price - upfront_discount)
    total_paid_via_emi = fee_with_gst + (monthly_emi * months)
    total_extra_cost = round(total_paid_via_emi - cash_price_today, 2)
    
    if total_paid_via_emi <= cash_price_today or monthly_emi <= 0 or months <= 0:
        return {
            "effective_annual_rate": 0.0,
            "nominal_annual_rate": 0.0,
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
        return {
            "effective_annual_rate": 99.99,
            "nominal_annual_rate": 99.99,
            "monthly_rate": 8.33,
            "cash_price_today": round(cash_price_today, 2),
            "fee_with_gst": round(fee_with_gst, 2),
            "total_paid_via_emi": round(total_paid_via_emi, 2),
            "total_extra_cost": total_extra_cost,
            "is_truly_zero_cost": False,
            "warning": "Processing fee is extremely high relative to the item price."
        }
        
    def npv_diff(m: float) -> float:
        if m == 0:
            pv = monthly_emi * months
        else:
            pv = monthly_emi * (1.0 - (1.0 + m) ** (-months)) / m
        return pv - net_financed
        
    low_m = 0.000001
    high_m = 1.0 # 100% per month upper bound
    
    if npv_diff(low_m) <= 0:
        monthly_m = 0.0
    else:
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
        
    ear = ((1.0 + monthly_m) ** 12 - 1.0) * 100.0
    nominal_apr = monthly_m * 12.0 * 100.0
    
    return {
        "effective_annual_rate": round(ear, 2),
        "nominal_annual_rate": round(nominal_apr, 2),
        "monthly_rate": round(monthly_m * 100.0, 2),
        "cash_price_today": round(cash_price_today, 2),
        "fee_with_gst": round(fee_with_gst, 2),
        "total_paid_via_emi": round(total_paid_via_emi, 2),
        "total_extra_cost": total_extra_cost,
        "is_truly_zero_cost": False,
        "benchmark_comparison": "Typical personal loan: 11-16%"
    }
