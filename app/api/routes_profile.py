"""
app/api/routes_profile.py
Profile & Persona Endpoints.
Strictly implements ARCHITECTURE.md §7.1 and PLAN.md Sub-stages A.2 & A.4.
"""

import json
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends

from app.config import settings
from app.core.schemas import VerifiedProfile, ActiveEMI, PayslipData
from app.api.deps import check_ai_rate_limit
from app.api.errors import (
    FileTooLargeException,
    UnsupportedFileException,
    AIUnavailableException,
    ValidationException,
)
from app.ai.extract_payslip import extract_payslip
from app.ai.client import AIUnavailableError

router = APIRouter(prefix="/api", tags=["Profile"])


def get_canonical_personas() -> Dict[str, VerifiedProfile]:
    """Canonical demo profiles matching scripts/compute_fixtures.py."""
    rahul = VerifiedProfile(
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
        existing_emis=[
            ActiveEMI(
                name="Previous Phone",
                monthly_amount=3500.0,
                tenure_remaining_months=3,
            )
        ],
        current_savings=150000.0,
        language_pref="en",
    )

    amit = VerifiedProfile(
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
        existing_emis=[
            ActiveEMI(
                name="Bike Loan",
                monthly_amount=8000.0,
                tenure_remaining_months=8,
            )
        ],
        current_savings=25000.0,
        language_pref="en",
    )

    vikram = VerifiedProfile(
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
        current_savings=200000.0,
        language_pref="en",
    )

    return {
        "rahul": rahul,
        "amit": amit,
        "vikram": vikram,
    }


@router.get(
    "/demo/profiles",
    summary="Get canonical demo personas",
    description="Returns pre-verified personas (Rahul, Amit, Vikram) for onboarding demo prefill.",
)
async def get_demo_profiles() -> Dict[str, Any]:
    personas = get_canonical_personas()
    return {
        "profiles": {
            key: profile.model_dump() for key, profile in personas.items()
        }
    }


@router.post(
    "/profile/build",
    summary="Extract payslip & build verified profile",
    description="Processes PDF/image payslip via Gemini OCR + G1-G3 sanity gates and constructs VerifiedProfile in-memory with zero persistence.",
)
async def build_profile(
    file: UploadFile = File(..., description="Payslip document (PDF, PNG, JPG, ≤ 5MB)"),
    tax_regime: str = Form("NEW", description="'NEW' or 'OLD'"),
    rent_monthly: float = Form(0.0, description="Monthly rent"),
    current_savings: float = Form(0.0, description="Liquid savings in bank"),
    is_metro: bool = Form(True, description="Metro city cost factor"),
    annual_variable_bonus: float = Form(0.0, description="Declared annual variable bonus"),
    existing_emis_json: Optional[str] = Form(None, description="JSON array of active EMIs"),
    language_pref: str = Form("en", description="'en', 'hi', or 'kn'"),
    install_id: str = Depends(check_ai_rate_limit),
) -> Dict[str, Any]:
    # 1. MIME type & extension validation
    filename = file.filename or "upload.pdf"
    content_type = file.content_type or ""
    allowed_types = {
        "application/pdf": "application/pdf",
        "image/png": "image/png",
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
    }

    mime_type = allowed_types.get(content_type.lower())
    if not mime_type:
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        ext_map = {
            "pdf": "application/pdf",
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
        }
        mime_type = ext_map.get(ext)

    if not mime_type:
        raise UnsupportedFileException(
            message=f"File '{filename}' has unsupported format. Only PDF, PNG, and JPG files are supported."
        )

    # 2. File size verification
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_bytes:
        raise FileTooLargeException(
            message=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_MB} MB.",
            max_mb=settings.MAX_UPLOAD_MB,
        )

    # 3. Extraction & Sanity Gates G1–G3
    try:
        extraction, validation = extract_payslip(
            file_bytes=file_bytes,
            mime_type=mime_type,
            filename=filename,
        )
    except AIUnavailableError as exc:
        raise AIUnavailableException(message=exc.message, fallback=exc.fallback)

    # 4. Parse active EMIs if provided
    active_emis: List[ActiveEMI] = []
    if existing_emis_json:
        try:
            parsed_emis = json.loads(existing_emis_json)
            if isinstance(parsed_emis, list):
                for emi in parsed_emis:
                    active_emis.append(ActiveEMI(**emi))
        except Exception as exc:
            raise ValidationException(
                message=f"Invalid format for existing_emis_json: {str(exc)}",
                details={"field": "existing_emis_json"},
            )

    # 5. Construct VerifiedProfile in-memory (derived fields auto-computed)
    profile = VerifiedProfile(
        profile_id=str(uuid.uuid4()),
        employer_name=extraction.company_name or "Company",
        pay_period=extraction.pay_period or "Current Month",
        gross_monthly=extraction.gross_monthly,
        basic_monthly=extraction.basic,
        hra_monthly=extraction.hra,
        pf_employee_monthly=extraction.pf_employee,
        professional_tax_monthly=extraction.professional_tax,
        tds_monthly=extraction.tds,
        tax_regime=tax_regime.upper(),
        in_hand_verified=extraction.net_pay,
        annual_variable_bonus=annual_variable_bonus,
        rent_monthly=rent_monthly,
        is_metro=is_metro,
        existing_emis=active_emis,
        current_savings=current_savings,
        language_pref=language_pref,
    )

    return {
        "profile": profile.model_dump(),
        "extraction": extraction.model_dump(),
        "validation": validation.to_dict(),
    }
