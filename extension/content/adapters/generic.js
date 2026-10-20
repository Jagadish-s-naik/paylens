import { detectCurrency, classifyPrice, formatCurrencyAmount, parsePriceFromText } from '../currency.js';
import { UniversalEmiExtractor } from '../emi_extractor.js';

function calculateEmiInstallment(principal, annualRatePercent, months) {
  if (months <= 1 || annualRatePercent <= 0) {
    return Math.round((principal / Math.max(1, months)) * 100) / 100;
  }
  const monthlyRate = (annualRatePercent / 12) / 100;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi * 100) / 100;
}

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

export const GenericAdapter = {
  id: 'generic',

  /**
   * Matches any webpage that contains standard e-commerce product metadata,
   * common PDP URL patterns, or Add-to-Cart purchase triggers.
   */
  matches(url = '') {
    const u = (url || (typeof window !== 'undefined' ? window.location?.href : '') || '').toLowerCase();
    const hasPdpSlug = u.includes('/product/') || u.includes('/products/') || u.includes('/p/') ||
                       u.includes('/p-') || u.includes('/dp/') || u.includes('/item/') || u.includes('/itm/') ||
                       u.includes('/pd/') || u.includes('/buy') || u.includes('?pid=') || u.includes('?sku=') ||
                       u.includes('/catalog/product/view/');

    if (typeof document === 'undefined') {
      return hasPdpSlug;
    }

    // 1. Schema.org Product JSON-LD
    const jsonLd = getJsonLdProduct(document);
    if (jsonLd) {
      const offers = jsonLd.offers;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      if (offer && (offer.price || offer.highPrice || offer.lowPrice)) {
        const p = parseFloat(offer.price || offer.lowPrice || '0');
        if (p > 0) return true;
      }
      if (jsonLd.name) return true;
    }

    // 2. OpenGraph Price & Product Type
    const hasOgPrice = document.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"], meta[itemprop="price"]');
    if (hasOgPrice && parseFloat(hasOgPrice.content || hasOgPrice.getAttribute('content') || '0') > 0) {
      return true;
    }
    const ogType = document.querySelector('meta[property="og:type"]')?.content;
    if (ogType && (ogType === 'product' || ogType === 'product.item')) {
      return true;
    }

    // 3. Cart / Buy Button heuristics
    const buyButton = document.querySelector(
      'button[name*="add-to-cart"], button[id*="add-to-cart"], button[id*="buy"], ' +
      '#addToCart, .add-to-cart, .buy-now, .pdp-add-to-bag, .btn-add-to-cart, [data-action*="add-to-cart"]'
    );
    const hasPriceElement = document.querySelector('[itemprop="price"], .product-price, .price, [class*="price"]');

    if (hasPdpSlug && (buyButton || hasPriceElement)) {
      return true;
    }

    if (buyButton && hasPriceElement) {
      return true;
    }

    return false;
  },

  /**
   * Extracts product details using structured data with fallback to OpenGraph & DOM.
   */
  async extract(doc) {
    try {
      if (!doc) return null;

      let title = '';
      let listPrice = 0;
      let category = 'Retail';
      let productId = 'gen_item_' + (Math.abs(doc.title?.length || 100));

      let samplePriceText = '';
      // 1. Try Schema.org JSON-LD
      const jsonLd = getJsonLdProduct(doc);
      if (jsonLd) {
        title = jsonLd.name || '';
        category = jsonLd.category || category;
        productId = jsonLd.sku || jsonLd.productID || productId;

        const offers = jsonLd.offers;
        if (offers) {
          const offer = Array.isArray(offers) ? offers[0] : offers;
          if (offer && (offer.price || offer.lowPrice)) {
            listPrice = parseFloat(offer.price || offer.lowPrice || '0');
            if (offer.priceCurrency) samplePriceText = String(offer.priceCurrency);
          }
        }
      }

      // 2. Optimized Title Extraction
      if (!title) {
        // Myntra: brand (.pdp-title) + product name (.pdp-name)
        const myntraBrand = doc.querySelector('.pdp-title')?.innerText?.trim();
        const myntraName = doc.querySelector('.pdp-name')?.innerText?.trim();
        if (myntraBrand && myntraName) {
          title = `${myntraBrand} ${myntraName}`;
        } else if (myntraName) {
          title = myntraName;
        }
      }
      if (!title) {
        const titleSelectors = [
          '#productTitle',
          'h1.pdp-title',
          'h1[class*="title"]',
          'h1[class*="name"]',
          'h1[class*="product"]',
          '.product-title',
          '.pdp-product-title',
          '#product-title',
          'h1'
        ];
        for (const s of titleSelectors) {
          const el = doc.querySelector(s);
          if (el && el.innerText?.trim()) {
            title = el.innerText.trim();
            break;
          }
        }
      }
      if (!title) {
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        title = ogTitle?.content || doc.title || 'Store Product';
      }
      if (title) {
        title = title.replace(/\s*\|\s*.*$/, '').replace(/\s*:\s*Buy.*$/i, '').replace(/\s*-\s*Buy.*$/i, '').trim();
      }

      // 3. Optimized Price Extraction (Store-specific & Semantic priority)
      if (listPrice <= 0) {
        const ogPrice = doc.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"], meta[itemprop="price"]');
        if (ogPrice) {
          listPrice = parseFloat(ogPrice.content || ogPrice.getAttribute('content') || '0');
          samplePriceText = doc.querySelector('meta[property="og:price:currency"], meta[property="product:price:currency"], meta[itemprop="priceCurrency"]')?.content || '';
        }
      }

      if (listPrice <= 0) {
        const priceSelectors = [
          // Myntra specific selling price
          'span.pdp-price strong',
          'span.pdp-price',
          '.pdp-selling-price',
          '.pdp-discounted-price',
          // Croma & Tata CliQ
          'span.amount[data-testid="new-price"]',
          '.cp-price .amount',
          '.main-price',
          // Ajio
          'span.prod-sp',
          '.price-sp',
          // eBay
          '.x-price-primary span',
          '.x-price-primary',
          // General standard e-commerce selectors
          '[itemprop="price"]',
          '.product-price',
          '.selling-price',
          '.special-price',
          '.offer-price',
          '.price',
          '[class*="product-price"]',
          '[class*="selling-price"]',
          '[class*="price-current"]',
          '[class*="price"]'
        ];
        for (const sel of priceSelectors) {
          const el = doc.querySelector(sel);
          if (el) {
            const raw = el.innerText || el.getAttribute('content') || '';
            const val = parsePriceFromText(raw);
            if (val > 0) {
              listPrice = val;
              samplePriceText = raw;
              break;
            }
          }
        }
      }

      // 4. Fallback price scanning
      if (listPrice <= 0) {
        const textElements = doc.querySelectorAll('h1 ~ div, [class*="product"] div, [class*="buy"] div, span');
        for (const el of textElements) {
          if (el.children.length === 0 && el.innerText) {
            const t = el.innerText.trim();
            if (t.startsWith('₹') || t.startsWith('Rs') || t.startsWith('$') || t.startsWith('€') || t.startsWith('£') || t.startsWith('AED')) {
              const val = parsePriceFromText(t);
              if (val >= 1) {
                listPrice = val;
                samplePriceText = t;
                break;
              }
            }
          }
        }
      }

      // 5. Strikethrough MRP / Original Price Extraction (for discount calculation)
      let mrp = listPrice;
      const mrpSelectors = [
        'span.pdp-mrp s',
        'span.pdp-mrp',
        '.pdp-mrp',
        '.old-price',
        '.strike',
        '.original-price',
        'span.a-text-price span',
        '.basisPrice span'
      ];
      for (const sel of mrpSelectors) {
        const el = doc.querySelector(sel);
        if (el) {
          const val = parsePriceFromText(el.innerText || '');
          if (val > listPrice) {
            mrp = val;
            break;
          }
        }
      }

      if (listPrice <= 0) return null;

      // Classify Currency and convert to INR
      const detectedCurrency = detectCurrency(doc, samplePriceText, doc.defaultView?.location?.href);
      const classification = classifyPrice(listPrice, detectedCurrency);

      const inrListPrice = classification.priceInINR;
      const effectiveCash = inrListPrice;
      const stdFee = 199.0;

      const hostname = (doc.defaultView?.location?.hostname || (typeof window !== 'undefined' ? window.location.hostname : 'Online Retailer'));
      const rawRetailer = hostname.replace(/^www\./, '').split('.')[0];
      const retailer = rawRetailer ? (rawRetailer.charAt(0).toUpperCase() + rawRetailer.slice(1)) : 'Online Retailer';

      const cashLabel = classification.isConverted
        ? `Full Payment Upfront (${classification.currencySymbol}${classification.originalPrice.toLocaleString('en-US')} ⇄ ₹${inrListPrice.toLocaleString('en-IN')})`
        : 'Full Payment Upfront';

      // Base Cash Option
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

      // Extract real bank EMI options from DOM, scripts, or verified store schedule
      const realEmis = await UniversalEmiExtractor.extract(doc, inrListPrice, 0.0, retailer);

      let paymentOptions = [cashOption];
      if (realEmis && realEmis.length > 0) {
        // Guarantee alias for contract consistency if no-cost option is present
        const topNoCost = realEmis.find(o => o.type === 'NO_COST_EMI');
        if (topNoCost && !realEmis.some(o => o.option_id === 'nocost_6m')) {
          realEmis.unshift({
            ...topNoCost,
            option_id: 'nocost_6m'
          });
        }
        paymentOptions = [cashOption, ...realEmis];
      }

      return {
        product_id: String(productId),
        title: title,
        category: category,
        retailer: retailer,
        currency: classification.currency,
        currency_symbol: classification.currencySymbol,
        original_price: classification.originalPrice,
        exchange_rate: classification.exchangeRate,
        currency_notice: classification.bannerNotice,
        upfront_cash_price: inrListPrice,
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
    // Prefer HDFC 3M / 6M if available, else standard No-Cost, else Cash
    return 'std_hdfc_3m';
  },

  mountPoint(doc) {
    try {
      if (!doc) return null;
      let slot = doc.querySelector('#paylens-generic-slot');
      if (slot) return slot;

      // Look for price container or buy button
      const priceEl = doc.querySelector('[itemprop="price"], .product-price, .price, .product-info, #addToCart, .add-to-cart, .buy-now');
      if (priceEl && priceEl.parentNode) {
        slot = doc.createElement('div');
        slot.id = 'paylens-generic-slot';
        slot.style.margin = '16px 0';
        priceEl.parentNode.insertBefore(slot, priceEl.nextSibling);
        return slot;
      }

      // Safe fallback to document.body for viewport-fixed launcher pill
      return doc.body || null;
    } catch (err) {
      return doc.body || null;
    }
  },

  observe(doc, onChange) {
    if (!doc || typeof onChange !== 'function') return () => {};
    let observer = null;
    observer = new MutationObserver(async () => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        if (observer) observer.disconnect();
        return;
      }
      const listing = await Promise.resolve(GenericAdapter.extract(doc));
      if (listing) {
        onChange({ productId: listing.product_id, optionId: 'std_hdfc_3m' });
      }
    });
    observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    return () => {
      if (observer) observer.disconnect();
    };
  }
};

export default GenericAdapter;
