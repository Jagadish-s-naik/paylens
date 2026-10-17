"""
Paylens Life Plan Mode
Turns monthly paycheck into a practical first-year roadmap:
- 50-30-20 split calibrated for Metro vs Tier-2 cities
- Emergency fund runway builder
- Custom goal milestones (e.g., 'Laptop in 6 months')
- 'Explain this to my parents' heartwarming message generator
"""

from typing import Dict, Any, Optional
from pydantic import BaseModel

class GoalItem(BaseModel):
    name: str = "Work Laptop"
    target_amount: float = 75_000.0
    timeline_months: int = 6

class LifePlanRequest(BaseModel):
    monthly_in_hand: float = 72_000.0
    is_metro: bool = True
    city_name: str = "Bengaluru"
    goal: Optional[GoalItem] = None
    language: str = "en"

class BudgetSplit(BaseModel):
    needs_amount: float
    needs_percentage: int
    wants_amount: float
    wants_percentage: int
    savings_amount: float
    savings_percentage: int

class LifePlanResponse(BaseModel):
    monthly_in_hand: float
    city_tier: str
    budget_split: BudgetSplit
    emergency_fund: Dict[str, Any]
    goal_tracker: Optional[Dict[str, Any]]
    parent_explanation: str

def generate_life_plan(req: LifePlanRequest) -> LifePlanResponse:
    """
    Computes deterministic budget allocation and milestone roadmap.
    """
    salary = max(0.0, req.monthly_in_hand)
    
    # 50-30-20 tuned for city living cost
    if req.is_metro:
        # Metro: Higher living & rent cost
        needs_pct = 55
        wants_pct = 20
        savings_pct = 25
        tier_label = f"Metro City ({req.city_name}) — 55/20/25 Calibrated Split"
    else:
        needs_pct = 45
        wants_pct = 25
        savings_pct = 30
        tier_label = f"Tier-2 City ({req.city_name}) — 45/25/30 Calibrated Split"
        
    needs_val = round(salary * (needs_pct / 100.0), 2)
    wants_val = round(salary * (wants_pct / 100.0), 2)
    savings_val = round(salary * (savings_pct / 100.0), 2)
    
    # Emergency Fund: 3 months of essential needs
    target_emergency = round(needs_val * 3.0, 2)
    emergency_allocation_monthly = round(savings_val * 0.60, 2) # 60% of savings goes to emergency cushion first
    months_to_complete_emergency = (
        round(target_emergency / emergency_allocation_monthly, 1)
        if emergency_allocation_monthly > 0 else 0
    )
    
    emergency_fund_info = {
        "target_amount": target_emergency,
        "monthly_allocation": emergency_allocation_monthly,
        "months_to_complete": months_to_complete_emergency,
        "milestone_text": f"You will achieve a complete 3-month safety cushion of ₹{target_emergency:,.0f} by Month {int(months_to_complete_emergency) + 1}."
    }
    
    # Goal Tracker
    goal_info = None
    if req.goal and req.goal.target_amount > 0 and req.goal.timeline_months > 0:
        monthly_required = round(req.goal.target_amount / req.goal.timeline_months, 2)
        surplus_savings = max(0.0, savings_val - emergency_allocation_monthly)
        feasible = monthly_required <= savings_val
        
        goal_info = {
            "goal_name": req.goal.name,
            "target_amount": req.goal.target_amount,
            "timeline_months": req.goal.timeline_months,
            "monthly_savings_needed": monthly_required,
            "is_feasible": feasible,
            "status_text": (
                f"Feasible! Save ₹{monthly_required:,.0f}/month to buy your {req.goal.name} in {req.goal.timeline_months} months."
                if feasible else
                f"Stretch: ₹{monthly_required:,.0f}/month exceeds your monthly savings pool (₹{savings_val:,.0f}). Consider extending timeline to {int(req.goal.target_amount / (savings_val * 0.5))} months."
            )
        }

    # "Explain to my parents" Heartwarming Message
    parent_text = format_parent_letter(
        salary=salary,
        needs=needs_val,
        savings=savings_val,
        emergency=target_emergency,
        goal=req.goal,
        language=req.language
    )

    return LifePlanResponse(
        monthly_in_hand=salary,
        city_tier=tier_label,
        budget_split=BudgetSplit(
            needs_amount=needs_val,
            needs_percentage=needs_pct,
            wants_amount=wants_val,
            wants_percentage=wants_pct,
            savings_amount=savings_val,
            savings_percentage=savings_pct
        ),
        emergency_fund=emergency_fund_info,
        goal_tracker=goal_info,
        parent_explanation=parent_text
    )

def format_parent_letter(
    salary: float,
    needs: float,
    savings: float,
    emergency: float,
    goal: Optional[GoalItem],
    language: str = "en"
) -> str:
    """
    Generates a respectful, proud WhatsApp-ready update for parents.
    """
    if language == "hi":
        msg = f"""नमस्ते मम्मी और पापा,

मेरी पहली नौकरी का सैलरी प्लान तैयार हो गया है, जिसे मैं आपके साथ साझा करना चाहता/चाहती हूँ:

• इन-हैंड सैलरी: हर महीने मेरे खाते में पूरे ₹{salary:,.0f} आएंगे।
• रहने और घर का खर्च: ₹{needs:,.0f} हर महीने कमरे के किराए, खाने और जरूरी चीजों के लिए तय किया है।
• बचत और इमरजेंसी फंड: मैं हर महीने ₹{savings:,.0f} सीधे बचाऊंगा/बचाऊंगी, ताकि ₹{emergency:,.0f} का 3 महीने का सुरक्षा फंड तैयार हो सके।"""
        if goal:
            msg += f"\n• मेरा अगला लक्ष्य: अपनी मेहनत की कमाई से ₹{goal.target_amount:,.0f} का {goal.name} लेना है, जिसके लिए हर महीने अलग से पैसे जोड़ रहा/रही हूँ।"
        msg += "\n\nआप दोनों के आशीर्वाद से सब अच्छा चल रहा है। आपकी मेहनत रंग लाई है! ❤️"
        return msg.strip()

    elif language == "kn":
        msg = f"""ನಮಸ್ಕಾರ ಅಪ್ಪ ಮತ್ತು ಅಮ್ಮ,

ನನ್ನ ಮೊದಲ ಉದ್ಯೋಗದ ಸಂಬಳದ ಯೋಜನೆಯನ್ನು ನಿಮ್ಮೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲು ನನಗೆ ತುಂಬಾ ಹೆಮ್ಮೆಯಾಗುತ್ತಿದೆ:

• ಮಾಸಿಕ ನಿವ್ವಳ ಸಂಬಳ: ತೆರಿಗೆ ಮತ್ತು ಕಡಿತಗಳ ನಂತರ ನನ್ನ ಕೈಗೆ ತಿಂಗಳಿಗೆ ₹{salary:,.0f} ಬರುತ್ತದೆ.
• ಅಗತ್ಯ ಖರ್ಚುಗಳು: ಬಾಡಿಗೆ, ಊಟ ಮತ್ತು ದೈನಂದಿನ ಖರ್ಚುಗಳಿಗಾಗಿ ₹{needs:,.0f} ನಿಗದಿಪಡಿಸಿದ್ದೇನೆ.
• ಉಳಿತಾಯ ಮತ್ತು ಭದ್ರತೆ: ಪ್ರತಿ ತಿಂಗಳು ₹{savings:,.0f} ಹಣವನ್ನು ಉಳಿಸಿ, ₹{emergency:,.0f} ಮೊತ್ತದ 3 ತಿಂಗಳ ತುರ್ತು ನಿಧಿಯನ್ನು ನಿರ್ಮಿಸುತ್ತಿದ್ದೇನೆ."""
        if goal:
            msg += f"\n• ನನ್ನ ಮುಂದಿನ ಗುರಿ: ನನ್ನ ಸ್ವಂತ ದುಡಿಮೆಯಿಂದ ₹{goal.target_amount:,.0f} ಮೌಲ್ಯದ {goal.name} ಖರೀದಿಸುವುದು."
        msg += "\n\nನಿಮ್ಮ ಆಶೀರ್ವಾದವೇ ನನ್ನ ಈ ಸಾಧನೆಗೆ ಕಾರಣ. ನಿಮ್ಮ ಪ್ರೀತಿಗೆ ಧನ್ಯವಾದಗಳು! ❤️"
        return msg.strip()

    else:
        msg = f"""Dear Mom & Dad,

I wanted to share my first paycheck plan with you so you know I'm managing my finances responsibly:

• Monthly In-Hand Salary: Exactly ₹{salary:,.0f} reaches my bank account after all taxes and PF.
• Essentials & Living: ₹{needs:,.0f}/month is allocated for rent, groceries, and bills.
• Savings & Safety Net: I am saving ₹{savings:,.0f} every single month to build a ₹{emergency:,.0f} emergency cushion."""
        if goal:
            msg += f"\n• First Major Goal: Saving responsibly for my {goal.name} (₹{goal.target_amount:,.0f}) over {goal.timeline_months} months without taking bad loans."
        msg += "\n\nThank you for everything you sacrificed to get me here. Your guidance made this possible! ❤️"
        return msg.strip()
