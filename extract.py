"""
Paylens Gemini Extraction & Explanation Module
Utilizes Google GenAI SDK (Vertex AI / AI Studio) with strict Pydantic schemas.

CRITICAL DESIGN RULE:
The LLM NEVER does math. Gemini only extracts printed numbers and explains
pre-computed results. Output tokens and temperature are strictly capped.
"""

import io
import re
import json
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from config import settings

# Structured schema for payslip extraction
class PayslipData(BaseModel):
    employee_name: str = Field(default="Employee", description="Employee name if present, else 'Employee'")
    company_name: str = Field(default="Company", description="Company or employer name if present")
    pay_period: str = Field(default="Current Month", description="Pay slip month and year, e.g. 'March 2026'")
    basic: float = Field(default=0.0, description="Basic salary component (monthly INR)")
    hra: float = Field(default=0.0, description="House Rent Allowance (monthly INR)")
    special_allowance: float = Field(default=0.0, description="Special allowance or flexible pay (monthly INR)")
    other_earnings: float = Field(default=0.0, description="Sum of other earnings, conveyance, medical allowances etc (monthly INR)")
    gross_monthly: float = Field(default=0.0, description="Total Gross Salary/Earnings before any deductions (monthly INR)")
    pf_employee: float = Field(default=0.0, description="Employee Provident Fund deduction (EPF) (monthly INR)")
    professional_tax: float = Field(default=0.0, description="Professional Tax deduction (PT) (monthly INR)")
    tds: float = Field(default=0.0, description="Tax Deducted at Source / Income Tax deducted (monthly INR)")
    other_deductions: float = Field(default=0.0, description="Other deductions like insurance, meal card etc (monthly INR)")
    net_pay: float = Field(default=0.0, description="Net Take-Home Pay printed on the payslip (monthly INR)")

# Structured schema for Offer Letter extraction
class OfferExtractionData(BaseModel):
    company_name: str = Field(default="Company", description="Company or hiring organization")
    role_title: str = Field(default="Software Engineer", description="Designation or job title")
    location: str = Field(default="Bengaluru", description="Job location or base city")
    annual_ctc: float = Field(default=0.0, description="Headline Annual CTC printed on offer letter (INR)")
    fixed_base: float = Field(default=0.0, description="Fixed base salary including allowances (Annual INR)")
    basic_salary_annual: float = Field(default=0.0, description="Basic salary component (Annual INR)")
    variable_pay_annual: float = Field(default=0.0, description="Performance bonus or variable component (Annual INR)")
    joining_bonus: float = Field(default=0.0, description="Sign-on or joining bonus amount (INR)")
    joining_bonus_clawback_months: int = Field(default=12, description="Clawback or lock-in period for joining bonus in months")
    stocks_esops_annual: float = Field(default=0.0, description="Annual vesting value of stocks or ESOPs (INR)")
    service_bond_months: int = Field(default=0, description="Service bond duration in months (0 if no bond)")
    bond_penalty_amount: float = Field(default=0.0, description="Penalty amount if leaving before bond ends (INR)")
    notice_period_days: int = Field(default=90, description="Notice period duration in days")

# Structured schema for Affordability Lens price quote extraction
class PriceQuoteExtraction(BaseModel):
    item_name: str = Field(default="Product", description="Product or vehicle name, e.g. iPhone 16 Pro, Royal Enfield")
    seller_or_platform: str = Field(default="Store", description="Platform, store, or dealer name (Amazon, Flipkart, Showroom)")
    upfront_cash_price: float = Field(default=0.0, description="Cash price if paid 100% upfront today (INR)")
    emi_monthly_amount: float = Field(default=0.0, description="Monthly EMI installment amount printed on the banner/quote (INR)")
    tenure_months: int = Field(default=6, description="Tenure duration in months (e.g. 3, 6, 9, 12, 24)")
    downpayment: float = Field(default=0.0, description="Initial down payment required today (INR)")
    processing_fee: float = Field(default=0.0, description="Processing fee or documentation charge (INR)")
    financing_type: str = Field(default="NO_COST_EMI", description="Financing scheme: NO_COST_EMI, STANDARD_EMI, BNPL, or PERSONAL_LOAN")

def get_genai_client() -> genai.Client:
    """Returns configured GenAI client based on AI_BACKEND setting."""
    if settings.AI_BACKEND == "vertex":
        return genai.Client(
            vertexai=True,
            project=settings.PROJECT_ID,
            location=settings.VERTEX_LOCATION
        )
    else:
        return genai.Client(api_key=settings.GEMINI_API_KEY)

def clean_json_text(text: str) -> str:
    """Strips Markdown code fences and trailing whitespaces."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"```$", "", text, flags=re.MULTILINE)
    return text.strip()

EXTRACTION_SYSTEM_INSTRUCTION = """
You are Paylens Payslip Parser, an OCR extraction engine for Indian salary payslips.
CRITICAL RULES:
1. Extract monthly INR monetary values EXACTLY as printed on the payslip.
2. DO NOT CALCULATE OR RECOMPUTE any numbers. If printed, copy verbatim.
3. If an item is missing or not mentioned, return 0.0.
4. Return clean structured JSON matching the provided schema.
"""

def extract_payslip_from_bytes(file_bytes: bytes, mime_type: str) -> Optional[PayslipData]:
    """
    Extracts structured payslip fields from PDF or image bytes using Gemini.
    Temperature is 0.0 for deterministic extraction.
    """
    try:
        client = get_genai_client()
        
        part = types.Part.from_bytes(
            data=file_bytes,
            mime_type=mime_type
        )
        
        prompt = "Extract all salary components and deductions from this payslip into the schema. Do not calculate, copy numbers exactly."
        
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[part, prompt],
            config=types.GenerateContentConfig(
                system_instruction=EXTRACTION_SYSTEM_INSTRUCTION,
                temperature=0.0,
                max_output_tokens=settings.MAX_EXTRACTION_TOKENS,
                response_mime_type="application/json",
                response_schema=PayslipData
            )
        )
        
        if not response.text:
            return None
            
        cleaned = clean_json_text(response.text)
        data = json.loads(cleaned)
        return PayslipData(**data)
    except Exception as e:
        print(f"Gemini payslip extraction error: {e}")
        return None

def extract_offer_from_bytes(file_bytes: bytes, mime_type: str) -> Optional[OfferExtractionData]:
    """
    Extracts structured offer letter components (CTC, Fixed Base, Bonds, Bonuses) from PDF/Image.
    """
    try:
        client = get_genai_client()
        part = types.Part.from_bytes(data=file_bytes, mime_type=mime_type)
        prompt = (
            "Extract all compensation components, variable pay, stocks/ESOPs, joining bonus clawback, "
            "service bonds, and notice period from this offer letter into the structured JSON schema. "
            "Do not calculate, copy numbers exactly."
        )
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[part, prompt],
            config=types.GenerateContentConfig(
                system_instruction="You are an offer letter parser for Indian employment contracts. Extract all figures into the schema exactly as stated.",
                temperature=0.0,
                max_output_tokens=settings.MAX_EXTRACTION_TOKENS,
                response_mime_type="application/json",
                response_schema=OfferExtractionData
            )
        )
        if not response.text:
            return None
        cleaned = clean_json_text(response.text)
        data = json.loads(cleaned)
        return OfferExtractionData(**data)
    except Exception as e:
        print(f"Gemini offer extraction error: {e}")
        return None

def extract_price_quote_from_bytes(file_bytes: bytes, mime_type: str) -> Optional[PriceQuoteExtraction]:
    """
    Extracts price tag, Amazon/Flipkart banner, or showroom EMI quote details from an image.
    """
    try:
        client = get_genai_client()
        part = types.Part.from_bytes(data=file_bytes, mime_type=mime_type)
        prompt = (
            "Analyze this product price tag, e-commerce banner, or loan quote image. "
            "Extract the item name, seller/platform, cash price, monthly EMI, tenure in months, "
            "down payment, processing fee, and financing scheme into the JSON schema."
        )
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[part, prompt],
            config=types.GenerateContentConfig(
                system_instruction="You are Paylens Affordability Lens. Extract product pricing, EMI figures, and fees accurately from banners or price tags.",
                temperature=0.0,
                max_output_tokens=settings.MAX_EXTRACTION_TOKENS,
                response_mime_type="application/json",
                response_schema=PriceQuoteExtraction
            )
        )
        if not response.text:
            return None
        cleaned = clean_json_text(response.text)
        data = json.loads(cleaned)
        return PriceQuoteExtraction(**data)
    except Exception as e:
        print(f"Gemini price quote extraction error: {e}")
        return None

def generate_financial_explanation(
    computed_data: Dict[str, Any],
    language: str = "en"
) -> List[str]:
    """
    Generates exactly 5 plain-language actionable bullets in the chosen language (English/Hindi/Kannada).
    FORBIDS any math recalculation. Strictly explains the provided Python-computed figures.
    """
    lang_names = {
        "en": "English",
        "hi": "Hindi",
        "kn": "Kannada"
    }
    target_lang = lang_names.get(language, "English")
    
    prompt = f"""
You are a friendly, encouraging financial mentor for a fresh graduate or first-job salary earner in India.
Explain the following PRE-COMPUTED financial analysis in simple, conversational {target_lang}.

PRE-COMPUTED FIGURES (DO NOT RECALCULATE, USE ONLY THESE EXACT NUMBERS):
- Gross Monthly Salary: ₹{computed_data.get('gross_monthly', 0):,.2f}
- Recommended Tax Regime: {computed_data.get('better_regime', 'NEW')}
- Annual Tax Savings: ₹{computed_data.get('annual_savings', 0):,.2f}
- Monthly In-Hand / Take-Home: ₹{computed_data.get('recommended_take_home', 0):,.2f}
- Safe Monthly EMI Limit: ₹{computed_data.get('safe_emi', 0):,.2f}
- Supported Loan Amount: ₹{computed_data.get('loan_capacity', 0):,.2f}

STRICT CONSTRAINTS:
1. Provide EXACTLY 5 clear bullet points.
2. Written directly in {target_lang}.
3. DO NOT recalculate or invent any numbers. Refer ONLY to the figures provided above.
4. Explain:
   - Bullet 1: Monthly take-home salary vs gross paycheck.
   - Bullet 2: Recommended tax regime and exact annual tax savings.
   - Bullet 3: Safe EMI allowance without risking living expenses.
   - Bullet 4: Maximum safe borrowing capacity for future goals.
   - Bullet 5: One practical tip on avoiding deceptive 'No-Cost EMI' offers.
5. Return clean JSON array of 5 strings: ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"].
"""

    try:
        client = get_genai_client()
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=settings.MAX_EXPLANATION_TOKENS,
                response_mime_type="application/json"
            )
        )
        if not response.text:
            raise ValueError("Empty response from Gemini")
            
        cleaned = clean_json_text(response.text)
        bullets = json.loads(cleaned)
        if isinstance(bullets, list) and len(bullets) >= 5:
            return [str(b).strip() for b in bullets[:5]]
        elif isinstance(bullets, list) and len(bullets) > 0:
            return [str(b).strip() for b in bullets]
        elif isinstance(bullets, dict):
            return [str(v) for v in bullets.values()][:5]
    except Exception as e:
        print(f"Gemini explanation generation note: {e}")
        
    # Reliable localized fallbacks matching computed data
    rec_takehome = computed_data.get('recommended_take_home', 0)
    regime = computed_data.get('better_regime', 'NEW')
    savings = computed_data.get('annual_savings', 0)
    safe = computed_data.get('safe_emi', 0)
    loan_cap = computed_data.get('loan_capacity', 0)
    
    if language == "hi":
        return [
            f"आपका वास्तविक मासिक इन-हैंड (Take-Home) वेतन ₹{rec_takehome:,.0f} है।",
            f"आपके लिए {regime} टैक्स रिजीम सबसे लाभदायक है, जिससे आप प्रति वर्ष ₹{savings:,.0f} की टैक्स बचत करेंगे।",
            f"आपकी सुरक्षित मासिक ईएमआई सीमा ₹{safe:,.0f} है (आपके वेतन का 35%)।",
            f"इस सुरक्षित ईएमआई पर आप लगभग ₹{loan_cap:,.0f} तक का पर्सनल या गैजेट लोन आसानी से संभाल सकते हैं।",
            "नो-कॉस्ट ईएमआई चुनते समय छिपी हुई 18% जीएसटी प्रोसेसिंग फीस और छूटे हुए कैश डिस्काउंट की हमेशा जांच करें।"
        ]
    elif language == "kn":
        return [
            f"ನಿಮ್ಮ ಮಾಸಿಕ ನಿವ್ವಳ ಸಂಬಳ (Take-Home) ₹{rec_takehome:,.0f}.",
            f"ನಿಮಗೆ {regime} ತೆರಿಗೆ ವ್ಯವಸ್ಥೆ ಹೆಚ್ಚು ಲಾಭದಾಯಕವಾಗಿದ್ದು, ವರ್ಷಕ್ಕೆ ₹{savings:,.0f} ತೆರಿಗೆ ಉಳಿತಾಯವಾಗಲಿದೆ.",
            f"ನಿಮ್ಮ ಸುರಕ್ಷಿತ ಮಾಸಿಕ ಇಎಂಐ ಮಿತಿ ₹{safe:,.0f} ಆಗಿದೆ.",
            f"ಈ ಇಎಂಐ ಸಾಮರ್ಥ್ಯದಲ್ಲಿ ನೀವು ಸುಮಾರು ₹{loan_cap:,.0f} ವರೆಗೆ ಸಾಲ ಪಡೆಯಬಹುದು.",
            "ನೋ-ಕಾಸ್ಟ್ ಇಎಂಐ ತೆಗೆದುಕೊಳ್ಳುವಾಗ ಗುಪ್ತ ಪ್ರಕ್ರಿಯಾ ಶುಲ್ಕ ಮತ್ತು ನಗದು ರಿಯಾಯಿತಿಗಳನ್ನು ಗಮನಿಸಿ."
        ]
    else:
        return [
            f"Your actual monthly in-hand take-home salary is ₹{rec_takehome:,.0f}.",
            f"The {regime} tax regime is optimal for your bracket, saving ₹{savings:,.0f} in taxes annually.",
            f"Your recommended safe EMI limit is ₹{safe:,.0f} per month (35% threshold).",
            f"At this rate, you can comfortably service a loan capacity of up to ₹{loan_cap:,.0f}.",
            "Watch out for No-Cost EMI traps: check for upfront processing fees (+18% GST) and foregone cash discounts."
        ]
