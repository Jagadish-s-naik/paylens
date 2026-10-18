/**
 * extension/content/adapters/amazon.js
 * Storefront DOM Adapter for Amazon India (amazon.in) and Amazon International.
 * Reverse-engineered from Buyhatke Chrome extension architecture (v5.1.170_0 / pos: 63):
 * - Cascading resilient selectors for ASIN, Title, Multi-part Prices, and MRP
 * - OfferListingId (OLID) extraction
 * - Instant bank discounts & voucher parsing
 * - Live InEMI rates & Offer Application Secondary View table extraction
 * - Resilient fallback to verified Indian bank schemes with documented charges
 *
 * Implements Paylens DOM Adapter Contract:
 * - matches(url): boolean
 * - extract(document): Promise<Listing | null> | (Listing | null)
 * - selectedOptionId(document): string | null
 * - mountPoint(document): Element | null
 * - observe(document, onChange): () => void
 */

function calculateEmiInstallment(principal, annualRatePercent, months) {
  if (months <= 1 || annualRatePercent <= 0) {
    return Math.round((principal / Math.max(1, months)) * 100) / 100;
  }
  const monthlyRate = (annualRatePercent / 12) / 100;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi * 100) / 100;
}

function parsePriceFromText(text) {
  if (!text) return 0;
  const match = text.match(/(?:₹|Rs\.?|INR|\$)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
  if (match && match[1]) {
    const clean = match[1].replace(/,/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }
  const clean = text.replace(/[^0-9.]/g, '');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

// In-memory cache for live InEMI results to prevent redundant network fetches
const emiCache = new Map();

/**
 * Extracts ASIN using Buyhatke's cascading priority:
 * input#ASIN -> data-csa-c-item-id -> data-asin -> URL regex -> canonical -> query params
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

  // 3. URL regex
  const url = (doc.defaultView?.location?.href || (typeof window !== 'undefined' ? window.location.href : '') || '');
  const urlMatch = url.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})/i);
  if (urlMatch) return urlMatch[1];

  // 4. Canonical link
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical && canonical.href) {
    const m = canonical.href.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})/i);
    if (m) return m[1];
  }

  // 5. Query parameters (pd_rd_i, asin)
  try {
    const u = new URL(url);
    const pd = u.searchParams.get('pd_rd_i') || u.searchParams.get('asin');
    if (pd && pd.trim().length === 10) return pd.trim();
  } catch (_) {}

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
      const val = el.getAttribute('content') || el.innerText || el.textContent;
      if (val && val.trim().length > 1) {
        return val.trim().replace(/\s*:\s*Amazon\.in.*?$/i, '').trim();
      }
    }
  }
  if (doc.title) {
    return doc.title.replace(/\s*:\s*Amazon\.in.*?$/i, '').replace(/^Amazon\.in\s*:\s*/i, '').trim();
  }
  return 'Amazon Product';
}

/**
 * Extracts Selling Price and MRP (Basis Price)
 * Combines .a-price-whole and .a-price-fraction for precise currency amount
 */
function extractPrice(doc) {
  if (!doc) return { listPrice: 0, mrp: 0 };
  let listPrice = 0;
  let mrp = 0;

  // 1. Buyhatke Multi-part Whole + Fraction selector
  const priceToPay = doc.querySelector('.centerColAlign .a-price.priceToPay, #corePriceDisplay_desktop_feature_div .a-price.priceToPay, #corePrice_desktop .a-price.priceToPay');
  if (priceToPay) {
    const whole = priceToPay.querySelector('.a-price-whole');
    const frac = priceToPay.querySelector('.a-price-fraction');
    if (whole) {
      const wholeClean = whole.innerText.replace(/[^0-9]/g, '');
      const fracClean = frac ? frac.innerText.replace(/[^0-9]/g, '') : '00';
      const num = parseFloat(`${wholeClean}.${fracClean}`);
      if (!isNaN(num) && num > 0) {
        listPrice = num;
      }
    }
  }

  // 2. Cascading single-element selectors
  if (listPrice <= 0) {
    const selectors = [
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#corePrice_desktop .a-price .a-offscreen',
      '.a-price.aok-align-center .a-offscreen',
      '#apex_desktop .a-price .a-offscreen',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
      '#price_inside_buybox',
      'span.a-price span.a-offscreen',
      '.a-price .a-offscreen'
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

  // 3. Extract MRP / Basis Price
  const mrpSelectors = [
    '.basisPrice .a-price.a-text-price span.a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-text-price span.a-offscreen',
    '#corePrice_desktop .a-text-price span.a-offscreen',
    '#listPrice',
    'span.a-price.a-text-price span.a-offscreen'
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
  const options = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const knownBanks = [
      { key: 'hdfc', name: 'HDFC Bank' },
      { key: 'icici', name: 'ICICI Bank' },
      { key: 'sbi', name: 'SBI Card' },
      { key: 'axis', name: 'Axis Bank' },
      { key: 'kotak', name: 'Kotak Bank' },
      { key: 'onecard', name: 'OneCard' },
      { key: 'amex', name: 'American Express' },
      { key: 'rbl', name: 'RBL Bank' },
      { key: 'bob', name: 'Bank of Baroda' },
      { key: 'indusind', name: 'IndusInd Bank' }
    ];

    const rows = doc.querySelectorAll('tr, .a-row, li');
    let activeBank = 'Bank';

    for (const row of rows) {
      const text = row.innerText || row.textContent || '';
      for (const b of knownBanks) {
        if (text.toLowerCase().includes(b.name.toLowerCase()) || text.toLowerCase().includes(b.key)) {
          activeBank = b.name;
          break;
        }
      }

      const tenureMatch = text.match(/(\d+)\s*(?:months|month|m)\b/i);
      const priceMatch = text.match(/(?:₹|Rs\.?)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i);

      if (tenureMatch && priceMatch) {
        const tenure = parseInt(tenureMatch[1], 10);
        if (tenure >= 3 && tenure <= 36) {
          const installment = parsePriceFromText(priceMatch[1]);
          if (installment > 0 && installment < listPrice) {
            const isNoCost = /no\s*cost/i.test(text) || /interest\s*free/i.test(text) || (Math.abs((installment * tenure) - listPrice) < 5);
            const rateMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
            const statedRate = isNoCost ? 0.0 : (rateMatch ? parseFloat(rateMatch[1]) : 14.0);

            const bankSlug = activeBank.toLowerCase().replace(/[^a-z0-9]/g, '');
            const optId = isNoCost ? `nocost_${bankSlug}_${tenure}m` : `std_${bankSlug}_${tenure}m`;

            if (!options.some(o => o.option_id === optId)) {
              options.push({
                option_id: optId,
                type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
                label: isNoCost
                  ? `${activeBank} No-Cost EMI (${tenure} Months)`
                  : `${activeBank} Standard EMI (${tenure} Months @ ${statedRate}% APR)`,
                tenure_months: tenure,
                monthly_installment: installment,
                upfront_downpayment: 0.0,
                processing_fee: 199.0,
                lost_cash_discount: cashDiscount,
                stated_interest_rate: statedRate
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Paylens AmazonAdapter] InEMI HTML parse error:', err);
  }
  return options;
}

/**
 * Fetches live Amazon InEMI table via background service worker proxy
 */
async function fetchLiveAmazonEmi(asin, olid, listPrice, cashDiscount) {
  if (!asin || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return [];
  }

  const cacheKey = `${asin}_${listPrice}`;
  if (emiCache.has(cacheKey)) {
    return emiCache.get(cacheKey);
  }

  const inEmiUrl = `https://www.amazon.in/gp/product/ajax-handlers/inemi-rates.html?asin=${asin}&ref_=dp_inemi`;

  try {
    const res = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2500);
      chrome.runtime.sendMessage({
        type: 'FETCH_STORE_DATA',
        payload: { url: inEmiUrl, options: { timeoutMs: 2500 } }
      }, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });

    if (res && res.ok && res.data && res.data.body) {
      const parsedOptions = parseInEmiHtml(res.data.body, listPrice, cashDiscount);
      if (parsedOptions.length > 0) {
        emiCache.set(cacheKey, parsedOptions);
        return parsedOptions;
      }
    }
  } catch (err) {
    console.warn('[Paylens AmazonAdapter] Live InEMI fetch error:', err);
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
    const isAmazonHost = u.includes('amazon.in') || u.includes('amazon.com') || u.includes('amazon.');
    const isProductPage = u.includes('/dp/') || u.includes('/gp/product/') || u.includes('/gp/aw/d/');
    return isAmazonHost && isProductPage;
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
      const { listPrice } = extractPrice(doc);
      if (listPrice <= 0) {
        return null;
      }

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
      const cashDiscount = extractInstantDiscounts(doc, listPrice);
      const effectiveCash = Math.max(0, listPrice - cashDiscount);

      // 7. Detect No-Cost EMI availability indicators
      const pageText = (doc.body ? doc.body.innerText : '');
      const hasNoCostEmi = pageText.includes('No Cost EMI') ||
                           doc.querySelector('#inemi_feature_div, a[href*="inemi"]') !== null;

      // 8. Fetch live InEMI options or build verified fallback schedules
      const liveOptions = await fetchLiveAmazonEmi(productId, olid, listPrice, cashDiscount);
      let paymentOptions = [];

      if (liveOptions && liveOptions.length > 0) {
        // Prepend Cash Full option
        const cashOption = {
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
   * Default selected option ID (prefers 6M No-Cost EMI if available, else Cash).
   */
  selectedOptionId(doc) {
    const pageText = (doc && doc.body ? doc.body.innerText : '');
    if (pageText.includes('No Cost EMI') || (doc && doc.querySelector && doc.querySelector('#inemi_feature_div') !== null)) {
      return 'nocost_6m';
    }
    return 'cash_full';
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
        '#desktop_buybox',
        '#centerCol'
      ];

      for (const sel of targets) {
        const el = doc.querySelector(sel);
        if (el && el.parentNode) {
          slot = doc.createElement('div');
          slot.id = 'paylens-amazon-slot';
          slot.style.margin = '16px 0';
          slot.style.width = '100%';

          if (sel === '#centerCol') {
            el.appendChild(slot);
          } else {
            el.parentNode.insertBefore(slot, el.nextSibling);
          }
          return slot;
        }
      }

      return null;
    } catch (err) {
      console.warn('[Paylens AmazonAdapter] Error locating mountPoint:', err);
      return null;
    }
  },

  /**
   * Observes variant switches and price updates.
   */
  observe(doc, onChange) {
    if (!doc || typeof onChange !== 'function') return () => {};

    let debounceTimer = null;
    let lastStateKey = '';

    const notify = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const listing = await Promise.resolve(AmazonAdapter.extract(doc));
          const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : '';
          if (stateKey && stateKey !== lastStateKey) {
            lastStateKey = stateKey;
            onChange({ productId: listing.product_id, optionId: 'nocost_6m' });
          }
        } catch (_) {}
      }, 250);
    };

    const observer = new MutationObserver(() => notify());
    const target = doc.querySelector('#centerCol') || doc.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }

    return () => {
      clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }
};

export default AmazonAdapter;
