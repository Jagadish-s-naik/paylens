"""
app/core/thresholds.py
Tunable threshold constants for the Paylens Affordability Engine.
Pure Python dataclass with frozen defaults. Zero external dependencies.
"""

from dataclasses import dataclass

@dataclass(frozen=True)
class Thresholds:
    # FOIR bounds (Fixed Obligation to Income Ratio)
    # <= SAFE_FOIR_MAX is COMFORTABLE; <= STRETCH_FOIR_MAX is STRETCH; > STRETCH_FOIR_MAX is RISKY
    SAFE_FOIR_MAX: float = 0.35
    STRETCH_FOIR_MAX: float = 0.50

    # Free Cash Ratio bounds (free_cash / in_hand)
    # >= SAFE_FREE_CASH_RATIO is COMFORTABLE; >= STRETCH_FREE_CASH_RATIO is STRETCH; < STRETCH_FREE_CASH_RATIO is RISKY
    SAFE_FREE_CASH_RATIO: float = 0.20
    STRETCH_FREE_CASH_RATIO: float = 0.05

    # Emergency Cushion / Runway (in months of essentials)
    # >= EMERGENCY_CUSHION_MONTHS is COMFORTABLE; >= MIN_RUNWAY_STRETCH is STRETCH; < MIN_RUNWAY_STRETCH is RISKY
    EMERGENCY_CUSHION_MONTHS: float = 3.0
    MIN_RUNWAY_STRETCH: float = 2.0

    # High APR / Cost Alert Thresholds (Separate from verdict tier per D2)
    HIGH_APR_THRESHOLD: float = 18.0
    SIGNIFICANT_MARKUP_RUPEES: float = 1500.0
    SIGNIFICANT_MARKUP_PCT: float = 0.05

    # Stress Test parameters
    INCOME_SHOCK_PCT: float = 0.20

DEFAULT = Thresholds()
