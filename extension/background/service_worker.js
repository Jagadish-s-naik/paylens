/**
 * Paylens Extension — Background Service Worker (MV3)
 * Implements ARCHITECTURE.md §8.2 & §8.3:
 * - Lazy & install-time installId generation
 * - Standard message envelope: { ok: true, data } | { ok: false, error: { code, message } }
 * - Contract-first mock bridge using extension/mock_data.js when CONFIG.MOCK_API is true
 * - Resilient fetchWithRetry (8s timeout, 1 retry, X-Install-Id) when CONFIG.MOCK_API is false
 */

import { CONFIG } from '../config.js';
import { resolveMockVerdict, getDemoPersonas, getMockExplanation } from '../mock_data.js';

// ============================================================================
// 1. Install & Lifecycle Initialization
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Paylens SW] onInstalled:', details.reason);
  await getOrCreateInstallId();
});

async function getOrCreateInstallId() {
  try {
    const key = CONFIG.STORAGE_KEYS.INSTALL_ID;
    const result = await chrome.storage.local.get(key);
    if (result && result[key]) {
      return result[key];
    }
    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ [key]: newId });
    console.log('[Paylens SW] Initialized new installId:', newId);
    return newId;
  } catch (err) {
    console.error('[Paylens SW] Error getting/creating installId:', err);
    return '00000000-0000-0000-0000-000000000000';
  }
}

// ============================================================================
// 2. HTTP Client with Retry & Timeout (for Live Mode)
// ============================================================================

async function fetchWithRetry(url, options = {}, retries = 1) {
  const timeoutMs = CONFIG.FETCH_TIMEOUT_MS || 8000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        let errData = null;
        try {
          errData = await response.json();
        } catch (_) {}

        const errorCode = errData?.error?.code || `HTTP_${response.status}`;
        const errorMsg = errData?.error?.message || `Server responded with status ${response.status}`;
        return { ok: false, error: { code: errorCode, message: errorMsg } };
      }

      const data = await response.json();
      return { ok: true, data };
    } catch (err) {
      clearTimeout(timer);
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        const isTimeout = err.name === 'AbortError';
        return {
          ok: false,
          error: {
            code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
            message: isTimeout
              ? `Request timed out after ${timeoutMs}ms.`
              : (err.message || 'Failed to connect to Paylens backend.')
          }
        };
      }
      console.warn(`[Paylens SW] Attempt ${attempt + 1} failed, retrying...`, err);
    }
  }
}

// ============================================================================
// 3. Message Dispatcher & Handlers
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Enforce asynchronous pattern per Rule 5
  (async () => {
    try {
      const response = await handleMessage(message);
      sendResponse(response);
    } catch (err) {
      console.error('[Paylens SW] Unhandled message error:', err);
      sendResponse({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Internal extension service worker error.'
        }
      });
    }
  })();

  return true; // Keeps the message channel open for async response
});

async function handleMessage(message) {
  if (!message || typeof message.type !== 'string') {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'Missing message type.' } };
  }

  const { type, payload } = message;

  switch (type) {
    case 'AFFORD':
      return await handleAfford(payload);

    case 'EXPLAIN':
      return await handleExplain(payload);

    case 'PROFILE_GET':
      return await handleProfileGet();

    case 'PROFILE_SET':
      return await handleProfileSet(payload);

    case 'DEMO_PROFILES':
      return { ok: true, data: getDemoPersonas() };

    case 'SETTINGS_GET':
      return await handleSettingsGet();

    case 'SETTINGS_SET':
      return await handleSettingsSet(payload);

    case 'PROFILE_BUILD':
      return await handleProfileBuild(payload);

    default:
      return {
        ok: false,
        error: { code: 'UNKNOWN_MESSAGE_TYPE', message: `Type "${type}" is not supported.` }
      };
  }
}

// ============================================================================
// 4. Specific Request Implementations
// ============================================================================

/**
 * Handles AFFORD request
 * Payload: { listing: Listing, selectedOptionId: string }
 */
async function handleAfford(payload) {
  if (!payload || !payload.listing || !payload.selectedOptionId) {
    return {
      ok: false,
      error: { code: 'VALIDATION', message: 'Missing listing or selectedOptionId in payload.' }
    };
  }

  // 1. Retrieve current verified profile from storage
  const profileKey = CONFIG.STORAGE_KEYS.PROFILE;
  const storageData = await chrome.storage.local.get(profileKey);
  const profile = storageData[profileKey];

  if (!profile) {
    return {
      ok: false,
      error: {
        code: 'NO_PROFILE',
        message: 'No verified payslip profile found. Please load or upload a payslip profile.'
      }
    };
  }

  // 2. Mock API Branch (Zero Backend Dependency)
  if (CONFIG.MOCK_API) {
    console.log('[Paylens SW:MOCK] Evaluating afford via local golden fixtures...');
    const verdict = resolveMockVerdict({
      productId: payload.listing.product_id,
      optionId: payload.selectedOptionId,
      profileId: profile.profile_id,
      profile: profile,
      listing: payload.listing
    });

    // Cache verdict for popup display
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.LAST_VERDICT]: verdict });
    return { ok: true, data: verdict };
  }

  // 3. Live API Branch
  const installId = await getOrCreateInstallId();
  const endpoint = `${CONFIG.API_BASE}/api/afford`;
  const result = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Install-Id': installId
      },
      body: JSON.stringify({
        profile: profile,
        listing: payload.listing,
        selected_option_id: payload.selectedOptionId
      })
    },
    1 // 1 retry on network error per ARCHITECTURE.md §8.3
  );

  if (result.ok && result.data) {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.LAST_VERDICT]: result.data });
  }

  return result;
}

/**
 * Handles EXPLAIN request
 * Payload: { verdict: Verdict, language?: string }
 */
async function handleExplain(payload) {
  if (!payload || !payload.verdict) {
    return { ok: false, error: { code: 'VALIDATION', message: 'Missing verdict in payload.' } };
  }

  const lang = payload.language || CONFIG.LANGUAGE || 'en';

  // Mock API Branch
  if (CONFIG.MOCK_API) {
    console.log(`[Paylens SW:MOCK] Generating explanation in language: ${lang}`);
    const explanation = getMockExplanation(payload.verdict, lang);
    return { ok: true, data: explanation };
  }

  // Live API Branch
  const installId = await getOrCreateInstallId();
  const endpoint = `${CONFIG.API_BASE}/api/afford/explain`;
  return await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Install-Id': installId
      },
      body: JSON.stringify({
        verdict: payload.verdict,
        language: lang
      })
    },
    0 // No retries for AI routes per rate-limit rules
  );
}

/**
 * Handles PROFILE_GET request
 */
async function handleProfileGet() {
  const profileKey = CONFIG.STORAGE_KEYS.PROFILE;
  const data = await chrome.storage.local.get(profileKey);
  return { ok: true, data: data[profileKey] || null };
}

/**
 * Handles PROFILE_SET request
 */
async function handleProfileSet(profile) {
  if (!profile || typeof profile !== 'object') {
    return { ok: false, error: { code: 'VALIDATION', message: 'Invalid profile payload.' } };
  }

  const profileKey = CONFIG.STORAGE_KEYS.PROFILE;
  await chrome.storage.local.set({ [profileKey]: profile });
  console.log('[Paylens SW] Saved verified profile:', profile.profile_id || 'unknown');
  return { ok: true, data: profile };
}

/**
 * Handles SETTINGS_GET request
 */
async function handleSettingsGet() {
  const settingsKey = CONFIG.STORAGE_KEYS.SETTINGS;
  const data = await chrome.storage.local.get(settingsKey);
  const defaultSettings = { apiBase: CONFIG.API_BASE, language: CONFIG.LANGUAGE };
  return { ok: true, data: data[settingsKey] || defaultSettings };
}

/**
 * Handles SETTINGS_SET request
 */
async function handleSettingsSet(settings) {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, error: { code: 'VALIDATION', message: 'Invalid settings payload.' } };
  }

  const settingsKey = CONFIG.STORAGE_KEYS.SETTINGS;
  await chrome.storage.local.set({ [settingsKey]: settings });
  return { ok: true, data: settings };
}

/**
 * Handles PROFILE_BUILD request (multipart OCR)
 * In mock mode: returns sample pre-verified profile
 */
async function handleProfileBuild(payload) {
  if (CONFIG.MOCK_API) {
    const demoPersonas = getDemoPersonas();
    const defaultProfile = demoPersonas[0].profile;
    return {
      ok: true,
      data: {
        profile: defaultProfile,
        extraction: {
          basic: defaultProfile.basic_monthly,
          hra: defaultProfile.hra_monthly,
          gross: defaultProfile.gross_monthly,
          in_hand: defaultProfile.in_hand_verified,
          confidence: 0.98
        },
        validation: {
          g1_gross_match: true,
          g2_deductions_match: true,
          g3_net_boundary_valid: true
        }
      }
    };
  }

  // Live API Branch: Options page performs direct FormData stream to /api/profile/build
  if (payload && payload.profile) {
    const profileKey = CONFIG.STORAGE_KEYS.PROFILE;
    await chrome.storage.local.set({ [profileKey]: payload.profile });
    return { ok: true, data: { profile: payload.profile } };
  }

  return {
    ok: false,
    error: {
      code: 'DIRECT_STREAM_REQUIRED',
      message: 'Payslip upload streams directly from Options Page to /api/profile/build.'
    }
  };
}
