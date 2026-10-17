"""Reference engine. Pure Python, no I/O. Every number in the manual comes from here."""
import math

CFG = dict(
    SAFE_FOIR=0.35, STRETCH_FOIR=0.50,
    FC_COMFORT=0.20, FC_STRETCH=0.05,
    CUSHION_MONTHS=3.0, RUNWAY_STRETCH=2.0,
    LIVING_RATE_METRO=0.30, LIVING_RATE_TIER2=0.25,
    SAVING_RATE_METRO=0.25, SAVING_RATE_TIER2=0.30,
    GST=0.18, APR_ALERT=0.18, ALERT_MIN_ABS=1500, ALERT_MIN_PCT=0.05,
    STRESS_INCOME_CUT=0.20,
)

# ---------------- Tax (new regime FY25-26 / FY26-27, unchanged) -------------
NEW_SLABS = [(400000, .00), (800000, .05), (1200000, .10), (1600000, .15),
             (2000000, .20), (2400000, .25), (math.inf, .30)]
OLD_SLABS = [(250000, .00), (500000, .05), (1000000, .20), (math.inf, .30)]


def slab_tax(taxable, slabs):
    tax, lo = 0.0, 0.0
    for hi, rate in slabs:
        if taxable > lo:
            tax += (min(taxable, hi) - lo) * rate
        lo = hi
    return tax


def new_regime_tax(gross_annual):
    taxable = max(0, gross_annual - 75000)
    t = slab_tax(taxable, NEW_SLABS)
    if taxable <= 1200000:
        t = 0.0
    else:
        t = min(t, taxable - 1200000)  # marginal relief
    return round(t * 1.04, 2)


def old_regime_tax(gross_annual, hra_exempt=0, pt=2400, c80=0, d80=0):
    taxable = max(0, gross_annual - 50000 - hra_exempt - pt - min(c80, 150000) - min(d80, 25000))
    t = slab_tax(taxable, OLD_SLABS)
    if taxable <= 500000:
        t = 0.0
    return round(t * 1.04, 2)


def march_shock(gross_annual, regime, declared_80c=0, declared_80d=0):
    """Extra tax recovered in the last month if declarations are not proven."""
    if regime == "NEW":
        return 0.0
    with_d = old_regime_tax(gross_annual, c80=declared_80c, d80=declared_80d)
    without = old_regime_tax(gross_annual, c80=0, d80=0)
    return round(without - with_d, 2)


# ---------------- Money maths -------------------------------------------------
def emi_for(principal, r, n):
    return principal / n if r == 0 else principal * r / (1 - (1 + r) ** -n)


def solve_r(net_financed, emi, n, lo=0.0, hi=0.5, iters=100, trace=None):
    """Bisection: find monthly r where PV(emi, r, n) == net_financed."""
    pv = lambda r: sum(emi / (1 + r) ** k for k in range(1, n + 1))
    if pv(0.0) <= net_financed:
        return 0.0
    for i in range(iters):
        mid = (lo + hi) / 2
        v = pv(mid)
        if trace is not None and i < 6:
            trace.append((mid, v))
        if v > net_financed:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def true_cost(cash_price, opt):
    fee = opt["fee"] * (1 + CFG["GST"])
    down = opt.get("down", 0.0)
    n, emi = opt["n"], opt["emi"]
    net = cash_price - down - fee
    trace = []
    r = solve_r(net, emi, n, trace=trace)
    total = down + emi * n + fee
    markup = total - cash_price
    ear = (1 + r) ** 12 - 1
    alert = ear > CFG["APR_ALERT"] and markup >= min(CFG["ALERT_MIN_ABS"], CFG["ALERT_MIN_PCT"] * cash_price)
    return dict(fee_gst=fee, net=net, r=r, ear=ear, nominal=12 * r, total=total,
                markup=markup, alert=alert, trace=trace)


# ---------------- Profile derivation -----------------------------------------
def profile(in_hand, rent, savings, emis, metro=True):
    live = CFG["LIVING_RATE_METRO"] if metro else CFG["LIVING_RATE_TIER2"]
    ess = rent + live * in_hand
    emi_total = sum(e[0] for e in emis)
    return dict(in_hand=in_hand, rent=rent, savings=savings, emis=emis, metro=metro,
                essentials=ess, emi_total=emi_total, runway=savings / ess,
                free_cash=in_hand - emi_total - ess,
                safe_emi=CFG["SAFE_FOIR"] * in_hand - emi_total,
                cushion=CFG["CUSHION_MONTHS"] * ess,
                save_pool=(CFG["SAVING_RATE_METRO"] if metro else CFG["SAVING_RATE_TIER2"]) * in_hand)


# ---------------- Verdict -----------------------------------------------------
RANK = {"COMFORTABLE": 0, "STRETCH": 1, "RISKY": 2}


def tier_foir(x):
    x = round(x, 6)
    return "COMFORTABLE" if x <= CFG["SAFE_FOIR"] else "STRETCH" if x <= CFG["STRETCH_FOIR"] else "RISKY"


def tier_fc(ratio):
    ratio = round(ratio, 6)
    return "COMFORTABLE" if ratio >= CFG["FC_COMFORT"] else "STRETCH" if ratio >= CFG["FC_STRETCH"] else "RISKY"


def tier_runway(m):
    m = round(m, 6)
    return "COMFORTABLE" if m >= CFG["CUSHION_MONTHS"] else "STRETCH" if m >= CFG["RUNWAY_STRETCH"] else "RISKY"


def evaluate(p, new_emi=0.0, upfront=0.0, in_hand=None, savings=None, existing_emi=None):
    """One scoring function for the main verdict AND every alternative."""
    ih = p["in_hand"] if in_hand is None else in_hand
    sv = p["savings"] if savings is None else savings
    ex = p["emi_total"] if existing_emi is None else existing_emi
    foir = (ex + new_emi) / ih
    fc = ih - ex - new_emi - p["essentials"]
    fcr = fc / ih
    run = (sv - upfront) / p["essentials"]
    tiers = dict(foir=tier_foir(foir), fc=tier_fc(fcr), runway=tier_runway(run))
    worst = max(tiers.values(), key=lambda t: RANK[t])
    return dict(foir=foir, fc=fc, fcr=fcr, runway=run, tiers=tiers, verdict=worst)


def foir_before(p):
    return p["emi_total"] / p["in_hand"]


# ---------------- Stress ------------------------------------------------------
def stress_income(p, new_emi):
    ih = p["in_hand"] * (1 - CFG["STRESS_INCOME_CUT"])
    foir = (p["emi_total"] + new_emi) / ih
    fc = ih - p["emi_total"] - new_emi - p["essentials"]
    return dict(foir=foir, fc=fc, passes=(foir <= CFG["STRETCH_FOIR"] and fc >= 0))


# ---------------- Alternatives -----------------------------------------------
def emi_at_month(p, m):
    """Existing EMIs still active in month m (1-indexed)."""
    return sum(a for a, left in p["emis"] if left >= m)


def wait_and_save(p, cash_price, max_months=60):
    """Smallest m such that savings_m - cash_price >= cushion. Monthly saving =
    min(saving pool, free cash that month). Existing EMIs roll off."""
    sv = p["savings"]
    for m in range(0, max_months + 1):
        if sv - cash_price >= p["cushion"]:
            return dict(months=m, savings_end=sv)
        k = m + 1
        fc_k = p["in_hand"] - emi_at_month(p, k) - p["essentials"]
        sv += max(0.0, min(p["save_pool"], fc_k))
    return dict(months=None, savings_end=sv)


def buy_cash_now(p, cash_price):
    if cash_price > p["savings"]:
        return dict(feasible=False)
    e = evaluate(p, new_emi=0.0, upfront=cash_price)
    return dict(feasible=True, **e)


def down_payment_boost(p, cash_price, r, n, fee):
    """HYPOTHETICAL: needs a bank/retailer that allows part-payment."""
    surplus = max(0.0, p["savings"] - p["cushion"])
    d = min(surplus - fee, cash_price)
    if d <= 0:
        return dict(feasible=False, surplus=surplus)
    emi = emi_for(cash_price - d, r, n)
    e = evaluate(p, new_emi=emi, upfront=d + fee)
    return dict(feasible=True, down=d, emi=emi, **e)


def score_wait(p, cash_price):
    w = wait_and_save(p, cash_price)
    if w["months"] is None:
        return dict(feasible=False)
    ex = emi_at_month(p, w["months"] + 1)
    e = evaluate(p, new_emi=0.0, upfront=cash_price, savings=w["savings_end"], existing_emi=ex)
    return dict(feasible=True, months=w["months"], savings_end=w["savings_end"], existing_after=ex, **e)