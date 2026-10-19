import { detectCurrency, classifyPrice, parsePriceFromText } from '../currency.js';
import { UniversalEmiExtractor } from '../emi_extractor.js';

function calculateEmiInstallment(principal, annualRatePercent, months) {
  if (months <= 1 || annualRatePercent <= 0) {
    return Math.round((principal / Math.max(1, months)) * 100) / 100;
  }
  const monthlyRate = (annualRatePercent / 12) / 100;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi * 100) / 100;
}

// In-memory cache for live InEMI results to prevent redundant network fetches
const emiCache = new Map();

/**
 * Extracts ASIN using Buyhatke's cascading priority:
 * input#ASIN -> data-csa-c-item-id -> data-asin -> URL regex -> canonical -> query params -> meta
 */
function extractAsin(doc) {
  if (!doc) return null;

  // 1. Hidden inputs
  const asinInput = doc.querySelector('input#ASIN, input[name="ASIN"], input#ftSelectAsin');
  if (asinInput && asinInput.value && asinInput.value.trim().length === 10) {
    return asinInput.value.trim();
  }

  // 2. Buyhatke CSA / Data attributes
  const csaEl = doc.querySelector('[data-csa-c-item-id*="asin"]');
  if (csaEl) {
    const csaId = csaEl.getAttribute('data-csa-c-item-id') || '';
    const m = csaId.match(/amzn1\.asin\.([A-Z0-9]{10})/i);
    if (m) return m[1];
  }

  const dataAsinEl = doc.querySelector('[data-asin]:not([data-asin=""])');
  if (dataAsinEl) {
    const val = dataAsinEl.getAttribute('data-asin');
    if (val && val.trim().length === 10) return val.trim();
  }

  // 3. URL regex (standard /dp/, short /d/, /gp/product/, /gp/aw/d/, /asin/)
  const url = (doc.defaultView?.location?.href || (typeof window !== 'undefined' ? window.location.href : '') || '');
  const urlMatch = url.match(/(?:\/dp\/|\/d\/|\/gp\/product\/|\/gp\/aw\/d\/|\/exec\/obidos\/ASIN\/|\/asin\/)([A-Z0-9]{10})/i);
  if (urlMatch) return urlMatch[1];

  // 4. Canonical link
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical && canonical.href) {
    const m = canonical.href.match(/(?:\/dp\/|\/d\/|\/gp\/product\/|\/gp\/aw\/d\/|\/asin\/)([A-Z0-9]{10})/i);
    if (m) return m[1];
  }

  // 5. Query parameters (pd_rd_i, asin)
  try {
    const u = new URL(url);
    const pd = u.searchParams.get('pd_rd_i') || u.searchParams.get('asin');
    if (pd && pd.trim().length === 10) return pd.trim();
  } catch (_) {}

  // 6. Meta tag fallback
  const metaAsin = doc.querySelector('meta[name="asin"], meta[property="og:asin"]');
  if (metaAsin && metaAsin.content && metaAsin.content.trim().length === 10) {
    return metaAsin.content.trim();
  }

  // 7. General 10-char ASIN slug regex from URL
  const genericMatch = url.match(/(?:[/?&]|^)([B0-9][A-Z0-9]{9})(?:[/?&]|$)/i);
  if (genericMatch) return genericMatch[1];

  return null;
}

/**
 * Extracts Product Title using Buyhatke's cascading title hierarchy
 */
function extractTitle(doc) {
  if (!doc) return 'Amazon Product';
  const selectors = [
    '#productTitle',
    '#title',
    'h1.a-size-large',
    '#ebooksProductTitle',
    '#item_name',
    'meta[property="og:title"]',
    'meta[name="title"]'
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const val = el.tagName === 'META' ? el.getAttribute('content') : (el.innerText || el.textContent);
      if (val && val.trim().length > 1) {
        return val.trim()
          .replace(/\s*:\s*Amazon\..*?$/i, '')
          .replace(/^Amazon\..*?:\s*/i, '')
          .replace(/^Buy\s+/i, '')
          .trim();
      }
    }
  }
  if (doc.title) {
    return doc.title
      .replace(/\s*:\s*Amazon\..*?$/i, '')
      .replace(/^Amazon\..*?:\s*/i, '')
      .replace(/^Buy\s+/i, '')
      .trim();
  }
  return 'Amazon Product';
}

/**
 * Extracts Selling Price and MRP (Basis Price)
 * Combines .a-offscreen, .a-price-whole/.a-price-fraction, JSON-LD, and Meta tags.
 */
function extractPrice(doc) {
  if (!doc) return { listPrice: 0, mrp: 0 };
  let listPrice = 0;
  let mrp = 0;

  // 1. Direct parse from priceToPay or prominent price container with .a-offscreen
  const priceToPaySelectors = [
    '.priceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-price.priceToPay .a-offscreen',
    '#corePrice_desktop .a-price.priceToPay .a-offscreen',
    '#apex_desktop .a-price.priceToPay .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen',
    '#apex_desktop .a-price .a-offscreen',
    '.priceToPay',
    '.a-price.priceToPay'
  ];

  for (const sel of priceToPaySelectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const val = parsePriceFromText(el.innerText || el.textContent);
      if (val > 0) {
        listPrice = val;
        break;
      }
    }
  }

  // 2. Buyhatke Multi-part Whole + Fraction selector
  if (listPrice <= 0) {
    const priceToPay = doc.querySelector('.priceToPay, .a-price.priceToPay, #corePriceDisplay_desktop_feature_div .a-price, #corePrice_desktop .a-price, #apex_desktop .a-price, #centerCol .a-price');
    if (priceToPay) {
      const whole = priceToPay.querySelector('.a-price-whole');
      const frac = priceToPay.querySelector('.a-price-fraction');
      if (whole) {
        const wholeClean = (whole.innerText || whole.textContent || '').replace(/[^0-9]/g, '');
        const fracClean = (frac ? (frac.innerText || frac.textContent || '') : '00').replace(/[^0-9]/g, '') || '00';
        if (wholeClean) {
          const num = parseFloat(`${wholeClean}.${fracClean}`);
          if (!isNaN(num) && num > 0) {
            listPrice = num;
          }
        }
      }
    }
  }

  // 3. Cascading single-element selectors
  if (listPrice <= 0) {
    const selectors = [
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#corePrice_desktop .a-price .a-offscreen',
      '.a-price.aok-align-center .a-offscreen',
      '#apex_desktop .a-price .a-offscreen',
      '#corePrice_feature_div .a-price .a-offscreen',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
      '#price_inside_buybox',
      'span.a-price span.a-offscreen',
      '.a-price .a-offscreen',
      '#priceblock_saleprice'
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = parsePriceFromText(el.innerText || el.textContent);
        if (val > 0) {
          listPrice = val;
          break;
        }
      }
    }
  }

  // 4. Schema.org JSON-LD Fallback
  if (listPrice <= 0) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '{}');
        const prod = data['@type'] === 'Product' ? data : (Array.isArray(data['@graph']) ? data['@graph'].find(i => i && i['@type'] === 'Product') : null);
        if (prod && prod.offers) {
          const offers = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
          const p = parseFloat(offers?.price || offers?.lowPrice || '0');
          if (p > 0) {
            listPrice = p;
            break;
          }
        }
      } catch (_) {}
    }
  }

  // 5. OpenGraph or Twitter price meta tag fallback
  if (listPrice <= 0) {
    const metaPrice = doc.querySelector('meta[property="product:price:amount"], meta[name="twitter:data1"]');
    if (metaPrice && metaPrice.content) {
      const p = parsePriceFromText(metaPrice.content);
      if (p > 0) listPrice = p;
    }
  }

  // 6. Extract MRP / Basis Price
  const mrpSelectors = [
    '.basisPrice .a-price.a-text-price span.a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-text-price span.a-offscreen',
    '#corePrice_desktop .a-text-price span.a-offscreen',
    '#apex_desktop .a-text-price span.a-offscreen',
    '#listPrice',
    'span.a-price.a-text-price span.a-offscreen',
    '.a-text-price span.a-offscreen'
  ];
  for (const sel of mrpSelectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const val = parsePriceFromText(el.innerText || el.textContent);
      if (val > 0) {
        mrp = val;
        break;
      }
    }
  }
  if (mrp < listPrice) mrp = listPrice;

  return { listPrice, mrp };
}

/**
 * Extracts OfferListingId (OLID) for secondaryView calls
 */
function extractOlid(doc) {
  if (!doc) return '';
  const input = doc.querySelector('input#offerListingID, input[name="offerListingId"]');
  if (input && input.value) return input.value.trim();
  const url = (doc.defaultView?.location?.href || (typeof window !== 'undefined' ? window.location.href : '') || '');
  try {
    const u = new URL(url);
    const m = u.searchParams.get('offerListingId') || u.searchParams.get('smid') || u.searchParams.get('m');
    if (m) return m.trim();
  } catch (_) {}
  return '';
}

/**
 * Extracts Instant Bank Discounts & Coupons
 */
function extractInstantDiscounts(doc, listPrice) {
  let cashDiscount = 0.0;
  if (!doc) return cashDiscount;

  // Coupon badge
  const couponEl = doc.querySelector('#couponText, .coupon-badge, label[for*="coupon"]');
  if (couponEl) {
    const couponText = couponEl.innerText || couponEl.textContent || '';
    const m = couponText.match(/(?:Save|₹|Rs\.?)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    if (m) {
      cashDiscount += parsePriceFromText(m[1]);
    }
  }

  // Bank offers in offer divs
  const offerContainers = doc.querySelectorAll('#item_offers_list, #sopp_feature_div, .offers-items, .vsx-offers-desktop-lv__list, .vsx-offers-desktop-dv__content');
  for (const cont of offerContainers) {
    const text = cont.innerText || '';
    const discountMatch = text.match(/(?:Flat\s*(?:INR|₹|Rs\.?)\s*|Instant\s*Discount\s*of\s*(?:INR|₹|Rs\.?)\s*|Upto\s*(?:INR|₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
    if (discountMatch) {
      cashDiscount = Math.max(cashDiscount, parsePriceFromText(discountMatch[1]));
    }
  }

  // Cap discount at 40% of list price to prevent over-extraction
  if (cashDiscount > listPrice * 0.40) {
    cashDiscount = 0.0;
  }
  return cashDiscount;
}

/**
 * Parses Amazon InEMI HTML tables into structured PaymentOptions
 */
function parseInEmiHtml(htmlText, listPrice, cashDiscount) {
  if (!htmlText || typeof htmlText !== 'string') return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    return UniversalEmiExtractor.parseTableRowsFromContainer(doc.body, listPrice, cashDiscount, 199.0);
  } catch (err) {
    console.warn('[Paylens AmazonAdapter] InEMI HTML parse error:', err);
    return [];
  }
}

/**
 * Fetches live Amazon InEMI table via background service worker proxy
 */
async function fetchLiveAmazonEmi(asin, olid, listPrice, cashDiscount, doc = null) {
  if (!asin || typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.runtime?.sendMessage) {
    return [];
  }

  const cacheKey = `${asin}_${listPrice}`;
  if (emiCache.has(cacheKey)) {
    return emiCache.get(cacheKey);
  }

  let inEmiUrl = null;
  if (doc) {
    const popoverLink = doc.querySelector('#inemi-popover-link, a[data-a-popover*="inemi"], a[data-a-popover*="rates"]');
    if (popoverLink) {
      const popoverAttr = popoverLink.getAttribute('data-a-popover');
      if (popoverAttr) {
        try {
          const parsed = JSON.parse(popoverAttr);
          if (parsed.url) {
            const origin = (doc.defaultView?.location?.origin || (typeof window !== 'undefined' ? window.location.origin : 'https://www.amazon.in'));
            inEmiUrl = new URL(parsed.url, origin).href;
          }
        } catch (_) {}
      }
    }
  }

  if (!inEmiUrl) {
    const origin = (doc?.defaultView?.location?.origin || (typeof window !== 'undefined' ? window.location.origin : 'https://www.amazon.in'));
    inEmiUrl = `${origin}/gp/product/ajax-handlers/inemi-rates.html?asin=${asin}&ref_=dp_inemi`;
  }

  try {
    const res = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2500);
      try {
        if (!chrome.runtime?.id) {
          clearTimeout(timeout);
          return resolve(null);
        }
        chrome.runtime.sendMessage({
          type: 'FETCH_STORE_DATA',
          payload: { url: inEmiUrl, options: { timeoutMs: 2500 } }
        }, (response) => {
          clearTimeout(timeout);
          // Check lastError to suppress Chrome's automatic error logging on context invalidation
          if (chrome.runtime.lastError) {
            return resolve(null);
          }
          resolve(response);
        });
      } catch (_) {
        clearTimeout(timeout);
        resolve(null);
      }
    });

    if (res && res.ok && res.data && res.data.body) {
      const parsedOptions = parseInEmiHtml(res.data.body, listPrice, cashDiscount);
      if (parsedOptions.length > 0) {
        emiCache.set(cacheKey, parsedOptions);
        return parsedOptions;
      }
    }
  } catch (err) {
    if (!err?.message?.includes('Extension context invalidated') && chrome.runtime?.id) {
      console.warn('[Paylens AmazonAdapter] Live InEMI fetch error:', err);
    }
  }

  return [];
}

/**
 * Generates verified fallback payment options with standard Indian bank schedules
 */
function buildFallbackPaymentOptions(listPrice, effectiveCash, cashDiscount, hasNoCostEmi) {
  const stdFee = 199.0;
  const options = [
    {
      option_id: 'cash_full',
      type: 'CASH',
      label: cashDiscount > 0
        ? `Full Payment (Includes ₹${cashDiscount.toLocaleString('en-IN')} Bank Discount)`
        : 'Full Payment Upfront',
      tenure_months: 1,
      monthly_installment: effectiveCash,
      upfront_downpayment: 0.0,
      processing_fee: 0.0,
      lost_cash_discount: null,
      stated_interest_rate: 0.0
    }
  ];

  if (hasNoCostEmi || listPrice >= 3000) {
    options.push({
      option_id: 'nocost_3m',
      type: 'NO_COST_EMI',
      label: 'No-Cost EMI (3 Months — HDFC/ICICI/Axis)',
      tenure_months: 3,
      monthly_installment: Math.round((listPrice / 3) * 100) / 100,
      upfront_downpayment: 0.0,
      processing_fee: stdFee,
      lost_cash_discount: cashDiscount,
      stated_interest_rate: 0.0
    });

    options.push({
      option_id: 'nocost_6m',
      type: 'NO_COST_EMI',
      label: 'No-Cost EMI (6 Months — HDFC/SBI/ICICI)',
      tenure_months: 6,
      monthly_installment: Math.round((listPrice / 6) * 100) / 100,
      upfront_downpayment: 0.0,
      processing_fee: stdFee,
      lost_cash_discount: cashDiscount,
      stated_interest_rate: 0.0
    });
  }

  options.push({
    option_id: 'std_9m',
    type: 'STANDARD_EMI',
    label: 'Standard EMI (9 Months @ 14% APR — SBI/HDFC)',
    tenure_months: 9,
    monthly_installment: calculateEmiInstallment(listPrice, 14.0, 9),
    upfront_downpayment: 0.0,
    processing_fee: stdFee,
    lost_cash_discount: cashDiscount,
    stated_interest_rate: 14.0
  });

  options.push({
    option_id: 'std_12m',
    type: 'STANDARD_EMI',
    label: 'Standard EMI (12 Months @ 15% APR — Axis/Kotak)',
    tenure_months: 12,
    monthly_installment: calculateEmiInstallment(listPrice, 15.0, 12),
    upfront_downpayment: 0.0,
    processing_fee: stdFee,
    lost_cash_discount: cashDiscount,
    stated_interest_rate: 15.0
  });

  return options;
}

export const AmazonAdapter = {
  id: 'amazon',

  /**
   * Matches Amazon India or Amazon international product pages.
   */
  matches(url = (typeof window !== 'undefined' ? window.location.href : '')) {
    if (!url) return false;
    const u = url.toLowerCase();
    const isAmazonHost = u.includes('amazon.in') || u.includes('amazon.com') || u.includes('amazon.') || u.includes('amzn.') || (typeof document !== 'undefined' && (document.domain || '').includes('amazon'));
    if (!isAmazonHost) return false;

    const isProductPage = u.includes('/dp/') || u.includes('/gp/product/') || u.includes('/gp/aw/d/') ||
                          u.includes('/d/') || u.includes('/product/') || u.includes('/deal/') ||
                          u.includes('/asin/') || u.includes('?asin=') || u.includes('&asin=') ||
                          u.includes('pd_rd_i=') || /\/(dp|d)\/[a-z0-9]{10}/i.test(u);
    if (isProductPage) return true;

    // Check DOM if available (for SPA transitions without full URL change)
    if (typeof document !== 'undefined') {
      if (document.querySelector('input#ASIN, input[name="ASIN"], #productTitle, #add-to-cart-button, #corePriceDisplay_desktop_feature_div, #apex_desktop, #inemi_feature_div')) {
        return true;
      }
    }
    return false;
  },

  /**
   * Extracts active product details and maps to normalized Listing schema.
   */
  async extract(doc) {
    try {
      if (!doc) return null;

      // 1. Cascading ASIN / Product ID
      const productId = extractAsin(doc) || 'amz_item';

      // 2. Cascading Product Title
      const title = extractTitle(doc);

      // 3. Multi-part Price and MRP
      const { listPrice: rawListPrice } = extractPrice(doc);
      if (rawListPrice <= 0) {
        return null;
      }

      // Currency Detection & Classification
      const symbolEl = doc.querySelector('.a-price-symbol');
      const sampleSymbol = symbolEl ? symbolEl.innerText.trim() : '';
      const pageUrl = (doc.defaultView?.location?.href || (typeof window !== 'undefined' ? window.location.href : ''));
      const detectedCurrency = detectCurrency(doc, sampleSymbol, pageUrl);
      const classification = classifyPrice(rawListPrice, detectedCurrency);

      const listPrice = classification.priceInINR;

      // 4. OfferListingID
      const olid = extractOlid(doc);

      // 5. Category
      let category = 'Electronics';
      const breadcrumbEl = doc.querySelector('#wayfinding-breadcrumbs_feature_div, #nav-subnav');
      if (breadcrumbEl && breadcrumbEl.innerText) {
        const parts = breadcrumbEl.innerText.split('›').map(s => s.trim()).filter(Boolean);
        if (parts.length > 0) category = parts[0];
      }

      // 6. Instant Bank Discounts & Coupons
      const rawCashDiscount = extractInstantDiscounts(doc, rawListPrice);
      const cashDiscount = classification.isConverted
        ? Math.round(rawCashDiscount * classification.exchangeRate * 100) / 100
        : rawCashDiscount;
      const effectiveCash = Math.max(0, listPrice - cashDiscount);

      // 7. Detect No-Cost EMI availability indicators
      const pageText = (doc.body ? doc.body.innerText : '');
      const hasNoCostEmi = pageText.includes('No Cost EMI') ||
                           doc.querySelector('#inemi_feature_div, a[href*="inemi"]') !== null;

      // 8. Fetch live InEMI options, or extract via UniversalEmiExtractor, or build verified fallback schedules
      let liveOptions = await fetchLiveAmazonEmi(productId, olid, listPrice, cashDiscount, doc);
      if (!liveOptions || liveOptions.length === 0) {
        liveOptions = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, 'Amazon');
      }
      let paymentOptions = [];

      const cashLabel = classification.isConverted
        ? `Full Payment Upfront (${classification.currencySymbol}${classification.originalPrice.toLocaleString('en-US')} ⇄ ₹${listPrice.toLocaleString('en-IN')})`
        : (cashDiscount > 0
          ? `Full Payment (Includes ₹${cashDiscount.toLocaleString('en-IN')} Bank Discount)`
          : 'Full Payment Upfront');

      if (liveOptions && liveOptions.length > 0) {
        // Prepend Cash Full option
        const cashOption = {
          option_id: 'cash_full',
          bank_key: 'cash',
          bank_name: 'Cash / UPI',
          type: 'CASH',
          label: cashLabel,
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0.0,
          processing_fee: 0.0,
          lost_cash_discount: null,
          stated_interest_rate: 0.0
        };

        // Guarantee standard alias IDs (nocost_6m, nocost_3m) exist for contract consistency
        const topNoCost = liveOptions.find(o => o.type === 'NO_COST_EMI');
        if (topNoCost && !liveOptions.some(o => o.option_id === 'nocost_6m')) {
          liveOptions.unshift({
            ...topNoCost,
            option_id: 'nocost_6m'
          });
        }
        paymentOptions = [cashOption, ...liveOptions];
      } else {
        paymentOptions = buildFallbackPaymentOptions(listPrice, effectiveCash, cashDiscount, hasNoCostEmi);
      }

      return {
        product_id: productId,
        title: title,
        category: category,
        retailer: 'Amazon',
        currency: classification.currency,
        currency_symbol: classification.currencySymbol,
        original_price: classification.originalPrice,
        exchange_rate: classification.exchangeRate,
        currency_notice: classification.bannerNotice,
        upfront_cash_price: listPrice,
        cash_discount: cashDiscount,
        effective_cash_price: effectiveCash,
        payment_options: paymentOptions
      };
    } catch (err) {
      console.warn('[Paylens AmazonAdapter] Error extracting listing (returning null):', err);
      return null;
    }
  },

  /**
   * Default selected option ID (prefers 6M No-Cost EMI if available, else standard HDFC 3M).
   */
  selectedOptionId(doc) {
    const offerContainers = doc ? doc.querySelectorAll('#item_offers_list, #sopp_feature_div, .offers-items, #inemi_feature_div') : [];
    for (const c of offerContainers) {
      if (/no\s*cost\s*emi/i.test(c.innerText || '')) {
        return 'nocost_6m';
      }
    }
    return 'std_hdfc_3m';
  },

  /**
   * Locates mount point inside Amazon's product column.
   */
  mountPoint(doc) {
    try {
      if (!doc) return null;

      let slot = doc.querySelector('#paylens-amazon-slot');
      if (slot) return slot;

      const targets = [
        '#inemi_feature_div',
        '#corePriceDisplay_desktop_feature_div',
        '#corePrice_desktop',
        '#corePrice_feature_div',
        '#apex_desktop',
        '#desktop_buybox',
        '#buybox',
        '#centerCol',
        '#dp-container'
      ];

      for (const sel of targets) {
        const el = doc.querySelector(sel);
        if (el && el.parentNode) {
          slot = doc.createElement('div');
          slot.id = 'paylens-amazon-slot';
          slot.style.margin = '16px 0';
          slot.style.width = '100%';

          if (sel === '#centerCol' || sel === '#dp-container') {
            el.appendChild(slot);
          } else {
            el.parentNode.insertBefore(slot, el.nextSibling);
          }
          return slot;
        }
      }

      return doc.body || null;
    } catch (err) {
      console.warn('[Paylens AmazonAdapter] Error locating mountPoint:', err);
      return doc?.body || null;
    }
  },

  /**
   * Observes variant switches and price updates.
   */
  observe(doc, onChange) {
    if (!doc || typeof onChange !== 'function') return () => {};

    let debounceTimer = null;
    let lastStateKey = '';
    let observer = null;

    const notify = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
            if (observer) observer.disconnect();
            return;
          }
          const listing = await Promise.resolve(AmazonAdapter.extract(doc));
          const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : '';
          if (stateKey && stateKey !== lastStateKey) {
            lastStateKey = stateKey;
            onChange({ productId: listing.product_id, optionId: AmazonAdapter.selectedOptionId(doc) });
          }
        } catch (_) {}
      }, 250);
    };

    observer = new MutationObserver(() => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        if (observer) observer.disconnect();
        return;
      }
      notify();
    });

    const target = doc.querySelector('#centerCol') || doc.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }

    return () => {
      clearTimeout(debounceTimer);
      if (observer) observer.disconnect();
    };
  }
};

export default AmazonAdapter;
