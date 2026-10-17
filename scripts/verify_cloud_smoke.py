"""
scripts/verify_cloud_smoke.py
Production Cloud Run Smoke Test for Paylens (§3.3 Task 3.3.1).
Tests live HTTPS endpoints on https://paylens-986743332275.asia-south1.run.app
"""

import sys
import time
import uuid
import httpx

CLOUD_BASE = "https://paylens-986743332275.asia-south1.run.app"

# Terminal formatting
GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def check(passed: bool, message: str, val=None):
    if passed:
        print(f"  {GREEN}✓ PASS:{RESET} {message}")
    else:
        print(f"  {RED}✗ FAIL:{RESET} {message} (Got: {val})")
        raise AssertionError(f"Cloud verification failed: {message}")


def main():
    print(f"\n{BOLD}{CYAN}=== Paylens Cloud Run Production Smoke Test ==={RESET}")
    print(f"Target: {CLOUD_BASE}\n")

    with httpx.Client(base_url=CLOUD_BASE, timeout=20.0) as client:
        # 1. Health Endpoint
        print(f"{BOLD}[1/4] Testing GET /api/health...{RESET}")
        t0 = time.perf_counter()
        res_health = client.get("/api/health")
        t_health = (time.perf_counter() - t0) * 1000
        check(res_health.status_code == 200, "Health returns HTTP 200", res_health.status_code)
        data_health = res_health.json()
        check(data_health.get("status") == "ok", "Status is 'ok'", data_health.get("status"))
        print(f"  {CYAN}Latency:{RESET} {t_health:.1f}ms (AI available: {data_health.get('ai_available')})")

        # 2. Mock Storefront Mount
        print(f"\n{BOLD}[2/4] Testing GET /mock-shop/...{RESET}")
        t0 = time.perf_counter()
        res_shop = client.get("/mock-shop/")
        t_shop = (time.perf_counter() - t0) * 1000
        check(res_shop.status_code == 200, "Storefront returns HTTP 200", res_shop.status_code)
        html = res_shop.text
        check('id="paylens-mount-sony"' in html, "Mount point #paylens-mount-sony exists")
        check('id="paylens-mount-iphone"' in html, "Mount point #paylens-mount-iphone exists")
        check('id="paylens-mount-laptop"' in html, "Mount point #paylens-mount-laptop exists")
        print(f"  {CYAN}Latency:{RESET} {t_shop:.1f}ms")

        # 3. Affordability Evaluation Route
        print(f"\n{BOLD}[3/4] Testing POST /api/afford (Rahul + Sony Headphones)...{RESET}")
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

        # Canonical Rahul Sharma profile
        profile_rahul = {
            "schema_version": "1.0.0",
            "profile_id": "prof_rahul",
            "employer_name": "Acme Cloud Tech India Pvt Ltd",
            "pay_period": "March 2026",
            "gross_monthly": 80000.0,
            "basic_monthly": 40000.0,
            "hra_monthly": 20000.0,
            "pf_employee_monthly": 4800.0,
            "professional_tax_monthly": 200.0,
            "tds_monthly": 0.0,
            "tax_regime": "NEW",
            "in_hand_verified": 75000.0,
            "annual_variable_bonus": 182400.0,
            "rent_monthly": 18000.0,
            "is_metro": True,
            "existing_emis": [
                {"name": "Previous Phone", "monthly_amount": 3500.0, "tenure_remaining_months": 3}
            ],
            "current_savings": 150000.0,
            "language_pref": "en",
        }

        install_id = str(uuid.uuid4())
        t0 = time.perf_counter()
        res_afford = client.post(
            "/api/afford",
            json={
                "profile": profile_rahul,
                "listing": listing_sony,
                "selected_option_id": "sony_nocost_6m",
            },
            headers={"X-Install-Id": install_id},
        )
        t_afford = (time.perf_counter() - t0) * 1000
        check(res_afford.status_code == 200, "POST /api/afford returns HTTP 200", res_afford.status_code)
        v = res_afford.json()
        check(v["verdict_level"] == "COMFORTABLE", "Verdict level is COMFORTABLE 🟢", v["verdict_level"])
        check(v["true_cost"]["effective_annual_rate"] == 30.74, "EAR is 30.74%", v["true_cost"]["effective_annual_rate"])
        check(round(v["true_cost"]["hidden_markup"]) == 2235, "Hidden markup is ₹2,235", v["true_cost"]["hidden_markup"])
        print(f"  {CYAN}Latency:{RESET} {t_afford:.1f}ms")

        # 4. Regional Explanation Route
        print(f"\n{BOLD}[4/4] Testing POST /api/afford/explain (Hindi)...{RESET}")
        t0 = time.perf_counter()
        res_explain = client.post(
            "/api/afford/explain",
            json={"verdict": v, "language": "hi"},
            headers={"X-Install-Id": install_id},
        )
        t_explain = (time.perf_counter() - t0) * 1000
        check(res_explain.status_code == 200, "POST /api/afford/explain returns HTTP 200", res_explain.status_code)
        data_explain = res_explain.json()
        bullets = data_explain.get("bullets", [])
        check(len(bullets) >= 3, f"Explanation bullets >= 3 (Got {len(bullets)})")
        print(f"  {CYAN}Latency:{RESET} {t_explain:.1f}ms (Source: {data_explain.get('source')})")

    print(f"\n{BOLD}{GREEN}==============================================================={RESET}")
    print(f"{BOLD}{GREEN}PRODUCTION CLOUD RUN SMOKE TEST PASSED 100%!{RESET}")
    print(f"{BOLD}{GREEN}Service URL: {CLOUD_BASE}{RESET}")
    print(f"{BOLD}{GREEN}==============================================================={RESET}\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\n{BOLD}{RED}Cloud smoke test failed: {e}{RESET}")
        sys.exit(1)
