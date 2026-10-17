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
 * Resolves the golden pre-computed verdict from local memory.
 * Used when CONFIG.MOCK_API is true.
 */
export function resolveMockVerdict({ productId = "", optionId = "", profileId = "" } = {}) {
  const pid = (productId || "").toLowerCase();
  const profId = (profileId || "").toLowerCase();

  // Vikram + iPhone 16 Pro (March TDS Shock)
  if (pid.includes("iphone") && (profId.includes("vikram") || profId.includes("prof_vikram"))) {
    return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.iphone_vikram));
  }

  // Amit + Gaming Laptop (Risky Scenario)
  if (pid.includes("laptop") || pid.includes("rog")) {
    return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.laptop_amit));
  }

  // Rahul + iPhone 16 Pro (Stretch Scenario)
  if (pid.includes("iphone")) {
    return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.iphone_rahul));
  }

  // Default: Rahul + Sony WH-1000XM5 (Comfortable Scenario with 30.74% Hidden EAR)
  return JSON.parse(JSON.stringify(MOCK_DATA.verdicts.sony_rahul));
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
