"""
app/ai/extract_payslip.py
Multimodal Payslip OCR with Gemini 2.5 Flash and Deterministic Sanity Gates G1-G3.
Strictly implements PLAN.md Task A.4.2 and Principle P1 (LLMs never do math).
"""

import json
import re
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from google.genai import types

from app.config import settings
from app.core.schemas import PayslipData
from app.core.validate import validate_payslip_data, ValidationResult
from app.ai.client import get_gemini_client, AIUnavailableError

EXTRACTION_SYSTEM_INSTRUCTION = """
You are Paylens Payslip Parser, an OCR extraction engine for Indian salary payslips.
CRITICAL RULES:
1. Extract monthly INR monetary values EXACTLY as printed on the payslip.
2. DO NOT CALCULATE OR RECOMPUTE any numbers. If printed, copy verbatim.
3. If an item is missing or not mentioned, return 0.0.
4. Return clean structured JSON matching the provided schema.
"""


def clean_json_text(text: str) -> str:
    """Strips Markdown code fences and surrounding whitespace."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"```$", "", text, flags=re.MULTILINE)
    return text.strip()


def get_mock_payslip_data(filename: Optional[str] = None) -> PayslipData:
    """Loads ground truth fixture for offline fallback (PAYLENS_OFFLINE=1)."""
    ground_truth_path = Path(__file__).resolve().parent.parent.parent / "samples" / "ground_truth.json"
    if ground_truth_path.is_file():
        try:
            data = json.loads(ground_truth_path.read_text(encoding="utf-8"))
            if filename and filename in data:
                return PayslipData(**data[filename])
            # Return first available sample
            first_key = next(iter(data))
            return PayslipData(**data[first_key])
        except Exception:
            pass

    # Hardcoded resilient fallback
    return PayslipData(
        employee_name="Demo User",
        company_name="Acme Tech",
        pay_period="March 2026",
        gross_monthly=80000.0,
        basic=40000.0,
        hra=20000.0,
        special_allowance=16000.0,
        other_earnings=0.0,
        pf_employee=4800.0,
        professional_tax=200.0,
        tds=3000.0,
        other_deductions=0.0,
        net_pay=72000.0,
    )


def extract_payslip(
    file_bytes: bytes,
    mime_type: str,
    filename: Optional[str] = None,
) -> Tuple[PayslipData, ValidationResult]:
    """
    Extracts structured PayslipData from PDF or image bytes and runs deterministic validation gates G1-G3.
    Returns (PayslipData, ValidationResult).
    """
    if settings.PAYLENS_OFFLINE == 1:
        extracted = get_mock_payslip_data(filename)
        validation = validate_payslip_data(extracted)
        return extracted, validation

    try:
        client = get_gemini_client()
        part = types.Part.from_bytes(data=file_bytes, mime_type=mime_type)
        prompt = (
            "Extract all salary components and deductions from this payslip into the schema. "
            "Do not calculate, copy numbers exactly as printed."
        )

        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[part, prompt],
            config=types.GenerateContentConfig(
                system_instruction=EXTRACTION_SYSTEM_INSTRUCTION,
                temperature=0.0,
                max_output_tokens=2048,
                response_mime_type="application/json",
                response_schema=PayslipData,
            ),
        )

        if not response.text:
            raise AIUnavailableError("Gemini returned empty extraction response.")

        cleaned = clean_json_text(response.text)
        raw_dict = json.loads(cleaned)
        extracted = PayslipData(**raw_dict)
    except AIUnavailableError:
        raise
    except Exception as exc:
        raise AIUnavailableError(
            message=f"Gemini payslip extraction failed: {str(exc)}",
            fallback="manual_entry",
        ) from exc

    # Run deterministic sanity gates G1–G3
    validation = validate_payslip_data(extracted)
    return extracted, validation
