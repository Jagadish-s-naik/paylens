"""
Paylens Translation Module
Pre-bundles high-quality Hindi and Kannada translations for 100% offline & fast serving.
Also supports live Cloud Translation API fetching if new keys are added.
Ensures ₹0 ongoing cost with dual-layer caching.
"""

import os
import json
from typing import Dict
from google.cloud import translate_v2 as translate
from config import settings

# Master English UI dictionary
UI_STRINGS_EN: Dict[str, str] = {
    "app_title": "Paylens — First Paycheck Copilot",
    "app_tagline": "Understand your salary, then find out what you can actually afford.",
    "nav_step1": "1. Upload & Input",
    "nav_step2": "2. Salary & Tax Review",
    "nav_step3": "3. Afford & EMI Reality",
    "upload_heading": "Upload Your Salary Payslip",
    "upload_subheading": "PDF, PNG, or JPG (up to 5MB). Camera photos supported.",
    "drag_drop_text": "Drop your payslip here or click to browse",
    "sample_button": "⚡ Try Sample Payslip (Acme Tech)",
    "monthly_rent_label": "Monthly Rent Paid (₹)",
    "metro_city_label": "Living in a Metro City? (Mumbai, Delhi, Kolkata, Chennai)",
    "existing_emi_label": "Existing Monthly EMIs (₹)",
    "select_language": "Language / भाषा / ಭಾಷೆ",
    "btn_extract": "Analyze Payslip with Paylens AI",
    "analyzing_spinner": "Extracting numbers with Gemini on Vertex AI...",
    "review_heading": "Salary Review & Verified Components",
    "verify_note": "⚠️ Please verify the extracted values against your physical payslip before calculating taxes.",
    "gross_monthly": "Gross Monthly Salary",
    "basic_salary": "Basic Salary",
    "hra": "House Rent Allowance (HRA)",
    "special_allowance": "Special Allowance",
    "other_earnings": "Other Allowances",
    "pf_employee": "Provident Fund (EPF)",
    "professional_tax": "Professional Tax (PT)",
    "tds_deduction": "Income Tax Deducted (TDS)",
    "other_deductions": "Other Deductions",
    "btn_recalculate": "Recompute Tax & Take-Home",
    "badge_recommended": "RECOMMENDED REGIME",
    "save_badge": "Save ₹{savings}/year with {regime} Regime",
    "new_regime_title": "New Tax Regime (FY 2025-26)",
    "old_regime_title": "Old Tax Regime (FY 2025-26)",
    "annual_tax": "Annual Tax Payable",
    "monthly_takehome": "Monthly In-Hand Take-Home",
    "taxable_income": "Taxable Income",
    "waterfall_chart_title": "Monthly Salary Flow (Gross to In-Hand)",
    "ai_explanation_title": "Paylens AI 5-Bullet Financial Briefing",
    "assumptions_title": "Tax & Affordability Assumptions",
    "disclaimer_text": "Educational estimate only, not certified tax or financial advice.",
    "safe_emi_title": "Your Safe Monthly EMI Allowance",
    "ratio_slider_label": "Max Safe EMI Ratio (35% Standard)",
    "supported_loan_title": "Supported Borrowing Capacity",
    "loan_tenure": "Tenure (Months)",
    "loan_interest": "Annual Interest Rate (%)",
    "nocost_heading": "Truth Behind 'No-Cost EMI' Offers",
    "nocost_subheading": "Find out the hidden annualized interest rate hiding behind processing fees and lost cash discounts.",
    "item_price": "Listed Item Price (₹)",
    "monthly_emi_amount": "Monthly EMI Amount (₹)",
    "tenure_months": "Number of Months",
    "processing_fee": "Processing Fee (+18% GST) (₹)",
    "cash_discount": "Cash Discount if paid upfront today (₹)",
    "btn_check_truth": "Reveal Hidden Interest Rate",
    "real_interest_label": "Effective Annual Interest Rate (EAR)",
    "benchmark_comparison": "Typical Personal Loan: 11% - 16%",
    "hike_simulator_title": "Hike Simulator: What if you get a raise?",
    "raise_slider_label": "Projected Raise Percentage",
    "new_gross_label": "New Monthly Gross",
    "new_takehome_label": "New Monthly In-Hand",
    "new_safe_emi_label": "New Safe EMI"
}

UI_STRINGS_HI: Dict[str, str] = {
    "app_title": "पेयलेंस — फर्स्ट पेचेक कोपायलट",
    "app_tagline": "अपनी सैलरी को समझें, फिर पता लगाएं कि आप वास्तव में क्या खर्च कर सकते हैं।",
    "nav_step1": "1. अपलोड और इनपुट",
    "nav_step2": "2. वेतन एवं कर समीक्षा",
    "nav_step3": "3. वहन क्षमता और ईएमआई की वास्तविकता",
    "upload_heading": "अपनी वेतन पर्ची अपलोड करें",
    "upload_subheading": "पीडीएफ, पीएनजी या जेपीजी (5 एमबी तक)। कैमरे से खींची गई तस्वीरें समर्थित हैं।",
    "drag_drop_text": "अपनी वेतन पर्ची यहाँ डालें या देखने के लिए क्लिक करें",
    "sample_button": "⚡ नमूना वेतन पर्ची देखें (एक्मे टेक)",
    "monthly_rent_label": "मासिक किराया भुगतान (₹)",
    "metro_city_label": "क्या आप किसी महानगर में रहते हैं? (मुंबई, दिल्ली, कोलकाता, चेन्नई)",
    "existing_emi_label": "मौजूदा मासिक ईएमआई (₹)",
    "select_language": "भाषा / भाषा / ಭಾಷೆ",
    "btn_extract": "Paylens AI की मदद से वेतन पर्ची का विश्लेषण करें",
    "analyzing_spinner": "Vertex AI पर Gemini का उपयोग करके संख्याओं को निकालना...",
    "review_heading": "वेतन समीक्षा और सत्यापित घटक",
    "verify_note": "⚠️ कर की गणना करने से पहले, कृपया निकाले गए मूल्यों का अपने मूल वेतन पर्ची से मिलान कर लें।",
    "gross_monthly": "सकल मासिक वेतन",
    "basic_salary": "मूल वेतन",
    "hra": "मकान किराया भत्ता (एचआरए)",
    "special_allowance": "विशेष भत्ता",
    "other_earnings": "अन्य भत्ते",
    "pf_employee": "भविष्य निधि (ईपीएफ)",
    "professional_tax": "व्यावसायिक कर (पीटी)",
    "tds_deduction": "आयकर कटौती (टीडीएस)",
    "other_deductions": "अन्य कटौतियाँ",
    "btn_recalculate": "कर की पुनर्गणना करें और प्राप्त होने वाली राशि का अनुमान लगाएं",
    "badge_recommended": "अनुशंसित शासन",
    "save_badge": "{regime} व्यवस्था के साथ प्रति वर्ष ₹{savings} की बचत करें",
    "new_regime_title": "नई कर व्यवस्था (वित्तीय वर्ष 2025-26)",
    "old_regime_title": "पुरानी कर व्यवस्था (वित्तीय वर्ष 2025-26)",
    "annual_tax": "वार्षिक कर देय",
    "monthly_takehome": "मासिक इन-हैंड (घर ले जाने योग्य) वेतन",
    "taxable_income": "करदायी आय",
    "waterfall_chart_title": "मासिक वेतन प्रवाह (सकल से हाथ में आने वाली राशि तक)",
    "ai_explanation_title": "पेयलेंस एआई की 5-बुलेट वाली वित्तीय ब्रीफिंग",
    "assumptions_title": "कर और वहनीयता संबंधी धारणाएँ",
    "disclaimer_text": "यह केवल शैक्षिक अनुमान है, प्रमाणित कर या वित्तीय सलाह नहीं है।",
    "safe_emi_title": "आपकी सुरक्षित मासिक ईएमआई भत्ता",
    "ratio_slider_label": "अधिकतम सुरक्षित ईएमआई अनुपात (35% मानक)",
    "supported_loan_title": "समर्थित उधार लेने की क्षमता",
    "loan_tenure": "कार्यकाल (महीनों में)",
    "loan_interest": "वार्षिक ब्याज दर (%)",
    "nocost_heading": "'नो-कॉस्ट ईएमआई' ऑफर के पीछे की सच्चाई",
    "nocost_subheading": "प्रोसेसिंग फीस और खोई हुई नकद छूट के पीछे छिपी वार्षिक ब्याज दर का पता लगाएं।",
    "item_price": "सूचीबद्ध वस्तु का मूल्य (₹)",
    "monthly_emi_amount": "मासिक ईएमआई राशि (₹)",
    "tenure_months": "महीनों की संख्या",
    "processing_fee": "प्रोसेसिंग शुल्क (+18% जीएसटी) (₹)",
    "cash_discount": "आज ही अग्रिम भुगतान करने पर नकद छूट (₹)",
    "btn_check_truth": "छिपी हुई ब्याज दर का खुलासा करें",
    "real_interest_label": "प्रभावी वार्षिक ब्याज दर (ईएआर)",
    "benchmark_comparison": "सामान्य व्यक्तिगत ऋण: 11% - 16%",
    "hike_simulator_title": "हाइक सिमुलेटर: अगर आपकी सैलरी बढ़ जाए तो क्या होगा?",
    "raise_slider_label": "अनुमानित वेतन वृद्धि प्रतिशत",
    "new_gross_label": "नया मासिक सकल",
    "new_takehome_label": "नया मासिक इन-हैंड",
    "new_safe_emi_label": "नई सुरक्षित ईएमआई"
}

UI_STRINGS_KN: Dict[str, str] = {
    "app_title": "ಪೇಲೆನ್ಸ್ — ಮೊದಲ ಪೇಚೆಕ್ ಕೋ-ಪೈಲಟ್",
    "app_tagline": "ನಿಮ್ಮ ಸಂಬಳವನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಿ, ನಂತರ ನೀವು ನಿಜವಾಗಿಯೂ ಏನು ನಿಭಾಯಿಸಬಲ್ಲಿರಿ ಎಂಬುದನ್ನು ಕಂಡುಕೊಳ್ಳಿ.",
    "nav_step1": "1. ಅಪ್‌ಲೋಡ್ ಮತ್ತು ಇನ್‌ಪುಟ್",
    "nav_step2": "2. ಸಂಬಳ ಮತ್ತು ತೆರಿಗೆ ವಿಮರ್ಶೆ",
    "nav_step3": "3. ಅಫರ್ಡ್ & ಇಎಂಐ ರಿಯಾಲಿಟಿ",
    "upload_heading": "ನಿಮ್ಮ ಸಂಬಳದ ಪೇಸ್ಲಿಪ್ ಅನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    "upload_subheading": "PDF, PNG, ಅಥವಾ JPG (5MB ವರೆಗೆ). ಕ್ಯಾಮೆರಾ ಫೋಟೋಗಳಿಗೆ ಬೆಂಬಲವಿದೆ.",
    "drag_drop_text": "ನಿಮ್ಮ ಪೇಸ್ಲಿಪ್ ಅನ್ನು ಇಲ್ಲಿ ಬಿಡಿ ಅಥವಾ ಬ್ರೌಸ್ ಮಾಡಲು ಕ್ಲಿಕ್ ಮಾಡಿ",
    "sample_button": "⚡ ಮಾದರಿ ಪೇಸ್ಲಿಪ್ (ಆಕ್ಮೆ ಟೆಕ್) ಪ್ರಯತ್ನಿಸಿ",
    "monthly_rent_label": "ಮಾಸಿಕ ಬಾಡಿಗೆ ಪಾವತಿಸಲಾಗಿದೆ (₹)",
    "metro_city_label": "ಮೆಟ್ರೋ ನಗರದಲ್ಲಿ ವಾಸಿಸುತ್ತಿದ್ದೀರಾ? (ಮುಂಬೈ, ದೆಹಲಿ, ಕೋಲ್ಕತ್ತಾ, ಚೆನ್ನೈ)",
    "existing_emi_label": "ಅಸ್ತಿತ್ವದಲ್ಲಿರುವ ಮಾಸಿಕ EMI ಗಳು (₹)",
    "select_language": "Language / ಭಾಷೆ / भाषा",
    "btn_extract": "ಪೇಲೆನ್ಸ್ AI ನೊಂದಿಗೆ ಪೇಸ್ಲಿಪ್ ಅನ್ನು ವಿಶ್ಲೇಷಿಸಿ",
    "analyzing_spinner": "ವರ್ಟೆಕ್ಸ್ AI ನಲ್ಲಿ ಜೆಮಿನಿಯೊಂದಿಗೆ ಸಂಖ್ಯೆಗಳನ್ನು ಹೊರತೆಗೆಯಲಾಗುತ್ತಿದೆ...",
    "review_heading": "ಸಂಬಳ ವಿಮರ್ಶೆ ಮತ್ತು ಪರಿಶೀಲಿಸಿದ ಘಟಕಗಳು",
    "verify_note": "⚠️ ತೆರಿಗೆಗಳನ್ನು ಲೆಕ್ಕಾಚಾರ ಮಾಡುವ ಮೊದಲು ಹೊರತೆಗೆಯಲಾದ ಮೌಲ್ಯಗಳನ್ನು ನಿಮ್ಮ ಭೌತಿಕ ಪೇಸ್ಲಿಪ್ ವಿರುದ್ಧ ಪರಿಶೀಲಿಸಿ.",
    "gross_monthly": "ಒಟ್ಟು ಮಾಸಿಕ ವೇತನ",
    "basic_salary": "ಮೂಲ ವೇತನ",
    "hra": "ಮನೆ ಬಾಡಿಗೆ ಭತ್ಯೆ (HRA)",
    "special_allowance": "ವಿಶೇಷ ಭತ್ಯೆ",
    "other_earnings": "ಇತರ ಭತ್ಯೆಗಳು",
    "pf_employee": "ಭವಿಷ್ಯ ನಿಧಿ (ಇಪಿಎಫ್)",
    "professional_tax": "ವೃತ್ತಿಪರ ತೆರಿಗೆ (ಪಿಟಿ)",
    "tds_deduction": "ಕಡಿತಗೊಳಿಸಿದ ಆದಾಯ ತೆರಿಗೆ (ಟಿಡಿಎಸ್)",
    "other_deductions": "ಇತರ ಕಡಿತಗಳು",
    "btn_recalculate": "ತೆರಿಗೆಯನ್ನು ಮರು ಲೆಕ್ಕಾಚಾರ ಮಾಡಿ ಮತ್ತು ಮನೆಗೆ ತೆಗೆದುಕೊಂಡು ಹೋಗಿ",
    "badge_recommended": "ಶಿಫಾರಸು ಮಾಡಲಾದ ಆಡಳಿತ",
    "save_badge": "{regime} Regime ಬಳಸಿ ವರ್ಷಕ್ಕೆ ₹{savings} ಉಳಿಸಿ",
    "new_regime_title": "ಹೊಸ ತೆರಿಗೆ ಪದ್ಧತಿ (FY 2025-26)",
    "old_regime_title": "ಹಳೆಯ ತೆರಿಗೆ ಪದ್ಧತಿ (FY 2025-26)",
    "annual_tax": "ವಾರ್ಷಿಕ ತೆರಿಗೆ ಪಾವತಿಸಬೇಕಾದ",
    "monthly_takehome": "ಮಾಸಿಕ ಇನ್-ಹ್ಯಾಂಡ್ ಟೇಕ್-ಹೋಮ್ ಸಂಬಳ",
    "taxable_income": "ತೆರಿಗೆ ವಿಧಿಸಬಹುದಾದ ಆದಾಯ",
    "waterfall_chart_title": "ಮಾಸಿಕ ಸಂಬಳದ ಹರಿವು (ಒಟ್ಟು ವೇತನದಿಂದ ನಿವ್ವಳ ವೇತನದವರೆಗೆ)",
    "ai_explanation_title": "ಪೇಲೆನ್ಸ್ AI 5-ಬುಲೆಟ್ ಹಣಕಾಸು ಬ್ರೀಫಿಂಗ್",
    "assumptions_title": "ತೆರಿಗೆ ಮತ್ತು ಕೈಗೆಟುಕುವಿಕೆಯ ಊಹೆಗಳು",
    "disclaimer_text": "ಶೈಕ್ಷಣಿಕ ಅಂದಾಜು ಮಾತ್ರ, ಪ್ರಮಾಣೀಕೃತ ತೆರಿಗೆ ಅಥವಾ ಹಣಕಾಸು ಸಲಹೆಯಲ್ಲ.",
    "safe_emi_title": "ನಿಮ್ಮ ಸುರಕ್ಷಿತ ಮಾಸಿಕ EMI ಭತ್ಯೆ",
    "ratio_slider_label": "ಗರಿಷ್ಠ ಸುರಕ್ಷಿತ EMI ಅನುಪಾತ (35% ಪ್ರಮಾಣಿತ)",
    "supported_loan_title": "ಬೆಂಬಲಿತ ಸಾಲ ಪಡೆಯುವ ಸಾಮರ್ಥ್ಯ",
    "loan_tenure": "ಅಧಿಕಾರಾವಧಿ (ತಿಂಗಳುಗಳು)",
    "loan_interest": "ವಾರ್ಷಿಕ ಬಡ್ಡಿ ದರ (%)",
    "nocost_heading": "'ನೋ-ಕಾಸ್ಟ್ ಇಎಂಐ' ಆಫರ್‌ಗಳ ಹಿಂದಿನ ಸತ್ಯ",
    "nocost_subheading": "ಸಂಸ್ಕರಣಾ ಶುಲ್ಕಗಳು ಮತ್ತು ಕಳೆದುಹೋದ ನಗದು ರಿಯಾಯಿತಿಗಳ ಹಿಂದೆ ಅಡಗಿರುವ ವಾರ್ಷಿಕ ಬಡ್ಡಿದರವನ್ನು ಕಂಡುಹಿಡಿಯಿರಿ.",
    "item_price": "ಪಟ್ಟಿ ಮಾಡಲಾದ ಐಟಂ ಬೆಲೆ (₹)",
    "monthly_emi_amount": "ಮಾಸಿಕ EMI ಮೊತ್ತ (₹)",
    "tenure_months": "ತಿಂಗಳುಗಳ ಸಂಖ್ಯೆ",
    "processing_fee": "ಸಂಸ್ಕರಣಾ ಶುಲ್ಕ (+18% GST) (₹)",
    "cash_discount": "ಇಂದು ಮುಂಗಡವಾಗಿ ಪಾವತಿಸಿದರೆ ನಗದು ರಿಯಾಯಿತಿ (₹)",
    "btn_check_truth": "ಗುಪ್ತ ಬಡ್ಡಿ ದರವನ್ನು ಬಹಿರಂಗಪಡಿಸಿ",
    "real_interest_label": "ಪರಿಣಾಮಕಾರಿ ವಾರ್ಷಿಕ ಬಡ್ಡಿ ದರ (EAR)",
    "benchmark_comparison": "ವಿಶಿಷ್ಟ ವೈಯಕ್ತಿಕ ಸಾಲ: 11% - 16%",
    "hike_simulator_title": "ಹೈಕ್ ಸಿಮ್ಯುಲೇಟರ್: ನಿಮಗೆ ಸಂಬಳ ಏರಿಕೆಯಾದರೆ ಏನು?",
    "raise_slider_label": "ಅಂದಾಜು ಏರಿಕೆಯ ಶೇಕಡಾವಾರು",
    "new_gross_label": "ಹೊಸ ಮಾಸಿಕ ಒಟ್ಟು",
    "new_takehome_label": "ಹೊಸ ಮಾಸಿಕ ಇನ್-ಹ್ಯಾಂಡ್",
    "new_safe_emi_label": "ಹೊಸ ಸುರಕ್ಷಿತ EMI"
}

# In-memory dictionary cache with pre-bundled English, Hindi, and Kannada
_memory_cache: Dict[str, Dict[str, str]] = {
    "en": UI_STRINGS_EN,
    "hi": UI_STRINGS_HI,
    "kn": UI_STRINGS_KN
}

def get_ui_labels(language: str = "en") -> Dict[str, str]:
    """Returns translated UI labels for the requested language."""
    if language in _memory_cache:
        return _memory_cache[language]

    print(f"Translating UI strings to '{language}' via Cloud Translation API...")
    translated_dict = dict(UI_STRINGS_EN)
    try:
        client = translate.Client()
        keys = list(UI_STRINGS_EN.keys())
        values = [UI_STRINGS_EN[k] for k in keys]
        batch_results = client.translate(values, target_language=language)
        for k, res in zip(keys, batch_results):
            translated_dict[k] = res["translatedText"]
        _memory_cache[language] = translated_dict
    except Exception as e:
        print(f"Cloud Translation API fallback: {e}")
        return UI_STRINGS_EN
        
    return translated_dict
