/**
 * extension/content/content_loader.js
 * Chrome MV3 ES Module Loader for Paylens Content Script.
 * Dynamically imports modular content.js into the host page context.
 */

(async function loadPaylensModularContentScript() {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
    const src = chrome.runtime.getURL('content/content.js');
    await import(src);
  } catch (err) {
    if (!err?.message?.includes('Extension context invalidated')) {
      console.error('[Paylens Loader] Error dynamically importing content.js:', err);
    }
  }
})();
