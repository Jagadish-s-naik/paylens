/**
 * extension/popup/popup.js
 * Logic for Paylens Action Popup Inspection Widget.
 * Implements ARCHITECTURE.md §8.2 & §8.3 and PLAN.md Sub-stage B.6 (Task B.6.1):
 * - Detects active storefront tab and product context (Sony, iPhone, Laptop, or Cash/EMI)
 * - Displays active verified financial profile snapshot
 * - 1-Click persona switcher dropdown for rapid judge demos
 * - Syncs profile instantly via service worker PROFILE_SET
 * - Previews dynamic evaluated verdict for the CURRENT product and persona
 * - Provides quick links to Options / Profile Builder page
 */

import { CONFIG } from '../config.js';
import { getDemoPersonas, resolveMockVerdict } from '../mock_data.js';

let demoPersonas = [];
let savedPulseTimer = null;
let currentProfile = null;
let activeProductContext = {
  productId: 'sony_wh1000xm5',
  optionId: 'sony_nocost_6m',
  title: 'Sony WH-1000XM5'
};

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

  // Populate persona dropdown
  setupPersonaDropdown();

  // Detect active product from current store tab
  await detectActiveStoreContext();

  // Load active profile and compute evaluation
  await loadActiveProfileAndVerdict();

  // Bind event listeners
  bindEvents();
});

function setupPersonaDropdown() {
  const select = document.getElementById('persona-select');
  if (!select) return;

  select.innerHTML = '';
  demoPersonas.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.title})`;
    select.appendChild(opt);
  });
}

/**
 * Detects the active storefront product by messaging the active tab
 * or inspecting the active tab URL.
 */
async function detectActiveStoreContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // 1. Try querying content script directly
    if (tab.id) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_SELECTION' });
        if (response?.ok && response.data?.productId) {
          activeProductContext.productId = response.data.productId;
          activeProductContext.optionId = response.data.optionId || 'cash_full';
          activeProductContext.title = response.data.title || formatProductTitle(response.data.productId);
          return;
        }
      } catch (_) {
        // Content script might not be injected on non-store tabs; fallback to URL
      }
    }

    // 2. Fallback to URL pattern inspection
    const url = (tab.url || '').toLowerCase();
    if (url.includes('iphone') || url.endsWith('#iphone')) {
      activeProductContext.productId = 'iphone_16_pro';
      activeProductContext.optionId = 'iphone_nocost_6m';
      activeProductContext.title = 'Apple iPhone 16 Pro';
    } else if (url.includes('laptop') || url.includes('rog') || url.endsWith('#laptop')) {
      activeProductContext.productId = 'asus_rog_strix';
      activeProductContext.optionId = 'laptop_std_12m';
      activeProductContext.title = 'ASUS ROG Strix G16';
    } else if (url.includes('sony') || url.endsWith('#sony')) {
      activeProductContext.productId = 'sony_wh1000xm5';
      activeProductContext.optionId = 'sony_nocost_6m';
      activeProductContext.title = 'Sony WH-1000XM5';
    }
  } catch (err) {
    console.warn('[Paylens Popup] Could not inspect active tab:', err);
  }
}

function formatProductTitle(pid = '') {
  const p = pid.toLowerCase();
  if (p.includes('iphone')) return 'Apple iPhone 16 Pro';
  if (p.includes('laptop') || p.includes('rog')) return 'ASUS ROG Strix G16';
  return 'Sony WH-1000XM5';
}

async function loadActiveProfileAndVerdict() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'PROFILE_GET' });
    if (res?.ok && res.data) {
      currentProfile = res.data;
    }
  } catch (err) {
    console.warn('[Paylens Popup] Failed to get profile:', err);
  }

  // If no profile yet, use first demo persona (Rahul)
  if (!currentProfile && demoPersonas.length > 0) {
    currentProfile = demoPersonas[0].profile;
  }

  if (currentProfile) {
    renderProfile(currentProfile);
    syncDropdownSelection(currentProfile);
  }

  // Compute live verdict for active store product + active profile
  refreshVerdictPreview();
}

function refreshVerdictPreview() {
  if (!currentProfile) return;

  const verdict = resolveMockVerdict({
    productId: activeProductContext.productId,
    optionId: activeProductContext.optionId,
    profileId: currentProfile.profile_id,
    profile: currentProfile
  });

  renderLastVerdict(verdict, activeProductContext.title);

  // Cache to storage
  chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.LAST_VERDICT]: verdict }).catch(() => {});
}

// ============================================================================
// 2. Rendering Functions
// ============================================================================

function renderProfile(p) {
  if (!p) return;

  // Snapshot header
  const takeHomeEl = document.getElementById('profile-take-home');
  const regimeEl = document.getElementById('profile-regime');
  const employerEl = document.getElementById('profile-employer');

  if (takeHomeEl) takeHomeEl.textContent = formatINR(p.in_hand_verified || p.gross_monthly || 0);
  if (regimeEl) {
    regimeEl.textContent = `${(p.tax_regime || 'NEW').toUpperCase()} REGIME`;
  }
  if (employerEl) employerEl.textContent = p.employer_name || 'Verified Payslip Profile';

  // Cushion stats
  const freeCashEl = document.getElementById('stat-free-cash');
  const runwayEl = document.getElementById('stat-runway');

  if (freeCashEl) freeCashEl.textContent = formatINR(p.free_cash_monthly || 0);
  if (runwayEl) {
    const runway = Number(p.emergency_runway_months || 0);
    runwayEl.textContent = `${runway.toFixed(2)} mo`;
  }

  // Committed EMIs
  const totalEmiEl = document.getElementById('total-emi-label');
  const emisListEl = document.getElementById('emis-list');

  const emis = p.existing_emis || [];
  const totalEmi = p.total_existing_emi_monthly || emis.reduce((sum, e) => sum + (Number(e.monthly_amount) || 0), 0);

  if (totalEmiEl) totalEmiEl.textContent = `${formatINR(totalEmi)}/mo`;

  if (emisListEl) {
    emisListEl.innerHTML = '';
    if (emis.length === 0) {
      const li = document.createElement('li');
      li.className = 'emi-item';
      li.innerHTML = '<span style="color: #64748b; font-style: italic;">No active EMIs or debts</span>';
      emisListEl.appendChild(li);
    } else {
      emis.forEach((emi) => {
        const li = document.createElement('li');
        li.className = 'emi-item';
        li.innerHTML = `
          <span>${emi.name || 'Debt / EMI'}</span>
          <strong>${formatINR(emi.monthly_amount)}/mo (${emi.tenure_remaining_months || 0}m left)</strong>
        `;
        emisListEl.appendChild(li);
      });
    }
  }
}

function syncDropdownSelection(p) {
  const select = document.getElementById('persona-select');
  if (!select) return;

  const profId = (p.profile_id || '').toLowerCase();
  for (const opt of select.options) {
    if (profId.includes(opt.value)) {
      select.value = opt.value;
      return;
    }
  }
}

function renderLastVerdict(verdict, productTitle = '') {
  const container = document.getElementById('last-verdict-container');
  const pill = document.getElementById('verdict-tier-pill');
  const titleEl = document.getElementById('verdict-product-title');
  const reason = document.getElementById('verdict-reason-preview');

  if (!container || !verdict) return;

  const tier = (verdict.verdict_level || verdict.tier || 'COMFORTABLE').toUpperCase();
  const score = verdict.affordability_score ?? 85;

  let tierEmoji = '🟢';
  let tierClass = 'tier-comfortable';
  if (tier === 'STRETCH') {
    tierEmoji = '🟡';
    tierClass = 'tier-stretch';
  } else if (tier === 'RISKY') {
    tierEmoji = '🟠';
    tierClass = 'tier-risky';
  } else if (tier === 'DANGEROUS') {
    tierEmoji = '🔴';
    tierClass = 'tier-dangerous';
  }

  if (pill) {
    pill.textContent = `${tierEmoji} ${tier} (${score}/100)`;
    pill.className = `verdict-tier-pill ${tierClass}`;
  }

  if (titleEl) {
    const title = productTitle || activeProductContext.title || 'Product';
    titleEl.textContent = title;
  }

  if (reason) {
    reason.textContent = verdict.headline_reason || verdict.reasoning || verdict.recommendation || 'Evaluated against verified financial profile.';
  }

  container.hidden = false;
}

// ============================================================================
// 3. User Interactions
// ============================================================================

function bindEvents() {
  // Persona switcher
  const select = document.getElementById('persona-select');
  if (select) {
    select.addEventListener('change', async (e) => {
      const selectedId = e.target.value;
      const persona = demoPersonas.find((p) => p.id === selectedId);
      if (!persona) return;

      currentProfile = persona.profile;

      // Update Profile UI
      renderProfile(currentProfile);

      // Re-evaluate verdict preview for this persona on the ACTIVE product
      refreshVerdictPreview();

      // Save via service worker
      try {
        await chrome.runtime.sendMessage({
          type: 'PROFILE_SET',
          payload: currentProfile
        });

        showSavedPulse();

        // Notify active tab to re-evaluate storefront if open
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, { type: 'PROFILE_UPDATED' }).catch(() => {
            // Ignore if content script not present on current tab
          });
        }
      } catch (err) {
        console.error('[Paylens Popup] Failed to save profile:', err);
      }
    });
  }

  // Open Options Page buttons
  const btnOptions = document.getElementById('btn-open-options');
  const btnQuickOptions = document.getElementById('btn-quick-options');

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  };

  if (btnOptions) btnOptions.addEventListener('click', openOptions);
  if (btnQuickOptions) btnQuickOptions.addEventListener('click', openOptions);
}

function showSavedPulse() {
  const pulseEl = document.getElementById('saved-pulse');
  if (!pulseEl) return;

  pulseEl.hidden = false;
  pulseEl.style.opacity = '1';

  if (savedPulseTimer) clearTimeout(savedPulseTimer);
  savedPulseTimer = setTimeout(() => {
    pulseEl.hidden = true;
  }, 1500);
}
