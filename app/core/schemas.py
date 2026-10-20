"""
app/core/schemas.py
Pydantic contracts for VerifiedProfile, Listing, PaymentOption, and Verdict.
100% Pure Python dataclasses with zero external dependencies beyond pydantic.
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# =====================================================================
# 1. ENUMS & SUB-MODELS
# =====================================================================
class PaymentType(str, Enum):
    CASH = "CASH"
    NO_COST_EMI = "NO_COST_EMI"
    STANDARD_EMI = "STANDARD_EMI"
    BNPL = "BNPL"

class ActiveEMI(BaseModel):
    name: str = Field(..., description="Item or loan description")
    monthly_amount: float = Field(..., description="Current monthly installment in INR")
    tenure_remaining_months: int = Field(..., description="Remaining installments before roll-off")

class PayslipData(BaseModel):
    """Raw payslip fields extracted from OCR."""
    employee_name: str = Field(default="Employee")
    company_name: str = Field(default="Company")
    pay_period: str = Field(default="Recent")
    basic: float = Field(default=0.0)
    hra: float = Field(default=0.0)
    special_allowance: float = Field(default=0.0)
    other_earnings: float = Field(default=0.0)
    gross_monthly: float = Field(default=0.0)
    pf_employee: float = Field(default=0.0)
    professional_tax: float = Field(default=0.0)
    tds: float = Field(default=0.0)
    other_deductions: float = Field(default=0.0)
    net_pay: float = Field(default=0.0)

# =====================================================================
# 2. VERIFIED PROFILE
# =====================================================================
class VerifiedProfile(BaseModel):
    schema_version: str = Field("1.0.0", description="Schema version for sync migration")
    profile_id: str = Field(..., description="Anonymous UUID generated on install/onboarding")
    
    # Income (Truth Layer)
    employer_name: str = Field("Company", description="Employer name from payslip")
    pay_period: str = Field("Recent", description="Month & Year of payslip")
    gross_monthly: float = Field(..., description="Verified gross earnings from payslip")
    basic_monthly: float = Field(..., description="Basic salary component")
    hra_monthly: float = Field(0.0, description="House Rent Allowance")
    pf_employee_monthly: float = Field(0.0, description="EPF deduction")
    professional_tax_monthly: float = Field(200.0, description="Professional Tax")
    tds_monthly: float = Field(0.0, description="Declared monthly TDS deducted")
    tax_regime: str = Field("NEW", description="'NEW' or 'OLD' tax regime")
    
    # Regular verified net take-home from payslip (EXCLUDES annual variable bonuses)
    in_hand_verified: float = Field(..., description="Verified regular net monthly take-home")
    annual_variable_bonus: float = Field(0.0, description="Declared annual non-guaranteed variable bonus")
    
    # Committed Expenses & Essentials
    rent_monthly: float = Field(0.0, description="Monthly rent obligation")
    is_metro: bool = Field(True, description="Metro city cost factor")
    existing_emis: List[ActiveEMI] = Field(default_factory=list, description="Active debt obligations")
    total_existing_emi_monthly: float = Field(0.0, description="Sum of active monthly EMIs")
    
    # Financial Cushion
    current_savings: float = Field(0.0, description="Liquid savings in bank account")
    essentials_monthly: float = Field(0.0, description="Baseline living cost (rent + 30% in-hand)")
    emergency_runway_months: float = Field(0.0, description="current_savings / essentials_monthly")
    
    # Affordability Capacity
    free_cash_monthly: float = Field(0.0, description="in_hand - total_existing_emi - essentials")
    safe_emi_ceiling: float = Field(0.0, description="Max recommended new EMI (35% in_hand - existing)")
    language_pref: str = Field("en", description="'en', 'hi', or 'kn'")

    @classmethod
    def _compute_derived(cls, data: Any) -> Any:
        if isinstance(data, dict):
            in_hand = data.get("in_hand_verified", 0.0)
            rent = data.get("rent_monthly", 0.0)
            savings = data.get("current_savings", 0.0)
            emis = data.get("existing_emis", [])
            total_emi = sum(e["monthly_amount"] if isinstance(e, dict) else e.monthly_amount for e in emis)
            data["total_existing_emi_monthly"] = total_emi
            
            essentials = rent + (in_hand * 0.30)
            data["essentials_monthly"] = round(essentials, 2)
            data["emergency_runway_months"] = round(savings / essentials, 2) if essentials > 0 else 0.0
            data["free_cash_monthly"] = round(in_hand - total_emi - essentials, 2)
            data["safe_emi_ceiling"] = max(0.0, round((in_hand * 0.35) - total_emi, 2))
        return data

    from pydantic import model_validator
    @model_validator(mode="before")
    @classmethod
    def validate_derived_fields(cls, data: Any) -> Any:
        return cls._compute_derived(data)

# =====================================================================
# 3. LISTING & PAYMENT OPTIONS
# =====================================================================
class PaymentOption(BaseModel):
    option_id: str = Field(..., description="Unique ID for option, e.g. 'hdfc_nocost_6m'")
    type: PaymentType = Field(..., description="Payment option type enum")
    label: str = Field(..., description="Display label, e.g. 'HDFC No-Cost EMI (6 Months)'")
    tenure_months: int = Field(1, description="Number of installments (1 for CASH)")
    monthly_installment: float = Field(..., description="Amount billed per month (INR)")
    upfront_downpayment: float = Field(0.0, description="Down payment required today (INR)")
    processing_fee: float = Field(0.0, description="Upfront documentation/processing charge")
    
    # Only applicable to EMI/BNPL options that forfeit the upfront cash discount.
    # Set to None for CASH option where the discount is captured.
    lost_cash_discount: Optional[float] = Field(None, description="Instant discount lost if taking EMI")
    stated_interest_rate: float = Field(0.0, description="Advertised annual interest rate (0% for No-Cost)")
    instrument_type: Optional[str] = Field("CREDIT_CARD", description="CREDIT_CARD, DEBIT_CARD, or CARDLESS_BNPL")
    bank_key: Optional[str] = Field(None, description="Provider/Bank key slug, e.g. 'hdfc', 'bajaj'")
    bank_name: Optional[str] = Field(None, description="Provider/Bank display name, e.g. 'HDFC Bank', 'Amazon Pay Later'")
    eligibility_note: Optional[str] = Field(None, description="Pre-approval / eligibility note if applicable")
    bank_discount: Optional[float] = Field(0.0, description="Direct bank discount/subvention applied to this specific EMI plan (INR)")
    discount_basis: Optional[str] = Field(None, description="The rationale, offer title, or text basis on which this discount is applied")
    total_cost: Optional[float] = Field(None, description="Final total amount outflow after discount (INR)")

class Listing(BaseModel):
    product_id: str
    title: str
    category: str = Field("Electronics", description="e.g. Smartphone, Laptop, Appliance")
    retailer: str = Field("MockStore", description="MockStore, Amazon, Flipkart")
    upfront_cash_price: float = Field(..., description="Sticker price before discounts (INR)")
    cash_discount: float = Field(0.0, description="Instant discount for upfront cash payment")
    
    # effective_cash_price = upfront_cash_price - cash_discount (True baseline benchmark)
    effective_cash_price: float = Field(..., description="Upfront cash price after instant discount")
    currency: str = Field("INR", description="Source currency code (INR, USD, EUR, GBP, AED, etc.)")
    currency_symbol: str = Field("₹", description="Currency symbol (₹, $, €, £, etc.)")
    original_currency_price: Optional[float] = Field(None, description="Original sticker price in source currency before FX conversion")
    exchange_rate_to_inr: float = Field(1.0, description="FX exchange rate applied to convert to INR")
    payment_options: List[PaymentOption]

# =====================================================================
# 4. VERDICT & IMPACT
# =====================================================================
class TrueCost(BaseModel):
    effective_annual_rate: float = Field(..., description="Effective Annual Rate (EAR) via bisection IRR")
    nominal_annual_rate: float = Field(..., description="Nominal Annual Percentage Rate (APR) = monthly_r * 12")
    total_outflow: float = Field(..., description="Total money paid over full tenure")
    hidden_markup: float = Field(..., description="Total extra cost vs effective cash price")
    is_truly_zero_cost: bool
    has_high_apr_alert: bool = Field(..., description="Flags high rate if EAR > 18% and markup >= min(1500, 5% price)")

class FinancialImpact(BaseModel):
    foir_before: float = Field(..., description="Fixed Obligation to Income Ratio before purchase")
    foir_after: float = Field(..., description="FOIR after taking this option")
    free_cash_before: float
    free_cash_after: float
    free_cash_ratio_after: float
    runway_months_before: float
    runway_months_after: float

class StressTestResult(BaseModel):
    scenario_name: str
    description: str
    stressed_foir: float
    stressed_free_cash: float
    passes: bool
    is_applicable: bool = True
    warning: Optional[str] = None

class AlternativeOption(BaseModel):
    strategy: str = Field(..., description="'BUY_CASH' | 'WAIT_AND_SAVE' | 'DOWNPAYMENT_BOOST'")
    title: str
    description: str
    suggested_monthly_emi: float
    suggested_tenure_months: int
    rescore_verdict: str
    rescore_badge: str
    runway_after: float
    money_saved: float
    is_feasible: bool = True

class Verdict(BaseModel):
    # Core Affordability: worst tier across (FOIR, FreeCash, Runway)
    verdict_level: str = Field(..., description="'COMFORTABLE' | 'STRETCH' | 'RISKY'")
    badge: str = Field(..., description="🟢 Safe to Buy | 🟡 Budget Stretch | 🔴 Risky Debt")
    headline_reason: str = Field(..., description="Concise, plain-language one-line verdict")
    selected_option: PaymentOption
    true_cost: TrueCost
    impact: FinancialImpact
    stress_tests: List[StressTestResult]
    alternatives: List[AlternativeOption]
    
    # Optional: populated on-demand or asynchronously to conserve AI quotas
    explanation_bullets: Optional[List[str]] = Field(None, description="Optional localized bullets")
