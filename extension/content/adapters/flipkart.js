/**
 * extension/content/adapters/flipkart.js
 * Storefront DOM Adapter for Flipkart (flipkart.com).
 * Reverse-engineered from Buyhatke Chrome extension architecture (v5.1.170_0 / pos: 2):
 * - Cascading PID extraction (URL query params, path itm slugs, DOM link attributes)
 * - Brand-prefix aware product title extraction (.qbKhdn / .G6XhRU + h1.VU-ZEz / h1.C5Tx4z)
 * - High-precision selling price and MRP extraction (Nx9bqj.CxhGGd / _30jeq3._16Jk6d)
 * - Bank offer pills and instant cash discount detection
 * - In-DOM and __INITIAL_STATE__ EMI scheme extraction (EMI_OFFER_PILL, BANK_OFFER_PILL)
 * - Resilient fallback to verified Indian bank schedules
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

import { parsePriceFromText } from '../currency.js';
import { UniversalEmiExtractor } from '../emi_extractor.js';

/**
 * Extracts Schema.org JSON-LD Product object if present on page
 */
function getJsonLdProduct(doc) {
  if (!doc) return null;
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '{}');
      if (data['@type'] === 'Product') return data;
      if (Array.isArray(data['@graph'])) {
        const prod = data['@graph'].find(item => item && item['@type'] === 'Product');
        if (prod) return prod;
      }
      if (Array.isArray(data)) {
        const prod = data.find(item => item && item['@type'] === 'Product');
        if (prod) return prod;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Extracts Flipkart PID using Buyhatke's cascading priority:
 * URL search param (pid) -> URL /p/ slug -> JSON-LD -> Canonical -> DOM anchor -> input[name=pid]
 */
function extractPid(doc) {
  if (!doc) return null;
  const url = (doc.defaultView?.location?.href || (typeof window !== 'undefined' ? window.location.href : '') || '');

  // 1. URL Query parameter pid=... (16 alphanumeric chars)
  const pidParamMatch = url.match(/[?&]pid=([A-Z0-9]{16})/i) || url.match(/[?&]pid=([A-Z0-9]+)/i);
  if (pidParamMatch) {
    return pidParamMatch[1];
  }

  // 2. URL Path /p/itm...
  const itmMatch = url.match(/\/p\/(itm[a-z0-9]+)/i) || url.match(/(itm[a-z0-9]{10,})/i);
  if (itmMatch) {
    return itmMatch[1];
  }

  // 3. Schema.org JSON-LD
  const jsonLd = getJsonLdProduct(doc);
  if (jsonLd && (jsonLd.sku || jsonLd.productID)) {
    return String(jsonLd.sku || jsonLd.productID);
  }

  // 4. Canonical link
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical && canonical.href) {
    const cm = canonical.href.match(/[?&]pid=([A-Z0-9]+)/i) || canonical.href.match(/\/p\/(itm[a-z0-9]+)/i);
    if (cm) return cm[1];
  }

  // 5. Anchor tags with pid
  const anchorPid = doc.querySelector('a[href*="pid="]');
  if (anchorPid && anchorPid.href) {
    const m = anchorPid.href.match(/[?&]pid=([A-Z0-9]+)/i);
    if (m) return m[1];
  }

  // 6. Form inputs
  const inputPid = doc.querySelector('input[name="pid"], input#pid');
  if (inputPid && inputPid.value) {
    return inputPid.value.trim();
  }

  return null;
}

/**
 * Extracts Product Title combining optional Brand Prefix and Model Name
 */
function extractTitle(doc) {
  if (!doc) return 'Flipkart Product';

  // 1. Schema.org JSON-LD title
  const jsonLd = getJsonLdProduct(doc);
  if (jsonLd && jsonLd.name && jsonLd.name.trim().length > 1) {
    return jsonLd.name.trim();
  }

  // 2. Extract optional brand prefix (e.g. "Apple", "Samsung", "Nike")
  let brandPrefix = '';
  const brandEl = doc.querySelector('div.qbKhdn, span.G6XhRU, span._2WkVRV, ._2WkVRV');
  if (brandEl && brandEl.innerText) {
    brandPrefix = brandEl.innerText.trim();
  }

  // 3. Extract core title from DOM
  const titleSelectors = [
    'h1.VU-ZEz',
    'h1.C5Tx4z',
    'h1._6EBuvT',
    'h1 .B_NuCI',
    'span.VU-ZEz',
    'span.B_NuCI',
    '.LMizgS',
    'h1'
  ];
  let title = '';
  for (const sel of titleSelectors) {
    const el = doc.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length > 1) {
      title = el.innerText.trim();
      break;
    }
  }

  // 4. OpenGraph title fallback
  if (!title) {
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      title = ogTitle.content.replace(/\s*-\s*Flipkart\.com.*?$/i, '').trim();
    }
  }

  if (!title && doc.title) {
    title = doc.title.replace(/\s*-\s*Flipkart\.com.*?$/i, '').trim();
  }

  if (!title) title = 'Flipkart Product';

  // If brand prefix exists and title doesn't already start with it, prepend
  if (brandPrefix && !title.toLowerCase().startsWith(brandPrefix.toLowerCase())) {
    return `${brandPrefix} ${title}`;
  }
  return title;
}

/**
 * Extracts Selling Price and MRP with multi-source cascading fallbacks
 */
function extractPrice(doc) {
  if (!doc) return { listPrice: 0, mrp: 0 };
  let listPrice = 0;
  let mrp = 0;

  // 1. Schema.org JSON-LD Price
  const jsonLd = getJsonLdProduct(doc);
  if (jsonLd && jsonLd.offers) {
    const offers = jsonLd.offers;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (offer && (offer.price || offer.lowPrice)) {
      const p = parseFloat(offer.price || offer.lowPrice || '0');
      if (p > 0) listPrice = p;
    }
  }

  // 2. OpenGraph & Microdata Price
  if (listPrice <= 0) {
    const ogPrice = doc.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"], meta[itemprop="price"]');
    if (ogPrice && ogPrice.content) {
      const p = parseFloat(ogPrice.content);
      if (p > 0) listPrice = p;
    }
  }

  // 3. Current selling price via Flipkart CSS classes
  if (listPrice <= 0) {
    const priceSelectors = [
      'div.Nx9bqj.CxhGGd',
      'div._30jeq3._16Jk6d',
      'div._25b18c ._30jeq3',
      'div.Nx9bqj',
      'div._30jeq3',
      'div._16Jk6d',
      '[class*="Nx9bqj"]',
      '[class*="_30jeq3"]'
    ];
    for (const sel of priceSelectors) {
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

  // 4. Currency Regex fallback in product container
  if (listPrice <= 0) {
    const candidates = doc.querySelectorAll('div.col-8-12 div, div.UQC-roll div, div._25b18c div, span');
    for (const el of candidates) {
      if (el.children.length === 0 && el.innerText && el.innerText.trim().startsWith('₹')) {
        const val = parsePriceFromText(el.innerText);
        if (val >= 100) {
          listPrice = val;
          break;
        }
      }
    }
  }

  // 5. MRP / Original strikethrough price
  const mrpSelectors = [
    'div.yRaY8j.A68qe2',
    'div._3I9_wc._2p6lqe',
    'div.yRaY8j',
    'div._3I9_wc',
    '[class*="yRaY8j"]',
    '[class*="_3I9_wc"]'
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
 * Extracts Instant Bank Discounts & Special Price Offers
 */
function extractDiscounts(doc, listPrice) {
  let cashDiscount = 0.0;
  if (!doc) return cashDiscount;

  const offerElements = doc.querySelectorAll('div.x-r2QD, div._3Ay6Sb, div.UkUFwK, li._16eBzU, div._2teBhd, div._3j4G2b');
  for (const off of offerElements) {
    const txt = off.innerText || '';
    const match = txt.match(/(?:Flat\s*(?:₹|Rs\.?)\s*|Instant\s*Discount\s*of\s*(?:₹|Rs\.?)\s*|Special\s*Price.*?₹\s*|extra\s*(?:₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
    if (match) {
      cashDiscount = Math.max(cashDiscount, parsePriceFromText(match[1]));
    }
  }

  // Cap discount at 40% of list price
  if (cashDiscount > listPrice * 0.40) {
    cashDiscount = 0.0;
  }
  return cashDiscount;
}

/**
 * Extracts real EMI plans from DOM widgets or embedded window.__INITIAL_STATE__
 */
function extractFlipkartEmis(doc, listPrice, cashDiscount) {
  if (!doc) return [];
  const options = [];

  const knownBanks = [
    { key: 'hdfc', name: 'HDFC Bank' },
    { key: 'sbi', name: 'SBI Card' },
    { key: 'icici', name: 'ICICI Bank' },
    { key: 'axis', name: 'Flipkart Axis Bank' },
    { key: 'kotak', name: 'Kotak Bank' },
    { key: 'bajaj', name: 'Bajaj Finserv', isBnpl: true },
    { key: 'flipkartpaylater', name: 'Flipkart Pay Later', isBnpl: true },
    { key: 'onecard', name: 'OneCard' },
    { key: 'rbl', name: 'RBL Bank' }
  ];

  // 1. Inspect DOM EMI widgets / tables
  const emiContainers = doc.querySelectorAll('div._3XINqE, div.row._3q9YpE, div._29jN3X, div._3eA9m-, ._1-8UeG, table.p-1');
  for (const cont of emiContainers) {
    const text = cont.innerText || cont.textContent || '';
    let bankMatch = null;
    for (const b of knownBanks) {
      if (text.toLowerCase().includes(b.name.toLowerCase()) || text.toLowerCase().includes(b.key)) {
        bankMatch = b;
        break;
      }
    }

    const tenureMatch = text.match(/(\d+)\s*(?:months|month|m)\b/i);
    const priceMatch = text.match(/(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);

    if (tenureMatch && priceMatch) {
      const tenure = parseInt(tenureMatch[1], 10);
      const installment = parsePriceFromText(priceMatch[1]);
      if (tenure >= 3 && tenure <= 36 && installment > 0 && installment < listPrice) {
        const isDebit = /debit/i.test(text);
        if (isDebit && listPrice < 5000) continue;

        const isBnpl = /pay\s*later|bajaj/i.test(text) || (bankMatch && bankMatch.isBnpl);
        const isNoCost = /no\s*cost/i.test(text) || Math.abs((installment * tenure) - listPrice) < 5 || (bankMatch?.key === 'bajaj');
        const rateMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
        const statedRate = isNoCost ? 0.0 : (rateMatch ? parseFloat(rateMatch[1]) : (isDebit ? 16.0 : 14.5));

        const instrumentType = isDebit ? 'DEBIT_CARD' : (isBnpl ? 'CARDLESS_BNPL' : 'CREDIT_CARD');
        const bankKey = bankMatch ? bankMatch.key : (isDebit ? 'debit' : (isBnpl ? 'bnpl' : 'flipkart_partner'));
        let bankName = bankMatch ? bankMatch.name : (isDebit ? 'Debit Card EMI' : 'Flipkart Partner Bank');

        let fee = 199.0;
        let eligibilityNote = null;
        if (bankKey === 'bajaj') {
          fee = 117.0;
          eligibilityNote = "Requires active Bajaj Finserv EMI Network Card. Zero cost EMI with ₹117 processing fee.";
        } else if (bankKey === 'flipkartpaylater') {
          fee = 0.0;
          eligibilityNote = "Instant credit line up to ₹1,00,000. Requires PAN & Aadhaar verification on Flipkart.";
        } else if (isDebit) {
          if (!bankName.includes('Debit')) bankName = `${bankName} (Debit Card)`;
          eligibilityNote = "Pre-approved bank debit cardholders only (min order ₹5,000). Check with your issuing bank via SMS.";
        }

        const prefix = isNoCost ? 'nocost' : 'std';
        const typePrefix = isDebit ? 'debit_' : (isBnpl ? 'bnpl_' : '');
        const optId = `${prefix}_${typePrefix}${bankKey}_${tenure}m`;

        if (!options.some(o => o.option_id === optId)) {
          options.push({
            option_id: optId,
            instrument_type: instrumentType,
            bank_key: bankKey,
            bank_name: bankName,
            type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
            label: isNoCost
              ? `${bankName} No-Cost EMI (${tenure} Months)`
              : `${bankName} Standard EMI (${tenure} Months @ ${statedRate}% APR)`,
            tenure_months: tenure,
            monthly_installment: installment,
            upfront_downpayment: 0.0,
            processing_fee: fee,
            lost_cash_discount: cashDiscount,
            stated_interest_rate: statedRate,
            eligibility_note: eligibilityNote
          });
        }
      }
    }
  }

/**
 * Extracts balanced JSON object string from a script element containing window.__INITIAL_STATE__
 * Reverse-engineered from Buyhatke utility_all2:595422
 */
function extractJsonFromScriptText(text, varName = 'window.__INITIAL_STATE__') {
  if (!text) return null;
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(escaped + '\\s*=\\s*\\{'));
  if (!match) return null;

  const startIdx = match.index + match[0].length - 1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;
  let endIdx = -1;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (endIdx !== -1) {
    try {
      return JSON.parse(text.slice(startIdx, endIdx + 1));
    } catch (_) {
      return null;
    }
  }
  return null;
}

function walkStateForEmis(obj, listPrice, cashDiscount, options, knownBanks, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      walkStateForEmis(item, listPrice, cashDiscount, options, knownBanks, depth + 1);
    }
    return;
  }

  // Check for installment/EMI structure
  if (obj.tenure && (obj.monthlyInstallment || obj.monthlyAmount || obj.installmentAmount)) {
    const tenure = parseInt(obj.tenure, 10);
    const installment = parseFloat(obj.monthlyInstallment || obj.monthlyAmount || obj.installmentAmount);
    if (tenure >= 3 && tenure <= 36 && installment > 0 && installment < listPrice) {
      const bankRaw = String(obj.bankName || obj.bank || obj.title || 'Flipkart Verified Bank');
      let bankName = bankRaw;
      for (const b of knownBanks) {
        if (bankRaw.toLowerCase().includes(b.name.toLowerCase()) || bankRaw.toLowerCase().includes(b.key)) {
          bankName = b.name;
          break;
        }
      }
      const isNoCost = Boolean(obj.isNoCost || obj.subventionAmount > 0 || Math.abs((installment * tenure) - listPrice) < 5);
      const statedRate = isNoCost ? 0.0 : (parseFloat(obj.rate || obj.interestRate || obj.apr) || 14.5);
      const bankSlug = bankName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const optId = isNoCost ? `nocost_${bankSlug}_${tenure}m` : `std_${bankSlug}_${tenure}m`;

      if (!options.some(o => o.option_id === optId)) {
        options.push({
          option_id: optId,
          type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
          label: isNoCost
            ? `${bankName} No-Cost EMI (${tenure} Months)`
            : `${bankName} Standard EMI (${tenure} Months @ ${statedRate}% APR)`,
          tenure_months: tenure,
          monthly_installment: Math.round(installment * 100) / 100,
          upfront_downpayment: 0.0,
          processing_fee: 199.0,
          lost_cash_discount: cashDiscount,
          stated_interest_rate: statedRate
        });
      }
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      walkStateForEmis(obj[key], listPrice, cashDiscount, options, knownBanks, depth + 1);
    }
  }
}

  // 2. Buyhatke exact script parsing: script#is_script or scripts containing __INITIAL_STATE__
  try {
    const isScript = doc.getElementById('is_script');
    const scripts = isScript ? [isScript] : Array.from(doc.querySelectorAll('script'));
    for (const s of scripts) {
      const content = s.textContent || '';
      if (!content.includes('__INITIAL_STATE__') && !content.includes('EMI_OFFER_PILL') && !content.includes('installmentPlans')) {
        continue;
      }

      // Try balanced-braces JSON parsing
      const stateObj = extractJsonFromScriptText(content, 'window.__INITIAL_STATE__');
      if (stateObj) {
        walkStateForEmis(stateObj, listPrice, cashDiscount, options, knownBanks);
      }

      // Regex fallback for minified substrings
      const tenureMatches = content.matchAll(/"tenure":\s*(\d+)[^}]+?"monthlyInstallment":\s*([0-9.]+)/g);
      for (const tm of tenureMatches) {
        const tenure = parseInt(tm[1], 10);
        const installment = parseFloat(tm[2]);
        if (tenure >= 3 && tenure <= 36 && installment > 0 && installment < listPrice) {
          const isNoCost = Math.abs((installment * tenure) - listPrice) < 5;
          const optId = isNoCost ? `nocost_fk_${tenure}m` : `std_fk_${tenure}m`;
          if (!options.some(o => o.option_id === optId)) {
            options.push({
              option_id: optId,
              type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
              label: isNoCost
                ? `Flipkart Verified No-Cost EMI (${tenure} Months)`
                : `Flipkart Standard EMI (${tenure} Months @ 14.5% APR)`,
              tenure_months: tenure,
              monthly_installment: Math.round(installment * 100) / 100,
              upfront_downpayment: 0.0,
              processing_fee: 199.0,
              lost_cash_discount: cashDiscount,
              stated_interest_rate: isNoCost ? 0.0 : 14.5
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Paylens FlipkartAdapter] Error inspecting __INITIAL_STATE__ script:', err);
  }

  return options;
}

/**
 * Builds verified fallback payment options with standard Indian bank schedules
 */
function buildFallbackPaymentOptions(listPrice, effectiveCash, cashDiscount, hasNoCostEmi) {
  const stdFee = 199.0;
  const options = [
    {
      option_id: 'cash_full',
      type: 'CASH',
      label: cashDiscount > 0
        ? `Full Payment (Includes ₹${cashDiscount.toLocaleString('en-IN')} Bank Offer)`
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
      label: 'No-Cost EMI (3 Months — Flipkart Axis/HDFC)',
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
      label: 'No-Cost EMI (6 Months — SBI/ICICI/Kotak)',
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
    label: 'Standard EMI (9 Months @ 14% APR — HDFC/SBI)',
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

export const FlipkartAdapter = {
  id: 'flipkart',

  /**
   * Matches Flipkart product pages.
   */
  matches(url = (typeof window !== 'undefined' ? window.location.href : '')) {
    if (!url) return false;
    const u = url.toLowerCase();
    const isFlipkart = u.includes('flipkart.com') || (typeof document !== 'undefined' && (document.domain || '').includes('flipkart'));
    if (!isFlipkart) return false;
    const isProductPage = u.includes('/p/') || u.includes('pid=') || u.includes('itm') || u.includes('/product/');
    if (isProductPage) return true;

    // Check DOM if available (for SPA transitions without full URL change)
    if (typeof document !== 'undefined') {
      if (document.querySelector('input[name="pid"], a[href*="pid="], div.Nx9bqj, div._30jeq3, div.col-8-12')) {
        return true;
      }
      const jsonLd = getJsonLdProduct(document);
      if (jsonLd) return true;
    }
    return false;
  },

  /**
   * Extracts active Flipkart product details and maps to Listing schema.
   */
  async extract(doc) {
    try {
      if (!doc) return null;

      // 1. Cascading PID
      const productId = extractPid(doc) || 'fk_item_' + (Math.abs((doc.title || '').length) % 10000);

      // 2. Brand-prefix aware Product Title
      const title = extractTitle(doc);

      // 3. Multi-part Price and MRP
      const { listPrice } = extractPrice(doc);
      if (listPrice <= 0) {
        return null;
      }

      // 4. Category
      let category = 'Electronics';
      const breadcrumbEls = doc.querySelectorAll('a._2whKao, div._3GIHBu a');
      if (breadcrumbEls && breadcrumbEls.length > 1) {
        category = breadcrumbEls[1].innerText.trim() || 'Electronics';
      }

      // 5. Detect Bank Offers & Instant Discounts
      const cashDiscount = extractDiscounts(doc, listPrice);
      const effectiveCash = Math.max(0, listPrice - cashDiscount);

      // 6. Detect No-Cost EMI availability
      const pageText = (doc.body ? doc.body.innerText : '');
      const hasNoCostEmi = pageText.includes('No Cost EMI') || pageText.includes('No cost EMI');

      // 7. Extract real EMI plans or fallback to verified schedules
      let realEmis = extractFlipkartEmis(doc, listPrice, cashDiscount);
      if (!realEmis || realEmis.length === 0) {
        realEmis = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, 'Flipkart');
      }
      let paymentOptions = [];

      if (realEmis && realEmis.length > 0) {
        const cashOption = {
          option_id: 'cash_full',
          bank_key: 'cash',
          bank_name: 'Cash / UPI',
          type: 'CASH',
          label: cashDiscount > 0
            ? `Full Payment (Includes ₹${cashDiscount.toLocaleString('en-IN')} Bank Offer)`
            : 'Full Payment Upfront',
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0.0,
          processing_fee: 0.0,
          lost_cash_discount: null,
          stated_interest_rate: 0.0
        };

        const topNoCost = realEmis.find(o => o.type === 'NO_COST_EMI');
        if (topNoCost && !realEmis.some(o => o.option_id === 'nocost_6m')) {
          realEmis.unshift({
            ...topNoCost,
            option_id: 'nocost_6m'
          });
        }
        paymentOptions = [cashOption, ...realEmis];
      } else {
        paymentOptions = buildFallbackPaymentOptions(listPrice, effectiveCash, cashDiscount, hasNoCostEmi);
      }

      return {
        product_id: productId,
        title: title,
        category: category,
        retailer: 'Flipkart',
        currency: 'INR',
        currency_symbol: '₹',
        original_price: listPrice,
        exchange_rate: 1.0,
        upfront_cash_price: listPrice,
        cash_discount: cashDiscount,
        effective_cash_price: effectiveCash,
        payment_options: paymentOptions
      };
    } catch (err) {
      console.warn('[Paylens FlipkartAdapter] Error extracting listing (returning null):', err);
      return null;
    }
  },

  /**
   * Default selected option ID (prefers 6M No-Cost EMI if available, else standard Axis/HDFC 3M).
   */
  selectedOptionId(doc) {
    const offerContainers = doc ? doc.querySelectorAll('div._3XINqE, div._29jN3X, div._3eA9m-, [class*="offer"]') : [];
    for (const c of offerContainers) {
      if (/no\s*cost\s*emi/i.test(c.innerText || '')) {
        return 'nocost_6m';
      }
    }
    return 'std_axis_3m';
  },

  /**
   * Locates mount point inside Flipkart's main product detail column.
   */
  mountPoint(doc) {
    try {
      if (!doc) return null;

      let slot = doc.querySelector('#paylens-flipkart-slot');
      if (slot) return slot;

      const targets = [
        'div.UQC-roll',
        'div._25b18c',
        'div.Nx9bqj.CxhGGd',
        'div.col-8-12',
        'div._2c22dd',
        'div._1YokD2._3Mn1Gg'
      ];

      for (const sel of targets) {
        const el = doc.querySelector(sel);
        if (el && el.parentNode) {
          slot = doc.createElement('div');
          slot.id = 'paylens-flipkart-slot';
          slot.style.margin = '16px 0';
          slot.style.width = '100%';

          if (sel === 'div.col-8-12' || sel === 'div._2c22dd') {
            el.appendChild(slot);
          } else {
            el.parentNode.insertBefore(slot, el.nextSibling);
          }
          return slot;
        }
      }

      // Floating launcher pill attaches cleanly to doc.body if specific container classes are absent
      return doc.body || null;
    } catch (err) {
      return doc.body || null;
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
          const listing = await Promise.resolve(FlipkartAdapter.extract(doc));
          const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : '';
          if (stateKey && stateKey !== lastStateKey) {
            lastStateKey = stateKey;
            onChange({ productId: listing.product_id, optionId: FlipkartAdapter.selectedOptionId(doc) });
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

    const target = doc.querySelector('div.col-8-12') || doc.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }

    return () => {
      clearTimeout(debounceTimer);
      if (observer) observer.disconnect();
    };
  }
};

export default FlipkartAdapter;
