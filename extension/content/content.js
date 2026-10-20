/**
 * extension/content/content.js
 * Content Script Orchestrator.
 * Implements ARCHITECTURE.md §2 (Sequence Diagram) & §8.3:
 * Connects adapter extraction, service worker messaging, and shadow DOM card updates.
 */

import { getAdapter } from './adapters/index.js';
import { PaylensCard } from './card.js';
import { UniversalEmiExtractor } from './emi_extractor.js';

(async function initPaylensContentScript() {
  console.log('[Paylens Content] Initializing on:', window.location.href);

  // Initialize Card instance
  const card = new PaylensCard();
  let currentListing = null;
  let activeOptionOverride = null;
  let isEvaluating = false;
  let lastEvaluationKey = null;
  let adapter = getAdapter(window.location.href);
  let stopAdapterObserver = null;

  function bindAdapterObserver(adp) {
    if (stopAdapterObserver) {
      try { stopAdapterObserver(); } catch (_) {}
      stopAdapterObserver = null;
    }
    if (adp && typeof adp.observe === 'function') {
      stopAdapterObserver = adp.observe(document, () => {
        if (!chrome.runtime?.id) return;
        activeOptionOverride = null;
        evaluateAffordability();
      });
    }
  }

  if (adapter) {
    console.log('[Paylens Content] Matched adapter:', adapter.id);
    bindAdapterObserver(adapter);
  }

  async function evaluateAffordability() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
    if (isEvaluating) return;

    if (!adapter) {
      adapter = getAdapter(window.location.href);
      if (adapter) {
        bindAdapterObserver(adapter);
      }
    }
    if (!adapter) return;

    // 1. Extract and validate listing first before touching the DOM
    const listing = await Promise.resolve(adapter.extract(document));
    let selectedOptionId = activeOptionOverride || (await Promise.resolve(adapter.selectedOptionId(document)));

    if (!listing || !listing.product_id || !listing.upfront_cash_price || listing.upfront_cash_price <= 0) {
      return; // Non-product page or price unextractable: do not mount
    }

    // Ensure selectedOptionId is guaranteed to exist in listing.payment_options
    if (Array.isArray(listing.payment_options) && listing.payment_options.length > 0) {
      const exists = listing.payment_options.some(o => o.option_id === selectedOptionId);
      if (!exists) {
        const preferred = listing.payment_options.find(o => o.option_id === 'std_hdfc_3m' || o.option_id === 'std_hdfc_6m' || o.option_id === 'nocost_6m') ||
                          listing.payment_options.find(o => o.type !== 'CASH') ||
                          listing.payment_options[0];
        selectedOptionId = preferred ? preferred.option_id : listing.payment_options[0].option_id;
      }
    }

    if (!selectedOptionId) {
      return;
    }

    // 2. Locate Mount Point only for validated products
    const mountPoint = adapter.mountPoint(document) || document.body;
    if (!mountPoint) {
      return;
    }

    // 3. Attach Shadow DOM once product is confirmed
    card.mount(mountPoint);

    currentListing = listing;
    const activeOptObj = listing.payment_options?.find(o => o.option_id === selectedOptionId);
    const evaluationKey = `${listing.product_id}:${selectedOptionId}:${activeOptObj?.monthly_installment}:${activeOptObj?.bank_discount}`;
    if (evaluationKey === lastEvaluationKey) {
      return; // Deduplicate
    }

    isEvaluating = true;
    lastEvaluationKey = evaluationKey;
    card.renderLoading();

    try {
      if (!chrome.runtime?.id) return;
      const response = await chrome.runtime.sendMessage({
        type: 'AFFORD',
        payload: {
          listing: listing,
          selectedOptionId: selectedOptionId
        }
      });

      if (!response || !response.ok) {
        const err = response?.error;
        if (err?.code === 'NO_PROFILE') {
          card.renderNoProfile({
            onOpenOptions: () => {
              if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => {});
              }
            },
            onLoadDemo: async () => {
              if (!chrome.runtime?.id) return;
              // Quick-load Rahul Demo directly from service worker
              card.renderLoading('Loading Rahul Sharma (12 LPA) demo persona...');
              const demoProfilesRes = await chrome.runtime.sendMessage({ type: 'DEMO_PROFILES' });
              if (demoProfilesRes?.ok && demoProfilesRes.data?.length > 0) {
                await chrome.runtime.sendMessage({
                  type: 'PROFILE_SET',
                  payload: demoProfilesRes.data[0].profile
                });
                lastEvaluationKey = null;
                isEvaluating = false;
                evaluateAffordability();
              }
            }
          });
        } else {
          card.renderError(err?.message || 'Affordability evaluation failed.', {
            onRetry: () => {
              lastEvaluationKey = null;
              isEvaluating = false;
              evaluateAffordability();
            }
          });
        }
        return;
      }

      // Success: render full verdict breakdown
      const verdict = response.data;
      renderActiveVerdict(verdict, 'en', selectedOptionId);
    } catch (err) {
      if (!chrome.runtime?.id || err?.message?.includes('Extension context invalidated')) {
        return; // Suppress orphaned context errors after extension reloads
      }
      console.error('[Paylens Content] Evaluation error:', err);
      card.renderError(err.message || 'Error communicating with Paylens extension.', {
        onRetry: () => {
          lastEvaluationKey = null;
          isEvaluating = false;
          evaluateAffordability();
        }
      });
    } finally {
      isEvaluating = false;
    }
  }

  function renderActiveVerdict(verdict, language = 'en', activeOptionId = null) {
    const optId = activeOptionId || activeOptionOverride || adapter.selectedOptionId(document);
    card.renderVerdict(verdict, {
      currentLanguage: language,
      listing: currentListing,
      selectedOptionId: optId,
      onSelectOption: (newOptionId) => {
        activeOptionOverride = newOptionId;
        lastEvaluationKey = null;
        evaluateAffordability();
      },
      onOpenOptions: () => {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => {});
        }
      },
      onLanguageChange: async (newLang) => {
        try {
          if (!chrome.runtime?.id) return;
          const explainRes = await chrome.runtime.sendMessage({
            type: 'EXPLAIN',
            payload: { verdict, language: newLang }
          });
          if (explainRes?.ok && explainRes.data?.bullets) {
            verdict.explanation_bullets = explainRes.data.bullets;
            renderActiveVerdict(verdict, newLang, optId);
          }
        } catch (e) {
          if (chrome.runtime?.id && !e?.message?.includes('Extension context invalidated')) {
            console.warn('[Paylens Content] Language explanation error:', e);
          }
        }
      }
    });
  }

  // Listen for queries and persona changes
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!adapter) {
      adapter = getAdapter(window.location.href);
      if (adapter) bindAdapterObserver(adapter);
    }

    if (msg?.type === 'GET_ACTIVE_SELECTION') {
      (async () => {
        if (!adapter) {
          adapter = getAdapter(window.location.href);
          if (adapter) bindAdapterObserver(adapter);
        }
        if (!adapter) {
          sendResponse({ ok: false, data: { isProductPage: false } });
          return;
        }
        const listing = currentListing || (await Promise.resolve(adapter.extract(document)));
        const selectedOptionId = activeOptionOverride || (await Promise.resolve(adapter.selectedOptionId(document)));
        const isValid = Boolean(listing && listing.product_id && listing.upfront_cash_price > 0);
        sendResponse({
          ok: isValid,
          data: isValid ? {
            isProductPage: true,
            productId: listing.product_id,
            optionId: selectedOptionId || null,
            title: listing.title || null,
            retailer: listing.retailer || null,
            listing: listing
          } : {
            isProductPage: false
          }
        });
      })();
      return true;
    }
    if (msg?.type === 'PROFILE_UPDATED') {
      lastEvaluationKey = null;
      isEvaluating = false;
      evaluateAffordability();
    }
    if (msg?.type === 'RELAUNCH_COPILOT') {
      if (!adapter) {
        adapter = getAdapter(window.location.href);
        if (adapter) bindAdapterObserver(adapter);
      }
      card.isDismissed = false;
      if (card.host) {
        card.host.style.display = 'block';
      } else if (adapter) {
        const mountPoint = adapter.mountPoint(document) || document.body;
        card.mount(mountPoint);
      }
      card.openPanel();
      lastEvaluationKey = null;
      isEvaluating = false;
      evaluateAffordability();
      sendResponse({ ok: true, message: 'Copilot relaunched on page.' });
      return false;
    }
  });

  // Track SPA client-side URL changes
  let lastRecordedUrl = window.location.href;
  const onUrlChange = () => {
    if (window.location.href !== lastRecordedUrl) {
      lastRecordedUrl = window.location.href;
      const newAdapter = getAdapter(window.location.href);
      if (newAdapter) {
        adapter = newAdapter;
        bindAdapterObserver(adapter);
        lastEvaluationKey = null;
        isEvaluating = false;
        evaluateAffordability();
      }
    }
  };
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);

  // 4. Initial evaluation run with retry for delayed SPA rendering
  const runInitialEvaluations = () => {
    evaluateAffordability();
    setTimeout(evaluateAffordability, 500);
    setTimeout(evaluateAffordability, 1500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitialEvaluations);
  } else {
    runInitialEvaluations();
  }

  // 5. Observe on-page EMI modal interactions (e.g. user opens modal or changes bank tabs)
  UniversalEmiExtractor.observeEmiModal(document, () => {
    console.log('[Paylens Content] Detected EMI modal update in DOM. Re-evaluating with live bank data.');
    lastEvaluationKey = null;
    isEvaluating = false;
    evaluateAffordability();
  });
})();

