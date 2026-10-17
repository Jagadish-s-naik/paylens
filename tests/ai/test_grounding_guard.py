"""
tests/ai/test_grounding_guard.py
Unit tests for Numeric Grounding Guard and Static Templates.
Verifies Principle P1 (Mechanical enforcement of pure core numbers).
"""

import pytest
from app.core.schemas import (
    Verdict,
    TrueCost,
    FinancialImpact,
    PaymentOption,
    PaymentType,
)
from app.ai.explain import (
    collect_allowed_numbers,
    extract_numbers_from_text,
    verify_numeric_grounding,
    generate_explanation,
)
from app.ai.templates import get_template_explanation
from app.config import settings


@pytest.fixture
def mock_verdict() -> Verdict:
    return Verdict(
        verdict_level="COMFORTABLE",
        badge="🟢 Safe to Buy",
        headline_reason="Budget-safe (11.3% FOIR), but financing costs 30.74% EAR markup (₹2,235 lost).",
        selected_option=PaymentOption(
            option_id="nocost_6m",
            type=PaymentType.NO_COST_EMI,
            label="No-Cost EMI (6 Months)",
            tenure_months=6,
            monthly_installment=4998.33,
            upfront_downpayment=0.0,
            processing_fee=199.0,
            lost_cash_discount=2000.0,
            stated_interest_rate=0.0,
        ),
        true_cost=TrueCost(
            effective_annual_rate=30.74,
            nominal_annual_rate=27.24,
            total_outflow=30225.0,
            hidden_markup=2235.0,
            is_truly_zero_cost=False,
            has_high_apr_alert=True,
        ),
        impact=FinancialImpact(
            foir_before=0.0467,
            foir_after=0.1133,
            free_cash_before=31000.0,
            free_cash_after=26001.67,
            free_cash_ratio_after=0.3467,
            runway_months_before=3.7,
            runway_months_after=3.7,
        ),
        stress_tests=[],
        alternatives=[],
        explanation_bullets=None,
    )


def test_extract_numbers_from_text():
    sample = "You pay ₹4,998.33/mo for 6 months at 30.74% EAR with ₹2,235 fee."
    nums = extract_numbers_from_text(sample)
    assert 4998.33 in nums
    assert 6.0 in nums
    assert 30.74 in nums
    assert 2235.0 in nums


def test_grounding_guard_accepts_verifiable_bullets(mock_verdict):
    allowed = collect_allowed_numbers(mock_verdict)
    valid_bullets = [
        "Your monthly payment is ₹4,998.33 for 6 months.",
        "Your debt ratio increases to 11.3% FOIR.",
        "Effective annual rate is 30.74% with ₹2,235 in total extra costs.",
        "Your emergency runway remains at 3.7 months.",
    ]
    assert verify_numeric_grounding(valid_bullets, allowed) is True


def test_grounding_guard_rejects_hallucinated_numbers(mock_verdict):
    allowed = collect_allowed_numbers(mock_verdict)
    # 77.5% and 88,000 are not in mock_verdict
    hallucinated_bullets = [
        "Your monthly payment is ₹4,998.33.",
        "Our AI calculated an interest rate of 77.5% per annum.",
        "You could save ₹88,000 by switching banks.",
    ]
    assert verify_numeric_grounding(hallucinated_bullets, allowed) is False


def test_template_generation_en_hi_kn(mock_verdict):
    en_bullets = get_template_explanation(mock_verdict, "en")
    assert len(en_bullets) >= 4
    assert any("30.74" in b or "2,235" in b for b in en_bullets)

    hi_bullets = get_template_explanation(mock_verdict, "hi")
    assert len(hi_bullets) >= 4
    assert any("30.74" in b for b in hi_bullets)

    kn_bullets = get_template_explanation(mock_verdict, "kn")
    assert len(kn_bullets) >= 4
    assert any("30.74" in b for b in kn_bullets)


def test_generate_explanation_offline(mock_verdict, monkeypatch):
    monkeypatch.setattr(settings, "PAYLENS_OFFLINE", 1)
    bullets, source = generate_explanation(mock_verdict, "en")
    assert source == "template"
    assert len(bullets) >= 4
    assert any("11.3%" in b for b in bullets)
