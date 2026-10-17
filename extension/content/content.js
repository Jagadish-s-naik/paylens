/**
 * extension/content/content.js
 * Content Script Orchestrator.
 * Implements ARCHITECTURE.md §2 (Sequence Diagram) & §8.3:
 * Connects adapter extraction, service worker messaging, and shadow DOM card updates.
 */

import { getAdapter } from './adapters/index.js';
import { PaylensCard } from './card.js';

(async function initPaylensContentScript() {
  console.log('[Paylens Content] Initializing on:', window.location.href);

  // 1. Resolve matching adapter
  const adapter = getAdapter(window.location.href);
  if (!adapter) {
    console.log('[Paylens Content] No adapter matches current URL. Sleeping.');
    return;
  }

  console.log('[Paylens Content] Matched adapter:', adapter.id);

  // 2. Initialize Card instance
  const card = new PaylensCard();
  let currentListing = null;
  let isEvaluating = false;
  let lastEvaluationKey = null;

  async function evaluateAffordability() {
    if (isEvaluating) return;

    // Locate Mount Point
    const mountPoint = adapter.mountPoint(document);
    if (!mountPoint) {
      console.warn('[Paylens Content] Mount point not found on page.');
      return;
    }

    // Attach Shadow DOM if not already mounted
    card.mount(mountPoint);

    // Extract listing and selected option
    const listing = adapter.extract(document);
    const selectedOptionId = adapter.selectedOptionId(document);

    if (!listing || !selectedOptionId) {
      console.log('[Paylens Content] Extraction yielded null or missing selected option.');
      return;
    }

    currentListing = listing;
    const evaluationKey = `${listing.product_id}:${selectedOptionId}`;
    if (evaluationKey === lastEvaluationKey) {
      return; // Deduplicate
    }

    isEvaluating = true;
    lastEvaluationKey = evaluationKey;
    card.renderLoading();

    try {
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
              if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
              } else {
                window.open(chrome.runtime.getURL('options/options.html'), '_blank');
              }
            },
            onLoadDemo: async () => {
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
      renderActiveVerdict(verdict);
    } catch (err) {
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

  function renderActiveVerdict(verdict, language = 'en') {
    card.renderVerdict(verdict, {
      currentLanguage: language,
      onOpenOptions: () => {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          window.open(chrome.runtime.getURL('options/options.html'), '_blank');
        }
      },
      onLanguageChange: async (newLang) => {
        try {
          const explainRes = await chrome.runtime.sendMessage({
            type: 'EXPLAIN',
            payload: { verdict, language: newLang }
          });
          if (explainRes?.ok && explainRes.data?.bullets) {
            verdict.explanation_bullets = explainRes.data.bullets;
            renderActiveVerdict(verdict, newLang);
          }
        } catch (e) {
          console.warn('[Paylens Content] Language explanation error:', e);
        }
      }
    });
  }

  // 3. Start observing option and product changes (150ms debounced)
  adapter.observe(document, () => {
    evaluateAffordability();
  });

  // Listen for queries and persona changes
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'GET_ACTIVE_SELECTION') {
      const listing = adapter.extract(document);
      const selectedOptionId = adapter.selectedOptionId(document);
      sendResponse({
        ok: true,
        data: {
          productId: listing?.product_id || null,
          optionId: selectedOptionId || null,
          title: listing?.title || null
        }
      });
      return false;
    }
    if (msg?.type === 'PROFILE_UPDATED') {
      lastEvaluationKey = null;
      isEvaluating = false;
      evaluateAffordability();
    }
  });

  // 4. Initial evaluation run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', evaluateAffordability);
  } else {
    evaluateAffordability();
  }
})();

