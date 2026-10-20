/**
 * extension/content/adapters/reliance_digital.js
 * Storefront DOM Adapter for Reliance Digital (reliancedigital.in).
 * Extracts ground-truth product information, instant bank discounts, and real bank EMI options:
 * - High-precision PID extraction from URL /p/ slugs and DOM sku attributes
 * - Clean product title extraction (.pdp__title)
 * - Selling price and MRP extraction (.pdp__offerPrice, .text-lg)
 * - Bank offer and discount extraction (.pdp__offers)
 * - Real EMI integration via UniversalEmiExtractor (Credit Card, Debit Card, Bajaj Finserv)
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

function extractPid(doc) {
  if (!doc) return null;
  const url = (doc.defaultView?.location?.href || (typeof window !== 'undefined' ? window.location.href : '') || '');

  // 1. URL pattern /p/493838421
  const urlMatch = url.match(/\/p\/([0-9]+)/i) || url.match(/[?&]sku=([0-9]+)/i);
  if (urlMatch) return urlMatch[1];

  // 2. DOM attributes
  const skuEl = doc.querySelector('[data-sku], input#productCode, meta[property="product:retailer_item_id"]');
  if (skuEl) {
    const val = skuEl.getAttribute('data-sku') || skuEl.getAttribute('content') || skuEl.value;
    if (val && val.trim().length > 0) return val.trim();
  }

  // 3. Canonical link
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical && canonical.href) {
    const m = canonical.href.match(/\/p\/([0-9]+)/i);
    if (m) return m[1];
  }

  return null;
}

function extractTitle(doc) {
  if (!doc) return 'Reliance Digital Product';
  const selectors = [
    'h1.pdp__title',
    'h1.product-title',
    '.pdp-title',
    'h1',
    'meta[property="og:title"]'
  ];

  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const val = el.tagName === 'META' ? el.getAttribute('content') : (el.innerText || el.textContent);
      if (val && val.trim().length > 1) {
        return val.trim().replace(/\s*-\s*Reliance Digital.*?$/i, '').trim();
      }
    }
  }

  return 'Reliance Digital Product';
}

function extractPrice(doc) {
  let listPrice = 0.0;
  let mrp = 0.0;
  if (!doc) return { listPrice, mrp };

  const priceSelectors = [
    'span.pdp__offerPrice',
    '.pdp-offer-price',
    'span[class*="offerPrice"]',
    '.text-lg.font-bold',
    '.pdp-price',
    'span.amount'
  ];

  for (const sel of priceSelectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const val = parsePriceFromText(el.innerText || el.textContent || '');
      if (val > 0) {
        listPrice = val;
        break;
      }
    }
  }

  // Schema.org fallback
  if (listPrice <= 0) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent || '{}');
        if (data.offers && (data.offers.price || data.offers.lowPrice)) {
          listPrice = parseFloat(data.offers.price || data.offers.lowPrice);
          break;
        }
      } catch (_) {}
    }
  }

  // MRP
  const mrpEl = doc.querySelector('span.pdp__mrpPrice, .strike, span[class*="mrp"]');
  if (mrpEl) {
    mrp = parsePriceFromText(mrpEl.innerText || mrpEl.textContent || '');
  }

  return { listPrice, mrp };
}

function extractInstantDiscounts(doc, listPrice) {
  let discount = 0.0;
  if (!doc) return discount;

  const offerElements = doc.querySelectorAll('.pdp__offers, .bank-offers, .pdp-bank-offers-list, [class*="bankOffer"]');
  for (const el of offerElements) {
    const text = el.innerText || el.textContent || '';
    const m = text.match(/(?:Instant\s*(?:Discount|Cashback)\s*of\s*(?:₹|Rs\.?)\s*|Flat\s*(?:₹|Rs\.?)\s*|Save\s*(?:₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
    if (m) {
      discount = Math.max(discount, parsePriceFromText(m[1]));
    }
  }

  if (discount > listPrice * 0.40) discount = 0.0;
  return discount;
}

export const RelianceDigitalAdapter = {
  id: 'reliance_digital',

  matches(url = (typeof window !== 'undefined' ? window.location.href : '')) {
    if (!url) return false;
    const u = url.toLowerCase();
    const isReliance = u.includes('reliancedigital.in') || (typeof document !== 'undefined' && (document.domain || '').includes('reliancedigital'));
    if (!isReliance) return false;

    const isProductPage = u.includes('/p/') || /\/p\/[0-9]+/i.test(u);
    if (isProductPage) return true;

    if (typeof document !== 'undefined') {
      if (document.querySelector('h1.pdp__title, .pdp__offerPrice, [data-sku]')) {
        return true;
      }
    }
    return false;
  },

  async extract(doc) {
    try {
      if (!doc) return null;

      const productId = extractPid(doc) || 'rd_item_' + (Math.abs((doc.title || '').length) % 10000);
      const title = extractTitle(doc);
      const { listPrice } = extractPrice(doc);

      if (listPrice <= 0) return null;

      let category = 'Electronics';
      const breadcrumb = doc.querySelector('.breadcrumb, [class*="breadcrumb"]');
      if (breadcrumb && breadcrumb.innerText) {
        const parts = breadcrumb.innerText.split('>').map(s => s.trim()).filter(Boolean);
        if (parts.length > 1) category = parts[1];
      }

      const cashDiscount = extractInstantDiscounts(doc, listPrice);
      const effectiveCash = Math.max(0, listPrice - cashDiscount);

      const liveOptions = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, 'Reliance Digital');

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

      const paymentOptions = [cashOption, ...liveOptions];

      return {
        product_id: productId,
        title: title,
        category: category,
        retailer: 'Reliance Digital',
        currency: 'INR',
        currency_symbol: '₹',
        upfront_cash_price: listPrice,
        cash_discount: cashDiscount,
        effective_cash_price: effectiveCash,
        payment_options: paymentOptions
      };
    } catch (err) {
      console.warn('[Paylens RelianceDigitalAdapter] Error extracting listing:', err);
      return null;
    }
  },

  selectedOptionId(doc) {
    if (doc) {
      const text = doc.body ? doc.body.innerText : '';
      if (/no\s*cost\s*emi/i.test(text)) {
        return 'nocost_hdfc_3m';
      }
    }
    return 'std_hdfc_3m';
  },

  mountPoint(doc) {
    if (!doc) return null;
    const selectors = [
      '.pdp__priceSection',
      '.pdp-price-wrap',
      '.pdp__right',
      '.product-details',
      '.pdp__offerPrice'
    ];

    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el && el.parentNode) {
        let slot = doc.querySelector('#paylens-reliance-slot');
        if (!slot) {
          slot = doc.createElement('div');
          slot.id = 'paylens-reliance-slot';
          slot.style.margin = '16px 0';
          el.parentNode.insertBefore(slot, el.nextSibling);
        }
        return slot;
      }
    }

    return doc.body || null;
  },

  observe(doc, onChange) {
    if (!doc || typeof onChange !== 'function') return () => {};

    let debounceTimer = null;
    let lastStateKey = '';

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const listing = await Promise.resolve(RelianceDigitalAdapter.extract(doc));
          const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : '';
          if (stateKey && stateKey !== lastStateKey) {
            lastStateKey = stateKey;
            onChange({ productId: listing.product_id, optionId: RelianceDigitalAdapter.selectedOptionId(doc) });
          }
        } catch (_) {}
      }, 250);
    });

    const target = doc.querySelector('.pdp__priceSection, .pdp__right, body') || doc.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }
};

export default RelianceDigitalAdapter;
