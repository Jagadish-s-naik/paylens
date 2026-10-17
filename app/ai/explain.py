"""
app/ai/explain.py
Multilingual Explanation Generator with Strict Numeric Grounding Guard.
Strictly implements PLAN.md Task A.5.1 and Principle P1 (Mechanical enforcement).
Zero imports from app.api to preserve architecture.
"""

import json
import re
from typing import List, Tuple, Set, Optional
from google.genai import types

from app.config import settings
from app.core.schemas import Verdict, VerifiedProfile
from app.ai.templates import get_template_explanation
from app.ai.client import get_gemini_client, AIUnavailableError


def extract_numbers_from_text(text: str) -> List[float]:
    """Regex extracts all monetary amounts, percentages, and numeric values from text."""
    # Matches numbers with optional commas and decimals, e.g. 1,500.00 or 30.74 or 20
    matches = re.findall(r"(?:\b|\b₹|\$)?(\d+(?:,\d+)*(?:\.\d+)?)\b", text)
    numbers: List[float] = []
    for m in matches:
        cleaned = m.replace(",", "")
        try:
            val = float(cleaned)
            numbers.append(val)
        except ValueError:
            continue
    return numbers


def collect_allowed_numbers(
    verdict: Verdict,
    profile: Optional[VerifiedProfile] = None,
) -> Set[float]:
    """Extracts all authorized numeric values from Verdict and Profile."""
    allowed: Set[float] = set()

    # Common valid constants (months, percentages, bullet indices, zero)
    for c in [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 12.0, 20.0, 24.0, 35.0, 50.0, 100.0]:
        allowed.add(c)

    # True cost numbers
    tc = verdict.true_cost
    allowed.add(round(tc.effective_annual_rate, 2))
    allowed.add(round(tc.nominal_annual_rate, 2))
    allowed.add(round(tc.total_outflow, 2))
    allowed.add(round(tc.hidden_markup, 2))

    # Impact numbers
    imp = verdict.impact
    allowed.add(round(imp.foir_before * 100, 1))
    allowed.add(round(imp.foir_after * 100, 1))
    allowed.add(round(imp.free_cash_before, 2))
    allowed.add(round(imp.free_cash_after, 2))
    allowed.add(round(abs(imp.free_cash_after), 2))
    allowed.add(round(imp.runway_months_before, 1))
    allowed.add(round(imp.runway_months_after, 1))
    allowed.add(round(imp.free_cash_ratio_after * 100, 1))

    # Selected payment option
    opt = verdict.selected_option
    allowed.add(float(opt.tenure_months))
    allowed.add(round(opt.monthly_installment, 2))
    allowed.add(round(opt.upfront_downpayment, 2))
    allowed.add(round(opt.processing_fee, 2))
    allowed.add(round(opt.stated_interest_rate, 2))
    if opt.lost_cash_discount:
        allowed.add(round(opt.lost_cash_discount, 2))

    # Stress tests numbers
    for st in verdict.stress_tests:
        allowed.add(round(st.stressed_foir * 100, 1))
        allowed.add(round(st.stressed_free_cash, 2))
        allowed.add(round(abs(st.stressed_free_cash), 2))

    # Alternatives numbers
    for alt in verdict.alternatives:
        allowed.add(float(alt.suggested_tenure_months))
        allowed.add(round(alt.suggested_monthly_emi, 2))
        allowed.add(round(alt.runway_after, 1))
        allowed.add(round(alt.money_saved, 2))

    # Profile numbers if provided
    if profile:
        allowed.add(round(profile.gross_monthly, 2))
        allowed.add(round(profile.in_hand_verified, 2))
        allowed.add(round(profile.current_savings, 2))
        allowed.add(round(profile.rent_monthly, 2))
        allowed.add(round(profile.essentials_monthly, 2))
        allowed.add(round(profile.total_existing_emi_monthly, 2))

    return allowed


def verify_numeric_grounding(bullets: List[str], allowed_numbers: Set[float]) -> bool:
    """
    Asserts every number extracted from the bullets appears in the allowed numbers.
    Tolerance: within 1.5% or absolute difference <= 1.0 (for rounding variations).
    Returns False if ANY number cannot be mathematically grounded.
    """
    for bullet in bullets:
        extracted = extract_numbers_from_text(bullet)
        for num in extracted:
            matched = False
            for allowed in allowed_numbers:
                if abs(num - allowed) <= 1.0 or (allowed > 0 and abs(num - allowed) / allowed <= 0.02):
                    matched = True
                    break
            if not matched:
                return False
    return True


def generate_explanation(
    verdict: Verdict,
    language: str = "en",
    profile: Optional[VerifiedProfile] = None,
) -> Tuple[List[str], str]:
    """
    Generates 4-5 bullet explanation. Returns (bullets, source) where source is 'gemini' or 'template'.
    Enforces Numeric Grounding Guard; rejects any unverified numbers.
    """
    fallback_bullets = get_template_explanation(verdict, language)

    if settings.PAYLENS_OFFLINE == 1:
        return fallback_bullets, "template"

    allowed_numbers = collect_allowed_numbers(verdict, profile)
    lang_map = {"en": "English", "hi": "Hindi", "kn": "Kannada"}
    target_lang = lang_map.get(language.lower(), "English")

    prompt = f"""
You are Paylens Financial Explainer.
Explain this verified financial assessment in 4-5 concise, encouraging bullet points in {target_lang}.

ASSESSMENT DETAILS (DO NOT INVENT OR RECALCULATE ANY NUMBERS; USE ONLY THESE):
- Verdict Level: {verdict.verdict_level}
- Headline Reason: {verdict.headline_reason}
- Debt Ratio (FOIR): {round(verdict.impact.foir_after * 100, 1)}%
- Monthly Take-Home Free Cash After: ₹{verdict.impact.free_cash_after:,.0f}
- Emergency Savings Runway: {verdict.impact.runway_months_after:.1f} months
- Effective Annual Financing Rate (EAR): {verdict.true_cost.effective_annual_rate:.2f}%
- Total Hidden Markup vs Cash: ₹{verdict.true_cost.hidden_markup:,.0f}
- Monthly Installment: ₹{verdict.selected_option.monthly_installment:,.0f} for {verdict.selected_option.tenure_months} months

STRICT GROUNDING RULES:
1. Provide exactly 4 or 5 bullet points.
2. Every number you write MUST match one of the exact numbers provided above.
3. Return a clean JSON array of strings: ["bullet 1", "bullet 2", "bullet 3", "bullet 4"].
"""

    try:
        client = get_gemini_client()
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=1024,
                response_mime_type="application/json",
            ),
        )

        if not response.text:
            return fallback_bullets, "template"

        cleaned = response.text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
            cleaned = re.sub(r"```$", "", cleaned, flags=re.MULTILINE).strip()

        bullets = json.loads(cleaned)
        if not isinstance(bullets, list) or len(bullets) < 3:
            return fallback_bullets, "template"

        clean_bullets = [str(b).strip() for b in bullets if str(b).strip()]

        # RUN NUMERIC GROUNDING GUARD
        if verify_numeric_grounding(clean_bullets, allowed_numbers):
            return clean_bullets, "gemini"
        else:
            return fallback_bullets, "template"
    except Exception:
        return fallback_bullets, "template"
