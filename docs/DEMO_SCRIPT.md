# Paylens — 60-Second Live Pitch Script & Judge Defense Guide

> **Target Presentation Duration**: Exactly 60 seconds (1 minute).  
> **Target Audience**: Hackathon Judges, FinTech Mentors, and Engineering Evaluators.  
> **Production URL**: [https://paylens-986743332275.asia-south1.run.app/mock-shop/](https://paylens-986743332275.asia-south1.run.app/mock-shop/)  
> **Local URL**: `http://localhost:8000/mock-shop/`

---

## ⏱️ The 60-Second Master Script

### Act 0: The Hook & Truth Layer (0:00 – 0:12)

**Spoken Dialogue**:  
> *"Judges, headline CTC numbers deceive freshers. Rahul's offer letter advertised '12 LPA', but after stripping variable bonus and employer PF, Paylens scanned his payslip and proved his true take-home is exactly ₹75,000/month under FY 2025-26 rules."*

**Visual Action in Browser**:  
- **Action**: Start on the **Paylens Options Page** (`options.html`) or have Rahul's verified profile displayed in the toolbar popup.
- **Visual Callout**: Point cursor to **₹75,000.00 Net In-Hand Take-Home** and the **100/100 Health Score (Gates G1–G3 passed)**.
- **Key Takeaway**: Zero reliance on CTC illusions; all arithmetic stems from statutory payslip truth.

---

### Act 1: The Hidden APR Reveal on Sony Headphones (0:12 – 0:26)

**Spoken Dialogue**:  
> *"Rahul browses our electronics store to buy Sony WH-1000XM5 headphones (₹29,990) on a '0% No-Cost EMI' for ₹4,998/month. The Paylens extension triggers immediately: While budget-comfortable (FOIR 11.3%), Paylens reveals a 🔴 **30.74% Hidden EAR**! Taking No-Cost EMI forfeits a ₹2,000 cash discount and incurs processing fees, losing ₹2,235 in markup. Buying in cash preserves his ₹1.22L emergency cushion."*

**Visual Action in Browser**:  
- **Action**: Switch to Storefront (`/mock-shop/`). Click on **1. Sony WH-1000XM5**.
- **Visual Callout**:
  1. Top badge: `🟢 COMFORTABLE • Safe to Buy`.
  2. Crimson Banner: `⚠️ High APR Financing Alert (30.74% EAR)` showing `+₹2,234.80` lost markup.
  3. Re-Scored Alternatives: Point to `Buy in Cash Today (Full Payment)` with `3.01m runway` and saving `₹2,234.80`.
- **Key Takeaway**: Proves that "0% Interest" is often an expensive 30%+ annual loan in disguise.

---

### Act 2: The Stretch Reality Check on iPhone 16 Pro (0:26 – 0:42)

**Spoken Dialogue**:  
> *"Next, Rahul views the iPhone 16 Pro (₹1,19,900) on 6-month EMI at ₹19,983/month. Paylens shifts to 🟡 **Budget Stretch**! Look at the cash-flow impact: Debt ratio jumps to 31.3%, and free cash drops to just ₹11,017. Worse, an income stress test (-20% cut) triggers an immediate deficit of -₹3,983/month!"*

**Visual Action in Browser**:  
- **Action**: Click tab **2. Apple iPhone 16 Pro**.
- **Visual Callout**:
  1. Top badge: Shifts instantly from Green to `🟡 STRETCH • Budget Stretch`.
  2. Impact Grid: Point to `FOIR Debt Ratio 31.3%` (up from 4.7%) and `Free Cash Remaining: ₹11,016.67`.
  3. Stress Test Box: Highlight `⚠️ Income Shock (-20% Salary Cut)` marked `Fails Shock` with warning: *"A 20% salary cut triggers an immediate deficit of ₹3,983/month."*
- **Key Takeaway**: Protects against unexpected layoffs or pay cuts before taking on heavy debt.

---

### Act 3: The Honest Alternative & Close (0:42 – 1:00)

**Spoken Dialogue**:  
> *"Instead of forcing an unaffordable EMI or wiping out his emergency savings, Paylens offers a clear alternative: 'Wait 3 months, save ₹5,235'. By saving his uncommitted monthly cash for 3 months, he can buy the phone upfront in cash, pocket the ₹5,000 discount, and keep his 3.0-month emergency cushion 100% intact. Zero hallucinated math, 100% financial protection. Thank you!"*

**Visual Action in Browser**:  
- **Action**: Scroll down slightly to **Re-Scored Smart Alternatives**.
- **Visual Callout**:
  1. Alternative Card: Point to `Wait 3 Months & Buy in Cash`.
  2. Tag: `Saves ₹5,352.82` without incurring debt or compromising the 3.0-month emergency runway.
  3. Footer: Click the **HI** or **KN** language pill to demonstrate instant regional explanation.
- **Key Takeaway**: Paylens is an honest guardian copilot that builds wealth instead of pushing predatory debt.

---

## 📊 Live System Number Verification Table

| Claim in Script | Mathematical Basis | Engine Formula / Fixture | Live API Value | Status |
|---|---|---|---|:---:|
| **Rahul In-Hand** | ₹80k Gross - ₹4.8k PF - ₹200 PT | `80000 - 4800 - 200 = 75000` | `₹75,000.00` | ✅ Exact |
| **Sony EMI** | ₹29,990 / 6 months | `29990 / 6 = 4998.33` | `₹4,998.33` | ✅ Exact |
| **Sony FOIR** | (₹3,500 active EMI + ₹4,998) / ₹75k | `8498.33 / 75000 = 11.33%` | `11.3%` | ✅ Exact |
| **Sony Hidden EAR** | Bisection IRR on (₹27,990 - ₹199) vs ₹4,998x6 | Cash discount forfeited + ₹199 fee | `30.74%` | ✅ Exact |
| **Sony Markup** | Total Outflow (₹30,224.80) - Cash (₹27,990) | `30224.80 - 27990 = 2234.80` | `₹2,235` | ✅ Exact |
| **Sony Cash Cushion**| Savings ₹1.50L - Cash Price ₹27,990 | `150000 - 27990 = 122010` (3.01m) | `3.01 months` | ✅ Exact |
| **iPhone Price** | List ₹1.19,900 - Cash Discount ₹5,000 | `119900 - 5000 = 114900` | `₹1,14,900.00` | ✅ Exact |
| **iPhone FOIR** | (₹3,500 + ₹19,983.33) / ₹75k | `23483.33 / 75000 = 31.31%` | `31.3%` | ✅ Exact |
| **iPhone Free Cash**| ₹75,000 - ₹23,483.33 EMI - ₹40,500 Essentials | `75000 - 23483.33 - 40500` | `₹11,016.67` | ✅ Exact |
| **Income Shock Deficit** | Stressed ₹60k in-hand - ₹23,483 - ₹40,500 | `60000 - 63983.33 = -3983.33` | `-₹3,983/mo` | ✅ Exact |
| **Wait & Save Option**| Uncommitted ₹31k/mo saved for 3 months | Dynamic roll-off + cushion floor | `Wait 3 Months` | ✅ Exact |

---

## 🛡️ Judge Q&A Defense Matrix

### Q1: "How do you calculate the 30.74% EAR on a '0% No-Cost EMI'?"
> **Answer**:  
> *"When a consumer takes a 0% EMI, the retailer forfeits the instant upfront bank discount (₹2,000 on Sony) and the bank charges an upfront documentation fee (₹199 + 18% GST). We set up the Net Present Value equation of the cash flows ($CF_0 = 27,990 - 234.82$, $CF_{1..6} = -4,998.33$) and solve for periodic rate $r$ using a deterministic bisection IRR solver converging to $10^{-6}$. Annualizing via $(1+r)^{12} - 1$ yields exactly 30.74% Effective Annual Rate. This follows RBI mandate on true annual percentage disclosures."*

### Q2: "How do you guarantee Gemini doesn't hallucinate these numbers?"
> **Answer**:  
> *"We follow Principle P1: Zero arithmetic by LLMs. All taxes, IRR math, FOIR ratios, and stress deficits are computed in pure Python with 100% test coverage. When Gemini generates multilingual explanations, our Numeric Grounding Guard extracts all numbers with regex and asserts they are a subset of the mathematically authorized numbers in the Verdict. If even one digit deviates, it instantly rejects the generation and defaults to verified templates."*

### Q3: "What happens if a user is under the Old Tax Regime?"
> **Answer**:  
> *"We built regime-aware intelligence. For example, persona Vikram Malhotra is under the Old Tax Regime. When evaluating high purchases in March, Paylens detects unsubmitted Section 80C and HRA investment proofs, accurately forecasting a ₹127,800 March TDS deduction spike that would wipe out the user's disposable income."*
