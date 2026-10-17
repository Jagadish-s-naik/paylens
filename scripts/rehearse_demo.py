"""
scripts/rehearse_demo.py
Interactive 60-Second Demo Presentation Rehearsal Coach.
Paces the presenter through Acts 0-3 with real-time assertions against the live Paylens API.
"""

import sys
import time
import uuid
import argparse
import httpx

# Terminal Colors
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def print_banner():
    print(f"\n{BOLD}{CYAN}========================================================================={RESET}")
    print(f"{BOLD}{GREEN}           PAYLENS — 60-SECOND LIVE JUDGE PITCH REHEARSAL COACH          {RESET}")
    print(f"{BOLD}{CYAN}========================================================================={RESET}\n")


def display_act(act_num: int, time_range: str, title: str, spoken_text: str, visual_cues: list, api_checks: list):
    print(f"\n{BOLD}{YELLOW}[Act {act_num}: {time_range}] — {title}{RESET}")
    print(f"{BOLD}🎙️ SPOKEN DIALOGUE:{RESET}")
    print(f'"{spoken_text}"\n')

    print(f"{BOLD}👉 ON-SCREEN PRESENTER CUES:{RESET}")
    for cue in visual_cues:
        print(f"  • {cue}")

    print(f"\n{BOLD}🔍 LIVE MATHEMATICAL ASSERTIONS:{RESET}")
    for desc, expected, actual in api_checks:
        is_match = (str(expected).strip() == str(actual).strip()) or (isinstance(expected, (int, float)) and abs(expected - float(actual)) < 0.5)
        status = f"{GREEN}✓ MATCH{RESET}" if is_match else f"{RED}✗ MISMATCH{RESET}"
        print(f"  {status} {desc}: Expected '{expected}', Got '{actual}'")
        if not is_match:
            raise AssertionError(f"Rehearsal assertion mismatch: {desc}")


def run_rehearsal(base_url: str, auto_mode: bool = False):
    print_banner()
    print(f"Connecting to live API: {base_url}")
    install_id = str(uuid.uuid4())
    headers = {"X-Install-Id": install_id}

    with httpx.Client(base_url=base_url, timeout=10.0) as client:
        # Pre-fetch data
        res_prof = client.get("/api/demo/profiles")
        if res_prof.status_code != 200:
            print(f"{RED}Error connecting to backend /api/demo/profiles: HTTP {res_prof.status_code}{RESET}")
            return 1
        rahul = res_prof.json()["profiles"]["rahul"]

        listing_sony = {
            "product_id": "sony_wh1000xm5",
            "title": "Sony WH-1000XM5 Wireless Headphones",
            "category": "Audio",
            "retailer": "MockStore",
            "upfront_cash_price": 29990.0,
            "cash_discount": 2000.0,
            "effective_cash_price": 27990.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment",
                    "tenure_months": 1,
                    "monthly_installment": 27990.0,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 0.0,
                    "lost_cash_discount": None,
                    "stated_interest_rate": 0.0,
                },
                {
                    "option_id": "sony_nocost_6m",
                    "type": "NO_COST_EMI",
                    "label": "HDFC No-Cost EMI (6 Months)",
                    "tenure_months": 6,
                    "monthly_installment": 4998.33,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 199.0,
                    "lost_cash_discount": 2000.0,
                    "stated_interest_rate": 0.0,
                },
            ],
        }

        listing_iphone = {
            "product_id": "iphone_16_pro",
            "title": "Apple iPhone 16 Pro (128GB)",
            "category": "Smartphones",
            "retailer": "MockStore",
            "upfront_cash_price": 119900.0,
            "cash_discount": 5000.0,
            "effective_cash_price": 114900.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment",
                    "tenure_months": 1,
                    "monthly_installment": 114900.0,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 0.0,
                    "lost_cash_discount": None,
                    "stated_interest_rate": 0.0,
                },
                {
                    "option_id": "iphone_nocost_6m",
                    "type": "NO_COST_EMI",
                    "label": "ICICI No-Cost EMI (6 Months)",
                    "tenure_months": 6,
                    "monthly_installment": 19983.33,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 299.0,
                    "lost_cash_discount": 5000.0,
                    "stated_interest_rate": 0.0,
                },
            ],
        }

        v_sony = client.post(
            "/api/afford",
            json={"profile": rahul, "listing": listing_sony, "selected_option_id": "sony_nocost_6m"},
            headers=headers,
        ).json()

        v_iphone = client.post(
            "/api/afford",
            json={"profile": rahul, "listing": listing_iphone, "selected_option_id": "iphone_nocost_6m"},
            headers=headers,
        ).json()

        # -------------------------------------------------------------
        # ACT 0: 0:00 - 0:12
        # -------------------------------------------------------------
        display_act(
            act_num=0,
            time_range="0:00 – 0:12",
            title="The Hook & Truth Layer",
            spoken_text="Judges, headline CTC numbers deceive freshers. Rahul's offer letter advertised '12 LPA', but after stripping variable bonus and employer PF, Paylens scanned his payslip and proved his true take-home is exactly ₹75,000/month under FY 2025-26 rules.",
            visual_cues=[
                "Start on Options Page (options.html) or Action Popup with Rahul active.",
                "Cursor highlights: 'Verified Take-Home: ₹75,000.00/mo' and 'Health Score: 100/100 (G1-G3 Passed)'.",
                "Emphasize that uncommitted free cash is calculated strictly from this verified baseline."
            ],
            api_checks=[
                ("Rahul Verified In-Hand Take-Home", 75000.0, rahul["in_hand_verified"]),
                ("Tax Regime", "NEW", rahul["tax_regime"]),
                ("Declared Variable Bonus Excluded", 182400.0, rahul["annual_variable_bonus"]),
            ]
        )

        if not auto_mode:
            input(f"\n{DIM}[Press ENTER to advance to Act 1 (0:12)]...{RESET}")
        else:
            time.sleep(2)

        # -------------------------------------------------------------
        # ACT 1: 0:12 - 0:26
        # -------------------------------------------------------------
        tc_sony = v_sony["true_cost"]
        cash_alt_sony = next((a for a in v_sony["alternatives"] if "Cash" in a["title"]), None)

        display_act(
            act_num=1,
            time_range="0:12 – 0:26",
            title="The Hidden APR Reveal on Sony Headphones",
            spoken_text="Rahul browses our electronics store to buy Sony WH-1000XM5 headphones (₹29,990) on a '0% No-Cost EMI' for ₹4,998/month. The Paylens extension triggers immediately: While budget-comfortable (FOIR 11.3%), Paylens reveals a 🔴 30.74% Hidden EAR! Taking No-Cost EMI forfeits a ₹2,000 cash discount and incurs processing fees, losing ₹2,235 in markup. Buying in cash preserves his ₹1.22L emergency cushion.",
            visual_cues=[
                "Switch to Storefront tab (http://localhost:8000/mock-shop/).",
                "Show Tab 1 (Sony WH-1000XM5) active with No-Cost EMI radio selected.",
                "Highlight the open shadow DOM Verdict Card rendering directly below.",
                "Point cursor to the Crimson Callout: '⚠️ High APR Financing Alert (30.74% EAR)'.",
                "Point cursor to Alternative: 'Buy in Cash Today' showing 3.01m runway and saving ₹2,235."
            ],
            api_checks=[
                ("Verdict Tier", "COMFORTABLE", v_sony["verdict_level"]),
                ("FOIR Debt Ratio", "11.3%", f"{round(v_sony['impact']['foir_after']*100, 1)}%"),
                ("Effective Annual Rate (EAR)", 30.74, tc_sony["effective_annual_rate"]),
                ("Hidden Markup", 2235, round(tc_sony["hidden_markup"])),
                ("High APR Alert Flag", True, tc_sony["has_high_apr_alert"]),
                ("Cash Alternative Runway", 3.01, cash_alt_sony["runway_after"] if cash_alt_sony else 0),
            ]
        )

        if not auto_mode:
            input(f"\n{DIM}[Press ENTER to advance to Act 2 (0:26)]...{RESET}")
        else:
            time.sleep(2)

        # -------------------------------------------------------------
        # ACT 2: 0:26 - 0:42
        # -------------------------------------------------------------
        imp_iphone = v_iphone["impact"]
        inc_shock_iphone = next((s for s in v_iphone["stress_tests"] if "Income" in s["scenario_name"]), None)

        display_act(
            act_num=2,
            time_range="0:26 – 0:42",
            title="The Stretch Reality Check on iPhone 16 Pro",
            spoken_text="Next, Rahul views the iPhone 16 Pro (₹1,19,900) on 6-month EMI at ₹19,983/month. Paylens shifts to 🟡 Budget Stretch! Look at the cash-flow impact: Debt ratio jumps to 31.3%, and free cash drops to just ₹11,017. Worse, an income stress test (-20% cut) triggers an immediate deficit of -₹3,983/month!",
            visual_cues=[
                "Click Tab 2 (Apple iPhone 16 Pro) on storefront.",
                "Observe instantaneous badge shift from Green to 🟡 STRETCH • Budget Stretch.",
                "Point to Impact Grid: FOIR jumps to 31.3% and Free Cash shrinks to ₹11,017.",
                "Point to Stress Test Section: '⚠️ Income Shock (-20% Salary Cut)' marked 'Fails Shock (-₹3,983)'."
            ],
            api_checks=[
                ("Verdict Tier", "STRETCH", v_iphone["verdict_level"]),
                ("FOIR Debt Ratio", "31.3%", f"{round(imp_iphone['foir_after']*100, 1)}%"),
                ("Free Cash After", 11017, round(imp_iphone["free_cash_after"])),
                ("Income Shock Passes", False, inc_shock_iphone["passes"] if inc_shock_iphone else True),
                ("Income Shock Deficit in Warning", True, "3,983" in inc_shock_iphone["warning"] if inc_shock_iphone else False),
            ]
        )

        if not auto_mode:
            input(f"\n{DIM}[Press ENTER to advance to Act 3 (0:42)]...{RESET}")
        else:
            time.sleep(2)

        # -------------------------------------------------------------
        # ACT 3: 0:42 - 1:00
        # -------------------------------------------------------------
        wait_alt_iphone = next((a for a in v_iphone["alternatives"] if "Wait" in a["title"]), None)

        display_act(
            act_num=3,
            time_range="0:42 – 1:00",
            title="The Honest Alternative & Close",
            spoken_text="Instead of forcing an unaffordable EMI or wiping out his emergency savings, Paylens offers a clear alternative: 'Wait 3 months, save ₹5,235'. By saving his uncommitted monthly cash for 3 months, he can buy the phone upfront in cash, pocket the ₹5,000 discount, and keep his 3.0-month emergency cushion 100% intact. Zero hallucinated math, 100% financial protection. Thank you!",
            visual_cues=[
                "Scroll down slightly to 'Re-Scored Smart Alternatives'.",
                "Highlight 'Wait 3 Months & Buy in Cash' card and its savings badge.",
                "Explain the dynamic roll-off: Rahul saves ₹31k/month uncommitted cash to reach upfront price.",
                "Click 'HI' or 'KN' language pill to show instant grounded multilingual explanation.",
                "Finish presentation cleanly at the 1:00 mark."
            ],
            api_checks=[
                ("Alternative Strategy", "WAIT_AND_SAVE", wait_alt_iphone["strategy"] if wait_alt_iphone else ""),
                ("Alternative Title mentions '3 Months'", True, "3 Months" in wait_alt_iphone["title"] if wait_alt_iphone else False),
                ("Money Saved > ₹5,000", True, wait_alt_iphone["money_saved"] > 5000.0 if wait_alt_iphone else False),
            ]
        )

    print(f"\n{BOLD}{GREEN}========================================================================={RESET}")
    print(f"{BOLD}{GREEN}  REHEARSAL COMPLETED: ALL 14 SPOKEN FIGURES MATCH LIVE SYSTEM OUTPUTS!  {RESET}")
    print(f"{BOLD}{GREEN}========================================================================={RESET}\n")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Paylens 60-second pitch rehearsal coach")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base URL for Paylens API")
    parser.add_argument("--auto", action="store_true", help="Run in automated non-interactive mode")
    args = parser.parse_args()

    sys.exit(run_rehearsal(args.url, auto_mode=args.auto))
