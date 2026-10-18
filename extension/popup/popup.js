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
  isProductPage: false,
  productId: null,
  optionId: null,
  title: null,
  retailer: null
};

function formatINR(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Validates whether a URL strictly matches a supported e-commerce product detail page.
 */
function isEcommerceProductUrl(url = '') {
  if (!url) return false;
  const u = url.toLowerCase();

  // 1. Amazon PDP
  if ((u.includes('amazon.in') || u.includes('amazon.com') || u.includes('amazon.')) &&
      (u.includes('/dp/') || u.includes('/gp/product/') || u.includes('/gp/aw/d/'))) {
    return true;
  }

  // 2. Flipkart PDP
  if (u.includes('flipkart.com') && (u.includes('/p/') || u.includes('pid=') || u.includes('/itm'))) {
    return true;
  }

  // 3. MockStore PDP
  if (u.includes('/mock-shop/') || u.includes('mock-shop')) {
    return true;
  }

  return false;
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
 * or strictly validating known e-commerce URL patterns.
 */
async function detectActiveStoreContext() {
  activeProductContext = {
    isProductPage: false,
    productId: null,
    optionId: null,
    title: null,
    retailer: null
  };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const tabUrl = (tab.url || '').toLowerCase();
    const isEcom = isEcommerceProductUrl(tabUrl);

    // 1. Try querying content script directly
    if (tab.id) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_SELECTION' });
        if (response?.ok && response.data?.isProductPage && response.data?.productId) {
          activeProductContext.isProductPage = true;
          activeProductContext.productId = response.data.productId;
          activeProductContext.optionId = response.data.optionId || 'cash_full';
          activeProductContext.title = response.data.title || formatProductTitle(response.data.productId);
          activeProductContext.retailer = response.data.retailer || 'Online Retailer';
          return;
        }
      } catch (_) {
        // Content script might not be injected on non-store tabs
      }
    }

    // 2. If content script didn't respond with a verified product, ONLY proceed if URL matches a known store PDP
    if (!isEcom) {
      activeProductContext.isProductPage = false;
      return;
    }

    // 3. Fallback to URL pattern inspection for recognized e-commerce PDPs only
    if (tabUrl.includes('amazon.')) {
      activeProductContext.isProductPage = true;
      activeProductContext.productId = 'amazon_item';
      activeProductContext.optionId = 'nocost_6m';
      activeProductContext.title = tab.title ? tab.title.split(':')[0].trim() : 'Amazon Product';
      activeProductContext.retailer = 'Amazon';
    } else if (tabUrl.includes('flipkart.')) {
      activeProductContext.isProductPage = true;
      activeProductContext.productId = 'flipkart_item';
      activeProductContext.optionId = 'nocost_6m';
      activeProductContext.title = tab.title ? tab.title.split('|')[0].trim() : 'Flipkart Product';
      activeProductContext.retailer = 'Flipkart';
    } else if (tabUrl.includes('/mock-shop/') || tabUrl.includes('mock-shop')) {
      activeProductContext.isProductPage = true;
      if (tabUrl.includes('iphone') || tabUrl.endsWith('#iphone')) {
        activeProductContext.productId = 'iphone_16_pro';
        activeProductContext.optionId = 'iphone_nocost_6m';
        activeProductContext.title = 'Apple iPhone 16 Pro';
      } else if (tabUrl.includes('laptop') || tabUrl.includes('rog') || tabUrl.endsWith('#laptop')) {
        activeProductContext.productId = 'asus_rog_strix';
        activeProductContext.optionId = 'laptop_std_12m';
        activeProductContext.title = 'ASUS ROG Strix G16';
      } else {
        activeProductContext.productId = 'sony_wh1000xm5';
        activeProductContext.optionId = 'sony_nocost_6m';
        activeProductContext.title = 'Sony WH-1000XM5';
      }
      activeProductContext.retailer = 'MockStore';
    }
  } catch (err) {
    console.warn('[Paylens Popup] Could not inspect active tab:', err);
  }
}

function formatProductTitle(pid = '') {
  const p = pid.toLowerCase();
  if (p.includes('iphone')) return 'Apple iPhone 16 Pro';
  if (p.includes('laptop') || p.includes('rog')) return 'ASUS ROG Strix G16';
  if (p.includes('sony')) return 'Sony WH-1000XM5';
  return 'E-Commerce Product';
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

  // Compute live verdict for active store product or load cached store evaluation
  await refreshVerdictPreview();
}

async function refreshVerdictPreview() {
  if (!currentProfile) return;

  const verdictContainer = document.getElementById('last-verdict-container');
  const standbyContainer = document.getElementById('standby-notice-container');

  // Case 1: Active tab is a verified e-commerce product
  if (activeProductContext.isProductPage && activeProductContext.productId) {
    const verdict = resolveMockVerdict({
      productId: activeProductContext.productId,
      optionId: activeProductContext.optionId,
      profileId: currentProfile.profile_id,
      profile: currentProfile
    });

    if (standbyContainer) standbyContainer.hidden = true;
    renderLastVerdict(verdict, activeProductContext.title, {
      boxHeader: 'Active Product Evaluation',
      isLive: true
    });

    // Cache to storage
    chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.LAST_VERDICT]: verdict }).catch(() => {});
    return;
  }

  // Case 2: Active tab is NOT an e-commerce product page (e.g. jagadish.linklee.in)
  // Check if we have a real store verdict cached from a recent visit
  try {
    const storageKey = CONFIG.STORAGE_KEYS.LAST_VERDICT;
    const stored = await chrome.storage.local.get(storageKey);
    const lastVerdict = stored[storageKey];

    if (lastVerdict && lastVerdict.headline_reason) {
      if (standbyContainer) standbyContainer.hidden = true;
      const lastTitle = lastVerdict.selected_option?.label
        ? `Last Store Visit: ${lastVerdict.selected_option.label}`
        : 'Recent Store Evaluation';
      renderLastVerdict(lastVerdict, lastTitle, {
        boxHeader: 'Last Store Evaluation',
        contextNote: 'Active tab is not an e-commerce product'
      });
      return;
    }
  } catch (_) {}

  // Case 3: No active product and no stored verdict -> Show clean Standby Mode
  if (verdictContainer) verdictContainer.hidden = true;
  if (standbyContainer) standbyContainer.hidden = false;
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

function renderLastVerdict(verdict, productTitle = '', options = {}) {
  const container = document.getElementById('last-verdict-container');
  const headerEl = document.getElementById('verdict-box-header');
  const pill = document.getElementById('verdict-tier-pill');
  const titleEl = document.getElementById('verdict-product-title');
  const contextEl = document.getElementById('verdict-context-tag');
  const reason = document.getElementById('verdict-reason-preview');

  if (!container || !verdict) return;

  if (headerEl) {
    headerEl.textContent = options.boxHeader || 'Current Product Evaluation';
  }

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
    titleEl.textContent = productTitle || activeProductContext.title || 'Product';
  }

  if (contextEl) {
    if (options.contextNote) {
      contextEl.textContent = options.contextNote;
      contextEl.hidden = false;
    } else {
      contextEl.hidden = true;
    }
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

  // Relaunch Copilot Screen on Page
  const btnRelaunch = document.getElementById('btn-relaunch-copilot');
  const relaunchStatus = document.getElementById('relaunch-status');

  if (btnRelaunch) {
    btnRelaunch.addEventListener('click', async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          btnRelaunch.disabled = true;
          await chrome.tabs.sendMessage(activeTab.id, { type: 'RELAUNCH_COPILOT' });
          if (relaunchStatus) {
            relaunchStatus.hidden = false;
            relaunchStatus.textContent = '✓ Copilot Relaunched on Page!';
            setTimeout(() => {
              if (relaunchStatus) relaunchStatus.hidden = true;
            }, 3000);
          }
        }
      } catch (err) {
        console.warn('[Paylens Popup] Failed to relaunch copilot on page:', err);
        if (relaunchStatus) {
          relaunchStatus.hidden = false;
          relaunchStatus.textContent = 'Notice: Refresh store page if not responding.';
          setTimeout(() => {
            if (relaunchStatus) relaunchStatus.hidden = true;
          }, 3000);
        }
      } finally {
        btnRelaunch.disabled = false;
      }
    });
  }
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
