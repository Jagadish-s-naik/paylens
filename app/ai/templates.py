"""
app/ai/templates.py
Static Fallback Explanation Templates in English, Hindi, and Kannada.
Strictly implements PLAN.md Task A.5.1 and Principle P5 (Graceful degradation).
"""

from typing import List, Dict
from app.core.schemas import Verdict

TEMPLATES: Dict[str, Dict[str, List[str]]] = {
    "en": {
        "COMFORTABLE": [
            "Your fixed debt ratio after this purchase is {foir_pct}%, which remains well within the safe 35% limit.",
            "You will retain ₹{free_cash:,.0f} in monthly uncommitted cash after paying all essentials and installments.",
            "Your emergency savings cushion stands at {runway:.1f} months of expenses.",
            "Financing analysis: Effective Annual Rate (EAR) is {ear:.2f}% with ₹{markup:,.0f} in hidden fees/lost discounts.",
        ],
        "STRETCH": [
            "This purchase consumes {foir_pct}% of your monthly take-home salary, putting you in the stretch zone.",
            "Your remaining uncommitted monthly cash will reduce to ₹{free_cash:,.0f}.",
            "Your emergency savings runway after upfront costs is {runway:.1f} months.",
            "In an income shock scenario (-20%), your monthly budget will face a cash deficit.",
            "Consider waiting to buy upfront in cash to capture instant discounts.",
        ],
        "RISKY": [
            "High risk: fixed monthly obligations will exceed safe limits at {foir_pct}% FOIR.",
            "This installment leads to an immediate monthly cash deficit of ₹{free_cash_abs:,.0f}.",
            "Emergency cushion runway is critically low at {runway:.1f} months (recommended is at least 3 months).",
            "Strong recommendation: build your emergency buffer first before taking on new debt.",
        ],
    },
    "hi": {
        "COMFORTABLE": [
            "इस खरीद के बाद आपका ऋण अनुपात {foir_pct}% रहेगा, जो 35% की सुरक्षित सीमा के अंदर है।",
            "आवश्यक खर्चों और किस्तों के बाद आपके पास प्रति माह ₹{free_cash:,.0f} की बचत रहेगी।",
            "आपका आपातकालीन फंड {runway:.1f} महीने के खर्चों को कवर करता है।",
            "वित्तपोषण विश्लेषण: प्रभावी वार्षिक ब्याज दर (EAR) {ear:.2f}% है।",
        ],
        "STRETCH": [
            "यह किस्त आपके मासिक वेतन का {foir_pct}% हिस्सा ले लेगी, जिससे बजट पर दबाव पड़ेगा।",
            "सभी खर्चों के बाद आपके पास प्रति माह केवल ₹{free_cash:,.0f} बचेंगे।",
            "डाउनपेमेंट के बाद आपका आपातकालीन रनवे {runway:.1f} महीने रह जाएगा।",
            "आय में 20% की गिरावट आने पर आपका मासिक बजट घाटे में चला जाएगा।",
        ],
        "RISKY": [
            "उच्च जोखिम: आपकी निश्चित देनदारियां सुरक्षित सीमा से अधिक ({foir_pct}% FOIR) हो जाएंगी।",
            "इस किस्त से प्रति माह ₹{free_cash_abs:,.0f} का नकद घाटा शुरू हो जाएगा।",
            "आपकी आपातकालीन बचत बहुत कम ({runway:.1f} महीने) रह जाएगी।",
            "सलाह: नया कर्ज लेने से पहले 3 महीने का आपातकालीन फंड बनाएं।",
        ],
    },
    "kn": {
        "COMFORTABLE": [
            "ಈ ಖರೀದಿಯ ನಂತರ ನಿಮ್ಮ ಸಾಲದ ಅನುಪಾತವು {foir_pct}% ಆಗಿರುತ್ತದೆ, ಇದು ಸುರಕ್ಷಿತ 35% ಮಿತಿಯಲ್ಲಿದೆ.",
            "ಅಗತ್ಯ ಖರ್ಚುಗಳ ನಂತರ ನಿಮ್ಮ ಬಳಿ ತಿಂಗಳಿಗೆ ₹{free_cash:,.0f} ಉಚಿತ ನಗದು ಉಳಿಯುತ್ತದೆ.",
            "ತುರ್ತು ಉಳಿತಾಯವು {runway:.1f} ತಿಂಗಳ ಖರ್ಚುಗಳಿಗೆ ಸಾಕಾಗುತ್ತದೆ.",
            "ಹಣಕಾಸು ವಿಶ್ಲೇಷಣೆ: ಪರಿಣಾಮಕಾರಿ ವಾರ್ಷಿಕ ಬಡ್ಡಿದರ (EAR) {ear:.2f}% ಆಗಿದೆ.",
        ],
        "STRETCH": [
            "ಈ ಕಂತು ನಿಮ್ಮ ಮಾಸಿಕ ಆದಾಯದ {foir_pct}% ಅನ್ನು ತೆಗೆದುಕೊಳ್ಳುತ್ತದೆ, ಇದು ಬಜೆಟ್ ಮೇಲೆ ಒತ್ತಡ ತರುತ್ತದೆ.",
            "ಖರ್ಚುಗಳ ನಂತರ ತಿಂಗಳಿಗೆ ಕೇವಲ ₹{free_cash:,.0f} ನಗದು ಉಳಿಯುತ್ತದೆ.",
            "ಮುಂಗಡ ಪಾವತಿಯ ನಂತರ ತುರ್ತು ಉಳಿತಾಯ ರನ್‌ವೇ {runway:.1f} ತಿಂಗಳುಗಳಿಗೆ ಕುಸಿಯುತ್ತದೆ.",
            "ಆದಾಯದಲ್ಲಿ 20% ಕಡಿತವಾದರೆ ಮಾಸಿಕ ಬಜೆಟ್ ಕೊರತೆಯಾಗುತ್ತದೆ.",
        ],
        "RISKY": [
            "ಹೆಚ್ಚಿನ ಅಪಾಯ: ನಿಮ್ಮ ಸಾಲದ ಬದ್ಧತೆಗಳು {foir_pct}% FOIR ಗೆ ಏರುತ್ತದೆ.",
            "ಈ ಕಂತು ತಿಂಗಳಿಗೆ ₹{free_cash_abs:,.0f} ನಗದು ಕೊರತೆಯನ್ನು ಉಂಟುಮಾಡುತ್ತದೆ.",
            "ತುರ್ತು ಉಳಿತಾಯವು ಕೇವಲ {runway:.1f} ತಿಂಗಳುಗಳಿಗೆ ಮಾತ್ರ ಸೀಮಿತವಾಗಿದೆ.",
            "ಸಲಹೆ: ಹೊಸ ಸಾಲ ಮಾಡುವ ಮೊದಲು ಕನಿಷ್ಠ 3 ತಿಂಗಳ ತುರ್ತು ನಿಧಿಯನ್ನು ನಿರ್ಮಿಸಿ.",
        ],
    },
}


def get_template_explanation(verdict: Verdict, language: str = "en") -> List[str]:
    """Fills static templates safely using exact numbers from the Verdict."""
    lang = language.lower()
    if lang not in TEMPLATES:
        lang = "en"

    vl = verdict.verdict_level
    if vl not in TEMPLATES[lang]:
        vl = "COMFORTABLE"

    raw_templates = TEMPLATES[lang][vl]

    foir_pct = round(verdict.impact.foir_after * 100, 1)
    free_cash = verdict.impact.free_cash_after
    free_cash_abs = abs(free_cash)
    runway = verdict.impact.runway_months_after
    ear = verdict.true_cost.effective_annual_rate
    markup = verdict.true_cost.hidden_markup

    bullets: List[str] = []
    for tmpl in raw_templates:
        bullet = tmpl.format(
            foir_pct=foir_pct,
            free_cash=free_cash,
            free_cash_abs=free_cash_abs,
            runway=runway,
            ear=ear,
            markup=markup,
        )
        bullets.append(bullet)

    return bullets
