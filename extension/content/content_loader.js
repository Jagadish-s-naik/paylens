/**
 * extension/content/content_loader.js
 * Legacy fallback content script.
 * Chrome MV3 now loads content.bundle.js directly from manifest.json.
 */

(function loadPaylensScript() {
  // Graceful no-op: content.bundle.js is directly injected by Chrome MV3
  if (typeof window !== 'undefined') {
    window.__paylens_loader_ready = true;
  }
})();
