/**
 * extension/content/card.js
 * Open Shadow DOM Verdict Card Component.
 * Strict implementation of ARCHITECTURE.md §8.6 and PLAN.md §3 (Tasks B.4.1 & B.4.2).
 */

export class PaylensCard {
  constructor() {
    this.host = null;
    this.shadowRoot = null;
    this.currentMount = null;
    this.currentVerdict = null;
    this.currentLanguage = 'en';
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
   * Injects or binds the open shadow root at the target mount point.
   */
  mount(mountElement) {
    if (!mountElement) return false;
    this.currentMount = mountElement;

    let existingHost = mountElement.querySelector('#paylens-host');
    if (!existingHost) {
      existingHost = document.createElement('div');
      existingHost.id = 'paylens-host';
      mountElement.appendChild(existingHost);
    }
    this.host = existingHost;

    if (!this.host.shadowRoot) {
      // Per Decision D12: Open Shadow DOM
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

  // ==========================================================================
  // State 1: Loading (Shimmer)
  // ==========================================================================
  renderLoading(message = 'Analyzing true financing cost & affordability...') {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      <div class="paylens-card">
        <div class="card-header-brand">
          <div class="brand-left">
            <span class="brand-title">Paylens Copilot</span>
            <span class="brand-pill">Calculating</span>
          </div>
        </div>
        <div class="state-loading">
          <div class="shimmer-bar shimmer-badge"></div>
          <div class="shimmer-bar shimmer-headline"></div>
          <div class="shimmer-bar shimmer-box"></div>
          <p style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">${message}</p>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // State 2: No Profile (Onboarding CTA)
  // ==========================================================================
  renderNoProfile({ onOpenOptions, onLoadDemo } = {}) {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      <div class="paylens-card">
        <div class="card-header-brand">
          <div class="brand-left">
            <span class="brand-title">Paylens Copilot</span>
            <span class="brand-pill">Setup Required</span>
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
      </div>
    `;

    const openBtn = this.shadowRoot.querySelector('.btn-open-options');
    if (openBtn && onOpenOptions) {
      openBtn.addEventListener('click', onOpenOptions);
    }

    const demoBtn = this.shadowRoot.querySelector('.btn-quick-demo');
    if (demoBtn && onLoadDemo) {
      demoBtn.addEventListener('click', onLoadDemo);
    }
  }

  // ==========================================================================
  // State 3: Error
  // ==========================================================================
  renderError(message = 'Unable to evaluate affordability.', { onRetry } = {}) {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      <div class="paylens-card">
        <div class="card-header-brand">
          <div class="brand-left">
            <span class="brand-title">Paylens Copilot</span>
            <span class="brand-pill" style="color: #f87171;">Notice</span>
          </div>
        </div>
        <div class="state-error">
          <h4 class="error-title">Evaluation Notice</h4>
          <p class="error-desc">${message}</p>
          <button class="retry-btn" type="button">Retry Check</button>
        </div>
      </div>
    `;

    const retryBtn = this.shadowRoot.querySelector('.retry-btn');
    if (retryBtn && onRetry) {
      retryBtn.addEventListener('click', onRetry);
    }
  }

  // ==========================================================================
  // State 4: Full Verdict Breakdown (Strict Order per §8.6)
  // ==========================================================================
  renderVerdict(verdict, { onLanguageChange, onOpenOptions, currentLanguage = 'en' } = {}) {
    if (!this.shadowRoot || !verdict) return;
    this.currentVerdict = verdict;
    this.currentLanguage = currentLanguage;

    const level = (verdict.verdict_level || 'COMFORTABLE').toUpperCase();
    const badgeClass = level === 'COMFORTABLE'
      ? 'badge-comfortable'
      : (level === 'STRETCH' ? 'badge-stretch' : 'badge-risky');

    const badgeIcon = level === 'COMFORTABLE' ? '🟢' : (level === 'STRETCH' ? '🟡' : '🔴');
    const badgeLabel = verdict.badge || `${badgeIcon} ${level}`;

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
      const rescoreBadge = alt.rescore_badge || (isFeas ? '🟢 Feasible' : '🔴 Infeasible');
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

    // Render Full Hierarchy
    this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
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
          </div>
        </div>

        <div class="card-body">
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
      </div>
    `;

    // Bind event listeners inside shadow DOM
    this._bindEvents({ onLanguageChange, onOpenOptions });
  }

  _bindEvents({ onLanguageChange, onOpenOptions } = {}) {
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
