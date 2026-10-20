/**
 * extension/config.js
 * Central runtime configuration for the Paylens Chrome Extension.
 * 
 * In accordance with docs/PLAN.md §1:
 * When MOCK_API is true, the extension operates in zero-backend mock mode,
 * returning exact pre-computed golden verdicts from extension/mock_data.js.
 * When MOCK_API is flipped to false, it issues live JSON requests to API_BASE.
 */

export const CONFIG = {
  // Base URL for the FastAPI backend (local development on port 8000)
  API_BASE: "http://localhost:8000",

  // Cloud Run production endpoint fallback
  CLOUD_RUN_BASE: "https://paylens-986743332275.asia-south1.run.app",

  // Decoupling toggle: false issues live API requests to API_BASE
  MOCK_API: false,

  // Default regional explanation language ('en', 'hi', 'kn')
  LANGUAGE: "en",

  // Network timeout in milliseconds for live API requests
  FETCH_TIMEOUT_MS: 8000,

  // Storage key namespace in chrome.storage.local
  STORAGE_KEYS: {
    INSTALL_ID: "paylens.installId",
    PROFILE: "paylens.profile",
    SETTINGS: "paylens.settings",
    LAST_VERDICT: "paylens.lastVerdict"
  }
};
