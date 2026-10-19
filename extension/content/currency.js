/**
 * extension/content/currency.js
 * Multi-Currency Classification and FX Conversion Engine for Paylens.
 * Detects, classifies, and standardizes prices from global e-commerce websites
 * (USD, EUR, GBP, AED, CAD, AUD, SGD, JPY, CNY, INR) to INR for verified
 * payslip affordability evaluations.
 */

export const EXCHANGE_RATES_TO_INR = {
  INR: 1.0,
  USD: 84.00,  // 1 USD = ~84.00 INR
  EUR: 91.50,  // 1 EUR = ~91.50 INR
  GBP: 109.00, // 1 GBP = ~109.00 INR
  AED: 22.90,  // 1 AED = ~22.90 INR
  CAD: 61.50,  // 1 CAD = ~61.50 INR
  AUD: 54.50,  // 1 AUD = ~54.50 INR
  SGD: 63.80,  // 1 SGD = ~63.80 INR
  JPY: 0.55,   // 1 JPY = ~0.55 INR
  CNY: 11.80,  // 1 CNY = ~11.80 INR
  SAR: 22.40,
  CHF: 95.00
};

export const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  CAD: 'CA$',
  AUD: 'AU$',
  SGD: 'SG$',
  JPY: '¥',
  CNY: 'CN¥',
  SAR: 'SAR ',
  CHF: 'CHF '
};

export const CURRENCY_NAMES = {
  INR: 'Indian Rupee',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  AED: 'UAE Dirham',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  SGD: 'Singapore Dollar',
  JPY: 'Japanese Yen',
  CNY: 'Chinese Yuan',
  SAR: 'Saudi Riyal',
  CHF: 'Swiss Franc'
};

/**
 * Detects and classifies the currency of a product page.
 * Inspection priority:
 * 1. Schema.org JSON-LD 'priceCurrency'
 * 2. OpenGraph / HTML Meta tags
 * 3. In-page price symbols / text snippet
 * 4. Storefront Domain / TLD
 * 5. Default fallback (INR for Indian stores, USD for international .com)
 */
export function detectCurrency(doc, sampleText = '', url = '') {
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const u = currentUrl.toLowerCase();

  // 1. Check Schema.org JSON-LD priceCurrency
  if (doc) {
    try {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('priceCurrency')) {
          const data = JSON.parse(text);
          const findCurrency = (obj) => {
            if (!obj) return null;
            if (obj.priceCurrency) return obj.priceCurrency.toUpperCase();
            if (obj.offers) {
              const off = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
              if (off?.priceCurrency) return off.priceCurrency.toUpperCase();
            }
            if (Array.isArray(obj['@graph'])) {
              for (const node of obj['@graph']) {
                const c = findCurrency(node);
                if (c) return c;
              }
            }
            return null;
          };
          const detected = findCurrency(data);
          if (detected && EXCHANGE_RATES_TO_INR[detected]) {
            return detected;
          }
        }
      }
    } catch (_) {}
  }

  // 2. OpenGraph & Meta Tags
  if (doc) {
    const metaCurrency = doc.querySelector(
      'meta[property="og:price:currency"], meta[property="product:price:currency"], meta[itemprop="priceCurrency"], meta[name="currency"]'
    );
    const content = metaCurrency?.content || metaCurrency?.getAttribute('content');
    if (content) {
      const clean = content.trim().toUpperCase();
      if (EXCHANGE_RATES_TO_INR[clean]) return clean;
    }
  }

  // 3. Price container DOM symbol check
  if (doc) {
    const symbolEl = doc.querySelector('.a-price-symbol, .currency-symbol, .money-symbol, [data-currency]');
    if (symbolEl) {
      const symText = (symbolEl.innerText || symbolEl.getAttribute('data-currency') || '').trim();
      const fromSym = matchCurrencyFromSymbol(symText);
      if (fromSym) return fromSym;
    }
  }

  // 4. Sample text inspection
  if (sampleText) {
    const fromText = matchCurrencyFromText(sampleText);
    if (fromText) return fromText;
  }

  // 5. Domain / TLD Heuristics
  try {
    const parsed = new URL(currentUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.endsWith('.in') || host.includes('flipkart') || host.includes('myntra') ||
        host.includes('croma') || host.includes('tatacliq') || host.includes('ajio') ||
        host.includes('meesho') || host.includes('reliancedigital')) {
      return 'INR';
    }
    if (host.endsWith('.co.uk')) return 'GBP';
    if (host.endsWith('.de') || host.endsWith('.fr') || host.endsWith('.it') || host.endsWith('.es') || host.endsWith('.nl')) return 'EUR';
    if (host.endsWith('.ae')) return 'AED';
    if (host.endsWith('.ca')) return 'CAD';
    if (host.endsWith('.au')) return 'AUD';
    if (host.endsWith('.jp')) return 'JPY';
    if (host.endsWith('.sg')) return 'SGD';

    // If on amazon.com, apple.com (US), bestbuy.com, target.com, walmart.com -> USD
    if (host === 'amazon.com' || host === 'www.amazon.com' ||
        host.includes('bestbuy.com') || host.includes('walmart.com') ||
        host.includes('target.com') || (host.includes('apple.com') && !u.includes('/in/'))) {
      return 'USD';
    }
  } catch (_) {}

  return 'INR';
}

/**
 * Matches currency from isolated symbol string
 */
export function matchCurrencyFromSymbol(symbolText = '') {
  const s = symbolText.trim();
  if (!s) return null;
  if (s.includes('₹') || s.toLowerCase().includes('rs') || s.toUpperCase().includes('INR')) return 'INR';
  if (s.includes('CA$') || s.toUpperCase().includes('CAD')) return 'CAD';
  if (s.includes('AU$') || s.toUpperCase().includes('AUD')) return 'AUD';
  if (s.includes('SG$') || s.toUpperCase().includes('SGD')) return 'SGD';
  if (s.includes('$') || s.toUpperCase().includes('USD')) return 'USD';
  if (s.includes('€') || s.toUpperCase().includes('EUR')) return 'EUR';
  if (s.includes('£') || s.toUpperCase().includes('GBP')) return 'GBP';
  if (s.includes('AED') || s.includes('د.إ') || s.toLowerCase().includes('dhs')) return 'AED';
  if (s.includes('¥') || s.toUpperCase().includes('JPY')) return 'JPY';
  return null;
}

/**
 * Matches currency from raw price text (e.g. "$1,299.00", "€850", "AED 3,699")
 */
export function matchCurrencyFromText(text = '') {
  const t = text.trim();
  if (!t) return null;

  if (/(?:₹|Rs\.?|INR)/i.test(t)) return 'INR';
  if (/(?:CA\$|C\$|CAD)/i.test(t)) return 'CAD';
  if (/(?:AU\$|A\$|AUD)/i.test(t)) return 'AUD';
  if (/(?:SG\$|S\$|SGD)/i.test(t)) return 'SGD';
  if (/(?:\$|USD|US\$)/i.test(t)) return 'USD';
  if (/(?:€|EUR)/i.test(t)) return 'EUR';
  if (/(?:£|GBP)/i.test(t)) return 'GBP';
  if (/(?:AED|د\.إ|Dhs)/i.test(t)) return 'AED';
  if (/(?:¥|JPY)/i.test(t)) return 'JPY';
  if (/(?:CN¥|CNY|RMB)/i.test(t)) return 'CNY';

  return null;
}

/**
 * Converts a price in any foreign currency to INR
 */
export function convertToINR(amount, currencyCode = 'INR') {
  const num = Number(amount || 0);
  const code = (currencyCode || 'INR').toUpperCase();
  const rate = EXCHANGE_RATES_TO_INR[code] || 1.0;
  return Math.round(num * rate * 100) / 100;
}

/**
 * Formats a value with appropriate currency symbol
 */
export function formatCurrencyAmount(amount, currencyCode = 'INR') {
  const num = Number(amount || 0);
  const code = (currencyCode || 'INR').toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] || `${code} `;

  if (code === 'INR') {
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return sym + num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Full classification helper returning standardized currency and INR converted values
 */
export function classifyPrice(rawPrice, detectedCurrency = 'INR') {
  const price = Number(rawPrice || 0);
  const currency = (detectedCurrency || 'INR').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  const rate = EXCHANGE_RATES_TO_INR[currency] || 1.0;
  const isConverted = currency !== 'INR';
  const priceInINR = convertToINR(price, currency);

  let bannerNotice = '';
  if (isConverted) {
    bannerNotice = `Identified currency: ${currency} (${symbol}${price.toLocaleString('en-US')}) • Converted to ₹${priceInINR.toLocaleString('en-IN')} INR (FX Rate: 1 ${currency} = ₹${rate.toFixed(2)})`;
  }

  return {
    currency,
    currencySymbol: symbol,
    currencyName: CURRENCY_NAMES[currency] || currency,
    originalPrice: price,
    exchangeRate: rate,
    priceInINR,
    isConverted,
    bannerNotice
  };
}

/**
 * Safely parses numeric price amounts from text without truncating 4+ digit numbers (e.g. ₹1799 -> 1799, NOT 179).
 * Corrects the classic regex pitfall where numbers without commas were truncated after 3 digits.
 */
export function parsePriceFromText(text) {
  if (!text) return 0;
  const t = String(text).trim();
  const match = t.match(/(?:₹|Rs\.?|INR|\$|€|£|AED|CA\$|AU\$|SG\$|¥)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
  if (match && match[1]) {
    const clean = match[1].replace(/,/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }
  const clean = t.replace(/[^0-9.]/g, '');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}
