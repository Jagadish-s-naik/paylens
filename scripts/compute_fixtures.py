"""
scripts/compute_fixtures.py
Runs the deterministic financial engine and IRR solver directly from app.core.
Computes the exact numbers for:
1. 🟢 Scenario 1: Comfortable (Sony Headphones for Rahul)
2. 🟡 Scenario 2: Stretch (iPhone 16 Pro for Rahul)
3. 🔴 Scenario 3: Risky (Gaming Laptop for Amit)
4. 🏢 Scenario 4: Old Regime March TDS Shock Persona (Vikram)
"""

import sys
import os
import json

# Ensure paylens root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.schemas import (
    VerifiedProfile,
    Listing,
    PaymentOption,
    PaymentType,
    ActiveEMI
)
from app.core.engine import evaluate_affordability

# =====================================================================
# PERSONAS & LISTINGS
# =====================================================================

# 1. Rahul (Fresher on 12 LPA CTC)
# Fixed Base: Rs 80k/mo (Rs 9.6L). Basic: Rs 40k. Employer PF: Rs 4,800/mo (Rs 57.6k).
# Annual Variable Bonus: Rs 182,400. Total CTC = 960k + 57.6k + 182.4k = Rs 1,200,000 (12 LPA).
# Monthly Payslip: Gross Rs 80k, Basic Rs 40k, HRA Rs 20k, PF Rs 4,800, PT Rs 200, TDS Rs 0 (87A rebate <= 12L).
# In-Hand Verified = Rs 75,000. Rent = Rs 18,000. Essentials = Rs 40,500. Savings = Rs 150,000 (3.70m runway).
# Existing EMI: Rs 3,500/mo (3m left). Free cash = Rs 31,000/mo.
profile_rahul = VerifiedProfile(
    profile_id="prof_rahul",
    employer_name="Acme Cloud Tech India Pvt Ltd",
    pay_period="March 2026",
    gross_monthly=80000.0,
    basic_monthly=40000.0,
    hra_monthly=20000.0,
    pf_employee_monthly=4800.0,
    professional_tax_monthly=200.0,
    tds_monthly=0.0,
    tax_regime="NEW",
    in_hand_verified=75000.0,
    annual_variable_bonus=182400.0,
    rent_monthly=18000.0,
    is_metro=True,
    existing_emis=[ActiveEMI(name="Previous Phone", monthly_amount=3500.0, tenure_remaining_months=3)],
    total_existing_emi_monthly=3500.0,
    current_savings=150000.0,
    essentials_monthly=40500.0,
    emergency_runway_months=3.70,
    free_cash_monthly=31000.0,
    safe_emi_ceiling=22750.0,
    language_pref="en"
)

# 2. Amit (Overleveraged Junior Dev)
# In-hand Rs 46,800. Rent Rs 14,000. Essentials Rs 28,040. Savings Rs 25,000 (0.89m runway < 2.0m).
# Existing Bike EMI: Rs 8,000/mo (8m remaining). Free cash = Rs 4,760/mo.
profile_amit = VerifiedProfile(
    profile_id="prof_amit",
    employer_name="Infosol Global",
    pay_period="March 2026",
    gross_monthly=50000.0,
    basic_monthly=25000.0,
    hra_monthly=10000.0,
    pf_employee_monthly=3000.0,
    professional_tax_monthly=200.0,
    tds_monthly=0.0,
    tax_regime="NEW",
    in_hand_verified=46800.0,
    annual_variable_bonus=0.0,
    rent_monthly=14000.0,
    is_metro=False,
    existing_emis=[ActiveEMI(name="Bike Loan", monthly_amount=8000.0, tenure_remaining_months=8)],
    total_existing_emi_monthly=8000.0,
    current_savings=25000.0,
    essentials_monthly=28040.0,
    emergency_runway_months=0.89,
    free_cash_monthly=4760.0,
    safe_emi_ceiling=8380.0,
    language_pref="en"
)

# 3. Vikram (Old Regime Unproven Proof Persona)
# Gross Rs 1,00,000/mo. In-hand Rs 88,000. Declared monthly TDS Rs 3,000.
# In March, unproven 80C/HRA declarations trigger full slab recalculation.
profile_vikram = VerifiedProfile(
    profile_id="prof_vikram",
    employer_name="Enterprise Systems",
    pay_period="March 2026",
    gross_monthly=100000.0,
    basic_monthly=50000.0,
    hra_monthly=25000.0,
    pf_employee_monthly=6000.0,
    professional_tax_monthly=200.0,
    tds_monthly=3000.0,
    tax_regime="OLD",
    in_hand_verified=88000.0,
    annual_variable_bonus=0.0,
    rent_monthly=25000.0,
    is_metro=True,
    existing_emis=[],
    total_existing_emi_monthly=0.0,
    current_savings=200000.0,
    essentials_monthly=51400.0,
    emergency_runway_months=3.89,
    free_cash_monthly=36600.0,
    safe_emi_ceiling=30800.0,
    language_pref="en"
)

# Listing 1: Sony WH-1000XM5 Headphones
listing_sony = Listing(
    product_id="sony_wh1000xm5",
    title="Sony WH-1000XM5 Wireless Noise Canceling Headphones",
    category="Audio",
    retailer="MockStore",
    upfront_cash_price=29990.0,
    cash_discount=2000.0,
    effective_cash_price=27990.0,
    payment_options=[
        PaymentOption(
            option_id="cash_full",
            type=PaymentType.CASH,
            label="Full Payment (Instant Bank Discount)",
            tenure_months=1,
            monthly_installment=27990.0,
            upfront_downpayment=0.0,
            processing_fee=0.0,
            lost_cash_discount=None,
            stated_interest_rate=0.0
        ),
        PaymentOption(
            option_id="sony_nocost_6m",
            type=PaymentType.NO_COST_EMI,
            label="No-Cost EMI (6 Months)",
            tenure_months=6,
            monthly_installment=4998.33,
            upfront_downpayment=0.0,
            processing_fee=199.0,
            lost_cash_discount=2000.0,
            stated_interest_rate=0.0
        )
    ]
)

# Listing 2: Apple iPhone 16 Pro 128GB
listing_iphone = Listing(
    product_id="iphone_16_pro",
    title="Apple iPhone 16 Pro (128 GB) - Natural Titanium",
    category="Smartphone",
    retailer="MockStore",
    upfront_cash_price=119900.0,
    cash_discount=5000.0,
    effective_cash_price=114900.0,
    payment_options=[
        PaymentOption(
            option_id="cash_full",
            type=PaymentType.CASH,
            label="Full Payment (Instant Bank Discount)",
            tenure_months=1,
            monthly_installment=114900.0,
            upfront_downpayment=0.0,
            processing_fee=0.0,
            lost_cash_discount=None,
            stated_interest_rate=0.0
        ),
        PaymentOption(
            option_id="iphone_nocost_6m",
            type=PaymentType.NO_COST_EMI,
            label="No-Cost EMI (6 Months)",
            tenure_months=6,
            monthly_installment=19983.33,
            upfront_downpayment=0.0,
            processing_fee=199.0,
            lost_cash_discount=5000.0,
            stated_interest_rate=0.0
        )
    ]
)

# Listing 3: ROG Gaming Laptop
listing_laptop = Listing(
    product_id="rog_strix_g16",
    title="ASUS ROG Strix G16 Gaming Laptop",
    category="Laptop",
    retailer="MockStore",
    upfront_cash_price=145000.0,
    cash_discount=5000.0,
    effective_cash_price=140000.0,
    payment_options=[
        PaymentOption(
            option_id="laptop_std_12m",
            type=PaymentType.STANDARD_EMI,
            label="Standard EMI (12 Months, 15% APR)",
            tenure_months=12,
            monthly_installment=13160.0,
            upfront_downpayment=0.0,
            processing_fee=999.0,
            lost_cash_discount=5000.0,
            stated_interest_rate=15.0
        )
    ]
)

# Run evaluations
v1 = evaluate_affordability(profile_rahul, listing_sony, "sony_nocost_6m")
v2 = evaluate_affordability(profile_rahul, listing_iphone, "iphone_nocost_6m")
v3 = evaluate_affordability(profile_amit, listing_laptop, "laptop_std_12m")
v4 = evaluate_affordability(profile_vikram, listing_iphone, "iphone_nocost_6m")

def print_verdict(title: str, v):
    print("=" * 70)
    print(title)
    print("=" * 70)
    print(f"Selected Option      : {v.selected_option.label}")
    print(f"Effective Cash Price : ₹{v.selected_option.monthly_installment if v.selected_option.type == PaymentType.CASH else (v.true_cost.total_outflow - v.true_cost.hidden_markup):,.2f}")
    print(f"Total Outflow via EMI: ₹{v.true_cost.total_outflow:,.2f}")
    print(f"Hidden Markup        : ₹{v.true_cost.hidden_markup:,.2f}")
    print(f"Effective EAR        : {v.true_cost.effective_annual_rate}%")
    print(f"Nominal APR          : {v.true_cost.nominal_annual_rate}%")
    print(f"FOIR Before -> After : {v.impact.foir_before*100:.1f}% -> {v.impact.foir_after*100:.1f}%")
    print(f"Free Cash After      : ₹{v.impact.free_cash_after:,.2f} ({v.impact.free_cash_ratio_after*100:.1f}% of in-hand)")
    print(f"Runway Before -> After: {v.impact.runway_months_before:.2f}m -> {v.impact.runway_months_after:.2f}m")
    print(f"Core Verdict         : {v.verdict_level} ({v.badge})")
    print(f"Headline Reason      : {v.headline_reason}")
    print(f"High APR Alert       : {v.true_cost.has_high_apr_alert}")
    print("-" * 70)
    print("STRESS TESTS:")
    for st in v.stress_tests:
        status = "Passes" if st.passes else "Fails"
        app = "" if st.is_applicable else " [Not Applicable]"
        warn = f" | Warning: {st.warning}" if st.warning else ""
        print(f" - {st.scenario_name}: {status}{app} | Stressed FOIR={st.stressed_foir*100:.1f}% | Stressed Free Cash=₹{st.stressed_free_cash:,.2f}{warn}")
    print("RE-SCORED ALTERNATIVES:")
    for alt in v.alternatives:
        feas = "Feasible" if alt.is_feasible else "Not Possible"
        print(f" • {alt.title} [{feas}]: {alt.description} (Verdict: {alt.rescore_verdict} {alt.rescore_badge}, Post Runway: {alt.runway_after:.2f}m, Saved: ₹{alt.money_saved:,.0f})")
    print()

def save_fixtures():
    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures"))
    os.makedirs(fixtures_dir, exist_ok=True)
    
    # Save profiles
    with open(os.path.join(fixtures_dir, "profile_rahul.json"), "w", encoding="utf-8") as f:
        json.dump(profile_rahul.model_dump(), f, indent=2)
    with open(os.path.join(fixtures_dir, "profile_amit.json"), "w", encoding="utf-8") as f:
        json.dump(profile_amit.model_dump(), f, indent=2)
    with open(os.path.join(fixtures_dir, "profile_vikram.json"), "w", encoding="utf-8") as f:
        json.dump(profile_vikram.model_dump(), f, indent=2)
        
    # Save listings
    with open(os.path.join(fixtures_dir, "listing_sony.json"), "w", encoding="utf-8") as f:
        json.dump(listing_sony.model_dump(), f, indent=2)
    with open(os.path.join(fixtures_dir, "listing_iphone.json"), "w", encoding="utf-8") as f:
        json.dump(listing_iphone.model_dump(), f, indent=2)
    with open(os.path.join(fixtures_dir, "listing_laptop.json"), "w", encoding="utf-8") as f:
        json.dump(listing_laptop.model_dump(), f, indent=2)
        
    # Save verdicts
    with open(os.path.join(fixtures_dir, "verdict_sony.json"), "w", encoding="utf-8") as f:
        json.dump(v1.model_dump(), f, indent=2)
    with open(os.path.join(fixtures_dir, "verdict_iphone.json"), "w", encoding="utf-8") as f:
        json.dump(v2.model_dump(), f, indent=2)
    with open(os.path.join(fixtures_dir, "verdict_laptop.json"), "w", encoding="utf-8") as f:
        json.dump(v3.model_dump(), f, indent=2)
    with open(os.path.join(fixtures_dir, "verdict_vikram.json"), "w", encoding="utf-8") as f:
        json.dump(v4.model_dump(), f, indent=2)
    print(f"✅ Generated and saved 10 golden fixtures to: {fixtures_dir}")

if __name__ == "__main__":
    print_verdict("🟢 Scenario 1: Comfortable (Sony Headphones for Rahul)", v1)
    print_verdict("🟡 Scenario 2: Stretch (iPhone 16 Pro for Rahul)", v2)
    print_verdict("🔴 Scenario 3: Risky (Gaming Laptop for Amit)", v3)
    print_verdict("🏢 Scenario 4: Old Regime March TDS Shock Persona (Vikram)", v4)
    save_fixtures()
