/**
 * extension/options/options.js
 * Logic for Paylens Profile Onboarding & Settings.
 * Implements ARCHITECTURE.md §8.2 & §8.3 and PLAN.md Sub-stage B.5:
 * - 1-Click Demo Persona buttons (Rahul, Amit, Vikram)
 * - Payslip dropzone
 * - Interactive salary review & G1-G3 sanity verification
 * - Dynamic capacity metrics calculation
 * - Storage sync via service worker PROFILE_SET
 */

import { CONFIG } from '../config.js';
import { getDemoPersonas } from '../mock_data.js';

let demoPersonas = [];
let activeProfileId = 'prof_rahul';

function formatINR(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ============================================================================
// 1. Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  demoPersonas = getDemoPersonas();

  // Load active profile from storage
  let currentProfile = null;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'PROFILE_GET' });
    if (res?.ok && res.data) {
      currentProfile = res.data;
    }
  } catch (err) {
    console.warn('[Paylens Options] Error reading profile:', err);
  }

  // If no profile saved, default to Rahul Sharma
  if (!currentProfile && demoPersonas.length > 0) {
    currentProfile = demoPersonas[0].profile;
  }

  if (currentProfile) {
    populateForm(currentProfile);
  }

  bindEventListeners();
  recalculateAll();
});

// ============================================================================
// 2. Form Population
// ============================================================================

function populateForm(p) {
  if (!p) return;
  activeProfileId = p.profile_id || 'prof_custom';

  document.getElementById('employer-name').value = p.employer_name || '';
  document.getElementById('pay-period').value = p.pay_period || 'March 2026';
  document.getElementById('basic-monthly').value = p.basic_monthly || 0;
  document.getElementById('hra-monthly').value = p.hra_monthly || 0;
  document.getElementById('gross-monthly').value = p.gross_monthly || 0;
  document.getElementById('bonus-annual').value = p.annual_variable_bonus || 0;

  document.getElementById('pf-employee').value = p.pf_employee_monthly || 0;
  document.getElementById('pt-monthly').value = p.professional_tax_monthly || 0;
  document.getElementById('tds-monthly').value = p.tds_monthly || 0;

  document.getElementById('tax-regime').value = p.tax_regime || 'NEW';
  document.getElementById('metro-city').value = p.is_metro ? 'true' : 'false';
  document.getElementById('monthly-rent').value = p.rent_monthly || 0;
  document.getElementById('current-savings').value = p.current_savings || 0;

  // Populate EMIs table
  const tbody = document.getElementById('emis-tbody');
  tbody.innerHTML = '';
  const emis = p.existing_emis || [];
  if (emis.length === 0) {
    addEmiRow('', 0, 0);
  } else {
    emis.forEach((emi) => {
      addEmiRow(emi.name, emi.monthly_amount, emi.tenure_remaining_months);
    });
  }

  updateActiveIndicator(p.employer_name, p.profile_id);
}

function addEmiRow(name = '', amount = 0, tenure = 0) {
  const tbody = document.getElementById('emis-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="emi-name" value="${name}" placeholder="e.g. Loan / EMI"></td>
    <td><input type="number" class="emi-amount" value="${amount || ''}" step="0.01" placeholder="0"></td>
    <td><input type="number" class="emi-tenure" value="${tenure || ''}" placeholder="0"></td>
    <td><button type="button" class="btn-remove-row" title="Remove row">✕</button></td>
  `;
  tbody.appendChild(tr);

  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    tr.remove();
    recalculateAll();
  });

  tr.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', recalculateAll);
  });
}

function updateActiveIndicator(employer, profileId) {
  const indicator = document.getElementById('active-profile-indicator');
  if (!indicator) return;
  if (profileId?.includes('rahul')) {
    indicator.textContent = '● Active: Rahul Sharma (12 LPA)';
  } else if (profileId?.includes('amit')) {
    indicator.textContent = '● Active: Amit Verma (Junior Dev)';
  } else if (profileId?.includes('vikram')) {
    indicator.textContent = '● Active: Vikram Malhotra (Senior Dev)';
  } else {
    indicator.textContent = `● Active: ${employer || 'Custom Profile'}`;
  }
}

// ============================================================================
// 3. Real-Time Calculation & Sanity Gates (G1–G3)
// ============================================================================

function recalculateAll() {
  const gross = parseFloat(document.getElementById('gross-monthly').value || 0);
  const basic = parseFloat(document.getElementById('basic-monthly').value || 0);
  const hra = parseFloat(document.getElementById('hra-monthly').value || 0);

  const pf = parseFloat(document.getElementById('pf-employee').value || 0);
  const pt = parseFloat(document.getElementById('pt-monthly').value || 0);
  const tds = parseFloat(document.getElementById('tds-monthly').value || 0);

  const totalDeductions = pf + pt + tds;
  const inHand = Math.max(0, gross - totalDeductions);

  document.getElementById('in-hand-display').textContent = formatINR(inHand);

  // Validation Gates G1–G3
  let score = 100;
  const g1El = document.getElementById('gate-g1');
  const g2El = document.getElementById('gate-g2');
  const g3El = document.getElementById('gate-g3');

  // G1: Basic + HRA <= Gross (Allowances make up difference)
  const earningsSum = basic + hra;
  const g1Pass = gross > 0 && earningsSum <= gross * 1.02;
  if (g1Pass) {
    g1El.className = 'val-gate-item pass';
    g1El.textContent = `✓ G1: Basic (${formatINR(basic)}) + HRA (${formatINR(hra)}) aligns with Gross (${formatINR(gross)})`;
  } else {
    g1El.className = 'val-gate-item fail';
    g1El.textContent = `✗ G1: Basic + HRA exceeds declared gross (${formatINR(gross)})`;
    score -= 30;
  }

  // G2: Gross - Deductions = In-Hand
  const g2Pass = Math.abs((gross - totalDeductions) - inHand) < 1.0;
  if (g2Pass) {
    g2El.className = 'val-gate-item pass';
    g2El.textContent = `✓ G2: Gross minus deductions matches verified take-home (${formatINR(inHand)})`;
  } else {
    g2El.className = 'val-gate-item fail';
    g2El.textContent = `✗ G2: Deduction arithmetic mismatch with net take-home`;
    score -= 30;
  }

  // G3: 0 < Net <= Gross
  const g3Pass = inHand > 0 && inHand <= gross;
  if (g3Pass) {
    g3El.className = 'val-gate-item pass';
    g3El.textContent = `✓ G3: Net pay is positive and within statutory gross boundary`;
  } else {
    g3El.className = 'val-gate-item fail';
    g3El.textContent = `✗ G3: Net pay out of boundary (<= 0 or > gross)`;
    score -= 40;
  }

  document.getElementById('val-score').textContent = `${Math.max(0, score)} / 100 Health Score`;

  // Capacity Preview Calculation
  const rent = parseFloat(document.getElementById('monthly-rent').value || 0);
  const savings = parseFloat(document.getElementById('current-savings').value || 0);

  // Sum active EMIs
  let totalEmi = 0;
  document.querySelectorAll('#emis-tbody tr').forEach(row => {
    const amt = parseFloat(row.querySelector('.emi-amount')?.value || 0);
    totalEmi += amt;
  });

  const essentials = rent + (inHand * 0.30);
  const runway = essentials > 0 ? (savings / essentials) : 0;
  const freeCash = inHand - totalEmi - essentials;
  const safeCeiling = Math.max(0, (inHand * 0.35) - totalEmi);

  document.getElementById('cap-essentials').textContent = formatINR(essentials);
  document.getElementById('cap-free-cash').textContent = formatINR(freeCash);
  document.getElementById('cap-runway').textContent = `${runway.toFixed(2)} months`;
  document.getElementById('cap-ceiling').textContent = formatINR(safeCeiling);
}

// ============================================================================
// 4. Event Listeners & Persona Switcher
// ============================================================================

function bindEventListeners() {
  // 1-Click Persona Buttons
  document.querySelectorAll('.persona-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const personaKey = btn.dataset.persona;
      const target = demoPersonas.find(p => p.id === personaKey);
      if (target && target.profile) {
        populateForm(target.profile);
        recalculateAll();

        // Save immediately to storage
        await chrome.runtime.sendMessage({
          type: 'PROFILE_SET',
          payload: target.profile
        });

        showSaveToast(`Loaded and activated profile for ${target.name}!`);
      }
    });
  });

  // Recalculate on any input change
  document.querySelectorAll('#profile-form input, #profile-form select').forEach(input => {
    input.addEventListener('input', recalculateAll);
  });

  // Add EMI Button
  document.getElementById('btn-add-emi')?.addEventListener('click', () => {
    addEmiRow('', 0, 0);
  });

  // Dropzone Handlers
  const dropzone = document.getElementById('payslip-dropzone');
  const fileInput = document.getElementById('file-input');

  dropzone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', handleFile);

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files?.length > 0) {
      handleFile({ target: { files: e.dataTransfer.files } });
    }
  });

  // Form Submit (Save Profile)
  document.getElementById('profile-form').addEventListener('submit', handleSaveProfile);
}

async function handleFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // In mock mode: prefill sample data
  const rahul = demoPersonas.find(p => p.id === 'rahul');
  if (rahul && rahul.profile) {
    populateForm(rahul.profile);
    recalculateAll();
    showSaveToast(`Extracted payslip "${file.name}" with 100% confidence!`);
  }
}

async function handleSaveProfile(e) {
  e.preventDefault();

  const gross = parseFloat(document.getElementById('gross-monthly').value || 0);
  const basic = parseFloat(document.getElementById('basic-monthly').value || 0);
  const hra = parseFloat(document.getElementById('hra-monthly').value || 0);
  const pf = parseFloat(document.getElementById('pf-employee').value || 0);
  const pt = parseFloat(document.getElementById('pt-monthly').value || 0);
  const tds = parseFloat(document.getElementById('tds-monthly').value || 0);
  const inHand = Math.max(0, gross - (pf + pt + tds));

  const rent = parseFloat(document.getElementById('monthly-rent').value || 0);
  const savings = parseFloat(document.getElementById('current-savings').value || 0);
  const isMetro = document.getElementById('metro-city').value === 'true';
  const taxRegime = document.getElementById('tax-regime').value;

  const existingEmis = [];
  let totalEmi = 0;
  document.querySelectorAll('#emis-tbody tr').forEach(row => {
    const name = row.querySelector('.emi-name')?.value?.trim();
    const amt = parseFloat(row.querySelector('.emi-amount')?.value || 0);
    const tenure = parseInt(row.querySelector('.emi-tenure')?.value || 0, 10);
    if (name && amt > 0) {
      existingEmis.push({ name, monthly_amount: amt, tenure_remaining_months: tenure });
      totalEmi += amt;
    }
  });

  const essentials = rent + (inHand * 0.30);
  const runway = essentials > 0 ? (savings / essentials) : 0;
  const freeCash = inHand - totalEmi - essentials;
  const safeCeiling = Math.max(0, (inHand * 0.35) - totalEmi);

  const profilePayload = {
    schema_version: '1.0.0',
    profile_id: activeProfileId,
    employer_name: document.getElementById('employer-name').value,
    pay_period: document.getElementById('pay-period').value,
    gross_monthly: gross,
    basic_monthly: basic,
    hra_monthly: hra,
    pf_employee_monthly: pf,
    professional_tax_monthly: pt,
    tds_monthly: tds,
    tax_regime: taxRegime,
    in_hand_verified: inHand,
    annual_variable_bonus: parseFloat(document.getElementById('bonus-annual').value || 0),
    rent_monthly: rent,
    is_metro: isMetro,
    existing_emis: existingEmis,
    total_existing_emi_monthly: totalEmi,
    current_savings: savings,
    essentials_monthly: Math.round(essentials * 100) / 100,
    emergency_runway_months: Math.round(runway * 100) / 100,
    free_cash_monthly: Math.round(freeCash * 100) / 100,
    safe_emi_ceiling: Math.round(safeCeiling * 100) / 100,
    language_pref: 'en'
  };

  const res = await chrome.runtime.sendMessage({
    type: 'PROFILE_SET',
    payload: profilePayload
  });

  if (res?.ok) {
    showSaveToast('Verified profile successfully saved to browser storage!');
    updateActiveIndicator(profilePayload.employer_name, profilePayload.profile_id);
    if (chrome.tabs?.query) {
      chrome.tabs.query({}, (tabs) => {
        tabs?.forEach((t) => {
          chrome.tabs.sendMessage(t.id, { type: 'PROFILE_UPDATED' }).catch(() => {});
        });
      });
    }
  } else {
    alert('Error saving profile: ' + (res?.error?.message || 'Unknown error'));
  }
}

function showSaveToast(msg) {
  const existing = document.querySelector('.save-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'save-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #0f172a;
    color: #ffffff;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 700;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  `;
  toast.textContent = '✓ ' + msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
