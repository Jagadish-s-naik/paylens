import pytest
from offer import OfferInput, decode_offer, compare_two_offers

def test_decode_offer_traps():
    """Tests trap detection for service bond, variable pay, and joining clawback."""
    offer = OfferInput(
        company_name="MegaTech Global",
        role_title="Graduate Trainee",
        annual_ctc=12_00_000,
        fixed_base=7_50_000,
        variable_pay_annual=2_50_000,
        joining_bonus=1_00_000,
        joining_bonus_clawback_months=12,
        stocks_esops_annual=1_00_000,
        service_bond_months=24,
        bond_penalty_amount=2_00_000,
        notice_period_days=90
    )
    res = decode_offer(offer)
    assert res.guaranteed_monthly_in_hand > 0
    assert res.first_month_in_hand > res.regular_month_in_hand
    assert len(res.month_by_month_projections) == 12

    # Verify trap titles
    trap_titles = [t["title"] for t in res.traps_detected]
    assert any("Service Bond" in t for t in trap_titles)
    assert any("Variable Pay" in t for t in trap_titles)
    assert any("Clawback" in t for t in trap_titles)
    assert any("Employer PF" in t for t in trap_titles)
    assert any("Gratuity" in t for t in trap_titles)

def test_compare_two_offers():
    """Tests side-by-side comparison between high-CTC paper offer vs clean cash offer."""
    # Offer A: 14 LPA (High paper CTC: 4L stocks, 2L variable, 8L fixed)
    offer_a = OfferInput(
        offer_id="A",
        company_name="PaperUnicorn",
        annual_ctc=14_00_000,
        fixed_base=8_00_000,
        variable_pay_annual=2_00_000,
        stocks_esops_annual=4_00_000
    )
    # Offer B: 11 LPA (Clean cash offer: 10L fixed, 1L variable, 0 stocks)
    offer_b = OfferInput(
        offer_id="B",
        company_name="CashFlow Inc",
        annual_ctc=11_00_000,
        fixed_base=10_00_000,
        variable_pay_annual=1_00_000,
        stocks_esops_annual=0
    )
    comp = compare_two_offers(offer_a, offer_b)
    # Offer B has higher guaranteed monthly in-hand despite lower headline CTC!
    assert comp["better_guaranteed_offer"] == "B"
    assert comp["monthly_in_hand_difference"] < 0
    assert "CashFlow Inc" in comp["comparer_verdict"]
