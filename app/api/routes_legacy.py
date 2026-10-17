"""
app/api/routes_legacy.py
Backwards-compatible API adapter routes for the single-page web dashboard (static/index.html & static/app.js).
Connects the web dashboard to the robust pure core calculation engine and Gemini 2.5 Flash OCR.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel, Field

from app.core.schemas import PayslipData
from app.core.tax import compare_tax_regimes, TaxInput
from app.core.irr import safe_emi, loan_capacity, effective_annual_rate
from app.ai.extract_payslip import extract_payslip
from app.config import settings
from app.api.translations import TRANSLATIONS_CACHE

router = APIRouter(prefix="/api", tags=["Web Dashboard (Legacy Compatibility)"])


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
    cash_discount: float = 0.0


class TranslateUIRequest(BaseModel):
    language: str = "en"


class ExplainBriefingRequest(BaseModel):
    computed_data: Dict[str, Any]
    language: str = "en"


@router.get("/sample")
def get_sample_payslip() -> Dict[str, Any]:
    """Returns sample payslip for instant demo in web dashboard."""
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
        "net_pay": 72000.0,
    }


@router.post("/extract")
async def extract_payslip_endpoint(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Extracts numbers from payslip upload (PDF/JPG/PNG). Fallbacks gracefully to manual on failure."""
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_bytes:
        return {
            "success": False,
            "message": f"File exceeds {settings.MAX_UPLOAD_MB} MB limit.",
            "data": PayslipData().model_dump(),
        }

    mime_type = file.content_type or "application/octet-stream"
    if mime_type not in ["application/pdf", "image/png", "image/jpeg", "image/jpg"]:
        ext = os.path.splitext(file.filename or "")[1].lower()
        ext_map = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        }
        mime_type = ext_map.get(ext, "application/pdf")

    try:
        extracted, validation = extract_payslip(file_bytes, mime_type, file.filename)
        return {
            "success": True,
            "message": "Values extracted successfully. Please review and verify below.",
            "data": extracted.model_dump(),
        }
    except Exception as exc:
        return {
            "success": False,
            "message": f"Extraction notice: {str(exc)}. Entering manual review mode.",
            "data": PayslipData().model_dump(),
        }


@router.post("/analyze")
def analyze_payslip_endpoint(payload: AnalyzeRequest) -> Dict[str, Any]:
    """Primary financial calculation engine for web dashboard."""
    p = payload.payslip

    tax_input = TaxInput(
        gross_monthly=p.gross_monthly,
        basic_monthly=p.basic,
        hra_monthly=p.hra,
        pf_employee_monthly=p.pf_employee,
        professional_tax_monthly=p.professional_tax,
        rent_monthly=payload.rent_monthly,
        is_metro=payload.is_metro,
        other_80c_annual=payload.other_80c_annual,
        other_80d_annual=payload.other_80d_annual,
    )
    tax_summary = compare_tax_regimes(tax_input)
    in_hand = tax_summary["recommended_take_home"]
    safe_emi_val = safe_emi(in_hand, ratio=payload.emi_ratio, existing_emis=payload.existing_emis)
    borrow_cap = loan_capacity(safe_emi_val, annual_rate=12.0, months=36)

    rec_tax_monthly = (
        tax_summary["new_regime"]["monthly_tax"]
        if tax_summary["better_regime"] == "NEW"
        else tax_summary["old_regime"]["monthly_tax"]
    )
    chart_data = {
        "labels": ["Gross Monthly", "PF Deduction", "Professional Tax", "Income Tax (Est.)", "Net In-Hand"],
        "values": [
            round(p.gross_monthly, 2),
            round(p.pf_employee, 2),
            round(p.professional_tax, 2),
            round(rec_tax_monthly, 2),
            round(in_hand, 2),
        ],
    }

    bullets = [
        f"Verified monthly take-home salary is ₹{in_hand:,.0f} under the {tax_summary['better_regime']} tax regime.",
        f"Choosing {tax_summary['better_regime']} Regime saves you ₹{tax_summary['annual_savings']:,.0f} per year in income tax.",
        f"Your maximum safe monthly EMI capacity is ₹{safe_emi_val:,.0f} (at {int(payload.emi_ratio * 100)}% standard allowance).",
        f"Supported 36-month loan capacity at 12% APR is ₹{borrow_cap:,.0f}.",
        "Beware of hidden processing fees and forfeited cash discounts on 'No-Cost' EMI schemes.",
    ]

    return {
        "tax_summary": tax_summary,
        "affordability": {
            "safe_emi": safe_emi_val,
            "borrow_capacity_36m_12pct": borrow_cap,
            "emi_ratio_used": payload.emi_ratio,
            "existing_emis": payload.existing_emis,
        },
        "chart_data": chart_data,
        "explanation_bullets": bullets,
    }


@router.post("/nocost")
def check_nocost_emi_endpoint(payload: NoCostEMIRequest) -> Dict[str, Any]:
    """Computes effective annual interest rate of No-Cost EMI via IRR bisection."""
    return effective_annual_rate(
        listed_price=payload.listed_price,
        monthly_emi=payload.monthly_emi,
        months=payload.months,
        processing_fee=payload.processing_fee,
        upfront_discount=payload.cash_discount,
    )


@router.post("/translate-ui")
def get_translated_ui_labels(payload: TranslateUIRequest) -> Dict[str, str]:
    """Returns translated UI labels for web dashboard."""
    lang = payload.language.lower()
    if lang in TRANSLATIONS_CACHE:
        return TRANSLATIONS_CACHE[lang]
    return TRANSLATIONS_CACHE.get("en", {})


@router.post("/explain")
def generate_briefing_endpoint(payload: ExplainBriefingRequest) -> Dict[str, Any]:
    """Generates localized explanation bullets for web dashboard."""
    d = payload.computed_data
    in_hand = d.get("recommended_take_home", 0.0)
    regime = d.get("better_regime", "NEW")
    savings = d.get("annual_savings", 0.0)
    safe = d.get("safe_emi", 0.0)
    cap = d.get("loan_capacity", 0.0)

    bullets = [
        f"Verified monthly take-home salary is ₹{in_hand:,.0f} under the {regime} tax regime.",
        f"Choosing {regime} Regime saves you ₹{savings:,.0f} per year in income tax.",
        f"Your maximum safe monthly EMI capacity is ₹{safe:,.0f}.",
        f"Supported loan capacity is ₹{cap:,.0f} over a 36-month tenure.",
        "Beware of hidden processing fees and forfeited cash discounts on 'No-Cost' EMI schemes.",
    ]
    return {"bullets": bullets}
