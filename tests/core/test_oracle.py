"""
tests/core/test_oracle.py
Oracle Test Gate: asserts app.core matches docs/reference/engine_ref.py
across golden fixtures and randomized profiles.
"""

import random
import pytest
from docs.reference import engine_ref
from app.core import irr, engine, tax
from app.core.schemas import VerifiedProfile, Listing, PaymentOption, PaymentType, ActiveEMI

def test_oracle_tax_calculation():
    # Test new regime across various income brackets
    for gross in [400_000, 700_000, 960_000, 1_200_000, 1_500_000, 2_400_000]:
        core_tax = tax.calculate_new_regime_tax(gross)["total_annual_tax"]
        ref_tax = engine_ref.new_regime_tax(gross)
        assert abs(core_tax - ref_tax) < 0.05, f"Tax mismatch at gross {gross}: core={core_tax}, ref={ref_tax}"

def test_oracle_true_cost_sony():
    # Sony WH-1000XM5: Cash 27,990, EMI 4,998.33, n=6, fee=199, discount=2000
    ref_tc = engine_ref.true_cost(27990.0, {"fee": 199.0, "down": 0.0, "n": 6, "emi": 4998.33})
    core_tc = irr.effective_annual_rate(
        listed_price=29990.0,
        monthly_emi=4998.33,
        months=6,
        processing_fee=199.0,
        upfront_discount=2000.0
    )
    
    assert abs((ref_tc["ear"] * 100) - core_tc["effective_annual_rate"]) < 0.02
    assert abs(ref_tc["total"] - (4998.33 * 6 + 199.0 * 1.18)) < 0.05
    assert abs(ref_tc["markup"] - 2234.80) < 0.05
    
    core_eval = engine.evaluate_core_math(
        in_hand=75000.0,
        current_savings=150000.0,
        rent_monthly=18000.0,
        existing_emi_total=3500.0,
        monthly_installment=4998.33,
        downpayment=0.0,
        tenure_months=6,
        effective_cash_price=27990.0,
        processing_fee=199.0,
        lost_cash_discount=2000.0,
        is_cash_option=False
    )
    assert ref_tc["alert"] == core_eval["has_high_apr_alert"]

def test_oracle_golden_verdicts():
    # 1. Rahul Sony -> COMFORTABLE
    p_rahul = engine_ref.profile(in_hand=75000.0, rent=18000.0, savings=150000.0, emis=[(3500.0, 3)], metro=True)
    v_sony = engine_ref.evaluate(p_rahul, new_emi=4998.33, upfront=0.0)
    assert v_sony["verdict"] == "COMFORTABLE"
    
    # 2. Rahul iPhone -> STRETCH
    v_iphone = engine_ref.evaluate(p_rahul, new_emi=19983.33, upfront=0.0)
    assert v_iphone["verdict"] == "STRETCH"
    
    # 3. Amit Laptop -> RISKY
    p_amit = engine_ref.profile(in_hand=46800.0, rent=14000.0, savings=25000.0, emis=[(8000.0, 8)], metro=False)
    v_laptop = engine_ref.evaluate(p_amit, new_emi=13258.24, upfront=0.0)
    assert v_laptop["verdict"] == "RISKY"

def test_oracle_fuzz_random_profiles():
    """Fuzz 50 randomized profiles and assert app.core.engine and engine_ref yield identical verdict tiers."""
    random.seed(42)
    for _ in range(50):
        in_hand = random.uniform(30000.0, 150000.0)
        rent = random.uniform(8000.0, in_hand * 0.40)
        savings = random.uniform(10000.0, 300000.0)
        existing_emi = random.uniform(0.0, in_hand * 0.25)
        new_emi = random.uniform(1000.0, in_hand * 0.35)
        
        # Reference
        ref_p = engine_ref.profile(in_hand=in_hand, rent=rent, savings=savings, emis=[(existing_emi, 6)], metro=True)
        ref_res = engine_ref.evaluate(ref_p, new_emi=new_emi, upfront=0.0)
        
        # Core
        core_res = engine.evaluate_core_math(
            in_hand=in_hand,
            current_savings=savings,
            rent_monthly=rent,
            existing_emi_total=existing_emi,
            monthly_installment=new_emi,
            downpayment=0.0,
            tenure_months=6,
            effective_cash_price=new_emi * 6,
            processing_fee=0.0,
            lost_cash_discount=0.0,
            is_cash_option=False
        )
        
        assert core_res["verdict_level"] == ref_res["verdict"]
        assert abs(core_res["foir_after"] - ref_res["foir"]) < 1e-3
        assert abs(core_res["free_cash_after"] - ref_res["fc"]) < 0.10
        assert abs(core_res["runway_after"] - ref_res["runway"]) < 0.05
