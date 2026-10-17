/**
 * Paylens — Interactive Client Controller
 * Manages 3-step Bento UI workflow, Chart.js salary waterfall,
 * live EMI & Hike sliders, multilingual switching, and No-Cost EMI reveal.
 */

// Global State
let currentStep = 1;
let currentLanguage = "en";
let activeSalaryData = {
  employee_name: "Demo User",
  company_name: "Acme Cloud Tech India Pvt Ltd",
  pay_period: "March 2026",
  basic: 40000.0,
  hra: 20000.0,
  special_allowance: 16000.0,
  other_earnings: 4000.0,
  gross_monthly: 80000.0,
  pf_employee: 4800.0,
  professional_tax: 200.0,
  tds: 3000.0,
  other_deductions: 0.0,
  net_pay: 72000.0
};
let latestTaxSummary = null;
let salaryChartInstance = null;

// Currency Formatter for Indian Rupee (e.g. ₹1,23,456)
function formatINR(amount) {
  if (isNaN(amount) || amount === null) return "₹0";
  const rounded = Math.round(amount);
  return "₹" + rounded.toLocaleString("en-IN");
}

// -------------------------------------------------------------
// Navigation & Step Management
// -------------------------------------------------------------
function switchStep(stepNum) {
  currentStep = stepNum;
  
  // Update view visibility
  document.querySelectorAll(".step-view").forEach((view, idx) => {
    if (idx + 1 === stepNum) {
      view.classList.add("active");
    } else {
      view.classList.remove("active");
    }
  });

  // Update Progress Chips
  document.querySelectorAll(".step-chip").forEach((chip, idx) => {
    if (idx + 1 === stepNum) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });

  // Update Dock Buttons
  document.querySelectorAll(".dock-nav .dock-btn").forEach((btn, idx) => {
    if (idx + 1 === stepNum) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // If entering Step 2, ensure chart renders cleanly
  if (stepNum === 2 && latestTaxSummary) {
    setTimeout(renderChart, 100);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleAssumptions() {
  const modal = document.getElementById("assumptions-modal");
  modal.classList.toggle("hidden");
}

// -------------------------------------------------------------
// File Upload & Drag-and-Drop
// -------------------------------------------------------------
let selectedUploadFile = null;

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    setFile(file);
  }
}

function setFile(file) {
  selectedUploadFile = file;
  document.getElementById("selected-file-name").textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  document.getElementById("btn-analyze-upload").disabled = false;
  document.getElementById("dropzone-prompt").innerHTML = `Ready to analyze <strong style="color:var(--accent-blue);">${file.name}</strong>`;
}

// Dropzone Drag-over events
const dropzone = document.getElementById("dropzone");
if (dropzone) {
  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) {
      setFile(file);
    }
  });
}

async function uploadAndExtract() {
  if (!selectedUploadFile) return;

  const loadingEl = document.getElementById("loading-state");
  const btnExtract = document.getElementById("btn-analyze-upload");
  
  loadingEl.classList.remove("hidden");
  btnExtract.disabled = true;

  const formData = new FormData();
  formData.append("file", selectedUploadFile);

  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    
    if (result.success && result.data) {
      activeSalaryData = result.data;
      populateReviewForm(result.data);
      await recalculateAll();
      switchStep(2);
    } else {
      alert(result.message || "Couldn't read the payslip automatically. Entering manual mode.");
      populateReviewForm(result.data || activeSalaryData);
      switchStep(2);
    }
  } catch (err) {
    console.error("Extraction error:", err);
    alert("Connection error. Switching to manual input mode.");
    switchStep(2);
  } finally {
    loadingEl.classList.add("hidden");
    btnExtract.disabled = false;
  }
}

// -------------------------------------------------------------
// Sample Payslip Loader (Demo User, ~80k gross)
// -------------------------------------------------------------
async function loadSamplePayslip() {
  try {
    const res = await fetch("/api/sample");
    const sample = await res.json();
    activeSalaryData = sample;
    populateReviewForm(sample);
    await recalculateAll();
    switchStep(2);
  } catch (err) {
    console.error("Error loading sample:", err);
    populateReviewForm(activeSalaryData);
    switchStep(2);
  }
}

function populateReviewForm(data) {
  document.getElementById("user-display-name").textContent = data.employee_name || "Fresher";
  document.getElementById("card-emp-name").textContent = (data.employee_name || "DEMO USER").toUpperCase();
  document.getElementById("card-period-val").textContent = (data.pay_period || "MARCH 2026").toUpperCase();

  document.getElementById("edit-gross").value = data.gross_monthly || 0;
  document.getElementById("edit-basic").value = data.basic || 0;
  document.getElementById("edit-hra").value = data.hra || 0;
  document.getElementById("edit-special").value = data.special_allowance || 0;
  document.getElementById("edit-pf").value = data.pf_employee || 0;
  document.getElementById("edit-pt").value = data.professional_tax || 0;
  document.getElementById("edit-tds").value = data.tds || 0;
  document.getElementById("edit-other-ded").value = data.other_deductions || 0;
}

// -------------------------------------------------------------
// Primary Deterministic Financial Calculation Engine
// -------------------------------------------------------------
async function recalculateAll() {
  // Read edited values
  activeSalaryData.gross_monthly = parseFloat(document.getElementById("edit-gross").value) || 0;
  activeSalaryData.basic = parseFloat(document.getElementById("edit-basic").value) || 0;
  activeSalaryData.hra = parseFloat(document.getElementById("edit-hra").value) || 0;
  activeSalaryData.special_allowance = parseFloat(document.getElementById("edit-special").value) || 0;
  activeSalaryData.pf_employee = parseFloat(document.getElementById("edit-pf").value) || 0;
  activeSalaryData.professional_tax = parseFloat(document.getElementById("edit-pt").value) || 0;
  activeSalaryData.tds = parseFloat(document.getElementById("edit-tds").value) || 0;
  activeSalaryData.other_deductions = parseFloat(document.getElementById("edit-other-ded").value) || 0;

  const rentMonthly = parseFloat(document.getElementById("input-rent").value) || 0;
  const isMetro = document.getElementById("toggle-metro").checked;
  const existingEMIs = parseFloat(document.getElementById("input-existing-emi").value) || 0;
  const other80c = parseFloat(document.getElementById("input-other-80c").value) || 0;
  const emiRatio = (parseFloat(document.getElementById("slider-emi-ratio").value) || 35) / 100.0;

  const requestBody = {
    payslip: activeSalaryData,
    rent_monthly: rentMonthly,
    is_metro: isMetro,
    existing_emis: existingEMIs,
    emi_ratio: emiRatio,
    other_80c_annual: other80c,
    other_80d_annual: 0.0,
    language: currentLanguage
  };

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const data = await res.json();
    latestTaxSummary = data;
    updateUIWithResults(data);
  } catch (err) {
    console.error("Analysis calculation error:", err);
  }
}

function updateUIWithResults(data) {
  const tax = data.tax_summary;
  const afford = data.affordability;

  // 1. Update Virtual Card & Stat Card
  const takeHomeFormatted = formatINR(tax.recommended_take_home);
  document.getElementById("card-takehome-val").textContent = takeHomeFormatted;
  document.getElementById("stat-monthly-takehome").innerHTML = `${takeHomeFormatted}<span class="stat-period">/month</span>`;
  document.getElementById("stat-gross-val").textContent = formatINR(tax.gross_monthly);

  const chosenTax = tax.better_regime === "NEW" ? tax.new_regime.monthly_tax : tax.old_regime.monthly_tax;
  document.getElementById("stat-tax-val").textContent = formatINR(chosenTax);

  // Take-home ratio progress bar
  const inHandPct = tax.gross_monthly > 0 ? Math.min(100, Math.round((tax.recommended_take_home / tax.gross_monthly) * 100)) : 0;
  document.getElementById("stat-inhand-pct").textContent = `${inHandPct}%`;
  document.getElementById("stat-progress-bar").style.width = `${inHandPct}%`;

  // 2. Regime Badge & Comparison Cards
  const regimeBadge = document.getElementById("regime-badge");
  regimeBadge.textContent = `Save ${formatINR(tax.annual_savings)}/yr with ${tax.better_regime}`;

  // New Regime Card
  document.getElementById("new-annual-tax").textContent = formatINR(tax.new_regime.total_annual_tax);
  document.getElementById("new-monthly-takehome").textContent = formatINR(tax.new_regime.monthly_take_home);

  // Old Regime Card
  document.getElementById("old-annual-tax").textContent = formatINR(tax.old_regime.total_annual_tax);
  document.getElementById("old-monthly-takehome").textContent = formatINR(tax.old_regime.monthly_take_home);
  document.getElementById("old-hra-exempt").textContent = formatINR(tax.old_regime.hra_exemption);
  document.getElementById("old-80c-deduct").textContent = formatINR(tax.old_regime.deduction_80c);

  const cardNew = document.getElementById("card-new-regime");
  const cardOld = document.getElementById("card-old-regime");
  const badgeNew = document.getElementById("badge-new-rec");
  const badgeOld = document.getElementById("badge-old-rec");

  if (tax.better_regime === "NEW") {
    cardNew.classList.add("recommended");
    cardOld.classList.remove("recommended");
    badgeNew.classList.remove("hidden");
    badgeOld.classList.add("hidden");
  } else {
    cardOld.classList.add("recommended");
    cardNew.classList.remove("recommended");
    badgeOld.classList.remove("hidden");
    badgeNew.classList.add("hidden");
  }

  // 3. Render Chart
  renderChart(data.chart_data);

  // 4. Update Gemini 5-Bullet Explanation
  renderBriefing(data.explanation_bullets);

  // 5. Update Step 3 Safe EMI
  updateSafeEMIDisplay(afford.safe_emi, afford.borrow_capacity_36m_12pct, tax.recommended_take_home, afford.emi_ratio_used, afford.existing_emis);

  // 6. Update Hike Simulation Preview
  const currentHike = parseInt(document.getElementById("hike-slider").value) || 15;
  updateHikeSimulation(currentHike);
}

// -------------------------------------------------------------
// Chart.js Salary Waterfall Chart
// -------------------------------------------------------------
function renderChart(chartData) {
  const ctx = document.getElementById("salaryChart");
  if (!ctx) return;

  if (salaryChartInstance) {
    salaryChartInstance.destroy();
  }

  const defaultData = chartData || (latestTaxSummary ? latestTaxSummary.chart_data : {
    labels: ["Gross Monthly", "PF", "Prof Tax", "Income Tax", "Net In-Hand"],
    values: [80000, 4800, 200, 0, 75000]
  });

  salaryChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: defaultData.labels,
      datasets: [{
        label: "Monthly INR",
        data: defaultData.values,
        backgroundColor: [
          "#94a3b8", // Gross (neutral)
          "#f87171", // PF (deduction)
          "#fb923c", // PT (deduction)
          "#f43f5e", // Tax (deduction)
          "#5478f0"  // Take-home (accent hero)
        ],
        borderRadius: 8,
        borderSkipped: false,
        barPercentage: 0.65
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return " " + formatINR(context.raw);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return "₹" + (value >= 1000 ? (value / 1000) + "k" : value);
            },
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
          },
          grid: { color: "#f1f5f9" }
        },
        x: {
          ticks: {
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
          },
          grid: { display: false }
        }
      }
    }
  });
}

function renderBriefing(bullets) {
  const listEl = document.getElementById("briefing-bullets-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!bullets || bullets.length === 0) {
    listEl.innerHTML = "<li>No briefing generated.</li>";
    return;
  }
  bullets.forEach(b => {
    const li = document.createElement("li");
    li.textContent = b;
    listEl.appendChild(li);
  });
}

// -------------------------------------------------------------
// Safe EMI Reactive Slider (Matches Python Server Formula)
// -------------------------------------------------------------
function updateSafeEMIFromSlider(ratioVal) {
  document.getElementById("ratio-display-val").textContent = `${ratioVal}%`;
  
  if (!latestTaxSummary) return;
  const takeHome = latestTaxSummary.tax_summary.recommended_take_home;
  const existingEMIs = parseFloat(document.getElementById("input-existing-emi").value) || 0;
  const ratio = parseFloat(ratioVal) / 100.0;

  // Exact Python formula match: safe_emi = (take_home * ratio) - existing_emis
  const safe = Math.max(0, (takeHome * ratio) - existingEMIs);

  // Exact Python annuity formula for 12% over 36 months
  const monthlyR = 0.12 / 12.0;
  const pv = safe > 0 ? safe * (1.0 - Math.pow(1.0 + monthlyR, -36)) / monthlyR : 0;

  updateSafeEMIDisplay(safe, pv, takeHome, ratio, existingEMIs);
}

function updateSafeEMIDisplay(safe, loanCap, takeHome, ratio, existingEMIs) {
  document.getElementById("safe-emi-display").textContent = formatINR(safe);
  document.getElementById("loan-cap-val").textContent = formatINR(loanCap);
  document.getElementById("safe-emi-math-note").textContent = 
    `(${formatINR(takeHome)} take-home × ${Math.round(ratio * 100)}%) - ${formatINR(existingEMIs)} existing EMIs`;
}

// -------------------------------------------------------------
// No-Cost EMI Truth Checker (IRR / Bisection Call)
// -------------------------------------------------------------
async function checkNoCostTruth() {
  const listedPrice = parseFloat(document.getElementById("nocost-price").value) || 0;
  const monthlyEMI = parseFloat(document.getElementById("nocost-emi").value) || 0;
  const months = parseInt(document.getElementById("nocost-months").value) || 1;
  const fee = parseFloat(document.getElementById("nocost-fee").value) || 0;
  const discount = parseFloat(document.getElementById("nocost-discount").value) || 0;

  try {
    const res = await fetch("/api/nocost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listed_price: listedPrice,
        monthly_emi: monthlyEMI,
        months: months,
        processing_fee: fee,
        upfront_discount: discount
      })
    });
    const data = await res.json();
    
    document.getElementById("reveal-ear-rate").textContent = `${data.effective_annual_rate}%`;
    document.getElementById("reveal-benchmark").textContent = data.benchmark_comparison || "Typical Personal Loan: 11% - 16%";
    
    if (data.is_truly_zero_cost) {
      document.getElementById("reveal-ear-rate").style.color = "#10b981";
      document.getElementById("reveal-extra-cost").innerHTML = 
        `🎉 This offer is genuinely <strong>0% interest</strong> with zero hidden markup!`;
    } else {
      document.getElementById("reveal-ear-rate").style.color = "#ef4444";
      document.getElementById("reveal-extra-cost").innerHTML = 
        `You pay an extra <strong>${formatINR(data.total_extra_cost)}</strong> in hidden fees (+18% GST) & lost cash discount compared to paying upfront.`;
    }
  } catch (err) {
    console.error("No-Cost calculation error:", err);
  }
}

// -------------------------------------------------------------
// Hike Simulator (Group C Wow Factor)
// -------------------------------------------------------------
function updateHikeSimulation(raisePct) {
  document.getElementById("hike-slider-val").textContent = `+${raisePct}% Raise`;
  
  const currentGross = activeSalaryData.gross_monthly || 80000;
  const factor = 1.0 + (parseFloat(raisePct) / 100.0);
  const newGross = currentGross * factor;

  // New regime estimation for live slider: Standard deduction 75k
  const taxableAnnual = Math.max(0, (newGross * 12) - 75000);
  let rawTax = 0;
  const slabs = [
    [0, 400000, 0.0],
    [400000, 800000, 0.05],
    [800000, 1200000, 0.10],
    [1200000, 1600000, 0.15],
    [1600000, 2000000, 0.20],
    [2000000, 2400000, 0.25],
    [2400000, Infinity, 0.30]
  ];
  for (const [lower, upper, rate] of slabs) {
    if (taxableAnnual > lower) {
      const chunk = Math.min(taxableAnnual, upper) - lower;
      rawTax += chunk * rate;
    }
  }
  let taxAfterRebate = taxableAnnual <= 1200000 ? 0 : Math.min(rawTax, taxableAnnual - 1200000);
  const totalTaxAnnual = taxAfterRebate * 1.04;
  const monthlyTax = totalTaxAnnual / 12.0;

  // Approximate scaled PF
  const newPF = (activeSalaryData.pf_employee || 4800) * factor;
  const newTakeHome = Math.round(newGross - newPF - 200 - monthlyTax);
  const newSafeEMI = Math.round(newTakeHome * 0.35);

  document.getElementById("hike-new-takehome").textContent = formatINR(newTakeHome);
  document.getElementById("hike-new-safe-emi").textContent = formatINR(newSafeEMI);
}

// -------------------------------------------------------------
// Multilingual Translation Switching (English / Hindi / Kannada)
// -------------------------------------------------------------
async function changeLanguage(langCode) {
  currentLanguage = langCode;
  
  try {
    // 1. Fetch cached UI labels
    const res = await fetch("/api/translate-ui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: langCode })
    });
    const labels = await res.json();
    applyUILabels(labels);

    // 2. Refresh 5-bullet briefing in new language if salary data exists
    if (latestTaxSummary) {
      const explainRes = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computed_data: {
            gross_monthly: activeSalaryData.gross_monthly,
            better_regime: latestTaxSummary.tax_summary.better_regime,
            annual_savings: latestTaxSummary.tax_summary.annual_savings,
            recommended_take_home: latestTaxSummary.tax_summary.recommended_take_home,
            safe_emi: latestTaxSummary.affordability.safe_emi,
            loan_capacity: latestTaxSummary.affordability.borrow_capacity_36m_12pct
          },
          language: langCode
        })
      });
      const explainData = await explainRes.json();
      renderBriefing(explainData.bullets);
    }
  } catch (err) {
    console.error("Translation switch error:", err);
  }
}

function applyUILabels(labels) {
  const map = {
    "tagline-text": labels.app_tagline,
    "label-step1": labels.nav_step1,
    "label-step2": labels.nav_step2,
    "label-step3": labels.nav_step3,
    "lbl-upload-heading": labels.upload_heading,
    "lbl-upload-sub": labels.upload_subheading,
    "btn-extract-text": labels.btn_extract,
    "lbl-rent": labels.monthly_rent_label,
    "lbl-metro": labels.metro_city_label,
    "lbl-existing-emi": labels.existing_emi_label,
    "lbl-review-heading": labels.review_heading,
    "lbl-verify-note": labels.verify_note,
    "lbl-new-regime": labels.new_regime_title,
    "lbl-old-regime": labels.old_regime_title,
    "lbl-chart-title": labels.waterfall_chart_title,
    "lbl-ai-briefing": labels.ai_explanation_title,
    "lbl-safe-emi-title": labels.safe_emi_title,
    "lbl-ratio-slider": labels.ratio_slider_label,
    "lbl-nocost-heading": labels.nocost_heading,
    "lbl-nocost-sub": labels.nocost_subheading
  };

  for (const [id, val] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el && val) {
      el.textContent = val;
    }
  }
}

// -------------------------------------------------------------
// Module Navigation & Multi-Feature Controllers
// -------------------------------------------------------------
let currentModule = "payslip";
let parentLetterLang = "en";
let isOfferInitialized = false;
let isLensInitialized = false;
let isAuditorInitialized = false;
let isLifePlanInitialized = false;

function switchModule(modName) {
  currentModule = modName;
  
  // 1. Toggle module views
  document.querySelectorAll(".module-view").forEach(v => {
    v.classList.remove("active");
  });
  const targetView = document.getElementById(`module-${modName}`);
  if (targetView) targetView.classList.add("active");

  // 2. Toggle module pills
  document.querySelectorAll(".module-pill").forEach(p => {
    p.classList.remove("active");
  });
  const targetPill = document.getElementById(`pill-mod-${modName}`);
  if (targetPill) targetPill.classList.add("active");

  // 3. Toggle sidebar dock buttons
  document.querySelectorAll(".dock-nav .dock-btn").forEach(b => {
    b.classList.remove("active");
  });
  const targetDockBtn = document.getElementById(`nav-btn-${modName}`);
  if (targetDockBtn) targetDockBtn.classList.add("active");

  // 4. Lazy initialize on first view switch
  if (modName === "offer" && !isOfferInitialized) {
    runOfferDecode();
    isOfferInitialized = true;
  } else if (modName === "lens" && !isLensInitialized) {
    runLensEvaluation();
    isLensInitialized = true;
  } else if (modName === "auditor" && !isAuditorInitialized) {
    loadSampleAuditCase();
    isAuditorInitialized = true;
  } else if (modName === "lifeplan" && !isLifePlanInitialized) {
    runLifePlan();
    isLifePlanInitialized = true;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// -------------------------------------------------------------
// Module 2: Offer Letter Decoder & Comparer
// -------------------------------------------------------------
function switchOfferMode(mode) {
  const singleSec = document.getElementById("offer-single-section");
  const compSec = document.getElementById("offer-compare-section");
  const btnSingle = document.getElementById("mode-btn-single-offer");
  const btnComp = document.getElementById("mode-btn-compare-offer");

  if (mode === "single") {
    singleSec.classList.remove("hidden");
    compSec.classList.add("hidden");
    btnSingle.classList.add("active");
    btnComp.classList.remove("active");
  } else {
    singleSec.classList.add("hidden");
    compSec.classList.remove("hidden");
    btnSingle.classList.remove("active");
    btnComp.classList.add("active");
  }
}

function loadSampleOffer(type) {
  if (type === "trap") {
    document.getElementById("offer-company").value = "MegaTech Global";
    document.getElementById("offer-role").value = "Associate Systems Engineer";
    document.getElementById("offer-ctc").value = 1400000;
    document.getElementById("offer-base").value = 800000;
    document.getElementById("offer-variable").value = 250000;
    document.getElementById("offer-bonus").value = 150000;
    document.getElementById("offer-clawback").value = 12;
    document.getElementById("offer-stocks").value = 200000;
    document.getElementById("offer-bond-months").value = 24;
    document.getElementById("offer-bond-penalty").value = 200000;
    document.getElementById("offer-notice").value = 90;
  } else {
    document.getElementById("offer-company").value = "CashFlow Labs Inc";
    document.getElementById("offer-role").value = "Junior Backend Developer";
    document.getElementById("offer-ctc").value = 1100000;
    document.getElementById("offer-base").value = 1000000;
    document.getElementById("offer-variable").value = 100000;
    document.getElementById("offer-bonus").value = 0;
    document.getElementById("offer-clawback").value = 0;
    document.getElementById("offer-stocks").value = 0;
    document.getElementById("offer-bond-months").value = 0;
    document.getElementById("offer-bond-penalty").value = 0;
    document.getElementById("offer-notice").value = 30;
  }
  runOfferDecode();
}

async function runOfferDecode() {
  const payload = {
    company_name: document.getElementById("offer-company").value || "MegaTech Global",
    role_title: document.getElementById("offer-role").value || "Graduate Trainee",
    annual_ctc: parseFloat(document.getElementById("offer-ctc").value) || 1400000,
    fixed_base: parseFloat(document.getElementById("offer-base").value) || 800000,
    variable_pay_annual: parseFloat(document.getElementById("offer-variable").value) || 0,
    joining_bonus: parseFloat(document.getElementById("offer-bonus").value) || 0,
    joining_bonus_clawback_months: parseInt(document.getElementById("offer-clawback").value) || 0,
    stocks_esops_annual: parseFloat(document.getElementById("offer-stocks").value) || 0,
    service_bond_months: parseInt(document.getElementById("offer-bond-months").value) || 0,
    bond_penalty_amount: parseFloat(document.getElementById("offer-bond-penalty").value) || 0,
    notice_period_days: parseInt(document.getElementById("offer-notice").value) || 30
  };

  try {
    const res = await fetch("/api/offer/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    document.getElementById("offer-ratio-badge").textContent = `${data.real_cash_ratio}% Real Cash Ratio`;
    document.getElementById("offer-guaranteed-inhand").innerHTML = `${formatINR(data.guaranteed_monthly_in_hand)}<span class="stat-period">/month guaranteed</span>`;
    document.getElementById("offer-ctc-tag").textContent = formatINR(data.annual_ctc);
    document.getElementById("offer-m1-tag").textContent = formatINR(data.first_month_in_hand);
    document.getElementById("offer-summary-text").textContent = data.summary_advice;
    document.getElementById("offer-traps-count-title").textContent = `${data.traps_detected.length} Fresher Traps Detected`;

    const trapsList = document.getElementById("offer-traps-list");
    if (trapsList) {
      if (data.traps_detected.length === 0) {
        trapsList.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; text-align:center; color:#10b981; font-weight:700;">✅ Clean Offer! No hidden traps or predatory bond clauses found.</div>`;
      } else {
        trapsList.innerHTML = data.traps_detected.map(t => `
          <div class="trap-card severity-${t.severity.toLowerCase()}">
            <div class="trap-card-header">
              <span class="trap-card-title">${t.title}</span>
              <span class="trap-severity-badge">${t.severity}</span>
            </div>
            <p class="trap-card-msg">${t.description}</p>
            ${t.financial_impact ? `<div class="trap-financial-impact">Financial Risk: ${t.financial_impact}</div>` : ''}
          </div>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Error decoding offer:", err);
  }
}

async function runOfferComparison() {
  const payload = {
    offer_a: {
      offer_id: "A",
      company_name: document.getElementById("comp-a-company").value || "Company A",
      annual_ctc: parseFloat(document.getElementById("comp-a-ctc").value) || 1400000,
      fixed_base: parseFloat(document.getElementById("comp-a-base").value) || 800000,
      variable_pay_annual: parseFloat(document.getElementById("comp-a-variable").value) || 0,
      stocks_esops_annual: parseFloat(document.getElementById("comp-a-stocks").value) || 0
    },
    offer_b: {
      offer_id: "B",
      company_name: document.getElementById("comp-b-company").value || "Company B",
      annual_ctc: parseFloat(document.getElementById("comp-b-ctc").value) || 1100000,
      fixed_base: parseFloat(document.getElementById("comp-b-base").value) || 1000000,
      variable_pay_annual: parseFloat(document.getElementById("comp-b-variable").value) || 0,
      stocks_esops_annual: parseFloat(document.getElementById("comp-b-stocks").value) || 0
    }
  };

  try {
    const res = await fetch("/api/offer/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    const resultBox = document.getElementById("offer-comparison-result");
    resultBox.classList.remove("hidden");
    
    document.getElementById("comp-winner-heading").textContent = `Winner: ${data.winner_name}`;
    document.getElementById("comp-winner-pill").textContent = `${data.better_guaranteed_offer} Wins (+${formatINR(Math.abs(data.monthly_in_hand_difference))}/mo Cash)`;
    document.getElementById("comp-verdict-desc").textContent = data.comparer_verdict;
    
    document.getElementById("th-comp-a").textContent = `${data.offer_a.company_name} (Offer A)`;
    document.getElementById("th-comp-b").textContent = `${data.offer_b.company_name} (Offer B)`;
    
    const tbody = document.getElementById("comp-table-body");
    tbody.innerHTML = `
      <tr>
        <td><strong>Headline CTC</strong></td>
        <td>${formatINR(data.offer_a.annual_ctc)}</td>
        <td>${formatINR(data.offer_b.annual_ctc)}</td>
        <td>${formatINR(data.offer_a.annual_ctc - data.offer_b.annual_ctc)}</td>
      </tr>
      <tr>
        <td><strong>Fixed Base Salary</strong></td>
        <td>${formatINR(data.offer_a.fixed_base)}</td>
        <td>${formatINR(data.offer_b.fixed_base)}</td>
        <td>${formatINR(data.offer_a.fixed_base - data.offer_b.fixed_base)}</td>
      </tr>
      <tr class="winner-row">
        <td><strong>Guaranteed Monthly In-Hand</strong></td>
        <td>${formatINR(data.offer_a.guaranteed_monthly_in_hand)}/mo</td>
        <td>${formatINR(data.offer_b.guaranteed_monthly_in_hand)}/mo</td>
        <td><strong>${formatINR(data.monthly_in_hand_difference)}/mo</strong></td>
      </tr>
      <tr>
        <td><strong>Real Cash Quality</strong></td>
        <td>${data.offer_a.real_cash_ratio}%</td>
        <td>${data.offer_b.real_cash_ratio}%</td>
        <td>${data.offer_b.real_cash_ratio - data.offer_a.real_cash_ratio}% better cash ratio</td>
      </tr>
      <tr>
        <td><strong>Fresher Traps Detected</strong></td>
        <td>${data.offer_a.traps_count} Traps</td>
        <td>${data.offer_b.traps_count} Traps</td>
        <td>${data.offer_a.traps_count > data.offer_b.traps_count ? 'Offer B has far fewer traps' : 'Equal'}</td>
      </tr>
    `;
  } catch (err) {
    console.error("Comparison error:", err);
  }
}

// -------------------------------------------------------------
// Module 3: Affordability Lens ("Snap & Decide")
// -------------------------------------------------------------
function loadLensPreset(type) {
  if (type === "iphone") {
    document.getElementById("lens-item").value = "iPhone 16 Pro (128GB)";
    document.getElementById("lens-price").value = 119900;
    document.getElementById("lens-emi").value = 19983;
    document.getElementById("lens-months").value = 6;
    document.getElementById("lens-fee").value = 999;
    document.getElementById("lens-discount").value = 3000;
  } else if (type === "headphones") {
    document.getElementById("lens-item").value = "Sony WH-1000XM5 ANC Headphones";
    document.getElementById("lens-price").value = 28000;
    document.getElementById("lens-emi").value = 4900;
    document.getElementById("lens-months").value = 6;
    document.getElementById("lens-fee").value = 500;
    document.getElementById("lens-discount").value = 1000;
  } else if (type === "bike") {
    document.getElementById("lens-item").value = "Royal Enfield Hunter 350";
    document.getElementById("lens-price").value = 150000;
    document.getElementById("lens-emi").value = 5500;
    document.getElementById("lens-months").value = 36;
    document.getElementById("lens-fee").value = 1500;
    document.getElementById("lens-discount").value = 5000;
  }
  runLensEvaluation();
}

async function runLensEvaluation() {
  const payload = {
    item_name: document.getElementById("lens-item").value || "Item",
    upfront_price: parseFloat(document.getElementById("lens-price").value) || 60000,
    monthly_emi: parseFloat(document.getElementById("lens-emi").value) || 10000,
    months: parseInt(document.getElementById("lens-months").value) || 6,
    processing_fee: parseFloat(document.getElementById("lens-fee").value) || 0,
    upfront_discount: parseFloat(document.getElementById("lens-discount").value) || 0,
    monthly_in_hand: parseFloat(document.getElementById("lens-salary").value) || activeSalaryData.net_pay || 72000,
    existing_emis: 0.0,
    emi_ratio: 0.35,
    financing_type: "NO_COST_EMI"
  };

  try {
    const res = await fetch("/api/lens/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    const banner = document.getElementById("lens-verdict-banner");
    banner.className = `lens-verdict-banner verdict-banner-${data.verdict_color.toLowerCase()}`;
    
    document.getElementById("lens-verdict-title").textContent = data.verdict_badge;
    document.getElementById("lens-verdict-sub").textContent = data.guidance;
    document.getElementById("lens-verdict-badge").textContent = data.verdict;
    
    document.getElementById("lens-m-apr").textContent = `${data.effective_annual_rate}%`;
    document.getElementById("lens-m-burn").textContent = `${data.salary_months_burned} Mos`;
    document.getElementById("lens-m-capacity").textContent = `${data.emi_burn_percentage}%`;
    document.getElementById("lens-detailed-advice").textContent = data.guidance;
  } catch (err) {
    console.error("Lens evaluation error:", err);
  }
}

// -------------------------------------------------------------
// Module 4: Payslip Auditor (Month-over-Month)
// -------------------------------------------------------------
async function loadSampleAuditCase() {
  const sampleSlips = [
    {
      employee_name: "Demo User",
      company_name: "Acme Tech",
      pay_period: "January 2026",
      gross_monthly: 80000.0,
      basic: 40000.0,
      hra: 20000.0,
      special_allowance: 16000.0,
      pf_employee: 4800.0,
      professional_tax: 200.0,
      tds: 2000.0,
      net_pay: 73000.0
    },
    {
      employee_name: "Demo User",
      company_name: "Acme Tech",
      pay_period: "February 2026",
      gross_monthly: 80000.0,
      basic: 40000.0,
      hra: 20000.0,
      special_allowance: 16000.0,
      pf_employee: 4800.0,
      professional_tax: 200.0,
      tds: 2000.0,
      net_pay: 73000.0
    },
    {
      employee_name: "Demo User",
      company_name: "Acme Tech",
      pay_period: "March 2026",
      gross_monthly: 80000.0,
      basic: 40000.0,
      hra: 20000.0,
      special_allowance: 16000.0,
      pf_employee: 4800.0,
      professional_tax: 200.0,
      tds: 14000.0, // March tax spike!
      net_pay: 61000.0
    }
  ];

  try {
    const res = await fetch("/api/audit/payslips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payslips: sampleSlips, state: "KA" })
    });
    const data = await res.json();
    
    document.getElementById("health-score-val").textContent = data.health_score;
    const angle = Math.round(data.health_score * 3.6);
    document.getElementById("health-circle").style.setProperty("--score-angle", `${angle}deg`);
    document.getElementById("auditor-summary-advice").textContent = data.summary_advice;
    
    const tagsContainer = document.getElementById("audited-months-tags");
    tagsContainer.innerHTML = data.months_audited.map(m => `<span class="compare-tag">${m}</span>`).join("");

    const list = document.getElementById("auditor-anomalies-list");
    list.innerHTML = data.anomalies.map(a => `
      <div class="anomaly-item ${a.severity.toLowerCase()}">
        <div class="anomaly-left">
          <h4>${a.title}</h4>
          <p>${a.message}</p>
        </div>
        <div class="anomaly-diff-badge">${a.difference >= 0 ? '+' : ''}${formatINR(a.difference)}</div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Auditor error:", err);
  }
}

function copyGrievanceEmail() {
  const text = document.getElementById("grievance-email-text").innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 Copied HR Grievance Email to clipboard!");
  }).catch(() => {
    showToast("Draft ready to copy.");
  });
}

// -------------------------------------------------------------
// Module 5: Life Plan Mode & WhatsApp Letter
// -------------------------------------------------------------
function changeParentLang(lang) {
  parentLetterLang = lang;
  document.getElementById("btn-parent-en").classList.toggle("active", lang === "en");
  document.getElementById("btn-parent-hi").classList.toggle("active", lang === "hi");
  document.getElementById("btn-parent-kn").classList.toggle("active", lang === "kn");
  runLifePlan();
}

async function runLifePlan() {
  const isMetro = document.getElementById("lp-metro-toggle").checked;
  const salary = parseFloat(document.getElementById("lp-salary").value) || activeSalaryData.net_pay || 72000;
  const cityName = document.getElementById("lp-city").value || (isMetro ? "Bengaluru" : "Pune");
  const goalName = document.getElementById("lp-goal-name").value || "Work Laptop";
  const goalTarget = parseFloat(document.getElementById("lp-goal-target").value) || 75000;
  const goalMonths = parseInt(document.getElementById("lp-goal-months").value) || 6;

  const payload = {
    monthly_in_hand: salary,
    is_metro: isMetro,
    city_name: cityName,
    goal: {
      name: goalName,
      target_amount: goalTarget,
      timeline_months: goalMonths
    },
    language: parentLetterLang
  };

  try {
    const res = await fetch("/api/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    document.getElementById("lp-tier-heading").textContent = data.city_tier;
    
    // Update bar widths
    const split = data.budget_split;
    const bNeeds = document.getElementById("lp-bar-needs");
    const bWants = document.getElementById("lp-bar-wants");
    const bSavings = document.getElementById("lp-bar-savings");

    bNeeds.style.width = `${split.needs_percentage}%`;
    bNeeds.textContent = `Needs ${split.needs_percentage}%`;
    bWants.style.width = `${split.wants_percentage}%`;
    bWants.textContent = `Wants ${split.wants_percentage}%`;
    bSavings.style.width = `${split.savings_percentage}%`;
    bSavings.textContent = `Savings ${split.savings_percentage}%`;

    document.getElementById("lp-val-needs").textContent = formatINR(split.needs_amount);
    document.getElementById("lp-val-wants").textContent = formatINR(split.wants_amount);
    document.getElementById("lp-val-savings").textContent = formatINR(split.savings_amount);

    // Emergency Fund
    document.getElementById("lp-emergency-target-tag").textContent = `Target: ${formatINR(data.emergency_fund.target_amount)}`;
    document.getElementById("lp-emergency-milestone-text").textContent = data.emergency_fund.milestone_text;
    document.getElementById("lp-emergency-monthly-val").textContent = `${formatINR(data.emergency_fund.monthly_allocation)}/mo`;

    // Parent WhatsApp Message
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("whatsapp-message-bubble").innerHTML = `${data.parent_explanation}\n<div class="whatsapp-time">${timeStr} ✓✓</div>`;
  } catch (err) {
    console.error("Life plan error:", err);
  }
}

function copyParentWhatsApp() {
  const bubble = document.getElementById("whatsapp-message-bubble");
  // Extract text content excluding the time div
  const clone = bubble.cloneNode(true);
  const timeEl = clone.querySelector(".whatsapp-time");
  if (timeEl) timeEl.remove();
  const text = clone.innerText.trim();

  navigator.clipboard.writeText(text).then(() => {
    showToast("📲 WhatsApp message copied! Ready to paste.");
  }).catch(() => {
    showToast("Message ready to copy.");
  });
}

// -------------------------------------------------------------
// Interactive Toast Notification
// -------------------------------------------------------------
function showToast(msg) {
  let toast = document.querySelector(".toast-popup");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast-popup";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>✨</span> <span>${msg}</span>`;
  toast.style.display = "flex";
  
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

// Initialize on page load with Sample Demo
document.addEventListener("DOMContentLoaded", () => {
  loadSamplePayslip();
});

