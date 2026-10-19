/**
 * extension/content/card.js
 * Open Shadow DOM Verdict Card & Floating Launcher Component.
 * - Non-intrusive floating pill button docked in viewport
 * - Expandable copilot panel triggered on click (does NOT auto-popup)
 * - Close button (✕) and "Remove from page" option
 * - Strict implementation of ARCHITECTURE.md §8.6.
 */

export function getBankForOption(opt) {
  if (!opt) return 'Partner Bank';
  if (opt.bank_name) return opt.bank_name;
  if (opt.type === 'CASH') return 'Cash / UPI';
  const label = opt.label || '';
  const optId = opt.option_id || '';
  const isDebit = opt.instrument_type === 'DEBIT_CARD' || /debit/i.test(label) || /debit/i.test(optId);

  let baseBank = 'Partner Bank';
  if (/bajaj/i.test(label) || /bajaj/i.test(optId)) return 'Bajaj Finserv';
  if (/amazon\s*pay\s*later/i.test(label) || /amazonpaylater/i.test(optId)) return 'Amazon Pay Later';
  if (/flipkart\s*pay\s*later/i.test(label) || /flipkartpaylater/i.test(optId)) return 'Flipkart Pay Later';

  if (/hdfc/i.test(label) || /hdfc/i.test(optId)) baseBank = 'HDFC Bank';
  else if (/icici/i.test(label) || /icici/i.test(optId)) baseBank = 'ICICI Bank';
  else if (/sbi/i.test(label) || /sbi/i.test(optId)) baseBank = 'SBI Card';
  else if (/axis/i.test(label) || /axis/i.test(optId)) baseBank = 'Axis Bank';
  else if (/kotak/i.test(label) || /kotak/i.test(optId)) baseBank = 'Kotak Bank';
  else if (/citi/i.test(label) || /citi/i.test(optId)) baseBank = 'Citi Bank';
  else if (/amex/i.test(label) || /amex/i.test(optId)) baseBank = 'American Express';
  else if (/hsbc/i.test(label) || /hsbc/i.test(optId)) baseBank = 'HSBC Bank';
  else if (/onecard/i.test(label) || /onecard/i.test(optId)) baseBank = 'OneCard';
  else if (/rbl/i.test(label) || /rbl/i.test(optId)) baseBank = 'RBL Bank';

  if (isDebit && !baseBank.includes('Debit')) {
    return `${baseBank} (Debit Card)`;
  }
  return baseBank;
}

export class PaylensCard {
  constructor() {
    this.host = null;
    this.shadowRoot = null;
    this.currentMount = null;
    this.currentListing = null;
    this.currentVerdict = null;
    this.currentLanguage = 'en';
    this.selectedBankFilter = null;
    this.activeSelectedOptionId = null;
    this.isOpen = false; // Closed by default: non-intrusive floating trigger
    this.isDismissed = false;
    this.callbacks = {};
  }

  /**
   * Formats a numeric value into an Indian Rupee string (e.g. ₹27,990.00).
   */
  static formatINR(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '₹0.00';
    return '₹' + Number(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /**
   * Formats a decimal ratio into a percentage string (e.g. 0.1133 -> 11.3%).
   */
  static formatRatioPercent(ratio) {
    if (ratio === null || ratio === undefined || isNaN(ratio)) return '0.0%';
    return (Number(ratio) * 100).toFixed(1) + '%';
  }

  /**
   * Injects or binds the open shadow root at document.body for fixed floating positioning.
   */
  mount(mountElement) {
    this.currentMount = mountElement;

    // Attach host to document.body so the floating button & panel are fixed in viewport
    let existingHost = document.getElementById('paylens-host');
    if (!existingHost) {
      existingHost = document.createElement('div');
      existingHost.id = 'paylens-host';
      document.body.appendChild(existingHost);
    }
    this.host = existingHost;

    if (this.isDismissed) {
      this.isDismissed = false;
    }
    this.host.style.display = 'block';

    if (!this.host.shadowRoot) {
      this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    } else {
      this.shadowRoot = this.host.shadowRoot;
    }

    return true;
  }

  /**
   * Generates the CSS link / inline styles inside the shadow root.
   */
  _getStyleTag() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const cssUrl = chrome.runtime.getURL('content/card.css');
        return `<link rel="stylesheet" href="${cssUrl}">`;
      }
    } catch (_) {}
    return `<link rel="stylesheet" href="card.css">`;
  }

  /**
   * Toggles the copilot panel open/closed.
   */
  togglePanel() {
    this.isDismissed = false;
    if (this.host) {
      this.host.style.display = 'block';
    }
    this.isOpen = !this.isOpen;
    this._updatePanelVisibility();
  }

  openPanel() {
    this.isDismissed = false;
    if (this.host) {
      this.host.style.display = 'block';
    }
    this.isOpen = true;
    this._updatePanelVisibility();
  }

  closePanel() {
    this.isOpen = false;
    this._updatePanelVisibility();
  }

  dismiss() {
    this.isDismissed = true;
    this.isOpen = false;
    if (this.host) {
      this.host.style.display = 'none';
    }
  }

  _updatePanelVisibility() {
    if (!this.shadowRoot) return;
    const panel = this.shadowRoot.querySelector('.paylens-panel-wrapper');
    const trigger = this.shadowRoot.querySelector('.paylens-floating-trigger');

    if (panel) {
      if (this.isOpen) {
        panel.classList.remove('panel-closed');
        panel.classList.add('panel-open');
      } else {
        panel.classList.remove('panel-open');
        panel.classList.add('panel-closed');
      }
    }
    if (trigger) {
      if (this.isOpen) {
        trigger.classList.add('trigger-active');
      } else {
        trigger.classList.remove('trigger-active');
      }
    }
  }

  // ==========================================================================
  // State 1: Loading
  // ==========================================================================
  renderLoading(message = 'Analyzing true financing cost & affordability...') {
    if (!this.shadowRoot || this.isDismissed) return;

    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      
      <!-- Collapsible Floating Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? 'panel-open' : 'panel-closed'}">
        <div class="paylens-card">
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill">Calculating</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-close-panel" type="button" title="Close Panel">✕</button>
            </div>
          </div>
          <div class="state-loading">
            <div class="shimmer-bar shimmer-badge"></div>
            <div class="shimmer-bar shimmer-headline"></div>
            <div class="shimmer-bar shimmer-box"></div>
            <p style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">${message}</p>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button -->
      <button class="paylens-floating-trigger ${this.isOpen ? 'trigger-active' : ''}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot loading"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-loading">Calculating...</span>
      </button>
    `;

    this._bindCommonEvents();
  }

  // ==========================================================================
  // State 2: No Profile (Onboarding CTA)
  // ==========================================================================
  renderNoProfile({ onOpenOptions, onLoadDemo } = {}) {
    if (!this.shadowRoot || this.isDismissed) return;

    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      
      <!-- Collapsible Floating Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? 'panel-open' : 'panel-closed'}">
        <div class="paylens-card">
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill">Setup Required</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-close-panel" type="button" title="Close Panel">✕</button>
            </div>
          </div>
          <div class="state-no-profile">
            <div class="no-profile-icon">🛡️</div>
            <h3 class="no-profile-title">No Payslip Profile Loaded</h3>
            <p class="no-profile-desc">
              Paylens calculates affordability from verified payslip take-home pay, not self-declared income.
            </p>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
              <button class="no-profile-btn btn-open-options" type="button">
                Open Options & Onboard
              </button>
              <button class="retry-btn btn-quick-demo" type="button">
                ⚡ Load Rahul (12 LPA Demo)
              </button>
            </div>
          </div>
          <div class="card-footer-dismiss">
            <button class="btn-remove-section" type="button">✕ Remove from this page</button>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button -->
      <button class="paylens-floating-trigger ${this.isOpen ? 'trigger-active' : ''}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot setup"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-setup">Setup Required</span>
      </button>
    `;

    this._bindCommonEvents();

    const openBtn = this.shadowRoot.querySelector('.btn-open-options');
    if (openBtn && onOpenOptions) openBtn.addEventListener('click', onOpenOptions);

    const demoBtn = this.shadowRoot.querySelector('.btn-quick-demo');
    if (demoBtn && onLoadDemo) demoBtn.addEventListener('click', onLoadDemo);
  }

  // ==========================================================================
  // State 3: Error
  // ==========================================================================
  renderError(message = 'Unable to evaluate affordability.', { onRetry } = {}) {
    if (!this.shadowRoot || this.isDismissed) return;

    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      
      <!-- Collapsible Floating Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? 'panel-open' : 'panel-closed'}">
        <div class="paylens-card">
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill" style="color: #f87171;">Notice</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-close-panel" type="button" title="Close Panel">✕</button>
            </div>
          </div>
          <div class="state-error">
            <h4 class="error-title">Evaluation Notice</h4>
            <p class="error-desc">${message}</p>
            <button class="retry-btn" type="button">Retry Check</button>
          </div>
          <div class="card-footer-dismiss">
            <button class="btn-remove-section" type="button">✕ Remove from this page</button>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button -->
      <button class="paylens-floating-trigger ${this.isOpen ? 'trigger-active' : ''}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot notice"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-notice">Notice</span>
      </button>
    `;

    this._bindCommonEvents();

    const retryBtn = this.shadowRoot.querySelector('.retry-btn');
    if (retryBtn && onRetry) retryBtn.addEventListener('click', onRetry);
  }

  // ==========================================================================
  // State 4: Full Verdict Breakdown
  // ==========================================================================
  renderVerdict(verdict, { onLanguageChange, onOpenOptions, onSelectOption, currentLanguage = 'en', listing = null, selectedOptionId = null } = {}) {
    if (!this.shadowRoot || !verdict || this.isDismissed) return;
    this.currentListing = listing;
    this.currentVerdict = verdict;
    this.currentLanguage = currentLanguage;
    this.activeSelectedOptionId = selectedOptionId;

    // Payment Option Selector Pills & Bank Filtering
    let paymentOptionsHtml = '';
    const paymentOptions = listing?.payment_options || [];
    if (paymentOptions.length > 1) {
      const activeOptId = selectedOptionId || verdict.selected_option?.option_id || paymentOptions[0].option_id;
      const activeOpt = paymentOptions.find(o => o.option_id === activeOptId);
      const activeOptBank = activeOpt ? getBankForOption(activeOpt) : null;

      // Extract unique banks (excluding Cash)
      const banks = [];
      for (const opt of paymentOptions) {
        if (opt.type !== 'CASH') {
          const b = getBankForOption(opt);
          if (b && !banks.includes(b)) {
            banks.push(b);
          }
        }
      }

      // Determine active bank filter
      if (!this.selectedBankFilter || (this.selectedBankFilter !== 'all' && !banks.includes(this.selectedBankFilter))) {
        this.selectedBankFilter = (activeOptBank && activeOptBank !== 'Cash / UPI') ? activeOptBank : (banks[0] || 'all');
      }

      // If active option bank changed, update selectedBankFilter to follow it
      if (activeOptBank && activeOptBank !== 'Cash / UPI' && this.selectedBankFilter !== 'all' && this.selectedBankFilter !== activeOptBank) {
        this.selectedBankFilter = activeOptBank;
      }

      const activeBank = this.selectedBankFilter;

      // Filter options to show: ALWAYS Cash, plus options matching activeBank (or all)
      const visibleOptions = paymentOptions.filter((opt) => {
        if (opt.type === 'CASH') return true;
        if (activeBank === 'all') return true;
        return getBankForOption(opt) === activeBank;
      });

      const pills = visibleOptions.map((opt) => {
        const isSelected = opt.option_id === activeOptId;
        const isDebit = opt.instrument_type === 'DEBIT_CARD' || /debit/i.test(opt.label) || /debit/i.test(opt.option_id);
        const isBnpl = opt.instrument_type === 'CARDLESS_BNPL' || /pay\s*later|bajaj/i.test(opt.label) || /paylater|bajaj/i.test(opt.option_id);
        const isNoCost = opt.type === 'NO_COST_EMI';

        let icon = '💳';
        if (opt.type === 'CASH') {
          icon = '💵';
        } else if (isBnpl) {
          icon = '🛍️';
        } else if (isDebit) {
          icon = '🏧';
        } else if (isNoCost) {
          icon = '⚡';
        }

        const costStr = opt.type === 'CASH'
          ? PaylensCard.formatINR(opt.monthly_installment)
          : `${PaylensCard.formatINR(opt.monthly_installment)}/mo`;

        // Format label cleanly
        let displayLabel = opt.label;
        if (opt.type !== 'CASH' && activeBank !== 'all') {
          const aprSuffix = opt.stated_interest_rate > 0 ? ` • ${opt.stated_interest_rate}% APR` : ' • 0% APR';
          displayLabel = `${opt.tenure_months} Months${aprSuffix}`;
        }

        return `
          <button class="option-pill ${isSelected ? 'active' : ''}" type="button" data-opt-id="${opt.option_id}" title="${opt.label}">
            <span class="opt-pill-title">${icon} ${displayLabel}</span>
            <span class="opt-pill-amount">${costStr}</span>
          </button>
        `;
      }).join('');

      // Group banks into categories: Credit, Debit, Cardless/BNPL
      const creditBanks = [];
      const debitBanks = [];
      const bnplBanks = [];

      for (const b of banks) {
        if (b.includes('Debit')) {
          debitBanks.push(b);
        } else if (b.includes('Pay Later') || b.includes('Bajaj')) {
          bnplBanks.push(b);
        } else {
          creditBanks.push(b);
        }
      }

      let bankGroupsHtml = '';
      if (creditBanks.length > 0) {
        bankGroupsHtml += `<optgroup label="Credit Cards">${creditBanks.map(b => `<option value="${b}" ${b === activeBank ? 'selected' : ''}>${b}</option>`).join('')}</optgroup>`;
      }
      if (debitBanks.length > 0) {
        bankGroupsHtml += `<optgroup label="Debit Cards (Min ₹5,000)">${debitBanks.map(b => `<option value="${b}" ${b === activeBank ? 'selected' : ''}>${b}</option>`).join('')}</optgroup>`;
      }
      if (bnplBanks.length > 0) {
        bankGroupsHtml += `<optgroup label="Cardless & BNPL">${bnplBanks.map(b => `<option value="${b}" ${b === activeBank ? 'selected' : ''}>${b}</option>`).join('')}</optgroup>`;
      }
      bankGroupsHtml += `<option value="all" ${activeBank === 'all' ? 'selected' : ''}>All Plans (${paymentOptions.length - 1} plans)</option>`;

      const bankDropdownHtml = banks.length > 1 ? `
        <div class="bank-dropdown-wrapper">
          <label for="paylensBankSelect" class="bank-select-label">Bank / Method:</label>
          <select id="paylensBankSelect" class="bank-select" aria-label="Filter EMI Plans by Bank or Instrument">
            ${bankGroupsHtml}
          </select>
        </div>
      ` : '';

      // Eligibility guidance banner for active selected option (Debit Card pre-approval or BNPL KYC)
      let eligibilityBannerHtml = '';
      if (activeOpt?.eligibility_note) {
        eligibilityBannerHtml = `
          <div class="eligibility-notice-banner">
            <span class="eligibility-icon">ℹ️</span>
            <span class="eligibility-text">${activeOpt.eligibility_note}</span>
          </div>
        `;
      }

      paymentOptionsHtml = `
        <div class="payment-options-selector">
          <div class="bank-selector-header">
            <span class="section-label-sm">Payment Plan to Evaluate:</span>
            ${bankDropdownHtml}
          </div>
          <div class="option-pills-row">
            ${pills}
          </div>
          ${eligibilityBannerHtml}
        </div>
      `;
    }

    const level = (verdict.verdict_level || 'COMFORTABLE').toUpperCase();
    const badgeClass = level === 'COMFORTABLE'
      ? 'badge-comfortable'
      : (level === 'STRETCH' ? 'badge-stretch' : 'badge-risky');

    const badgeIcon = level === 'COMFORTABLE' ? '🟢' : (level === 'STRETCH' ? '🟡' : '🔴');
    const tierDesc = verdict.badge ? verdict.badge.replace(/^[🟢🟡🔴]\s*/, '') : '';
    const badgeLabel = `${badgeIcon} ${level}${tierDesc ? ` • ${tierDesc}` : ''}`;

    const tc = verdict.true_cost || {};
    const ear = tc.effective_annual_rate ?? 0.0;
    const nominal = tc.nominal_annual_rate ?? 0.0;
    const totalOutflow = tc.total_outflow ?? 0.0;
    const hiddenMarkup = tc.hidden_markup ?? 0.0;
    const hasHighApr = tc.has_high_apr_alert || false;

    const imp = verdict.impact || {};
    const foirBefore = PaylensCard.formatRatioPercent(imp.foir_before);
    const foirAfter = PaylensCard.formatRatioPercent(imp.foir_after);
    const freeCash = PaylensCard.formatINR(imp.free_cash_after);
    const freeCashDanger = (imp.free_cash_after || 0) < 0;
    const runway = imp.runway_months_after !== undefined ? imp.runway_months_after.toFixed(1) : '0.0';

    // Stress tests
    const stressTests = verdict.stress_tests || [];
    const stressHtml = stressTests
      .filter((st) => st.is_applicable !== false)
      .map((st) => {
        const pass = st.passes;
        const icon = pass ? '✓' : '⚠️';
        const pillClass = pass ? 'pass' : 'fail';
        const pillText = pass ? 'Passes' : 'Fails Shock';
        const warning = st.warning ? `<p class="stress-warning-msg">${st.warning}</p>` : '';
        const stressedFreeCash = st.stressed_free_cash !== undefined ? PaylensCard.formatINR(st.stressed_free_cash) : '';

        return `
          <div class="stress-row ${pass ? '' : 'failed'}">
            <div class="stress-header">
              <span class="stress-title">${icon} ${st.scenario_name}</span>
              <span class="stress-status-pill ${pillClass}">${pillText} (${stressedFreeCash})</span>
            </div>
            ${warning}
          </div>
        `;
      }).join('');

    // Alternatives
    const alternatives = verdict.alternatives || [];
    const altsHtml = alternatives.map((alt) => {
      const isFeas = alt.is_feasible !== false;
      const rescoreBadge = alt.rescore_badge || (isFeas ? '🟢 Feasible' : '🔴 Not possible today');
      const savedBadge = alt.money_saved > 0
        ? `<span class="alt-savings-tag">Saves ${PaylensCard.formatINR(alt.money_saved)}</span>`
        : '';
      const runwayBadge = alt.runway_after > 0
        ? `<span style="font-size: 0.6875rem; color: #64748b;">Post-runway: ${alt.runway_after.toFixed(1)}m</span>`
        : '';

      return `
        <div class="alt-card ${isFeas ? '' : 'infeasible'}">
          <div class="alt-header">
            <span class="alt-title">${alt.title}</span>
            <span class="alt-badge-pill" style="background: ${isFeas ? '#ecfdf5' : '#f1f5f9'}; color: ${isFeas ? '#065f46' : '#64748b'};">
              ${rescoreBadge}
            </span>
          </div>
          <p class="alt-desc">${alt.description}</p>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
            ${savedBadge}
            ${runwayBadge}
          </div>
        </div>
      `;
    }).join('');

    // Explanations bullets
    const bullets = verdict.explanation_bullets || [
      `Safe on your monthly cash flow, but financing carries a hidden ${ear}% Effective Annual Rate.`,
      `Forfeiting the instant cash discount results in ${PaylensCard.formatINR(hiddenMarkup)} in lost markups.`,
      `Post-purchase emergency cushion remains intact at ${runway} months of expenses.`
    ];

    const bulletsHtml = bullets.map(b => `<li class="bullet-item">${b}</li>`).join('');

    const isConverted = Boolean(verdict.is_converted || (listing?.currency && listing.currency !== 'INR'));
    const currencyCode = verdict.currency || listing?.currency || 'INR';
    const currencySymbol = verdict.currency_symbol || listing?.currency_symbol || '₹';
    const originalPrice = verdict.original_price || listing?.original_price;
    const exchangeRate = verdict.exchange_rate || listing?.exchange_rate || 1.0;
    const inrPrice = listing?.effective_cash_price || listing?.upfront_cash_price || (originalPrice ? Math.round(originalPrice * exchangeRate) : null);

    let currencyBannerHtml = '';
    if (isConverted && originalPrice) {
      currencyBannerHtml = `
        <div class="currency-classification-banner">
          <div class="currency-tag-row">
            <span class="currency-badge">🌐 ${currencyCode} Classified</span>
            <span class="currency-orig-price">${currencySymbol}${Number(originalPrice).toLocaleString('en-US')}</span>
            <span class="currency-arrow">⇄</span>
            <span class="currency-inr-tag">₹${Number(inrPrice).toLocaleString('en-IN')} INR</span>
          </div>
          <div class="currency-fx-sub">
            Auto-converted at FX Rate 1 ${currencyCode} = ₹${Number(exchangeRate).toFixed(2)} INR to match verified Indian payslip.
          </div>
        </div>
      `;
    }

    const pillsText = isConverted && originalPrice
      ? `${currencySymbol}${Number(originalPrice).toLocaleString('en-US')} • ${badgeIcon} ${level}`
      : `${badgeIcon} ${level}`;

    // Render Floating Launcher & Copilot Panel
    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}

      <!-- Collapsible Floating Copilot Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? 'panel-open' : 'panel-closed'}">
        <div class="paylens-card">
          <!-- Brand Header -->
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill">Verified</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-settings" type="button" title="Open Profile Settings">
                ⚙️ Profile
              </button>
              <button class="btn-icon-link btn-close-panel" type="button" title="Minimize / Close Copilot Screen" aria-label="Close Copilot">
                ✕
              </button>
            </div>
          </div>

          <div class="card-body">
            <!-- Currency Classification Banner (if foreign currency detected) -->
            ${currencyBannerHtml}

            <!-- 0. Interactive Payment Option Selector (if options available) -->
            ${paymentOptionsHtml}

            <!-- 1. Badge & Headline Reason -->
            <div class="verdict-header-section">
              <div class="verdict-badge-row">
                <span class="verdict-badge ${badgeClass}">${badgeLabel}</span>
              </div>
              <p class="headline-reason-text">${verdict.headline_reason || 'Affordability evaluation completed.'}</p>
            </div>

            <!-- 2. True Cost Box -->
            <div class="true-cost-box">
              <div class="rates-row">
                <div class="rate-stat">
                  <span class="rate-label">Effective Annual Rate (EAR)</span>
                  <span class="rate-value ${hasHighApr ? 'highlight-red' : ''}">${ear}%</span>
                </div>
                <div class="rate-stat">
                  <span class="rate-label">Nominal APR</span>
                  <span class="rate-value">${nominal}%</span>
                </div>
              </div>
              <div class="outflow-comparison">
                <span>Total Outflow: <strong>${PaylensCard.formatINR(totalOutflow)}</strong></span>
                <span class="markup-amount">Hidden Markup: +${PaylensCard.formatINR(hiddenMarkup)}</span>
              </div>
            </div>

            <!-- High APR Alert Banner (Conditional) -->
            ${hasHighApr ? `
              <div class="high-apr-alert">
                <span class="alert-icon">⚠️</span>
                <div class="alert-content">
                  <h4>High APR Financing Alert (${ear}% EAR)</h4>
                  <p>Taking this No-Cost EMI forfeits cash discounts and incurs processing fees, resulting in <strong>+${PaylensCard.formatINR(hiddenMarkup)}</strong> in hidden markups vs cash upfront.</p>
                </div>
              </div>
            ` : ''}

            <!-- 3. Impact Grid -->
            <div class="impact-grid-section">
              <span class="section-label-sm">Cash-Flow Impact</span>
              <div class="impact-grid">
                <div class="impact-card">
                  <span class="impact-label">FOIR Debt Ratio</span>
                  <span class="impact-value">${foirAfter}</span>
                  <span class="impact-sub">From ${foirBefore}</span>
                </div>
                <div class="impact-card">
                  <span class="impact-label">Free Cash Remaining</span>
                  <span class="impact-value ${freeCashDanger ? 'impact-sub danger' : ''}">${freeCash}</span>
                  <span class="impact-sub">Monthly buffer</span>
                </div>
                <div class="impact-card">
                  <span class="impact-label">Emergency Runway</span>
                  <span class="impact-value">${runway}m</span>
                  <span class="impact-sub">Safety cushion</span>
                </div>
              </div>
            </div>

            <!-- 4. Stress Tests -->
            ${stressHtml ? `
              <div class="stress-tests-section">
                <span class="section-label-sm">Financial Resilience Stress Tests</span>
                ${stressHtml}
              </div>
            ` : ''}

            <!-- 5. Smart Alternatives -->
            ${altsHtml ? `
              <div class="alternatives-section">
                <span class="section-label-sm">Re-Scored Smart Alternatives</span>
                ${altsHtml}
              </div>
            ` : ''}

            <!-- 6. Regional Explanations -->
            <div class="explanations-section">
              <div class="lang-switch-row">
                <span class="lang-switch-title">Copilot Explanation</span>
                <div class="lang-pills">
                  <button class="lang-pill ${currentLanguage === 'en' ? 'active' : ''}" data-lang="en">EN</button>
                  <button class="lang-pill ${currentLanguage === 'hi' ? 'active' : ''}" data-lang="hi">HI</button>
                  <button class="lang-pill ${currentLanguage === 'kn' ? 'active' : ''}" data-lang="kn">KN</button>
                </div>
              </div>
              <ul class="bullets-list">
                ${bulletsHtml}
              </ul>
            </div>

            <!-- 7. Collapsible Assumptions Footer -->
            <div class="assumptions-footer">
              <button class="assumptions-toggle" type="button">
                <span>ⓘ Calculation Heuristics & Disclaimer</span>
                <span class="arrow">▼</span>
              </button>
              <div class="assumptions-content" hidden>
                Calculated via bisection IRR solver (XIRR methodology per RBI guidelines). All numbers are mathematically grounded against verified payslip take-home income. Not financial advice.
              </div>
            </div>

          </div>

          <!-- Bottom Dismiss Option -->
          <div class="card-footer-dismiss">
            <button class="btn-remove-section" type="button" title="Remove Paylens section from this page">
              ✕ Remove from this page
            </button>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button (Always visible unless dismissed) -->
      <button class="paylens-floating-trigger ${this.isOpen ? 'trigger-active' : ''}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot ${level.toLowerCase()}"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-${level.toLowerCase()}">${pillsText}</span>
      </button>
    `;

    // Bind event listeners inside shadow DOM
    this._bindCommonEvents();
    this._bindVerdictEvents({ onLanguageChange, onOpenOptions, onSelectOption });
  }

  _bindCommonEvents() {
    // Floating Trigger Button toggle
    const trigger = this.shadowRoot.querySelector('.paylens-floating-trigger');
    if (trigger) {
      trigger.addEventListener('click', () => {
        this.togglePanel();
      });
    }

    // Panel Close Button
    const closeBtn = this.shadowRoot.querySelector('.btn-close-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePanel();
      });
    }

    // Remove from Page Button
    const removeBtn = this.shadowRoot.querySelector('.btn-remove-section');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismiss();
      });
    }
  }

  _bindVerdictEvents({ onLanguageChange, onOpenOptions, onSelectOption } = {}) {
    // Option Pills (Interactive Payment Plan Switching)
    const optionPills = this.shadowRoot.querySelectorAll('.option-pill');
    optionPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const optId = pill.dataset.optId;
        if (optId && onSelectOption) {
          onSelectOption(optId);
        }
      });
    });

    // Bank Dropdown Change
    const bankSelect = this.shadowRoot.querySelector('#paylensBankSelect');
    if (bankSelect) {
      bankSelect.addEventListener('change', (e) => {
        const newBank = e.target.value;
        this.selectedBankFilter = newBank;
        // If switching to a specific bank, select its first plan
        if (newBank !== 'all' && onSelectOption) {
          const bankPlan = this.currentListing?.payment_options?.find(o => 
            getBankForOption(o) === newBank && o.type !== 'CASH'
          );
          if (bankPlan) {
            onSelectOption(bankPlan.option_id);
            return;
          }
        }
        // Otherwise re-render options with active filter
        this.renderVerdict(this.currentVerdict, {
          currentLanguage: this.currentLanguage,
          listing: this.currentListing,
          selectedOptionId: this.activeSelectedOptionId,
          onSelectOption,
          onOpenOptions,
          onLanguageChange
        });
      });
    }

    // Settings Button
    const settingsBtn = this.shadowRoot.querySelector('.btn-settings');
    if (settingsBtn && onOpenOptions) {
      settingsBtn.addEventListener('click', onOpenOptions);
    }

    // Language Switcher Pills
    const langPills = this.shadowRoot.querySelectorAll('.lang-pill');
    langPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const lang = pill.dataset.lang;
        if (lang && onLanguageChange) {
          onLanguageChange(lang);
        }
      });
    });

    // Assumptions Accordion Toggle
    const toggle = this.shadowRoot.querySelector('.assumptions-toggle');
    const content = this.shadowRoot.querySelector('.assumptions-content');
    if (toggle && content) {
      toggle.addEventListener('click', () => {
        const isHidden = content.hasAttribute('hidden');
        if (isHidden) {
          content.removeAttribute('hidden');
          toggle.querySelector('.arrow').textContent = '▲';
        } else {
          content.setAttribute('hidden', '');
          toggle.querySelector('.arrow').textContent = '▼';
        }
      });
    }
  }
}

export default PaylensCard;
