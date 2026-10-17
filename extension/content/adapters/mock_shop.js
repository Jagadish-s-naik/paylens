/**
 * extension/content/adapters/mock_shop.js
 * Storefront DOM Adapter for ApexStore / MockStore.
 * Strict implementation of ARCHITECTURE.md §8.4 contract:
 * - matches(url): boolean
 * - extract(document): Listing | null (never throws)
 * - selectedOptionId(document): string | null
 * - mountPoint(document): Element | null
 * - observe(document, onChange): () => void (disconnect)
 */

function getActiveProductElement(doc) {
  if (!doc) return null;

  // 1. Check URL hash for instant precision
  try {
    const hash = (doc.defaultView?.location?.hash || (typeof window !== 'undefined' ? window.location.hash : '') || '').toLowerCase();
    if (hash.includes('iphone') || hash.includes('iphone16')) {
      const el = doc.getElementById('product-iphone');
      if (el) return el;
    } else if (hash.includes('laptop') || hash.includes('rog')) {
      const el = doc.getElementById('product-laptop');
      if (el) return el;
    } else if (hash.includes('sony') || hash.includes('wh1000xm5')) {
      const el = doc.getElementById('product-sony');
      if (el) return el;
    }
  } catch (_) {}

  // 2. Look for visible (non-hidden) section
  const visible = doc.querySelector('section[data-pl-product]:not([hidden])');
  if (visible) return visible;

  // 3. Look for .active class
  const active = doc.querySelector('section[data-pl-product].active');
  if (active) return active;

  // 4. Fallback to first matching product container
  return doc.querySelector('section[data-pl-product]');
}

export const MockShopAdapter = {
  id: 'mock_shop',

  /**
   * Matches URL against mock shop patterns (localhost, Cloud Run, local files)
   */
  matches(url = '') {
    if (!url) return false;
    const u = url.toLowerCase();
    return u.includes('/mock-shop/') || u.includes('mock-shop') || u.endsWith('/mock-shop');
  },

  /**
   * Extracts active product details and maps to normalized Listing schema.
   * Guarantees never throwing an unhandled exception.
   */
  extract(doc) {
    try {
      const productEl = getActiveProductElement(doc);
      if (!productEl) return null;

      const productId = productEl.dataset.plId;
      if (!productId) return null;

      const listPrice = parseFloat(productEl.dataset.plListPrice || '0');
      const cashDiscount = parseFloat(productEl.dataset.plCashDiscount || '0');
      const effectiveCash = Math.max(0, listPrice - cashDiscount);

      // Parse Payment Options
      const optionEls = Array.from(productEl.querySelectorAll('[data-pl-option]'));
      if (optionEls.length === 0) return null;

      const paymentOptions = optionEls.map((opt) => {
        const optionId = opt.dataset.plId;
        const optionType = opt.dataset.plType || 'CASH';
        const labelEl = opt.querySelector('.option-name');
        const label = labelEl ? labelEl.innerText.trim() : (opt.dataset.plId || 'Option');

        const tenure = parseInt(opt.dataset.plTenure || '1', 10);
        const installment = parseFloat(opt.dataset.plEmi || '0');
        const downpayment = parseFloat(opt.dataset.plDown || '0');
        const fee = parseFloat(opt.dataset.plFee || '0');
        const statedRate = parseFloat(opt.dataset.plRate || '0');

        let lostDiscount = null;
        if (opt.dataset.plLostDiscount !== undefined && opt.dataset.plLostDiscount !== '') {
          lostDiscount = parseFloat(opt.dataset.plLostDiscount);
        } else if (optionType !== 'CASH') {
          lostDiscount = cashDiscount;
        }

        return {
          option_id: optionId,
          type: optionType,
          label: label,
          tenure_months: tenure,
          monthly_installment: installment,
          upfront_downpayment: downpayment,
          processing_fee: fee,
          lost_cash_discount: optionType === 'CASH' ? null : lostDiscount,
          stated_interest_rate: statedRate
        };
      });

      const title = productEl.dataset.plTitle ||
                    productEl.querySelector('.product-title')?.innerText?.trim() ||
                    'Product';
      const category = productEl.dataset.plCategory || 'Electronics';

      return {
        product_id: productId,
        title: title,
        category: category,
        retailer: 'MockStore',
        upfront_cash_price: listPrice,
        cash_discount: cashDiscount,
        effective_cash_price: effectiveCash,
        payment_options: paymentOptions
      };
    } catch (err) {
      console.warn('[Paylens MockShopAdapter] Error during extraction (returning null):', err);
      return null;
    }
  },

  /**
   * Identifies the currently selected payment option id.
   */
  selectedOptionId(doc) {
    try {
      const productEl = getActiveProductElement(doc);
      if (!productEl) return null;

      // Look for aria-checked="true"
      const checkedOption = productEl.querySelector('[data-pl-option][aria-checked="true"]');
      if (checkedOption && checkedOption.dataset.plId) {
        return checkedOption.dataset.plId;
      }

      // Fallback to .selected class
      const selectedOption = productEl.querySelector('[data-pl-option].selected');
      if (selectedOption && selectedOption.dataset.plId) {
        return selectedOption.dataset.plId;
      }

      // Fallback to first available option
      const firstOption = productEl.querySelector('[data-pl-option]');
      return firstOption ? (firstOption.dataset.plId || null) : null;
    } catch (err) {
      console.warn('[Paylens MockShopAdapter] Error reading selectedOptionId:', err);
      return null;
    }
  },

  /**
   * Locates the injection mount target element in the active product section.
   */
  mountPoint(doc) {
    try {
      const productEl = getActiveProductElement(doc);
      if (!productEl) return null;

      return productEl.querySelector('[data-pl-mount]') ||
             productEl.querySelector('.paylens-slot') ||
             null;
    } catch (err) {
      console.warn('[Paylens MockShopAdapter] Error locating mountPoint:', err);
      return null;
    }
  },

  /**
   * Observes option selection changes, product switches, and DOM updates with 150ms debounce.
   * Returns a cleanup disconnect function.
   */
  observe(doc, onChange) {
    if (!doc || typeof onChange !== 'function') {
      return () => {};
    }

    let debounceTimer = null;
    let lastSignature = null;

    const notify = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const productEl = getActiveProductElement(doc);
          const productId = productEl?.dataset?.plId || '';
          const optionId = MockShopAdapter.selectedOptionId(doc) || '';
          const currentSignature = `${productId}:${optionId}`;

          // Ignore identical consecutive requests
          if (currentSignature !== lastSignature) {
            lastSignature = currentSignature;
            onChange({ productId, optionId });
          }
        } catch (err) {
          console.warn('[Paylens MockShopAdapter] Observer error in callback:', err);
        }
      }, 150); // 150ms debounce per ARCHITECTURE.md §8.4
    };

    // 1. Custom Storefront Events
    const handleOptionChanged = (e) => {
      notify();
    };

    const handleProductViewed = (e) => {
      lastSignature = null; // Reset signature on tab/product view switch
      notify();
    };

    doc.addEventListener('pl-option-changed', handleOptionChanged);
    doc.addEventListener('pl-product-viewed', handleProductViewed);

    // 2. DOM MutationObserver (watches attribute changes on options and PDP visibility)
    const observer = new MutationObserver((mutations) => {
      let shouldNotify = false;
      for (const m of mutations) {
        if (m.type === 'attributes') {
          if (m.attributeName === 'aria-checked' ||
              m.attributeName === 'class' ||
              m.attributeName === 'hidden') {
            shouldNotify = true;
            break;
          }
        } else if (m.type === 'childList') {
          shouldNotify = true;
          break;
        }
      }
      if (shouldNotify) {
        notify();
      }
    });

    observer.observe(doc.body || doc.documentElement, {
      attributes: true,
      attributeFilter: ['aria-checked', 'class', 'hidden'],
      childList: true,
      subtree: true
    });

    // Return cleanup disconnect function
    return () => {
      clearTimeout(debounceTimer);
      doc.removeEventListener('pl-option-changed', handleOptionChanged);
      doc.removeEventListener('pl-product-viewed', handleProductViewed);
      observer.disconnect();
    };
  }
};

export default MockShopAdapter;
