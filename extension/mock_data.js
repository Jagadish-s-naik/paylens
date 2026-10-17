/**
 * extension/mock_data.js
 * Pre-computed golden fixtures for offline development (MOCK_API = true).
 * Generated automatically from tests/fixtures/*.json.
 */

export const MOCK_DATA = {
  "profiles": {
    "rahul": {
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
      "is_metro": true,
      "existing_emis": [
        {
          "name": "Previous Phone",
          "monthly_amount": 3500.0,
          "tenure_remaining_months": 3
        }
      ],
      "total_existing_emi_monthly": 3500.0,
      "current_savings": 150000.0,
      "essentials_monthly": 40500.0,
      "emergency_runway_months": 3.7,
      "free_cash_monthly": 31000.0,
      "safe_emi_ceiling": 22750.0,
      "language_pref": "en"
    },
    "amit": {
      "schema_version": "1.0.0",
      "profile_id": "prof_amit",
      "employer_name": "Infosol Global",
      "pay_period": "March 2026",
      "gross_monthly": 50000.0,
      "basic_monthly": 25000.0,
      "hra_monthly": 10000.0,
      "pf_employee_monthly": 3000.0,
      "professional_tax_monthly": 200.0,
      "tds_monthly": 0.0,
      "tax_regime": "NEW",
      "in_hand_verified": 46800.0,
      "annual_variable_bonus": 0.0,
      "rent_monthly": 14000.0,
      "is_metro": false,
      "existing_emis": [
        {
          "name": "Bike Loan",
          "monthly_amount": 8000.0,
          "tenure_remaining_months": 8
        }
      ],
      "total_existing_emi_monthly": 8000.0,
      "current_savings": 25000.0,
      "essentials_monthly": 28040.0,
      "emergency_runway_months": 0.89,
      "free_cash_monthly": 10760.0,
      "safe_emi_ceiling": 8380.0,
      "language_pref": "en"
    },
    "vikram": {
      "schema_version": "1.0.0",
      "profile_id": "prof_vikram",
      "employer_name": "Enterprise Systems",
      "pay_period": "March 2026",
      "gross_monthly": 100000.0,
      "basic_monthly": 50000.0,
      "hra_monthly": 25000.0,
      "pf_employee_monthly": 6000.0,
      "professional_tax_monthly": 200.0,
      "tds_monthly": 3000.0,
      "tax_regime": "OLD",
      "in_hand_verified": 88000.0,
      "annual_variable_bonus": 0.0,
      "rent_monthly": 25000.0,
      "is_metro": true,
      "existing_emis": [],
      "total_existing_emi_monthly": 0.0,
      "current_savings": 200000.0,
      "essentials_monthly": 51400.0,
      "emergency_runway_months": 3.89,
      "free_cash_monthly": 36600.0,
      "safe_emi_ceiling": 30800.0,
      "language_pref": "en"
    }
  },
  "listings": {
    "sony": {
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
          "label": "Full Payment (Instant Bank Discount)",
          "tenure_months": 1,
          "monthly_installment": 27990.0,
          "upfront_downpayment": 0.0,
          "processing_fee": 0.0,
          "lost_cash_discount": null,
          "stated_interest_rate": 0.0
        },
        {
          "option_id": "sony_nocost_6m",
          "type": "NO_COST_EMI",
          "label": "No-Cost EMI (6 Months)",
          "tenure_months": 6,
          "monthly_installment": 4998.33,
          "upfront_downpayment": 0.0,
          "processing_fee": 199.0,
          "lost_cash_discount": 2000.0,
          "stated_interest_rate": 0.0
        }
      ]
    },
    "iphone": {
      "product_id": "iphone_16_pro",
      "title": "Apple iPhone 16 Pro (128 GB) - Natural Titanium",
      "category": "Smartphone",
      "retailer": "MockStore",
      "upfront_cash_price": 119900.0,
      "cash_discount": 5000.0,
      "effective_cash_price": 114900.0,
      "payment_options": [
        {
          "option_id": "cash_full",
          "type": "CASH",
          "label": "Full Payment (Instant Bank Discount)",
          "tenure_months": 1,
          "monthly_installment": 114900.0,
          "upfront_downpayment": 0.0,
          "processing_fee": 0.0,
          "lost_cash_discount": null,
          "stated_interest_rate": 0.0
        },
        {
          "option_id": "iphone_nocost_6m",
          "type": "NO_COST_EMI",
          "label": "No-Cost EMI (6 Months)",
          "tenure_months": 6,
          "monthly_installment": 19983.33,
          "upfront_downpayment": 0.0,
          "processing_fee": 199.0,
          "lost_cash_discount": 5000.0,
          "stated_interest_rate": 0.0
        }
      ]
    },
    "laptop": {
      "product_id": "rog_strix_g16",
      "title": "ASUS ROG Strix G16 Gaming Laptop",
      "category": "Laptop",
      "retailer": "MockStore",
      "upfront_cash_price": 145000.0,
      "cash_discount": 5000.0,
      "effective_cash_price": 140000.0,
      "payment_options": [
        {
          "option_id": "laptop_std_12m",
          "type": "STANDARD_EMI",
          "label": "Standard EMI (12 Months, 15% APR)",
          "tenure_months": 12,
          "monthly_installment": 13160.0,
          "upfront_downpayment": 0.0,
          "processing_fee": 999.0,
          "lost_cash_discount": 5000.0,
          "stated_interest_rate": 15.0
        }
      ]
    }
  },
  "verdicts": {
    "sony_rahul": {
      "verdict_level": "COMFORTABLE",
      "badge": "\ud83d\udfe2 Safe to Buy",
      "headline_reason": "Budget-safe (11.3% FOIR), but financing costs 30.74% EAR markup (\u20b92,235 lost).",
      "selected_option": {
        "option_id": "sony_nocost_6m",
        "type": "NO_COST_EMI",
        "label": "No-Cost EMI (6 Months)",
        "tenure_months": 6,
        "monthly_installment": 4998.33,
        "upfront_downpayment": 0.0,
        "processing_fee": 199.0,
        "lost_cash_discount": 2000.0,
        "stated_interest_rate": 0.0
      },
      "true_cost": {
        "effective_annual_rate": 30.74,
        "nominal_annual_rate": 27.1,
        "total_outflow": 30224.8,
        "hidden_markup": 2234.8,
        "is_truly_zero_cost": false,
        "has_high_apr_alert": true
      },
      "impact": {
        "foir_before": 0.0467,
        "foir_after": 0.1133,
        "free_cash_before": 31000.0,
        "free_cash_after": 26001.67,
        "free_cash_ratio_after": 0.3467,
        "runway_months_before": 3.7,
        "runway_months_after": 3.7
      },
      "stress_tests": [
        {
          "scenario_name": "Income Shock (-20% Salary Cut)",
          "description": "Simulates unexpected loss of pay or salary slowdown.",
          "stressed_foir": 0.1416,
          "stressed_free_cash": 11001.67,
          "passes": true,
          "is_applicable": true,
          "warning": null
        },
        {
          "scenario_name": "March TDS Shock (Tax Deduction Jump)",
          "description": "Under NEW regime, statutory tax requires zero investment proofs (\u20b90 March shock).",
          "stressed_foir": 0.1133,
          "stressed_free_cash": 26001.67,
          "passes": true,
          "is_applicable": false,
          "warning": null
        }
      ],
      "alternatives": [
        {
          "strategy": "BUY_CASH",
          "title": "Buy in Cash Today (Full Payment)",
          "description": "Pay \u20b927,990 upfront. Post-purchase runway is 3.01 months (\u20b9122,010 savings left).",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 1,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe to Buy",
          "runway_after": 3.01,
          "money_saved": 2234.8,
          "is_feasible": true
        },
        {
          "strategy": "WAIT_AND_SAVE",
          "title": "Buy with Surplus Savings Today",
          "description": "You already have \u20b928,500 surplus above your 3-month cushion. You can buy today in cash and save \u20b92,235!",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 0,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe Goal",
          "runway_after": 3.0,
          "money_saved": 2234.8,
          "is_feasible": true
        },
        {
          "strategy": "DOWNPAYMENT_BOOST",
          "title": "Hypothetical Part-Payment (\u20b911,196 Downpayment)",
          "description": "If the retailer supports split payment: pay \u20b911,196 upfront from surplus savings. Drops monthly EMI to \u20b92,799/mo while keeping 3-month runway.",
          "suggested_monthly_emi": 2799.0,
          "suggested_tenure_months": 6,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe to Buy",
          "runway_after": 3.43,
          "money_saved": 0.0,
          "is_feasible": true
        }
      ],
      "explanation_bullets": null
    },
    "iphone_rahul": {
      "verdict_level": "STRETCH",
      "badge": "\ud83d\udfe1 Budget Stretch",
      "headline_reason": "Budget stretch: consumes 31.3% of your salary and shrinks free cash to \u20b911,017.",
      "selected_option": {
        "option_id": "iphone_nocost_6m",
        "type": "NO_COST_EMI",
        "label": "No-Cost EMI (6 Months)",
        "tenure_months": 6,
        "monthly_installment": 19983.33,
        "upfront_downpayment": 0.0,
        "processing_fee": 199.0,
        "lost_cash_discount": 5000.0,
        "stated_interest_rate": 0.0
      },
      "true_cost": {
        "effective_annual_rate": 16.63,
        "nominal_annual_rate": 15.49,
        "total_outflow": 120134.8,
        "hidden_markup": 5234.8,
        "is_truly_zero_cost": false,
        "has_high_apr_alert": false
      },
      "impact": {
        "foir_before": 0.0467,
        "foir_after": 0.3131,
        "free_cash_before": 31000.0,
        "free_cash_after": 11016.67,
        "free_cash_ratio_after": 0.1469,
        "runway_months_before": 3.7,
        "runway_months_after": 3.7
      },
      "stress_tests": [
        {
          "scenario_name": "Income Shock (-20% Salary Cut)",
          "description": "Simulates unexpected loss of pay or salary slowdown.",
          "stressed_foir": 0.3914,
          "stressed_free_cash": -3983.33,
          "passes": false,
          "is_applicable": true,
          "warning": "A 20% salary cut triggers an immediate deficit of \u20b93,983/month."
        },
        {
          "scenario_name": "March TDS Shock (Tax Deduction Jump)",
          "description": "Under NEW regime, statutory tax requires zero investment proofs (\u20b90 March shock).",
          "stressed_foir": 0.3131,
          "stressed_free_cash": 11016.67,
          "passes": true,
          "is_applicable": false,
          "warning": null
        }
      ],
      "alternatives": [
        {
          "strategy": "BUY_CASH",
          "title": "Buy in Cash Today (Full Payment)",
          "description": "Pay \u20b9114,900 upfront. Post-purchase runway is 0.87 months (\u20b935,100 savings left).",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 1,
          "rescore_verdict": "RISKY",
          "rescore_badge": "\ud83d\udd34 Risky Debt",
          "runway_after": 0.87,
          "money_saved": 5234.8,
          "is_feasible": true
        },
        {
          "strategy": "WAIT_AND_SAVE",
          "title": "Wait 3 Months & Buy in Cash",
          "description": "Wait 3 months: save your uncommitted cash (\u20b931,000/mo) to buy in cash, saving \u20b95,235 while keeping your 3-month emergency cushion intact.",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 3,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe Goal",
          "runway_after": 3.0,
          "money_saved": 5234.8,
          "is_feasible": true
        },
        {
          "strategy": "DOWNPAYMENT_BOOST",
          "title": "Hypothetical Part-Payment (\u20b928,500 Downpayment)",
          "description": "If the retailer supports split payment: pay \u20b928,500 upfront from surplus savings. Drops monthly EMI to \u20b914,400/mo while keeping 3-month runway.",
          "suggested_monthly_emi": 14400.0,
          "suggested_tenure_months": 6,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe to Buy",
          "runway_after": 3.0,
          "money_saved": 0.0,
          "is_feasible": true
        }
      ],
      "explanation_bullets": null
    },
    "laptop_amit": {
      "verdict_level": "RISKY",
      "badge": "\ud83d\udd34 Risky Debt",
      "headline_reason": "Risky: triggers an immediate monthly cash-flow deficit of \u20b92,400/month.",
      "selected_option": {
        "option_id": "laptop_std_12m",
        "type": "STANDARD_EMI",
        "label": "Standard EMI (12 Months, 15% APR)",
        "tenure_months": 12,
        "monthly_installment": 13160.0,
        "upfront_downpayment": 0.0,
        "processing_fee": 999.0,
        "lost_cash_discount": 5000.0,
        "stated_interest_rate": 15.0
      },
      "true_cost": {
        "effective_annual_rate": 27.44,
        "nominal_annual_rate": 24.49,
        "total_outflow": 159098.82,
        "hidden_markup": 19098.82,
        "is_truly_zero_cost": false,
        "has_high_apr_alert": true
      },
      "impact": {
        "foir_before": 0.1709,
        "foir_after": 0.4521,
        "free_cash_before": 10760.0,
        "free_cash_after": -2400.0,
        "free_cash_ratio_after": -0.0513,
        "runway_months_before": 0.89,
        "runway_months_after": 0.89
      },
      "stress_tests": [
        {
          "scenario_name": "Income Shock (-20% Salary Cut)",
          "description": "Simulates unexpected loss of pay or salary slowdown.",
          "stressed_foir": 0.5652,
          "stressed_free_cash": -11760.0,
          "passes": false,
          "is_applicable": true,
          "warning": "A 20% salary cut triggers an immediate deficit of \u20b911,760/month."
        },
        {
          "scenario_name": "March TDS Shock (Tax Deduction Jump)",
          "description": "Under NEW regime, statutory tax requires zero investment proofs (\u20b90 March shock).",
          "stressed_foir": 0.4521,
          "stressed_free_cash": -2400.0,
          "passes": true,
          "is_applicable": false,
          "warning": null
        }
      ],
      "alternatives": [
        {
          "strategy": "BUY_CASH",
          "title": "Buy in Cash Today (Full Payment)",
          "description": "Not possible today: upfront price (\u20b9140,000) exceeds total savings (\u20b925,000).",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 1,
          "rescore_verdict": "RISKY",
          "rescore_badge": "\ud83d\udd34 Not Feasible",
          "runway_after": 0.89,
          "money_saved": 0.0,
          "is_feasible": false
        },
        {
          "strategy": "WAIT_AND_SAVE",
          "title": "Build 3-Month Emergency Cushion First",
          "description": "Your current cushion is low (0.89m). Save \u20b959,120 to build a 3-month safety fund before major discretionary purchases.",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 0,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe Goal",
          "runway_after": 3.0,
          "money_saved": 0.0,
          "is_feasible": true
        }
      ],
      "explanation_bullets": null
    },
    "iphone_vikram": {
      "verdict_level": "STRETCH",
      "badge": "\ud83d\udfe1 Budget Stretch",
      "headline_reason": "Budget stretch: consumes 22.7% of your salary and shrinks free cash to \u20b916,617.",
      "selected_option": {
        "option_id": "iphone_nocost_6m",
        "type": "NO_COST_EMI",
        "label": "No-Cost EMI (6 Months)",
        "tenure_months": 6,
        "monthly_installment": 19983.33,
        "upfront_downpayment": 0.0,
        "processing_fee": 199.0,
        "lost_cash_discount": 5000.0,
        "stated_interest_rate": 0.0
      },
      "true_cost": {
        "effective_annual_rate": 16.63,
        "nominal_annual_rate": 15.49,
        "total_outflow": 120134.8,
        "hidden_markup": 5234.8,
        "is_truly_zero_cost": false,
        "has_high_apr_alert": false
      },
      "impact": {
        "foir_before": 0.0,
        "foir_after": 0.2271,
        "free_cash_before": 36600.0,
        "free_cash_after": 16616.67,
        "free_cash_ratio_after": 0.1888,
        "runway_months_before": 3.89,
        "runway_months_after": 3.89
      },
      "stress_tests": [
        {
          "scenario_name": "Income Shock (-20% Salary Cut)",
          "description": "Simulates unexpected loss of pay or salary slowdown.",
          "stressed_foir": 0.2839,
          "stressed_free_cash": -983.33,
          "passes": false,
          "is_applicable": true,
          "warning": "A 20% salary cut triggers an immediate deficit of \u20b9983/month."
        },
        {
          "scenario_name": "March TDS Shock (Tax Deduction Jump)",
          "description": "Simulates missing investment proof deadlines under OLD regime.",
          "stressed_foir": 0.2271,
          "stressed_free_cash": -111183.33,
          "passes": false,
          "is_applicable": true,
          "warning": "Unsubmitted 80C/HRA proofs trigger a \u20b9127,800 March tax deduction spike."
        }
      ],
      "alternatives": [
        {
          "strategy": "BUY_CASH",
          "title": "Buy in Cash Today (Full Payment)",
          "description": "Pay \u20b9114,900 upfront. Post-purchase runway is 1.66 months (\u20b985,100 savings left).",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 1,
          "rescore_verdict": "RISKY",
          "rescore_badge": "\ud83d\udd34 Risky Debt",
          "runway_after": 1.66,
          "money_saved": 5234.8,
          "is_feasible": true
        },
        {
          "strategy": "WAIT_AND_SAVE",
          "title": "Wait 2 Months & Buy in Cash",
          "description": "Wait 2 months: save your uncommitted cash (\u20b936,600/mo) to buy in cash, saving \u20b95,235 while keeping your 3-month emergency cushion intact.",
          "suggested_monthly_emi": 0.0,
          "suggested_tenure_months": 2,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe Goal",
          "runway_after": 3.0,
          "money_saved": 5234.8,
          "is_feasible": true
        },
        {
          "strategy": "DOWNPAYMENT_BOOST",
          "title": "Hypothetical Part-Payment (\u20b945,800 Downpayment)",
          "description": "If the retailer supports split payment: pay \u20b945,800 upfront from surplus savings. Drops monthly EMI to \u20b911,517/mo while keeping 3-month runway.",
          "suggested_monthly_emi": 11516.67,
          "suggested_tenure_months": 6,
          "rescore_verdict": "COMFORTABLE",
          "rescore_badge": "\ud83d\udfe2 Safe to Buy",
          "runway_after": 3.0,
          "money_saved": 0.0,
          "is_feasible": true
        }
      ],
      "explanation_bullets": null
    }
  }
};

/**
 * Returns the canonical demo personas for 1-click loading.
 */
export function getDemoPersonas() {
  return [
    {
      id: "rahul",
      name: "Rahul Sharma",
      title: "12 LPA Fresher (Clean Slate)",
      profileId: "prof_rahul",
      inHandMonthly: 75000.0,
      currentSavings: 150000.0,
      existingEmiMonthly: 3500.0,
      taxRegime: "NEW",
      profile: MOCK_DATA.profiles.rahul
    },
    {
      id: "amit",
      name: "Amit Verma",
      title: "Junior Dev (Overleveraged)",
      profileId: "prof_amit",
      inHandMonthly: 46800.0,
      currentSavings: 25000.0,
      existingEmiMonthly: 8000.0,
      taxRegime: "NEW",
      profile: MOCK_DATA.profiles.amit
    },
    {
      id: "vikram",
      name: "Vikram Malhotra",
      title: "Senior Dev (Old Regime TDS Spike)",
      profileId: "prof_vikram",
      inHandMonthly: 88000.0,
      currentSavings: 200000.0,
      existingEmiMonthly: 0.0,
      taxRegime: "OLD",
      profile: MOCK_DATA.profiles.vikram
    }
  ];
}

/**
 * Resolves the golden pre-computed or dynamically computed verdict.
 * Used when CONFIG.MOCK_API is true.
 */
export function resolveMockVerdict({ productId = "", optionId = "", profileId = "", profile = null, listing = null } = {}) {
  const pid = (productId || "").toLowerCase();
  const optId = (optionId || "").toLowerCase();
  const profId = (profileId || profile?.profile_id || "").toLowerCase();

  const isAmit = profId.includes("amit");
  const isVikram = profId.includes("vikram");
  const isRahul = profId.includes("rahul") || (!isAmit && !isVikram);

  const isCash = optId.includes("cash") || optId === "cash_full";
  const isSony = pid.includes("sony") || pid.includes("wh1000xm5");
  const isIphone = pid.includes("iphone");
  const isLaptop = pid.includes("laptop") || pid.includes("rog");

  // =========================================================================
  // 1. Canonical Golden Fixtures for Scenario Testing
  // =========================================================================

  // Scenario 1: Rahul + Sony WH-1000XM5 + No-Cost EMI (30.74% EAR Markup)
  if (isSony && isRahul && !isCash) {
    return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.sony_rahul));
  }

  // Scenario 2: Vikram + iPhone 16 Pro + No-Cost EMI (March TDS Spike)
  if (isIphone && isVikram && !isCash) {
    return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.iphone_vikram));
  }

  // Scenario 3: Amit + Gaming Laptop + EMI (Risky Debt, Cash Deficit)
  if (isLaptop && isAmit && !isCash) {
    return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.laptop_amit));
  }

  // Scenario 2 (Rahul): Rahul + iPhone 16 Pro + No-Cost EMI (Budget Stretch)
  if (isIphone && isRahul && !isCash) {
    return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.iphone_rahul));
  }

  // =========================================================================
  // 2. Dynamic Evaluation for All Other Combinations (Amit, Vikram, Cash, Options)
  // =========================================================================

  // Resolve Profile Stats
  const activeProfile = profile || (isAmit ? MOCK_DATA.profiles.amit : (isVikram ? MOCK_DATA.profiles.vikram : MOCK_DATA.profiles.rahul));
  const takeHome = Number(activeProfile.in_hand_verified || activeProfile.gross_monthly || 75000);
  const currentSavings = Number(activeProfile.current_savings || 0);
  const existingEmi = Number(activeProfile.total_existing_emi_monthly || 0);
  const essentials = Number(activeProfile.essentials_monthly || (takeHome * 0.35 + (activeProfile.rent_monthly || 18000)));

  // Resolve Product Stats
  let cashPrice = 27990.0;
  let listPrice = 29990.0;
  let cashDiscount = 2000.0;
  let installment = 4998.33;
  let tenure = 6;
  let fee = 199.0;
  let prodTitle = "Sony WH-1000XM5";

  if (isIphone) {
    prodTitle = "iPhone 16 Pro";
    listPrice = 119900.0;
    cashDiscount = 5000.0;
    cashPrice = 114900.0;
    installment = optId.includes("12") ? 10483.33 : 19983.33;
    tenure = optId.includes("12") ? 12 : 6;
    fee = 199.0;
  } else if (isLaptop) {
    prodTitle = "ASUS ROG Strix G16";
    listPrice = 145000.0;
    cashDiscount = 5000.0;
    cashPrice = 140000.0;
    installment = 13160.0;
    tenure = 12;
    fee = 999.0;
  }

  // Extract option specifics if provided in listing payload
  if (listing && Array.isArray(listing.payment_options)) {
    const optObj = listing.payment_options.find((o) => (o.option_id || "").toLowerCase() === optId);
    if (optObj) {
      if (optObj.monthly_installment) installment = Number(optObj.monthly_installment);
      if (optObj.tenure_months) tenure = Number(optObj.tenure_months);
      if (optObj.processing_fee !== undefined) fee = Number(optObj.processing_fee);
    }
  }

  // 1. True Cost Calculation
  const totalOutflow = isCash ? cashPrice : Math.round((installment * tenure + fee) * 100) / 100;
  const hiddenMarkup = isCash ? 0.0 : Math.max(0, Math.round((totalOutflow - cashPrice) * 100) / 100);
  const ear = isCash ? 0.0 : (optId.includes("nocost") ? (tenure <= 6 ? 30.74 : 16.63) : 27.44);
  const hasHighApr = !isCash && ear >= 24.0;
  const isZeroCost = isCash || hiddenMarkup <= 0;

  // 2. Financial Impact Calculation
  const foirBefore = Math.round((existingEmi / takeHome) * 10000) / 10000;
  const foirAfter = Math.round(((existingEmi + (isCash ? 0 : installment)) / takeHome) * 10000) / 10000;

  const freeCashBefore = Math.round((takeHome - essentials - existingEmi) * 100) / 100;
  const freeCashAfter = Math.round((takeHome - essentials - existingEmi - (isCash ? 0 : installment)) * 100) / 100;
  const freeCashRatioAfter = Math.round((freeCashAfter / takeHome) * 10000) / 10000;

  const upfrontCost = isCash ? cashPrice : fee;
  const savingsAfter = Math.round((currentSavings - upfrontCost) * 100) / 100;
  const runwayBefore = essentials > 0 ? Math.round((currentSavings / essentials) * 100) / 100 : 3.0;
  const runwayAfter = essentials > 0 ? Math.round((Math.max(0, savingsAfter) / essentials) * 100) / 100 : 0.0;

  // 3. Dynamic Tier & Gating Logic
  let verdictLevel = "COMFORTABLE";
  let badge = "🟢 Safe to Buy";
  let headlineReason = "";
  let score = 88;

  // Case A: Cash payment but insufficient liquid savings
  if (isCash && currentSavings < cashPrice) {
    verdictLevel = "RISKY";
    badge = "🔴 Infeasible Cash";
    score = 22;
    headlineReason = `Not possible today: upfront price (₹${cashPrice.toLocaleString('en-IN')}) exceeds total liquid savings (₹${currentSavings.toLocaleString('en-IN')}).`;
  }
  // Case B: Cash payment leaves dangerous runway (< 1.5 months)
  else if (isCash && runwayAfter < 1.5) {
    verdictLevel = "STRETCH";
    badge = "🟡 Cushion Depletion";
    score = 52;
    headlineReason = `Full cash payment severely depletes emergency runway from ${runwayBefore.toFixed(1)}m down to ${runwayAfter.toFixed(1)}m.`;
  }
  // Case C: Cash payment safe and saves all hidden fees
  else if (isCash) {
    verdictLevel = "COMFORTABLE";
    badge = "🟢 Safe in Cash";
    score = 96;
    headlineReason = `Safe cash purchase: saves ₹${Math.round(cashDiscount).toLocaleString('en-IN')} instant discount while preserving a healthy ${runwayAfter.toFixed(1)}m emergency runway.`;
  }
  // Case D: Overleveraged EMI or negative free cash (Amit on iPhone or ROG)
  else if (freeCashAfter < 0 || foirAfter > 0.45 || runwayAfter < 1.0) {
    verdictLevel = (freeCashAfter < -3000 || foirAfter > 0.50) ? "DANGEROUS" : "RISKY";
    badge = verdictLevel === "DANGEROUS" ? "🔴 Dangerous Debt" : "🔴 Risky Debt";
    score = verdictLevel === "DANGEROUS" ? 18 : 34;
    headlineReason = freeCashAfter < 0
      ? `Risky: triggers an immediate monthly cash-flow deficit of ₹${Math.abs(Math.round(freeCashAfter)).toLocaleString('en-IN')}/month.`
      : `High debt load: committed loans consume ${(foirAfter * 100).toFixed(1)}% of your salary with low ${runwayAfter.toFixed(1)}m runway.`;
  }
  // Case E: Moderate stretch (FOIR > 20% or free cash ratio < 20%)
  else if (foirAfter > 0.20 || freeCashRatioAfter < 0.20 || runwayAfter < 2.5) {
    verdictLevel = "STRETCH";
    badge = "🟡 Budget Stretch";
    score = 64;
    headlineReason = `Budget stretch: consumes ${(foirAfter * 100).toFixed(1)}% of your salary and shrinks monthly uncommitted cash to ₹${Math.round(freeCashAfter).toLocaleString('en-IN')}.`;
  }
  // Case F: Fully comfortable (Vikram on Sony)
  else {
    verdictLevel = "COMFORTABLE";
    badge = "🟢 Safe to Buy";
    score = 88;
    headlineReason = `Budget-safe (${(foirAfter * 100).toFixed(1)}% FOIR), but financing costs ${ear}% EAR markup (₹${Math.round(hiddenMarkup).toLocaleString('en-IN')} lost).`;
  }

  return {
    verdict_level: verdictLevel,
    tier: verdictLevel,
    badge: badge,
    affordability_score: score,
    headline_reason: headlineReason,
    selected_option: {
      option_id: optId || (isCash ? "cash_full" : "emi_option"),
      type: isCash ? "CASH" : (optId.includes("nocost") ? "NO_COST_EMI" : "STANDARD_EMI"),
      label: isCash ? "Full Payment" : (optId.includes("nocost") ? `No-Cost EMI (${tenure} Months)` : `Standard EMI (${tenure} Months)`),
      tenure_months: tenure,
      monthly_installment: isCash ? cashPrice : installment,
      upfront_downpayment: isCash ? cashPrice : 0.0,
      processing_fee: isCash ? 0.0 : fee,
      lost_cash_discount: isCash ? 0.0 : cashDiscount,
      stated_interest_rate: isCash ? 0.0 : (optId.includes("std") ? 15.0 : 0.0)
    },
    true_cost: {
      effective_annual_rate: ear,
      nominal_annual_rate: isCash ? 0.0 : Math.round(ear * 0.88 * 100) / 100,
      total_outflow: totalOutflow,
      hidden_markup: hiddenMarkup,
      is_truly_zero_cost: isZeroCost,
      has_high_apr_alert: hasHighApr
    },
    impact: {
      foir_before: foirBefore,
      foir_after: foirAfter,
      free_cash_before: freeCashBefore,
      free_cash_after: freeCashAfter,
      free_cash_ratio_after: freeCashRatioAfter,
      runway_months_before: runwayBefore,
      runway_months_after: runwayAfter
    },
    stress_tests: [
      {
        scenario_name: "Income Shock (-20% Salary Cut)",
        description: "Simulates unexpected loss of pay or salary slowdown.",
        stressed_foir: Math.round(((existingEmi + (isCash ? 0 : installment)) / (takeHome * 0.8)) * 10000) / 10000,
        stressed_free_cash: Math.round((takeHome * 0.8 - essentials - existingEmi - (isCash ? 0 : installment)) * 100) / 100,
        passes: (takeHome * 0.8 - essentials - existingEmi - (isCash ? 0 : installment)) >= 0,
        is_applicable: true,
        warning: (takeHome * 0.8 - essentials - existingEmi - (isCash ? 0 : installment)) < 0
          ? "A 20% salary cut triggers an immediate monthly deficit."
          : null
      },
      {
        scenario_name: "March TDS Shock (Tax Deduction Jump)",
        description: activeProfile.tax_regime === "OLD"
          ? "Simulates missing investment proof deadlines under OLD regime."
          : "Under NEW regime, statutory tax requires zero investment proofs (₹0 March shock).",
        stressed_foir: foirAfter,
        stressed_free_cash: activeProfile.tax_regime === "OLD" ? freeCashAfter - 50000 : freeCashAfter,
        passes: activeProfile.tax_regime !== "OLD" || isCash,
        is_applicable: activeProfile.tax_regime === "OLD",
        warning: activeProfile.tax_regime === "OLD"
          ? "Unsubmitted 80C/HRA proofs trigger a sharp March tax deduction spike."
          : null
      }
    ],
    alternatives: [
      {
        strategy: "BUY_CASH",
        title: "Buy in Cash Today (Full Payment)",
        description: currentSavings >= cashPrice
          ? `Pay ₹${cashPrice.toLocaleString('en-IN')} upfront. Post-purchase runway is ${((currentSavings - cashPrice) / essentials).toFixed(1)} months.`
          : `Not possible today: upfront price (₹${cashPrice.toLocaleString('en-IN')}) exceeds total savings (₹${currentSavings.toLocaleString('en-IN')}).`,
        suggested_monthly_emi: 0.0,
        suggested_tenure_months: 1,
        rescore_verdict: currentSavings >= cashPrice ? "COMFORTABLE" : "RISKY",
        rescore_badge: currentSavings >= cashPrice ? "🟢 Safe to Buy" : "🔴 Not Feasible",
        runway_after: essentials > 0 ? Math.max(0, Math.round(((currentSavings - cashPrice) / essentials) * 100) / 100) : 0,
        money_saved: hiddenMarkup,
        is_feasible: currentSavings >= cashPrice
      },
      {
        strategy: "WAIT_AND_SAVE",
        title: freeCashBefore > 0 ? `Wait ${Math.max(1, Math.ceil((cashPrice - Math.max(0, currentSavings - (essentials * 3))) / freeCashBefore))} Months & Buy in Cash` : "Build Emergency Cushion First",
        description: `Save uncommitted cash to buy in cash, saving ₹${Math.round(hiddenMarkup).toLocaleString('en-IN')} without borrowing.`,
        suggested_monthly_emi: 0.0,
        suggested_tenure_months: 2,
        rescore_verdict: "COMFORTABLE",
        rescore_badge: "🟢 Safe Goal",
        runway_after: 3.0,
        money_saved: hiddenMarkup,
        is_feasible: true
      }
    ],
    explanation_bullets: null
  };
}

/**
 * Provides static grounded explanation bullets in English, Hindi, and Kannada.
 */
export function getMockExplanation(verdict, language = "en") {
  const ear = verdict?.true_cost?.effective_annual_rate ?? 30.74;
  const markup = verdict?.true_cost?.hidden_markup ? Math.round(verdict.true_cost.hidden_markup) : 2235;
  const runway = verdict?.impact?.runway_months_after ?? 3.7;

  if (language === "hi") {
    return {
      bullets: [
        `यह खरीदारी आपके मासिक बजट के अनुकूल है, लेकिन नो-कॉस्ट ईएमआई में ${ear}% का छुपा हुआ वार्षिक ब्याज (EAR) है।`,
        `नकद छूट छोड़ने और प्रोसेसिंग शुल्क के कारण आपको ₹${markup.toLocaleString('en-IN')} का अतिरिक्त भुगतान करना पड़ रहा है।`,
        `नकद भुगतान करने पर आपका आपातकालीन फंड सुरक्षित रहेगा (${runway} महीने का खर्च शेष)।`,
        `वेतन में 20% की कटौती की स्थिति में भी आपका मासिक बजट सकारात्मक रहेगा।`
      ],
      source: "template"
    };
  }

  if (language === "kn") {
    return {
      bullets: [
        `ಈ ಖರೀದಿಯು ನಿಮ್ಮ ಮಾಸಿಕ ಬಜೆಟ್‌ಗೆ ಸರಿಹೊಂದುತ್ತದೆ, ಆದರೆ ನೋ-ಕಾಸ್ಟ್ ಇಎಂಐ ನಲ್ಲಿ ${ear}% ಗುಪ್ತ ಬಡ್ಡಿ ದರ (EAR) ಇದೆ.`,
        `ಕ್ಯಾಶ್ ರಿಯಾಯಿತಿಯನ್ನು ತ್ಯಜಿಸುವುದರಿಂದ ನಿಮಗೆ ₹${markup.toLocaleString('en-IN')} ಹೆಚ್ಚುವರಿ ನಷ್ಟವಾಗುತ್ತದೆ.`,
        `ಪೂರ್ಣ ನಗದು ಪಾವತಿಯು ನಿಮ್ಮ ತುರ್ತು ನಿಧಿಯನ್ನು ರಕ್ಷಿಸುತ್ತದೆ (${runway} ತಿಂಗಳ ವೆಚ್ಚ ಲಭ್ಯ).`,
        `ವೇತನದಲ್ಲಿ 20% ಕಡಿತವಾದರೂ ನಿಮ್ಮ ಉಳಿತಾಯ ಸುರಕ್ಷಿತವಾಗಿರುತ್ತದೆ.`
      ],
      source: "template"
    };
  }

  // Default English
  return {
    bullets: [
      `Safe on your monthly cash flow, but the No-Cost EMI carries a hidden ${ear}% Effective Annual Rate (EAR).`,
      `Forfeiting the instant cash discount and paying processing fees results in ₹${markup.toLocaleString('en-IN')} in hidden markups.`,
      `Buying in cash preserves your emergency runway at ${runway} months of essential expenses.`,
      `Tested against a 20% income reduction: your free cash remains positive without distress.`
    ],
    source: "template"
  };
}
