import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["app"] == "Paylens"

def test_sample_endpoint():
    res = client.get("/api/sample")
    assert res.status_code == 200
    data = res.json()
    assert data["gross_monthly"] == 80000.0
    assert data["employee_name"] == "Demo User"

def test_analyze_endpoint():
    sample_payload = {
        "payslip": {
            "employee_name": "Demo User",
            "company_name": "Acme Tech",
            "pay_period": "March 2026",
            "gross_monthly": 80000.0,
            "basic": 40000.0,
            "hra": 20000.0,
            "special_allowance": 16000.0,
            "other_earnings": 4000.0,
            "pf_employee": 4800.0,
            "professional_tax": 200.0,
            "tds": 3000.0,
            "other_deductions": 0.0,
            "net_pay": 72000.0
        },
        "rent_monthly": 15000.0,
        "is_metro": True,
        "existing_emis": 0.0,
        "emi_ratio": 0.35,
        "language": "en"
    }
    res = client.post("/api/analyze", json=sample_payload)
    assert res.status_code == 200
    data = res.json()
    assert "tax_summary" in data
    assert "affordability" in data
    assert "chart_data" in data
    assert "explanation_bullets" in data
    assert data["tax_summary"]["better_regime"] in ["NEW", "OLD"]
    assert len(data["explanation_bullets"]) == 5

def test_nocost_endpoint():
    payload = {
        "listed_price": 50000.0,
        "monthly_emi": 8333.33,
        "months": 6,
        "processing_fee": 999.0,
        "upfront_discount": 4000.0
    }
    res = client.post("/api/nocost", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["is_truly_zero_cost"] is False
    assert data["effective_annual_rate"] > 20.0

def test_translate_ui_endpoint():
    res = client.post("/api/translate-ui", json={"language": "hi"})
    assert res.status_code == 200
    data = res.json()
    assert "app_title" in data
    assert "upload_heading" in data

def test_offer_decode_endpoint():
    payload = {
        "company_name": "TCS Prime",
        "role_title": "Systems Engineer",
        "annual_ctc": 900000.0,
        "fixed_base": 720000.0,
        "variable_pay_annual": 120000.0,
        "service_bond_months": 12,
        "bond_penalty_amount": 50000.0
    }
    res = client.post("/api/offer/decode", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["guaranteed_monthly_in_hand"] > 0
    assert len(data["traps_detected"]) >= 1

def test_offer_compare_endpoint():
    payload = {
        "offer_a": {
            "offer_id": "A",
            "company_name": "PaperInc",
            "annual_ctc": 1200000.0,
            "fixed_base": 700000.0,
            "variable_pay_annual": 300000.0,
            "stocks_esops_annual": 200000.0
        },
        "offer_b": {
            "offer_id": "B",
            "company_name": "SolidCo",
            "annual_ctc": 1000000.0,
            "fixed_base": 900000.0,
            "variable_pay_annual": 100000.0,
            "stocks_esops_annual": 0.0
        }
    }
    res = client.post("/api/offer/compare", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["better_guaranteed_offer"] == "B"

def test_lens_evaluate_endpoint():
    payload = {
        "item_name": "Sony WH-1000XM5 Headphones",
        "upfront_price": 28000.0,
        "monthly_emi": 4900.0,
        "months": 6,
        "processing_fee": 500.0,
        "upfront_discount": 1000.0,
        "monthly_in_hand": 72000.0,
        "existing_emis": 5000.0,
        "emi_ratio": 0.35,
        "financing_type": "NO_COST_EMI"
    }
    res = client.post("/api/lens/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["verdict"] in ["AFFORDABLE", "STRETCH", "DONT"]
    assert data["effective_annual_rate"] > 0

def test_audit_payslips_endpoint():
    payload = {
        "payslips": [
            {
                "employee_name": "Demo User",
                "pay_period": "January 2026",
                "gross_monthly": 80000.0,
                "basic": 40000.0,
                "pf_employee": 4800.0,
                "professional_tax": 200.0,
                "tds": 2000.0,
                "net_pay": 73000.0
            },
            {
                "employee_name": "Demo User",
                "pay_period": "February 2026",
                "gross_monthly": 80000.0,
                "basic": 40000.0,
                "pf_employee": 4800.0,
                "professional_tax": 200.0,
                "tds": 2000.0,
                "net_pay": 73000.0
            },
            {
                "employee_name": "Demo User",
                "pay_period": "March 2026",
                "gross_monthly": 80000.0,
                "basic": 40000.0,
                "pf_employee": 4800.0,
                "professional_tax": 200.0,
                "tds": 14000.0, # March spike
                "net_pay": 61000.0
            }
        ],
        "state": "KA"
    }
    res = client.post("/api/audit/payslips", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["months_audited"]) == 3
    assert len(data["anomalies"]) > 0

def test_life_plan_endpoint():
    payload = {
        "monthly_in_hand": 72000.0,
        "is_metro": True,
        "city_name": "Bengaluru",
        "goal": {
            "name": "Electric Scooter",
            "target_amount": 110000.0,
            "timeline_months": 10
        },
        "language": "en"
    }
    res = client.post("/api/plan/generate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "budget_split" in data
    assert "emergency_fund" in data
    assert "parent_explanation" in data

