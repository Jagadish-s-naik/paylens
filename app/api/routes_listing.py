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


EXCHANGE_RATES_TO_INR = {
    "INR": 1.0,
    "USD": 84.00,
    "EUR": 91.50,
    "GBP": 109.00,
    "AED": 22.90,
    "CAD": 61.50,
    "AUD": 54.50,
    "SGD": 63.80,
    "JPY": 0.55,
    "CNY": 11.80,
}

CURRENCY_SYMBOLS = {
    "INR": "₹",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "AED": "AED ",
    "CAD": "CA$",
    "AUD": "AU$",
    "SGD": "SG$",
    "JPY": "¥",
    "CNY": "CN¥",
}


def detect_currency_and_price(text: str):
    """Detects foreign currency and extracts numeric price."""
    patterns = [
        ("USD", r"(?:\$|USD|US\$)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("EUR", r"(?:€|EUR)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("GBP", r"(?:£|GBP)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("AED", r"(?:AED|د\.إ|Dhs)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("CAD", r"(?:CA\$|C\$|CAD)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("AUD", r"(?:AU\$|A\$|AUD)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("SGD", r"(?:SG\$|S\$|SGD)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("JPY", r"(?:¥|JPY)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
        ("INR", r"(?:₹|Rs\.?|INR)\s*(\d+(?:,\d+)*(?:\.\d+)?)"),
    ]
    for code, pat in patterns:
        m = re.findall(pat, text, flags=re.IGNORECASE)
        if m:
            try:
                raw_val = float(m[0].replace(",", ""))
                return code, raw_val
            except ValueError:
                continue

    # Generic number fallback (assume INR)
    generic_m = re.findall(r"\b(\d+(?:,\d+)*(?:\.\d+)?)\b", text)
    if generic_m:
        try:
            return "INR", float(generic_m[0].replace(",", ""))
        except ValueError:
            pass

    return "INR", 10000.0


def fallback_regex_parse(text: str, page_title: Optional[str] = None) -> Listing:
    """Deterministic regex extraction with multi-currency classification for offline or fallback."""
    title = (page_title or "Extracted Product").strip()
    currency, raw_price = detect_currency_and_price(text)
    rate = EXCHANGE_RATES_TO_INR.get(currency, 1.0)
    inr_price = round(raw_price * rate, 2)
    symbol = CURRENCY_SYMBOLS.get(currency, f"{currency} ")

    label = (
        f"Full Upfront Payment ({symbol}{raw_price:,.2f} ⇄ ₹{inr_price:,.2f} INR)"
        if currency != "INR"
        else "Full Upfront Payment"
    )

    return Listing(
        product_id=f"item_{abs(hash(title)) % 100000}",
        title=title,
        category="General",
        retailer="Online Retailer",
        currency=currency,
        currency_symbol=symbol,
        original_currency_price=raw_price if currency != "INR" else None,
        exchange_rate_to_inr=rate,
        upfront_cash_price=inr_price,
        cash_discount=0.0,
        effective_cash_price=inr_price,
        payment_options=[
            PaymentOption(
                option_id="cash_full",
                type=PaymentType.CASH,
                label=label,
                tenure_months=1,
                monthly_installment=inr_price,
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
