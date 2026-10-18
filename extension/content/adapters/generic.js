/**
 * extension/content/adapters/generic.js
 * Universal Storefront DOM Adapter for Any E-Commerce Website.
 * Uses Schema.org JSON-LD, OpenGraph tags, and semantic microdata.
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
  const clean = text.replace(/[^0-9.]/g, '');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function getJsonLdProduct(doc) {
  if (!doc) return null;
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '{}');
      if (data['@type'] === 'Product') return data;
      if (Array.isArray(data['@graph'])) {
        const prod = data['@graph'].find(item => item['@type'] === 'Product');
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

export const GenericAdapter = {
  id: 'generic',

  /**
   * Matches any webpage that contains standard e-commerce product metadata.
   */
  matches(url = '') {
    if (typeof document === 'undefined') return false;
    const jsonLd = getJsonLdProduct(document);
    if (jsonLd) {
      const offers = jsonLd.offers;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      if (offer && (offer.price || offer.highPrice || offer.lowPrice)) {
        const p = parseFloat(offer.price || offer.lowPrice || '0');
        if (p > 0) return true;
      }
    }

    const hasOgPrice = document.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"]');
    if (hasOgPrice && parseFloat(hasOgPrice.content || '0') > 0) return true;

    return false;
  },

  /**
   * Extracts product details using structured data with fallback to OpenGraph & DOM.
   */
  extract(doc) {
    try {
      if (!doc) return null;

      let title = '';
      let listPrice = 0;
      let category = 'Retail';
      let productId = 'gen_item_' + (Math.abs(doc.title?.length || 100));

      // 1. Try Schema.org JSON-LD
      const jsonLd = getJsonLdProduct(doc);
      if (jsonLd) {
        title = jsonLd.name || '';
        category = jsonLd.category || category;
        productId = jsonLd.sku || jsonLd.productID || productId;

        const offers = jsonLd.offers;
        if (offers) {
          const offer = Array.isArray(offers) ? offers[0] : offers;
          if (offer && offer.price) {
            listPrice = parseFloat(offer.price);
          }
        }
      }

      // 2. OpenGraph Fallbacks
      if (!title) {
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        title = ogTitle?.content || doc.querySelector('h1')?.innerText?.trim() || 'Store Product';
      }

      if (listPrice <= 0) {
        const ogPrice = doc.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"]');
        if (ogPrice && ogPrice.content) {
          listPrice = parseFloat(ogPrice.content);
        }
      }

      // 3. Semantic DOM Fallback
      if (listPrice <= 0) {
        const priceEl = doc.querySelector('[itemprop="price"], .product-price, .price');
        if (priceEl) {
          listPrice = parsePriceFromText(priceEl.innerText || priceEl.getAttribute('content'));
        }
      }

      if (listPrice <= 0) return null;

      const hostname = (doc.defaultView?.location?.hostname || (typeof window !== 'undefined' ? window.location.hostname : 'Online Retailer'));
      const retailer = hostname.replace(/^www\./, '').split('.')[0].toUpperCase();

      const effectiveCash = listPrice;
      const stdFee = 199.0;

      // Generate payment options
      const paymentOptions = [
        {
          option_id: 'cash_full',
          type: 'CASH',
          label: 'Full Payment Upfront',
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0.0,
          processing_fee: 0.0,
          lost_cash_discount: null,
          stated_interest_rate: 0.0
        },
        {
          option_id: 'nocost_3m',
          type: 'NO_COST_EMI',
          label: 'No-Cost EMI (3 Months)',
          tenure_months: 3,
          monthly_installment: Math.round((listPrice / 3) * 100) / 100,
          upfront_downpayment: 0.0,
          processing_fee: stdFee,
          lost_cash_discount: 0.0,
          stated_interest_rate: 0.0
        },
        {
          option_id: 'nocost_6m',
          type: 'NO_COST_EMI',
          label: 'No-Cost EMI (6 Months)',
          tenure_months: 6,
          monthly_installment: Math.round((listPrice / 6) * 100) / 100,
          upfront_downpayment: 0.0,
          processing_fee: stdFee,
          lost_cash_discount: 0.0,
          stated_interest_rate: 0.0
        },
        {
          option_id: 'std_12m',
          type: 'STANDARD_EMI',
          label: 'Standard EMI (12 Months @ 15% APR)',
          tenure_months: 12,
          monthly_installment: calculateEmiInstallment(listPrice, 15.0, 12),
          upfront_downpayment: 0.0,
          processing_fee: stdFee,
          lost_cash_discount: 0.0,
          stated_interest_rate: 15.0
        }
      ];

      return {
        product_id: String(productId),
        title: title,
        category: category,
        retailer: retailer,
        upfront_cash_price: listPrice,
        cash_discount: 0.0,
        effective_cash_price: effectiveCash,
        payment_options: paymentOptions
      };
    } catch (err) {
      console.warn('[Paylens GenericAdapter] Error during extraction:', err);
      return null;
    }
  },

  selectedOptionId(doc) {
    return 'nocost_6m';
  },

  mountPoint(doc) {
    try {
      if (!doc) return null;
      let slot = doc.querySelector('#paylens-generic-slot');
      if (slot) return slot;

      // Look for price container
      const priceEl = doc.querySelector('[itemprop="price"], .product-price, .price, .product-info');
      if (priceEl && priceEl.parentNode) {
        slot = doc.createElement('div');
        slot.id = 'paylens-generic-slot';
        slot.style.margin = '16px 0';
        priceEl.parentNode.insertBefore(slot, priceEl.nextSibling);
        return slot;
      }

      // No price container found
      return null;
    } catch (err) {
      return null;
    }
  },

  observe(doc, onChange) {
    if (!doc || typeof onChange !== 'function') return () => {};
    let observer = null;
    observer = new MutationObserver(() => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        if (observer) observer.disconnect();
        return;
      }
      const listing = GenericAdapter.extract(doc);
      if (listing) {
        onChange({ productId: listing.product_id, optionId: 'nocost_6m' });
      }
    });
    observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    return () => {
      if (observer) observer.disconnect();
    };
  }
};

export default GenericAdapter;
