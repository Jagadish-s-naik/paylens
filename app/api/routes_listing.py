"""
app/api/routes_listing.py
Fallback Listing Parser Endpoint.
Strictly implements ARCHITECTURE.md §7.1 and PLAN.md Task A.5.2.
"""

import json
import re
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from google.genai import types

from app.config import settings
from app.core.schemas import Listing, PaymentOption, PaymentType
from app.api.deps import check_ai_rate_limit
from app.api.errors import AIUnavailableException
from app.ai.client import get_gemini_client, AIUnavailableError

router = APIRouter(prefix="/api", tags=["Listing"])


class ParseListingRequest(BaseModel):
    url: Optional[str] = Field("", description="Product listing URL")
    page_title: Optional[str] = Field("", description="Web page title")
    text: str = Field(..., description="Unstructured webpage text or listing snippet")


def fallback_regex_parse(text: str, page_title: Optional[str] = None) -> Listing:
    """Deterministic regex extraction for offline or non-AI fallback."""
    title = (page_title or "Extracted Product").strip()
    price_matches = re.findall(r"(?:₹|Rs\.?|INR)\s*(\d+(?:,\d+)*(?:\.\d+)?)", text, flags=re.IGNORECASE)
    price = 10000.0
    if price_matches:
        try:
            price = float(price_matches[0].replace(",", ""))
        except ValueError:
            price = 10000.0

    return Listing(
        product_id=f"item_{abs(hash(title)) % 100000}",
        title=title,
        category="General",
        retailer="Online Retailer",
        upfront_cash_price=price,
        cash_discount=0.0,
        effective_cash_price=price,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label="Full Upfront Payment",
                tenure_months=1,
                monthly_installment=price,
                upfront_downpayment=0.0,
                processing_fee=0.0,
                lost_cash_discount=None,
                stated_interest_rate=0.0,
            )
        ],
    )


@router.post(
    "/listing/parse",
    response_model=Listing,
    summary="Parse unstructured text to Listing schema",
    description="Fallback route for extracting payment options and prices from unstructured text.",
)
async def parse_listing(
    req: ParseListingRequest,
    install_id: str = Depends(check_ai_rate_limit),
) -> Listing:
    if settings.PAYLENS_OFFLINE == 1:
        return fallback_regex_parse(req.text, req.page_title)

    try:
        client = get_gemini_client()
        prompt = (
            f"Parse the following product listing page text into structured JSON matching the Listing schema.\n"
            f"Page Title: {req.page_title}\n"
            f"Listing Text:\n{req.text}\n"
        )
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=1024,
                response_mime_type="application/json",
                response_schema=Listing,
            ),
        )
        if not response.text:
            return fallback_regex_parse(req.text, req.page_title)

        cleaned = response.text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
            cleaned = re.sub(r"```$", "", cleaned, flags=re.MULTILINE).strip()

        data = json.loads(cleaned)
        return Listing(**data)
    except AIUnavailableError as exc:
        raise AIUnavailableException(message=exc.message, fallback="regex_parse")
    except Exception:
        return fallback_regex_parse(req.text, req.page_title)
