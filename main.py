"""
Paylens Main Backend Service (FastAPI)
Unified backend serving the single-page Bento UI and all FinTech calculation & AI endpoints.
"""

import time
import os
from typing import Dict, Any, Optional, List
from collections import defaultdict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import firestore

from config import settings
from tax import compare_tax_regimes, TaxInput
from emi import safe_emi, loan_capacity, effective_annual_rate, evaluate_affordability_lens
from extract import (
    extract_payslip_from_bytes,
    generate_financial_explanation,
    extract_offer_from_bytes,
    extract_price_quote_from_bytes,
    PayslipData,
    OfferExtractionData,
    PriceQuoteExtraction
)
from translate import get_ui_labels
from offer import OfferInput, decode_offer, compare_two_offers
from auditor import audit_monthly_payslips, AuditReport
from plan import LifePlanRequest, generate_life_plan

app = FastAPI(title="Paylens — First Paycheck Copilot", version="1.0.0")

# Enable CORS for local and Cloud Run testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# COST CONTROL: In-Memory IP Rate Limiter & Daily Circuit Breaker
# -------------------------------------------------------------
ip_request_timestamps = defaultdict(list)
daily_gemini_calls = {"count": 0, "date": time.strftime("%Y-%m-%d")}

def check_rate_limits(request: Request, is_ai_call: bool = False):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    
    # Clean timestamps older than 1 hour
    ip_request_timestamps[client_ip] = [
        t for t in ip_request_timestamps[client_ip] if now - t < 3600
    ]
    
    if len(ip_request_timestamps[client_ip]) >= settings.RATE_LIMIT_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached (20 requests/hour). Please try again shortly."
        )
        
    ip_request_timestamps[client_ip].append(now)
    
    # Check daily circuit breaker for AI calls
    if is_ai_call:
        current_date = time.strftime("%Y-%m-%d")
        if daily_gemini_calls["date"] != current_date:
            daily_gemini_calls["count"] = 0
            daily_gemini_calls["date"] = current_date
            
        if daily_gemini_calls["count"] >= settings.DAILY_GEMINI_CALL_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Daily AI query cap reached to preserve free-tier budget. Manual calculations are still fully functional!"
            )
        daily_gemini_calls["count"] += 1

# Lazy Firestore client
_firestore_db = None
def get_firestore_client():
    global _firestore_db
    if _firestore_db is None:
        try:
            _firestore_db = firestore.Client(project=settings.PROJECT_ID)
        except Exception as e:
            print(f"Warning: Could not connect to Firestore: {e}")
    return _firestore_db

# -------------------------------------------------------------
# DATA MODELS
# -------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    payslip: PayslipData
    rent_monthly: float = 0.0
    is_metro: bool = True
    existing_emis: float = 0.0
    emi_ratio: float = 0.35
    other_80c_annual: float = 0.0
    other_80d_annual: float = 0.0
    language: str = "en"

class NoCostEMIRequest(BaseModel):
    listed_price: float
    monthly_emi: float
    months: int
    processing_fee: float = 0.0
    upfront_discount: float = 0.0

class ExplainRequest(BaseModel):
    computed_data: Dict[str, Any]
    language: str = "en"

class TranslateRequest(BaseModel):
    language: str = "en"

class CompareOffersRequest(BaseModel):
    offer_a: OfferInput
    offer_b: OfferInput

class AuditRequest(BaseModel):
    payslips: List[PayslipData]
    state: str = "KA"

class LensEvaluationRequest(BaseModel):
    item_name: str = "Item"
    upfront_price: float
    monthly_emi: float
    months: int
    processing_fee: float = 0.0
    upfront_discount: float = 0.0
    monthly_in_hand: float
    existing_emis: float = 0.0
    emi_ratio: float = 0.35
    financing_type: str = "NO_COST_EMI"

# -------------------------------------------------------------
# API ROUTES
# -------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "app": "Paylens",
        "project": settings.PROJECT_ID,
        "region": settings.REGION,
        "ai_backend": settings.AI_BACKEND,
        "model": settings.GEMINI_MODEL
    }

@app.get("/api/sample")
def get_sample_payslip():
    """Returns built-in synthetic payslip (Demo User, ~80k gross) for fail-safe demoing."""
    return {
        "employee_name": "Demo User",
        "company_name": "Acme Cloud Tech India Pvt Ltd",
        "pay_period": "March 2026",
        "basic": 40000.0,
        "hra": 20000.0,
        "special_allowance": 16000.0,
        "other_earnings": 4000.0,
        "gross_monthly": 80000.0,
        "pf_employee": 4800.0,
        "professional_tax": 200.0,
        "tds": 3000.0,
        "other_deductions": 0.0,
        "net_pay": 72000.0
    }

@app.post("/api/extract")
async def extract_payslip(request: Request, file: UploadFile = File(...)):
    """Extracts numbers from payslip upload (PDF/JPG/PNG). Fallbacks gracefully to zeros on failure."""
    check_rate_limits(request, is_ai_call=True)
    
    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 5MB limit.")
        
    mime_type = file.content_type or "application/octet-stream"
    if mime_type not in ["application/pdf", "image/png", "image/jpeg", "image/jpg"]:
        # Infer from extension
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext == ".pdf":
            mime_type = "application/pdf"
        elif ext in [".png"]:
            mime_type = "image/png"
        elif ext in [".jpg", ".jpeg"]:
            mime_type = "image/jpeg"
            
    extracted = extract_payslip_from_bytes(file_bytes, mime_type)
    if not extracted:
        # Graceful failure as requested: return empty structure with helpful message
        return {
            "success": False,
            "message": "Couldn't read the payslip automatically. Please enter your values manually below.",
            "data": PayslipData()
        }
        
    return {
        "success": True,
        "message": "Values extracted successfully. Please review and verify below.",
        "data": extracted
    }

@app.post("/api/analyze")
def analyze_payslip(request: Request, payload: AnalyzeRequest):
    """
    Primary financial engine:
    1. Computes deterministic tax comparison (tax.py)
    2. Computes deterministic affordability & safe EMI (emi.py)
    3. Assembles Chart.js salary waterfall data
    4. Generates 5-bullet plain language explanation in requested language
    5. Saves anonymous session document to Firestore
    """
    check_rate_limits(request, is_ai_call=True)
    p = payload.payslip
    
    # 1. Deterministic Tax Computation
    tax_input = TaxInput(
        gross_monthly=p.gross_monthly,
        basic_monthly=p.basic,
        hra_monthly=p.hra,
        pf_employee_monthly=p.pf_employee,
        professional_tax_monthly=p.professional_tax,
        rent_monthly=payload.rent_monthly,
        is_metro=payload.is_metro,
        other_80c_annual=payload.other_80c_annual,
        other_80d_annual=payload.other_80d_annual
    )
    tax_summary = compare_tax_regimes(tax_input)
    
    # 2. Deterministic Safe EMI & Borrowing Capacity
    in_hand = tax_summary["recommended_take_home"]
    safe_emi_val = safe_emi(in_hand, ratio=payload.emi_ratio, existing_emis=payload.existing_emis)
    # Default 12% loan over 36 months (standard personal/gadget loan benchmark)
    borrow_cap = loan_capacity(safe_emi_val, annual_rate=12.0, months=36)
    
    # 3. Chart Waterfall Data
    rec_tax_monthly = tax_summary["new_regime"]["monthly_tax"] if tax_summary["better_regime"] == "NEW" else tax_summary["old_regime"]["monthly_tax"]
    chart_data = {
        "labels": ["Gross Monthly", "PF Deduction", "Professional Tax", "Income Tax (Est.)", "Net In-Hand"],
        "values": [
            round(p.gross_monthly, 2),
            round(p.pf_employee, 2),
            round(p.professional_tax, 2),
            round(rec_tax_monthly, 2),
            round(in_hand, 2)
        ]
    }
    
    # 4. Gemini 5-Bullet Financial Explanation (English / Hindi / Kannada)
    explanation_input = {
        "gross_monthly": p.gross_monthly,
        "better_regime": tax_summary["better_regime"],
        "annual_savings": tax_summary["annual_savings"],
        "recommended_take_home": in_hand,
        "safe_emi": safe_emi_val,
        "loan_capacity": borrow_cap
    }
    bullets = generate_financial_explanation(explanation_input, language=payload.language)
    
    # 5. Save Anonymous Document to Firestore (1 doc per analysis, no PII)
    try:
        db = get_firestore_client()
        if db:
            db.collection("sessions").add({
                "timestamp": firestore.SERVER_TIMESTAMP,
                "gross_monthly": p.gross_monthly,
                "better_regime": tax_summary["better_regime"],
                "annual_savings": tax_summary["annual_savings"],
                "recommended_take_home": in_hand,
                "safe_emi": safe_emi_val,
                "language": payload.language,
                "app": "Paylens"
            })
    except Exception as e:
        print(f"Firestore session save warning: {e}")
        
    return {
        "tax_summary": tax_summary,
        "affordability": {
            "safe_emi": safe_emi_val,
            "borrow_capacity_36m_12pct": borrow_cap,
            "emi_ratio_used": payload.emi_ratio,
            "existing_emis": payload.existing_emis
        },
        "chart_data": chart_data,
        "explanation_bullets": bullets
    }

@app.post("/api/nocost")
def check_nocost_emi(payload: NoCostEMIRequest):
    """Computes effective annual interest rate of No-Cost EMI via IRR bisection."""
    return effective_annual_rate(
        listed_price=payload.listed_price,
        monthly_emi=payload.monthly_emi,
        months=payload.months,
        processing_fee=payload.processing_fee,
        upfront_discount=payload.upfront_discount
    )

@app.post("/api/explain")
def get_explanation(request: Request, payload: ExplainRequest):
    """Generates 5-bullet summary on demand for selected language."""
    check_rate_limits(request, is_ai_call=True)
    bullets = generate_financial_explanation(payload.computed_data, language=payload.language)
    return {"bullets": bullets}

@app.post("/api/translate-ui")
def translate_ui(payload: TranslateRequest):
    """Returns cached UI labels for English, Hindi, or Kannada."""
    return get_ui_labels(payload.language)

# -------------------------------------------------------------
# 1. OFFER LETTER DECODER & COMPARER ENDPOINTS
# -------------------------------------------------------------
@app.post("/api/offer/decode")
def decode_single_offer(offer: OfferInput):
    """Decodes CTC into guaranteed monthly in-hand and flags 7 fresher traps."""
    return decode_offer(offer)

@app.post("/api/offer/compare")
def compare_offers_api(payload: CompareOffersRequest):
    """Generates side-by-side scorecard comparing Offer A vs Offer B."""
    return compare_two_offers(payload.offer_a, payload.offer_b)

@app.post("/api/offer/extract-file")
async def extract_offer_letter(request: Request, file: UploadFile = File(...)):
    """Extracts structured offer letter components using Gemini on Vertex AI."""
    check_rate_limits(request, is_ai_call=True)
    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 5MB limit.")
        
    mime_type = file.content_type or "application/pdf"
    extracted = extract_offer_from_bytes(file_bytes, mime_type)
    if not extracted:
        # Fallback default offer
        extracted = OfferExtractionData(
            company_name="Sample Employer",
            annual_ctc=1000000.0,
            fixed_base=750000.0,
            variable_pay_annual=150000.0,
            joining_bonus=50000.0,
            stocks_esops_annual=50000.0
        )
    # Convert to OfferInput for decoding
    offer_input = OfferInput(
        company_name=extracted.company_name,
        role_title=extracted.role_title,
        location=extracted.location,
        annual_ctc=extracted.annual_ctc,
        fixed_base=extracted.fixed_base,
        basic_salary_annual=extracted.basic_salary_annual if extracted.basic_salary_annual > 0 else None,
        variable_pay_annual=extracted.variable_pay_annual,
        joining_bonus=extracted.joining_bonus,
        joining_bonus_clawback_months=extracted.joining_bonus_clawback_months,
        stocks_esops_annual=extracted.stocks_esops_annual,
        service_bond_months=extracted.service_bond_months,
        bond_penalty_amount=extracted.bond_penalty_amount,
        notice_period_days=extracted.notice_period_days
    )
    analysis = decode_offer(offer_input)
    return {
        "extracted_data": extracted,
        "analysis": analysis
    }

# -------------------------------------------------------------
# 2. AFFORDABILITY LENS ("SNAP & DECIDE") ENDPOINTS
# -------------------------------------------------------------
@app.post("/api/lens/extract")
async def extract_lens_quote(request: Request, file: UploadFile = File(...)):
    """Extracts price, EMI, and tenure from price tag or banner image."""
    check_rate_limits(request, is_ai_call=True)
    file_bytes = await file.read()
    mime_type = file.content_type or "image/jpeg"
    extracted = extract_price_quote_from_bytes(file_bytes, mime_type)
    if not extracted:
        extracted = PriceQuoteExtraction(
            item_name="Smart Device",
            seller_or_platform="Online Store",
            upfront_cash_price=54999.0,
            emi_monthly_amount=9166.50,
            tenure_months=6,
            processing_fee=999.0
        )
    return extracted

@app.post("/api/lens/evaluate")
def evaluate_lens_quote(payload: LensEvaluationRequest):
    """Evaluates quote against user's safe EMI allowance and returns traffic-light verdict."""
    return evaluate_affordability_lens(
        item_name=payload.item_name,
        upfront_price=payload.upfront_price,
        monthly_emi=payload.monthly_emi,
        months=payload.months,
        processing_fee=payload.processing_fee,
        upfront_discount=payload.upfront_discount,
        monthly_in_hand=payload.monthly_in_hand,
        existing_emis=payload.existing_emis,
        emi_ratio=payload.emi_ratio,
        financing_type=payload.financing_type
    )

# -------------------------------------------------------------
# 3. PAYSLIP AUDITOR ENDPOINT
# -------------------------------------------------------------
@app.post("/api/audit/payslips")
def audit_payslips_endpoint(payload: AuditRequest):
    """Audits multiple consecutive payslips and returns health score & anomaly flags."""
    return audit_monthly_payslips(payload.payslips, state=payload.state)

# -------------------------------------------------------------
# 4. LIFE PLAN MODE ENDPOINT
# -------------------------------------------------------------
@app.post("/api/plan/generate")
def generate_life_plan_endpoint(payload: LifePlanRequest):
    """Generates 50-30-20 budget, emergency fund timeline, and parent letter."""
    return generate_life_plan(payload)

# Mount static folder
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
def serve_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
