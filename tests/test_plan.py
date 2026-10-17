import pytest
from plan import LifePlanRequest, GoalItem, generate_life_plan

def test_generate_life_plan_metro():
    req = LifePlanRequest(
        monthly_in_hand=72000.0,
        is_metro=True,
        city_name="Bengaluru",
        goal=GoalItem(name="M3 MacBook Pro", target_amount=120000.0, timeline_months=8),
        language="en"
    )
    res = generate_life_plan(req)
    assert res.monthly_in_hand == 72000.0
    assert res.budget_split.needs_percentage == 55
    assert res.budget_split.wants_percentage == 20
    assert res.budget_split.savings_percentage == 25
    assert res.budget_split.needs_amount == 39600.0
    assert res.budget_split.savings_amount == 18000.0
    assert res.emergency_fund["target_amount"] == 39600.0 * 3.0
    assert res.goal_tracker is not None
    assert res.goal_tracker["goal_name"] == "M3 MacBook Pro"
    assert "M3 MacBook Pro" in res.parent_explanation

def test_generate_life_plan_hindi():
    req = LifePlanRequest(
        monthly_in_hand=60000.0,
        is_metro=False,
        city_name="Pune",
        language="hi"
    )
    res = generate_life_plan(req)
    assert "मम्मी और पापा" in res.parent_explanation

def test_generate_life_plan_kannada():
    req = LifePlanRequest(
        monthly_in_hand=60000.0,
        is_metro=True,
        city_name="Bengaluru",
        language="kn"
    )
    res = generate_life_plan(req)
    assert "ಅಪ್ಪ ಮತ್ತು ಅಮ್ಮ" in res.parent_explanation

