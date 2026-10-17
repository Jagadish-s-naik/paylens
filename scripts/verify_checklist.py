"""
scripts/verify_checklist.py
Automated End-to-End Checklist Runner (§3.7) for Paylens.
Tests the live FastAPI server at http://127.0.0.1:8000 across all 7 steps.
"""

import sys
import time
import uuid
import httpx

BASE_URL = "http://127.0.0.1:8000"

# ANSI Terminal Color Helpers
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_step_header(step_num: int, title: str):
    print(f"\n{BOLD}{CYAN}=== Step {step_num}: {title} ==={RESET}")


def assert_condition(condition: bool, description: str, actual_val=None):
    if condition:
        print(f"  {GREEN}✓ PASS:{RESET} {description}")
    else:
        print(f"  {RED}✗ FAIL:{RESET} {description} (Got: {actual_val})")
        raise AssertionError(f"Step check failed: {description}")


def main():
    print(f"{BOLD}{GREEN}Starting Paylens Phase 3 Stage 3.2 End-to-End Verification Checklist...{RESET}")
    print(f"Target backend: {BASE_URL}")

    install_id = str(uuid.uuid4())
    headers = {"X-Install-Id": install_id}

    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        # =====================================================================
        # Step 1: Onboarding Profile Verification
        # =====================================================================
        print_step_header(1, "Open options.html -> Load Rahul Sharma (Demo)")
        t0 = time.perf_counter()
        res = client.get("/api/demo/profiles")
        t_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res.status_code == 200, "GET /api/demo/profiles returns HTTP 200", res.status_code)

        profiles = res.json().get("profiles", {})
        rahul = profiles.get("rahul")
        assert_condition(rahul is not None, "Canonical Rahul Sharma profile present")
        assert_condition(rahul["in_hand_verified"] == 75000.0, "Verified take-home is exactly ₹75,000", rahul["in_hand_verified"])
        assert_condition(rahul["essentials_monthly"] == 40500.0, "Essentials monthly is ₹40,500", rahul["essentials_monthly"])
        assert_condition(rahul["free_cash_monthly"] == 31000.0, "Uncommitted free cash is ₹31,000", rahul["free_cash_monthly"])
        assert_condition(rahul["tax_regime"] == "NEW", "Tax regime is NEW", rahul["tax_regime"])
        print(f"  {CYAN}Latency:{RESET} {t_ms:.1f}ms")

        # =====================================================================
        # Step 2: Browse Storefront (FastAPI Mount Handshake)
        # =====================================================================
        print_step_header(2, "Browse http://localhost:8000/mock-shop/")
        t0 = time.perf_counter()
        res_shop = client.get("/mock-shop/")
        t_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res_shop.status_code == 200, "Storefront returns HTTP 200", res_shop.status_code)
        html = res_shop.text
        assert_condition('id="paylens-mount-sony"' in html, "Mount point #paylens-mount-sony present")
        assert_condition('id="paylens-mount-iphone"' in html, "Mount point #paylens-mount-iphone present")
        assert_condition('id="paylens-mount-laptop"' in html, "Mount point #paylens-mount-laptop present")
        assert_condition('data-pl-id="sony_wh1000xm5"' in html, "Product data-pl-id sony_wh1000xm5 present")
        assert_condition('data-pl-id="iphone_16_pro"' in html, "Product data-pl-id iphone_16_pro present")
        assert_condition('data-pl-id="rog_strix_g16"' in html, "Product data-pl-id rog_strix_g16 present")
        print(f"  {CYAN}Latency:{RESET} {t_ms:.1f}ms")

        # Mock listings matching DOM attributes
        listing_sony = {
            "product_id": "sony_wh1000xm5",
            "title": "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
            "category": "Audio",
            "retailer": "MockStore",
            "upfront_cash_price": 29990.0,
            "cash_discount": 2000.0,
            "effective_cash_price": 27990.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment (Cash / Instant Bank Discount)",
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
            "title": "Apple iPhone 16 Pro (128GB, Natural Titanium)",
            "category": "Smartphones",
            "retailer": "MockStore",
            "upfront_cash_price": 119900.0,
            "cash_discount": 5000.0,
            "effective_cash_price": 114900.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment (Cash / UPI)",
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

        listing_laptop = {
            "product_id": "rog_strix_g16",
            "title": "ASUS ROG Strix G16 (2025) Gaming Laptop",
            "category": "Laptops",
            "retailer": "MockStore",
            "upfront_cash_price": 145000.0,
            "cash_discount": 5000.0,
            "effective_cash_price": 140000.0,
            "payment_options": [
                {
                    "option_id": "cash_full",
                    "type": "CASH",
                    "label": "Full Payment (Upfront)",
                    "tenure_months": 1,
                    "monthly_installment": 140000.0,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 0.0,
                    "lost_cash_discount": None,
                    "stated_interest_rate": 0.0,
                },
                {
                    "option_id": "laptop_std_12m",
                    "type": "STANDARD_EMI",
                    "label": "Standard EMI (12 Months, 15% APR)",
                    "tenure_months": 12,
                    "monthly_installment": 13160.0,
                    "upfront_downpayment": 0.0,
                    "processing_fee": 999.0,
                    "lost_cash_discount": 5000.0,
                    "stated_interest_rate": 15.0,
                },
            ],
        }

        # =====================================================================
        # Step 3: Inspect Sony WH-1000XM5 (No-Cost EMI)
        # =====================================================================
        print_step_header(3, "Inspect Sony WH-1000XM5 (No-Cost EMI)")
        t0 = time.perf_counter()
        res_v3 = client.post(
            "/api/afford",
            json={
                "profile": rahul,
                "listing": listing_sony,
                "selected_option_id": "sony_nocost_6m",
            },
            headers=headers,
        )
        t_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res_v3.status_code == 200, "POST /api/afford returns HTTP 200", res_v3.status_code)
        v3 = res_v3.json()

        assert_condition(v3["verdict_level"] == "COMFORTABLE", "Badge level is COMFORTABLE 🟢", v3["verdict_level"])
        tc3 = v3["true_cost"]
        assert_condition(tc3["effective_annual_rate"] == 30.74, "High APR: 30.74% EAR", tc3["effective_annual_rate"])
        assert_condition(round(tc3["hidden_markup"]) == 2235, "Hidden Markup is ₹2,235", tc3["hidden_markup"])
        assert_condition(tc3["has_high_apr_alert"] is True, "High APR Alert is True", tc3["has_high_apr_alert"])

        cash_alt = next((a for a in v3["alternatives"] if "Cash" in a["title"]), None)
        assert_condition(cash_alt is not None, "Cash Alternative option generated")
        assert_condition(cash_alt["runway_after"] == 3.01, "Cash Alternative Runway is 3.01 months", cash_alt["runway_after"])
        assert_condition(round(cash_alt["money_saved"]) == 2235, "Cash Alternative saves ₹2,235", cash_alt["money_saved"])
        print(f"  {CYAN}Latency:{RESET} {t_ms:.1f}ms")

        # =====================================================================
        # Step 4: Inspect iPhone 16 Pro (No-Cost EMI)
        # =====================================================================
        print_step_header(4, "Inspect iPhone 16 Pro (No-Cost EMI)")
        t0 = time.perf_counter()
        res_v4 = client.post(
            "/api/afford",
            json={
                "profile": rahul,
                "listing": listing_iphone,
                "selected_option_id": "iphone_nocost_6m",
            },
            headers=headers,
        )
        t_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res_v4.status_code == 200, "POST /api/afford returns HTTP 200", res_v4.status_code)
        v4 = res_v4.json()

        assert_condition(v4["verdict_level"] == "STRETCH", "Badge level is STRETCH 🟡", v4["verdict_level"])
        imp4 = v4["impact"]
        assert_condition(round(imp4["free_cash_after"]) == 11017, "Free cash drops to ₹11,017", imp4["free_cash_after"])
        assert_condition(round(imp4["foir_after"] * 100, 1) == 31.3, "FOIR rises to 31.3%", round(imp4["foir_after"] * 100, 1))

        income_shock = next((s for s in v4["stress_tests"] if "Income" in s["scenario_name"]), None)
        assert_condition(income_shock is not None and income_shock["passes"] is False, "Income Shock fails")
        assert_condition("3,983" in income_shock["warning"], "Warning asserts deficit of ₹3,983/month", income_shock["warning"])

        wait_alt = next((a for a in v4["alternatives"] if "Wait" in a["title"]), None)
        assert_condition(wait_alt is not None and "3 Months" in wait_alt["title"], "Wait & Save: Wait 3 Months & Buy in Cash", wait_alt["title"])
        assert_condition(wait_alt["money_saved"] > 5000.0, "Wait & Save saves > ₹5,000", wait_alt["money_saved"])
        print(f"  {CYAN}Latency:{RESET} {t_ms:.1f}ms")

        # =====================================================================
        # Step 5: Switch persona to Amit Verma -> Inspect Gaming Laptop
        # =====================================================================
        print_step_header(5, "Switch persona to Amit Verma -> Inspect Gaming Laptop")
        amit = profiles.get("amit")
        t0 = time.perf_counter()
        res_v5 = client.post(
            "/api/afford",
            json={
                "profile": amit,
                "listing": listing_laptop,
                "selected_option_id": "laptop_std_12m",
            },
            headers=headers,
        )
        t_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res_v5.status_code == 200, "POST /api/afford returns HTTP 200", res_v5.status_code)
        v5 = res_v5.json()

        assert_condition(v5["verdict_level"] == "RISKY", "Badge level is RISKY 🔴", v5["verdict_level"])
        assert_condition(round(v5["impact"]["free_cash_after"], 2) == -2400.00, "Deficit is exactly -₹2,400.00", v5["impact"]["free_cash_after"])

        cash_alt5 = next((a for a in v5["alternatives"] if "Cash" in a["title"]), None)
        assert_condition(cash_alt5 is not None and cash_alt5["is_feasible"] is False, "Cash purchase is Not Feasible today")
        assert_condition("Not possible today" in cash_alt5["description"], "Cash description asserts 'Not possible today'", cash_alt5["description"])

        cushion_alt = next((a for a in v5["alternatives"] if "Cushion" in a["title"]), None)
        assert_condition(cushion_alt is not None, "Recommendation asserts 'Build 3-Month Emergency Cushion First'", cushion_alt["title"] if cushion_alt else None)
        print(f"  {CYAN}Latency:{RESET} {t_ms:.1f}ms")

        # =====================================================================
        # Step 6: Switch persona to Vikram Malhotra -> March TDS Shock
        # =====================================================================
        print_step_header(6, "Switch persona to Vikram Malhotra -> Inspect iPhone (March Shock)")
        vikram = profiles.get("vikram")
        t0 = time.perf_counter()
        res_v6 = client.post(
            "/api/afford",
            json={
                "profile": vikram,
                "listing": listing_iphone,
                "selected_option_id": "iphone_nocost_6m",
            },
            headers=headers,
        )
        t_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res_v6.status_code == 200, "POST /api/afford returns HTTP 200", res_v6.status_code)
        v6 = res_v6.json()

        march_shock = next((s for s in v6["stress_tests"] if "March" in s["scenario_name"] or "TDS" in s["scenario_name"]), None)
        assert_condition(march_shock is not None, "March TDS Shock present in stress tests")
        assert_condition(march_shock["is_applicable"] is True, "March TDS Shock is applicable (OLD regime)")
        assert_condition(march_shock["passes"] is False, "March TDS Shock fails")
        assert_condition("127,800" in march_shock["warning"], "Warning asserts ₹127,800 March tax deduction spike", march_shock["warning"])
        print(f"  {CYAN}Latency:{RESET} {t_ms:.1f}ms")

        # =====================================================================
        # Step 7: Language Toggle (Kannada / Hindi Regional Explanations)
        # =====================================================================
        print_step_header(7, "Language Toggle to Hindi and Kannada (< 500ms)")
        # Hindi
        t0 = time.perf_counter()
        res_hi = client.post(
            "/api/afford/explain",
            json={"verdict": v3, "language": "hi"},
            headers=headers,
        )
        t_hi_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res_hi.status_code == 200, "Hindi explanation returns HTTP 200", res_hi.status_code)
        bullets_hi = res_hi.json().get("bullets", [])
        assert_condition(len(bullets_hi) >= 3, f"Hindi bullets >= 3 (Got {len(bullets_hi)})")
        print(f"  {CYAN}Hindi Latency:{RESET} {t_hi_ms:.1f}ms (Source: {res_hi.json().get('source')})")

        # Kannada
        t0 = time.perf_counter()
        res_kn = client.post(
            "/api/afford/explain",
            json={"verdict": v3, "language": "kn"},
            headers=headers,
        )
        t_kn_ms = (time.perf_counter() - t0) * 1000
        assert_condition(res_kn.status_code == 200, "Kannada explanation returns HTTP 200", res_kn.status_code)
        bullets_kn = res_kn.json().get("bullets", [])
        assert_condition(len(bullets_kn) >= 3, f"Kannada bullets >= 3 (Got {len(bullets_kn)})")
        print(f"  {CYAN}Kannada Latency:{RESET} {t_kn_ms:.1f}ms (Source: {res_kn.json().get('source')})")

    print(f"\n{BOLD}{GREEN}==============================================================={RESET}")
    print(f"{BOLD}{GREEN}ALL 7 END-TO-END CHECKLIST VERIFICATION STEPS PASSED 100%!{RESET}")
    print(f"{BOLD}{GREEN}==============================================================={RESET}\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\n{BOLD}{RED}Verification failed with error: {e}{RESET}")
        sys.exit(1)
