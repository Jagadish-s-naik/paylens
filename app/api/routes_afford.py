"""
app/api/routes_afford.py
Deterministic Affordability Evaluation & Grounded Regional Explanations.
Strictly implements ARCHITECTURE.md §7.1 and PLAN.md Sub-stages A.2 & A.5.
"""

from typing import List
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.core.schemas import VerifiedProfile, Listing, Verdict
from app.core.engine import evaluate_affordability
from app.api.errors import OptionNotFoundException, ValidationException
from app.api.deps import optional_install_id, check_ai_rate_limit
from app.ai.explain import generate_explanation

router = APIRouter(prefix="/api", tags=["Affordability"])


class AffordRequest(BaseModel):
    profile: VerifiedProfile = Field(..., description="User's verified financial profile")
    listing: Listing = Field(..., description="Item listing and payment options")
    selected_option_id: str = Field(..., description="ID of selected payment option")


class ExplainRequest(BaseModel):
    verdict: Verdict = Field(..., description="Completed verdict to explain")
    language: str = Field("en", description="'en', 'hi', or 'kn'")


class ExplainResponse(BaseModel):
    bullets: List[str] = Field(..., description="4-5 concise, grounded explanation bullet points")
    source: str = Field(..., description="'gemini' or 'template'")


@router.post(
    "/afford",
    response_model=Verdict,
    summary="Evaluate purchase option affordability",
    description="Deterministic evaluation with zero network I/O, pure arithmetic, and p95 < 50ms.",
)
async def evaluate_purchase(
    req: AffordRequest,
    request: Request,
    install_id: str = Depends(optional_install_id),
) -> Verdict:
    # 1. Validate that selected_option_id exists in listing payment options
    matching_option = next(
        (opt for opt in req.listing.payment_options if opt.option_id == req.selected_option_id),
        None,
    )
    if not matching_option:
        raise OptionNotFoundException(req.selected_option_id)

    # 2. Recompute & validate listing effective_cash_price (Decision D8)
    expected_effective_cash = round(
        req.listing.upfront_cash_price - req.listing.cash_discount, 2
    )
    if abs(req.listing.effective_cash_price - expected_effective_cash) > 0.05:
        raise ValidationException(
            message=(
                f"Conflicting effective_cash_price: client sent {req.listing.effective_cash_price}, "
                f"expected {expected_effective_cash} (upfront_cash_price {req.listing.upfront_cash_price} - "
                f"cash_discount {req.listing.cash_discount})."
            ),
            details={"field": "listing.effective_cash_price"},
        )

    # 3. Deterministically evaluate affordability using pure core
    verdict = evaluate_affordability(
        profile=req.profile,
        listing=req.listing,
        selected_option_id=req.selected_option_id,
    )

    return verdict


@router.post(
    "/afford/explain",
    response_model=ExplainResponse,
    summary="Generate grounded bullet explanation",
    description="Returns 4-5 localized bullet points verified by the Numeric Grounding Guard.",
)
async def explain_purchase_verdict(
    req: ExplainRequest,
    install_id: str = Depends(check_ai_rate_limit),
) -> ExplainResponse:
    bullets, source = generate_explanation(
        verdict=req.verdict,
        language=req.language,
    )
    return ExplainResponse(bullets=bullets, source=source)
