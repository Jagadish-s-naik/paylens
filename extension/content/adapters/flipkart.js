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

// UniversalEmiExtractor provides universal, ground-truth bank EMI extraction across modals, drawers, and bank subventions.

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

      // 7. Extract real EMI plans via UniversalEmiExtractor
      let realEmis = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, 'Flipkart');
      let paymentOptions = [];

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

      if (realEmis && realEmis.length > 0) {
        const topNoCost = realEmis.find(o => o.type === 'NO_COST_EMI');
        if (topNoCost && !realEmis.some(o => o.option_id === 'nocost_6m')) {
          realEmis.unshift({
            ...topNoCost,
            option_id: 'nocost_6m'
          });
        }
        paymentOptions = [cashOption, ...realEmis];
      } else {
        paymentOptions = [cashOption];
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
   * Default selected option ID:
   * 1. Detects live active bank & tenure in any open EMI modal
   * 2. Promotes featured bank offers (e.g. ICICI Bank Flat ₹5,500 off)
   * 3. Defaults to 6M ICICI / HDFC EMI
   */
  selectedOptionId(doc) {
    if (!doc) return 'std_icici_6m';

    // 1. If an EMI modal is open in the DOM, detect active bank and selected tenure
    const modalContainers = doc.querySelectorAll(
      '[role="dialog"], [class*="modal" i], [class*="overlay" i], div._10Ermr, div._2rQPcW, div._1k9_yB, div.fk-modal-portal'
    );
    for (const cont of modalContainers) {
      const text = cont.innerText || cont.textContent || '';
      if (!text.includes('Installment') && !text.includes('Interest') && !text.includes('EMI')) continue;

      const activeBank = UniversalEmiExtractor.extractActiveBankFromContainer(cont);
      const bKey = activeBank ? activeBank.key : 'icici';

      // Check for checked radio or selected option row
      const checkedInput = cont.querySelector('input[type="radio"]:checked, [aria-checked="true"], [class*="selected"], [class*="active"]');
      if (checkedInput) {
        const rowEl = checkedInput.closest('tr, [class*="row"], [class*="item"], li, label, div') || checkedInput;
        const rowText = rowEl.innerText || rowEl.textContent || '';
        const tm = rowText.match(/(\d+)\s*(?:months?|m)\b/i);
        if (tm) {
          const m = parseInt(tm[1], 10);
          return `std_${bKey}_${m}m`;
        }
      }

      return `std_${bKey}_6m`;
    }

    // 2. Check for on-page PDP Bank Offers (e.g. ICICI Bank Flat ₹5,500 off)
    const pageText = (doc.body ? doc.body.innerText : '') || '';
    if (/ICICI/i.test(pageText) && /(?:Bank\s*Offer|discount|off|flat)[^\n.]*?ICICI/i.test(pageText)) {
      return 'std_icici_6m';
    }
    if (/HDFC/i.test(pageText) && /(?:Bank\s*Offer|discount|off|flat)[^\n.]*?HDFC/i.test(pageText)) {
      return 'std_hdfc_6m';
    }
    if (/Axis/i.test(pageText) && /(?:Bank\s*Offer|discount|off|flat)[^\n.]*?Axis/i.test(pageText)) {
      return 'std_axis_6m';
    }

    if (/no\s*cost\s*emi/i.test(pageText)) {
      return 'nocost_6m';
    }

    return 'std_icici_6m';
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
          const hasModal = Boolean(doc.querySelector('[role="dialog"], [class*="modal" i], [class*="overlay" i], div._10Ermr, div._2rQPcW'));
          const stateKey = listing
            ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}_${listing.payment_options?.length || 0}_${hasModal ? 'modal' : 'nomodal'}`
            : '';
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

    const target = doc.body || doc.querySelector('div.col-8-12') || doc.documentElement;
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
