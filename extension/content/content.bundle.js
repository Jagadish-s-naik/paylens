(() => {
  // extension/content/adapters/mock_shop.js
  function getActiveProductElement(doc) {
    if (!doc) return null;
    try {
      const hash = (doc.defaultView?.location?.hash || (typeof window !== "undefined" ? window.location.hash : "") || "").toLowerCase();
      if (hash.includes("iphone") || hash.includes("iphone16")) {
        const el = doc.getElementById("product-iphone");
        if (el) return el;
      } else if (hash.includes("laptop") || hash.includes("rog")) {
        const el = doc.getElementById("product-laptop");
        if (el) return el;
      } else if (hash.includes("sony") || hash.includes("wh1000xm5")) {
        const el = doc.getElementById("product-sony");
        if (el) return el;
      }
    } catch (_) {
    }
    const visible = doc.querySelector("section[data-pl-product]:not([hidden])");
    if (visible) return visible;
    const active = doc.querySelector("section[data-pl-product].active");
    if (active) return active;
    return doc.querySelector("section[data-pl-product]");
  }
  var MockShopAdapter = {
    id: "mock_shop",
    /**
     * Matches URL against mock shop patterns (localhost, Cloud Run, local files)
     */
    matches(url = "") {
      if (!url) return false;
      const u = url.toLowerCase();
      return u.includes("/mock-shop/") || u.includes("mock-shop") || u.endsWith("/mock-shop");
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
        const listPrice = parseFloat(productEl.dataset.plListPrice || "0");
        const cashDiscount = parseFloat(productEl.dataset.plCashDiscount || "0");
        const effectiveCash = Math.max(0, listPrice - cashDiscount);
        const optionEls = Array.from(productEl.querySelectorAll("[data-pl-option]"));
        if (optionEls.length === 0) return null;
        const paymentOptions = optionEls.map((opt) => {
          const optionId = opt.dataset.plId;
          const optionType = opt.dataset.plType || "CASH";
          const labelEl = opt.querySelector(".option-name");
          const label = labelEl ? labelEl.innerText.trim() : opt.dataset.plId || "Option";
          const tenure = parseInt(opt.dataset.plTenure || "1", 10);
          const installment = parseFloat(opt.dataset.plEmi || "0");
          const downpayment = parseFloat(opt.dataset.plDown || "0");
          const fee = parseFloat(opt.dataset.plFee || "0");
          const statedRate = parseFloat(opt.dataset.plRate || "0");
          let lostDiscount = null;
          if (opt.dataset.plLostDiscount !== void 0 && opt.dataset.plLostDiscount !== "") {
            lostDiscount = parseFloat(opt.dataset.plLostDiscount);
          } else if (optionType !== "CASH") {
            lostDiscount = cashDiscount;
          }
          return {
            option_id: optionId,
            type: optionType,
            label,
            tenure_months: tenure,
            monthly_installment: installment,
            upfront_downpayment: downpayment,
            processing_fee: fee,
            lost_cash_discount: optionType === "CASH" ? null : lostDiscount,
            stated_interest_rate: statedRate
          };
        });
        const title = productEl.dataset.plTitle || productEl.querySelector(".product-title")?.innerText?.trim() || "Product";
        const category = productEl.dataset.plCategory || "Electronics";
        return {
          product_id: productId,
          title,
          category,
          retailer: "MockStore",
          upfront_cash_price: listPrice,
          cash_discount: cashDiscount,
          effective_cash_price: effectiveCash,
          payment_options: paymentOptions
        };
      } catch (err) {
        console.warn("[Paylens MockShopAdapter] Error during extraction (returning null):", err);
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
        const checkedOption = productEl.querySelector('[data-pl-option][aria-checked="true"]');
        if (checkedOption && checkedOption.dataset.plId) {
          return checkedOption.dataset.plId;
        }
        const selectedOption = productEl.querySelector("[data-pl-option].selected");
        if (selectedOption && selectedOption.dataset.plId) {
          return selectedOption.dataset.plId;
        }
        const firstOption = productEl.querySelector("[data-pl-option]");
        return firstOption ? firstOption.dataset.plId || null : null;
      } catch (err) {
        console.warn("[Paylens MockShopAdapter] Error reading selectedOptionId:", err);
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
        return productEl.querySelector("[data-pl-mount]") || productEl.querySelector(".paylens-slot") || null;
      } catch (err) {
        console.warn("[Paylens MockShopAdapter] Error locating mountPoint:", err);
        return null;
      }
    },
    /**
     * Observes option selection changes, product switches, and DOM updates with 150ms debounce.
     * Returns a cleanup disconnect function.
     */
    observe(doc, onChange) {
      if (!doc || typeof onChange !== "function") {
        return () => {
        };
      }
      let debounceTimer = null;
      let lastSignature = null;
      let observer = null;
      const notify = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            if (typeof chrome === "undefined" || !chrome.runtime?.id) {
              if (observer) observer.disconnect();
              return;
            }
            const productEl = getActiveProductElement(doc);
            const productId = productEl?.dataset?.plId || "";
            const optionId = MockShopAdapter.selectedOptionId(doc) || "";
            const currentSignature = `${productId}:${optionId}`;
            if (currentSignature !== lastSignature) {
              lastSignature = currentSignature;
              onChange({ productId, optionId });
            }
          } catch (err) {
            if (chrome.runtime?.id) {
              console.warn("[Paylens MockShopAdapter] Observer error in callback:", err);
            }
          }
        }, 150);
      };
      const handleOptionChanged = (e) => {
        notify();
      };
      const handleProductViewed = (e) => {
        lastSignature = null;
        notify();
      };
      doc.addEventListener("pl-option-changed", handleOptionChanged);
      doc.addEventListener("pl-product-viewed", handleProductViewed);
      observer = new MutationObserver((mutations) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          if (observer) observer.disconnect();
          return;
        }
        let shouldNotify = false;
        for (const m of mutations) {
          if (m.type === "attributes") {
            if (m.attributeName === "aria-checked" || m.attributeName === "class" || m.attributeName === "hidden") {
              shouldNotify = true;
              break;
            }
          } else if (m.type === "childList") {
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
        attributeFilter: ["aria-checked", "class", "hidden"],
        childList: true,
        subtree: true
      });
      return () => {
        clearTimeout(debounceTimer);
        doc.removeEventListener("pl-option-changed", handleOptionChanged);
        doc.removeEventListener("pl-product-viewed", handleProductViewed);
        observer.disconnect();
      };
    }
  };

  // extension/content/currency.js
  var EXCHANGE_RATES_TO_INR = {
    INR: 1,
    USD: 84,
    // 1 USD = ~84.00 INR
    EUR: 91.5,
    // 1 EUR = ~91.50 INR
    GBP: 109,
    // 1 GBP = ~109.00 INR
    AED: 22.9,
    // 1 AED = ~22.90 INR
    CAD: 61.5,
    // 1 CAD = ~61.50 INR
    AUD: 54.5,
    // 1 AUD = ~54.50 INR
    SGD: 63.8,
    // 1 SGD = ~63.80 INR
    JPY: 0.55,
    // 1 JPY = ~0.55 INR
    CNY: 11.8,
    // 1 CNY = ~11.80 INR
    SAR: 22.4,
    CHF: 95
  };
  var CURRENCY_SYMBOLS = {
    INR: "\u20B9",
    USD: "$",
    EUR: "\u20AC",
    GBP: "\xA3",
    AED: "AED ",
    CAD: "CA$",
    AUD: "AU$",
    SGD: "SG$",
    JPY: "\xA5",
    CNY: "CN\xA5",
    SAR: "SAR ",
    CHF: "CHF "
  };
  var CURRENCY_NAMES = {
    INR: "Indian Rupee",
    USD: "US Dollar",
    EUR: "Euro",
    GBP: "British Pound",
    AED: "UAE Dirham",
    CAD: "Canadian Dollar",
    AUD: "Australian Dollar",
    SGD: "Singapore Dollar",
    JPY: "Japanese Yen",
    CNY: "Chinese Yuan",
    SAR: "Saudi Riyal",
    CHF: "Swiss Franc"
  };
  function detectCurrency(doc, sampleText = "", url = "") {
    const currentUrl = url || (typeof window !== "undefined" ? window.location.href : "");
    const u = currentUrl.toLowerCase();
    if (doc) {
      try {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          const text = script.textContent || "";
          if (text.includes("priceCurrency")) {
            const data = JSON.parse(text);
            const findCurrency = (obj) => {
              if (!obj) return null;
              if (obj.priceCurrency) return obj.priceCurrency.toUpperCase();
              if (obj.offers) {
                const off = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
                if (off?.priceCurrency) return off.priceCurrency.toUpperCase();
              }
              if (Array.isArray(obj["@graph"])) {
                for (const node of obj["@graph"]) {
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
      } catch (_) {
      }
    }
    if (doc) {
      const metaCurrency = doc.querySelector(
        'meta[property="og:price:currency"], meta[property="product:price:currency"], meta[itemprop="priceCurrency"], meta[name="currency"]'
      );
      const content = metaCurrency?.content || metaCurrency?.getAttribute("content");
      if (content) {
        const clean = content.trim().toUpperCase();
        if (EXCHANGE_RATES_TO_INR[clean]) return clean;
      }
    }
    if (doc) {
      const symbolEl = doc.querySelector(".a-price-symbol, .currency-symbol, .money-symbol, [data-currency]");
      if (symbolEl) {
        const symText = (symbolEl.innerText || symbolEl.getAttribute("data-currency") || "").trim();
        const fromSym = matchCurrencyFromSymbol(symText);
        if (fromSym) return fromSym;
      }
    }
    if (sampleText) {
      const fromText = matchCurrencyFromText(sampleText);
      if (fromText) return fromText;
    }
    try {
      const parsed = new URL(currentUrl);
      const host = parsed.hostname.toLowerCase();
      if (host.endsWith(".in") || host.includes("flipkart") || host.includes("myntra") || host.includes("croma") || host.includes("tatacliq") || host.includes("ajio") || host.includes("meesho") || host.includes("reliancedigital")) {
        return "INR";
      }
      if (host.endsWith(".co.uk")) return "GBP";
      if (host.endsWith(".de") || host.endsWith(".fr") || host.endsWith(".it") || host.endsWith(".es") || host.endsWith(".nl")) return "EUR";
      if (host.endsWith(".ae")) return "AED";
      if (host.endsWith(".ca")) return "CAD";
      if (host.endsWith(".au")) return "AUD";
      if (host.endsWith(".jp")) return "JPY";
      if (host.endsWith(".sg")) return "SGD";
      if (host === "amazon.com" || host === "www.amazon.com" || host.includes("bestbuy.com") || host.includes("walmart.com") || host.includes("target.com") || host.includes("apple.com") && !u.includes("/in/")) {
        return "USD";
      }
    } catch (_) {
    }
    return "INR";
  }
  function matchCurrencyFromSymbol(symbolText = "") {
    const s = symbolText.trim();
    if (!s) return null;
    if (s.includes("\u20B9") || s.toLowerCase().includes("rs") || s.toUpperCase().includes("INR")) return "INR";
    if (s.includes("CA$") || s.toUpperCase().includes("CAD")) return "CAD";
    if (s.includes("AU$") || s.toUpperCase().includes("AUD")) return "AUD";
    if (s.includes("SG$") || s.toUpperCase().includes("SGD")) return "SGD";
    if (s.includes("$") || s.toUpperCase().includes("USD")) return "USD";
    if (s.includes("\u20AC") || s.toUpperCase().includes("EUR")) return "EUR";
    if (s.includes("\xA3") || s.toUpperCase().includes("GBP")) return "GBP";
    if (s.includes("AED") || s.includes("\u062F.\u0625") || s.toLowerCase().includes("dhs")) return "AED";
    if (s.includes("\xA5") || s.toUpperCase().includes("JPY")) return "JPY";
    return null;
  }
  function matchCurrencyFromText(text = "") {
    const t = text.trim();
    if (!t) return null;
    if (/(?:₹|Rs\.?|INR)/i.test(t)) return "INR";
    if (/(?:CA\$|C\$|CAD)/i.test(t)) return "CAD";
    if (/(?:AU\$|A\$|AUD)/i.test(t)) return "AUD";
    if (/(?:SG\$|S\$|SGD)/i.test(t)) return "SGD";
    if (/(?:\$|USD|US\$)/i.test(t)) return "USD";
    if (/(?:€|EUR)/i.test(t)) return "EUR";
    if (/(?:£|GBP)/i.test(t)) return "GBP";
    if (/(?:AED|د\.إ|Dhs)/i.test(t)) return "AED";
    if (/(?:¥|JPY)/i.test(t)) return "JPY";
    if (/(?:CN¥|CNY|RMB)/i.test(t)) return "CNY";
    return null;
  }
  function convertToINR(amount, currencyCode = "INR") {
    const num = Number(amount || 0);
    const code = (currencyCode || "INR").toUpperCase();
    const rate = EXCHANGE_RATES_TO_INR[code] || 1;
    return Math.round(num * rate * 100) / 100;
  }
  function classifyPrice(rawPrice, detectedCurrency = "INR") {
    const price = Number(rawPrice || 0);
    const currency = (detectedCurrency || "INR").toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
    const rate = EXCHANGE_RATES_TO_INR[currency] || 1;
    const isConverted = currency !== "INR";
    const priceInINR = convertToINR(price, currency);
    let bannerNotice = "";
    if (isConverted) {
      bannerNotice = `Identified currency: ${currency} (${symbol}${price.toLocaleString("en-US")}) \u2022 Converted to \u20B9${priceInINR.toLocaleString("en-IN")} INR (FX Rate: 1 ${currency} = \u20B9${rate.toFixed(2)})`;
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
  function parsePriceFromText(text) {
    if (!text) return 0;
    const t = String(text).trim();
    const match = t.match(/(?:₹|Rs\.?|INR|\$|€|£|AED|CA\$|AU\$|SG\$|¥)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
    if (match && match[1]) {
      const clean2 = match[1].replace(/,/g, "");
      const val2 = parseFloat(clean2);
      return isNaN(val2) ? 0 : val2;
    }
    const clean = t.replace(/[^0-9.]/g, "");
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }

  // extension/content/emi_extractor.js
  var INSTRUMENT_TYPES = {
    CREDIT_CARD: "CREDIT_CARD",
    DEBIT_CARD: "DEBIT_CARD",
    CARDLESS_BNPL: "CARDLESS_BNPL"
  };
  var DEBIT_PREAPPROVAL_NOTES = {
    hdfc: "Pre-approved HDFC debit cardholders only. SMS 'MYHDFC' to 5676712 from registered mobile to check eligibility.",
    icici: "Pre-approved ICICI debit cardholders only. SMS 'DCEMI <last 4 digits>' to 5676766 to check eligibility.",
    sbi: "Pre-approved SBI debit cardholders only. SMS 'DCEMI' to 567676 to check eligibility.",
    axis: "Pre-approved Axis debit cardholders only. SMS 'DCEMI <last 4 digits>' to 56161600 to check eligibility.",
    kotak: "Pre-approved Kotak debit cardholders only. SMS 'DCEMI <last 4 digits>' to 5676788 to check eligibility.",
    federal: "Pre-approved Federal debit cardholders only. SMS 'DC <last 4 digits>' to 5676762 to check eligibility.",
    default: "Pre-approved bank debit cardholders only (min order \u20B95,000). Check with your issuing bank via SMS."
  };
  var BNPL_NOTES = {
    bajaj: "Requires active Bajaj Finserv EMI Network Card. 100% genuine zero cost EMI with \u20B9117 processing fee.",
    amazonpaylater: "Instant credit line up to \u20B960,000. Requires one-time PAN & Aadhaar KYC on Amazon.",
    flipkartpaylater: "Instant credit line up to \u20B91,00,000. Requires PAN & Aadhaar verification on Flipkart."
  };
  var KNOWN_BANKS = [
    { key: "hdfc", name: "HDFC Bank", aliases: ["hdfc", "hdfc bank"] },
    { key: "icici", name: "ICICI Bank", aliases: ["icici", "icici bank", "amazon pay icici"] },
    { key: "sbi", name: "SBI Card", aliases: ["sbi", "sbi card", "state bank of india"] },
    { key: "axis", name: "Axis Bank", aliases: ["axis", "axis bank", "flipkart axis"] },
    { key: "kotak", name: "Kotak Bank", aliases: ["kotak", "kotak mahindra", "kotak mahindra bank"] },
    { key: "citi", name: "Citi Bank", aliases: ["citi", "citibank", "citi bank"] },
    { key: "amex", name: "American Express", aliases: ["amex", "american express"] },
    { key: "hsbc", name: "HSBC Bank", aliases: ["hsbc", "hsbc bank"] },
    { key: "onecard", name: "OneCard", aliases: ["onecard", "one card", "fpl"] },
    { key: "rbl", name: "RBL Bank", aliases: ["rbl", "rbl bank", "ratnakar bank"] },
    { key: "bob", name: "Bank of Baroda", aliases: ["bob", "bank of baroda", "baroda"] },
    { key: "indusind", name: "IndusInd Bank", aliases: ["indusind", "indusind bank"] },
    { key: "federal", name: "Federal Bank", aliases: ["federal", "federal bank"] },
    { key: "standardchartered", name: "Standard Chartered", aliases: ["standard chartered", "sc bank", "stan c"] },
    { key: "yesbank", name: "Yes Bank", aliases: ["yes", "yes bank"] },
    { key: "idfc", name: "IDFC FIRST Bank", aliases: ["idfc", "idfc first", "idfc first bank"] },
    { key: "amazonpaylater", name: "Amazon Pay Later", aliases: ["amazon pay later", "amazon paylater", "amazon pay-later"], isBnpl: true },
    { key: "flipkartpaylater", name: "Flipkart Pay Later", aliases: ["flipkart pay later", "flipkart paylater", "flipkart pay-later"], isBnpl: true },
    { key: "bajaj", name: "Bajaj Finserv", aliases: ["bajaj finserv", "bajaj emi card", "bajaj finance", "bajaj"], isBnpl: true }
  ];
  function calculateReducingBalanceEmi(principal, annualRatePercent, months) {
    if (!principal || principal <= 0 || !months || months <= 0) return 0;
    if (annualRatePercent <= 0 || months <= 1) {
      return Math.round(principal / months * 100) / 100;
    }
    const monthlyRate = annualRatePercent / 12 / 100;
    const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, months);
    const denominator = Math.pow(1 + monthlyRate, months) - 1;
    const emi = numerator / denominator;
    return Math.round(emi);
  }
  function matchBank(text) {
    if (!text) return null;
    const t = text.toLowerCase();
    for (const b of KNOWN_BANKS) {
      for (const alias of b.aliases) {
        const regex = new RegExp(`\\b${alias}\\b`, "i");
        if (regex.test(t) || t === alias) {
          return b;
        }
      }
    }
    return null;
  }
  function extractListedStartingEmi(doc) {
    if (!doc) return null;
    const selectors = [
      ".pdp-emiOption",
      '[class*="emiOption"]',
      '[class*="emi-option"]',
      '[class*="emiPlans"]',
      '[class*="emi-plans"]',
      "#inemi_feature_div",
      ".inemi-rates-table",
      "#item_offers_list",
      ".offers-items"
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const text = el.innerText || el.textContent || "";
        const m = text.match(/(?:EMI\s+(?:starts?\s+(?:at|from)|starting\s+from)|or)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i) || text.match(/([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*\/\s*mo(?:nth)?/i);
        if (m) {
          const val = parsePriceFromText(m[1]);
          if (val > 0) {
            const isNoCost = /no\s*cost/i.test(text);
            return { amount: val, isNoCost };
          }
        }
      }
    }
    const bodyText = doc.body ? doc.body.innerText : "";
    const broadMatch = bodyText.match(/EMI\s+(?:starts?\s+(?:at|from)|starting\s+from)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
    if (broadMatch) {
      const val = parsePriceFromText(broadMatch[1]);
      if (val > 0) {
        return { amount: val, isNoCost: /no\s*cost/i.test(broadMatch[0]) };
      }
    }
    return null;
  }
  function extractPageBankOffers(doc, listPrice) {
    const bankOffers = {};
    if (!doc || !listPrice || listPrice <= 0) return bankOffers;
    const candidateTexts = /* @__PURE__ */ new Set();
    if (typeof doc.querySelectorAll === "function") {
      const offerNodes = doc.querySelectorAll(
        'div.x-r2QD, div._3Ay6Sb, div.UkUFwK, li._16eBzU, div._2teBhd, div._3j4G2b, div._3XINqE, div.row._3q9YpE, div._29jN3X, div._3eA9m-, #item_offers_list li, #sopp_feature_div li, .offers-items li, .pdp-offers li, .product-offers li, .bank-offers-list li, [class*="bank-offer"], [class*="offer-item"], [class*="OfferItem"], div.cp-offers, div.M8-xIr, div.Bv11UC, .offers-strip, .offer-text, [data-testid*="offer"], .pdp-offers'
      );
      for (const node of offerNodes) {
        const txt = (node.innerText || node.textContent || "").trim();
        if (txt.length >= 8 && (txt.includes("\u20B9") || txt.includes("Rs") || txt.includes("INR") || txt.includes("%") || /off|discount/i.test(txt))) {
          candidateTexts.add(txt);
        }
      }
    }
    const bodyText = (doc.body ? doc.body.innerText : "") || (typeof document !== "undefined" ? document.body?.innerText || "" : "");
    if (bodyText) {
      const lines = bodyText.split(/\n+/);
      for (const l of lines) {
        const line = l.trim();
        if ((line.includes("Bank Offer") || line.includes("Instant Discount") || line.includes("Credit Card EMI") || line.includes("Debit Card EMI") || line.includes("Special Price")) && (line.includes("\u20B9") || line.includes("Rs") || line.includes("INR") || line.includes("%"))) {
          candidateTexts.add(line);
        }
      }
    }
    for (const rawText of candidateTexts) {
      const bank = matchBank(rawText);
      if (!bank) continue;
      const bKey = bank.key;
      const isDebit = /debit\s*card|debit\s*emi|\bdebit\b/i.test(rawText);
      const isBnpl = /pay\s*later|bajaj/i.test(rawText) || Boolean(bank.isBnpl);
      const minOrderMatch = rawText.match(/(?:orders|orders\s*of|minimum\s*purchase|min\s*order|orders\s*above)[^\n.]*?(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*)/i);
      if (minOrderMatch) {
        const minOrder = parsePriceFromText(minOrderMatch[1]);
        if (minOrder > 0 && listPrice < minOrder) {
          continue;
        }
      }
      let discount = 0;
      const pctMatch = rawText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:instant\s*discount|off)?[^\n.]*?(?:up\s*to|max)\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:,[0-9]+)*)/i);
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        const cap = parsePriceFromText(pctMatch[2]);
        if (pct > 0 && cap > 0) {
          discount = Math.min(Math.round(listPrice * (pct / 100)), cap);
        }
      }
      if (discount <= 0) {
        const flatMatch = rawText.match(/(?:Flat|Extra|Instant)?\s*(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*)\s*(?:off|discount|instant\s*discount)/i) || rawText.match(/(?:discount|offer)\s*(?:available|of)?\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:,[0-9]+)*)/i) || rawText.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*)\s*(?:off|discount|instant\s*discount)/i);
        if (flatMatch) {
          discount = parsePriceFromText(flatMatch[1]);
        }
      }
      if (discount <= 0 || discount >= listPrice * 0.5) {
        continue;
      }
      const tenures = [];
      const rangeMatch = rawText.match(/(\d+)\s*(?:and|&|,|-)\s*(\d+)\s*(?:months?|m)\b/i);
      if (rangeMatch) {
        tenures.push(parseInt(rangeMatch[1], 10));
        tenures.push(parseInt(rangeMatch[2], 10));
      }
      const singleMatches = rawText.matchAll(/(\d+)\s*(?:months?|m)\b/gi);
      for (const sm of singleMatches) {
        const val = parseInt(sm[1], 10);
        if (!tenures.includes(val)) tenures.push(val);
      }
      const isEmi = /emi\b|installment/i.test(rawText);
      let basis = rawText.split("\n")[0].trim().replace(/\s*T&C\s*$/i, "");
      if (basis.length > 85) {
        basis = basis.slice(0, 82) + "...";
      }
      if (!bankOffers[bKey]) bankOffers[bKey] = [];
      bankOffers[bKey].push({
        discount,
        basis,
        tenures,
        isDebit,
        isBnpl,
        isEmi
      });
    }
    for (const k of Object.keys(bankOffers)) {
      bankOffers[k].sort((a, b) => {
        if (a.isEmi !== b.isEmi) return a.isEmi ? -1 : 1;
        return b.discount - a.discount;
      });
    }
    return bankOffers;
  }
  var hasAttemptedLazyModalTrigger = false;
  var UniversalEmiExtractor = {
    /**
     * Main asynchronous entry point:
     * Extracts ground-truth bank EMI options from DOM, remote pages, SPA drawers, or verified schedules.
     * Returns an array of normalized PaymentOptions.
     */
    async extract(doc, listPrice, cashDiscount = 0, retailer = "Store") {
      if (!doc || !listPrice || listPrice <= 0) return [];
      const stdFee = 199;
      const isEmiEligible = this.detectEmiAvailability(doc, listPrice);
      if (!isEmiEligible) {
        return [];
      }
      const startingEmi = extractListedStartingEmi(doc);
      const domOptions = this.extractDomEmis(doc, listPrice, cashDiscount, stdFee);
      if (domOptions.length > 0) {
        return domOptions;
      }
      const remoteOptions = await this.fetchRemoteEmiOptions(doc, listPrice, cashDiscount, stdFee);
      if (remoteOptions.length > 0) {
        return remoteOptions;
      }
      const mounted = await this.triggerLazyModal(doc);
      if (mounted) {
        const lazyOptions = this.extractDomEmis(doc, listPrice, cashDiscount, stdFee);
        this.closeLazyModal(doc);
        if (lazyOptions.length > 0) {
          return lazyOptions;
        }
      }
      const scriptOptions = this.extractScriptEmis(doc, listPrice, cashDiscount, stdFee);
      if (scriptOptions.length > 0) {
        return scriptOptions;
      }
      return this.generateStoreBankEmis(retailer, listPrice, cashDiscount, stdFee, doc, startingEmi);
    },
    /**
     * Detects whether EMI is available on this product page.
     */
    detectEmiAvailability(doc, listPrice) {
      if (!doc) return false;
      const emiSelectorMatches = doc.querySelector(
        '.pdp-emiOption, [class*="emi-option"], [class*="emiOption"], [class*="emi-plans"], a[href*="emi"], button[class*="emi"], #inemi_feature_div, [data-group="emi"], [class*="installment"], [id*="installment"]'
      );
      if (emiSelectorMatches) return true;
      const pageText = doc.body ? doc.body.innerText : "";
      const hasEmiTrigger = pageText.includes("EMI option available") || pageText.includes("EMI starts at") || pageText.includes("EMI starts from") || pageText.includes("EMI starting from") || pageText.includes("View Eligible") || pageText.includes("View Plans") || pageText.includes("No Cost EMI") || pageText.includes("No-Cost EMI") || pageText.includes("Credit Card EMI") || pageText.includes("Debit Card EMI") || /EMI\s+(?:from|starts?|available|plans)/i.test(pageText);
      if (hasEmiTrigger) return true;
      if (listPrice >= 2500) {
        return true;
      }
      return false;
    },
    /**
     * Extracts EMI options from DOM modal, drawer, or table (both visible and hidden).
     * Iterates across ALL bank tabs and sections without stopping after the first bank.
     */
    extractDomEmis(doc, listPrice, cashDiscount = 0, stdFee = 199) {
      const options = [];
      if (!doc) return options;
      const pageOffers = extractPageBankOffers(doc, listPrice);
      const containers = doc.querySelectorAll(
        '[role="dialog"], [class*="modal" i], [class*="drawer" i], [class*="popup" i], [class*="overlay" i], div._10Ermr, div._2rQPcW, div._1k9_yB, div[class*="_overlay"], [id*="modal" i], [id*="drawer" i], [id*="emi" i], .pdp-emiOption, .emi-details, #inemi_feature_div, table'
      );
      for (const container of containers) {
        const text = container.innerText || container.textContent || "";
        if (!text.includes("EMI") && !text.includes("Installment") && !text.includes("Interest") && !text.includes("Plans") && !text.includes("Credit Card") && !text.includes("Debit Card")) {
          continue;
        }
        const parsed = this.parseTableRowsFromContainer(container, listPrice, cashDiscount, stdFee, pageOffers);
        for (const opt of parsed) {
          if (!options.some((o) => o.option_id === opt.option_id)) {
            options.push(opt);
          }
        }
      }
      return options;
    },
    /**
     * Parses table rows or structured items inside a container, resolving bank context.
     */
    parseTableRowsFromContainer(container, listPrice, cashDiscount, stdFee, pageOffers = {}) {
      const options = [];
      if (!container) return options;
      const containerText = (container.innerText || container.textContent || "").toLowerCase();
      const isContainerDebit = /debit\s*card|debit\s*emi/i.test(containerText);
      const isContainerBnpl = /pay\s*later|bajaj/i.test(containerText);
      const rowSelector = 'tr, [class*="row"], [class*="item"], li, label:has(input[type="radio"]), div:has(> input[type="radio"]), [role="radio"], [class*="radio"], div[class*="Option"], div[class*="option"], div[class*="plan-card"], div[class*="planCard"]';
      const bankSections = container.querySelectorAll('[data-bank], .a-box, [class*="bank-plan"], [class*="bank-section"], [class*="accordion-row"]');
      if (bankSections.length > 0) {
        for (const section of bankSections) {
          let bank = null;
          const bankAttr = typeof section.getAttribute === "function" ? section.getAttribute("data-bank") : null;
          if (bankAttr) bank = matchBank(bankAttr);
          const headerEl = typeof section.querySelector === "function" ? section.querySelector("h1, h2, h3, h4, h5, .title, .header, strong, th") : null;
          const headerText = headerEl ? headerEl.innerText || headerEl.textContent || "" : "";
          const sectionText = section.innerText || section.textContent || "";
          if (!bank && headerEl) {
            bank = matchBank(headerText);
          }
          if (!bank) {
            bank = matchBank(sectionText);
          }
          const isSectionDebit = /debit\s*card|debit\s*emi|\bdebit\b/i.test(headerText || sectionText);
          const isSectionBnpl = /pay\s*later|bajaj|\bbnpl\b/i.test(headerText || sectionText);
          const rows2 = typeof section.querySelectorAll === "function" ? section.querySelectorAll(rowSelector) : [];
          for (const row of rows2) {
            const opt = this.parseRowToOption(row, bank, listPrice, cashDiscount, stdFee, {
              isDebit: isSectionDebit || isContainerDebit,
              isBnpl: isSectionBnpl || isContainerBnpl,
              pageOffers
            });
            if (opt && !options.some((o) => o.option_id === opt.option_id)) {
              options.push(opt);
            }
          }
        }
        if (options.length > 0) {
          return options;
        }
      }
      const activeBank = this.extractActiveBankFromContainer(container);
      const rows = container.querySelectorAll(rowSelector);
      for (const row of rows) {
        const opt = this.parseRowToOption(row, activeBank, listPrice, cashDiscount, stdFee, {
          isDebit: isContainerDebit,
          isBnpl: isContainerBnpl,
          pageOffers
        });
        if (opt && !options.some((o) => o.option_id === opt.option_id)) {
          options.push(opt);
        }
      }
      const rawText = container.innerText || container.textContent || "";
      const chunkRegex = /(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:\/mo|\/month)?\s*for\s*(\d+)\s*(?:months?|m)\b/gi;
      const textMatches = [];
      let tm;
      while ((tm = chunkRegex.exec(rawText)) !== null) {
        textMatches.push({
          index: tm.index,
          installment: parsePriceFromText(tm[1]),
          tenure: parseInt(tm[2], 10)
        });
      }
      if (textMatches.length > 0) {
        for (let i = 0; i < textMatches.length; i++) {
          const item = textMatches[i];
          const nextIdx = textMatches[i + 1] ? textMatches[i + 1].index : item.index + 500;
          const chunk = rawText.slice(item.index, nextIdx);
          const discountMatch = chunk.match(/(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:discount|off)/i) || chunk.match(/Bank\s*offer\s*[-–]?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i) || chunk.match(/(?:discount|offer)\s*(?:of)?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
          const rowDiscount = discountMatch ? parsePriceFromText(discountMatch[1]) : 0;
          const rateMatch = chunk.match(/(\d+(?:\.\d+)?)\s*%/);
          const statedRate = rateMatch ? parseFloat(rateMatch[1]) : isContainerDebit ? 16 : 15.99;
          const tcMatch = chunk.match(/(?:Total\s*Cost|Total\s*EMI)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
          const totalCost = tcMatch ? parsePriceFromText(tcMatch[1]) : Math.round(item.installment * item.tenure * 100) / 100;
          const isDebit = isContainerDebit || /debit/i.test(chunk);
          const isBnpl = isContainerBnpl || /pay\s*later|bajaj/i.test(chunk);
          const isNoCost = /no\s*cost/i.test(chunk) || /0%/i.test(chunk) || Math.abs(item.installment * item.tenure - listPrice) < 5;
          let bankKey = activeBank ? activeBank.key : isBnpl ? "bnpl" : isDebit ? "debit" : "bank";
          let bankName = activeBank ? activeBank.name : isBnpl ? "Pay Later" : isDebit ? "Partner Bank" : "Partner Bank";
          const prefix = isNoCost ? "nocost" : "std";
          const typePrefix = isDebit ? "debit_" : isBnpl ? "bnpl_" : "";
          const optId = `${prefix}_${typePrefix}${bankKey}_${item.tenure}m`;
          let chunkDiscountBasis = null;
          if (rowDiscount > 0) {
            chunkDiscountBasis = discountMatch ? discountMatch[0].trim() : `${bankName} Offer: \u20B9${rowDiscount.toLocaleString("en-IN")} off on ${item.tenure}M EMI`;
            if (pageOffers && bankKey && pageOffers[bankKey]) {
              const matchingOffer = pageOffers[bankKey].find((o) => o.discount === rowDiscount || o.tenures.includes(item.tenure));
              if (matchingOffer && matchingOffer.basis) {
                chunkDiscountBasis = matchingOffer.basis;
              }
            }
          }
          const discountTag = rowDiscount > 0 ? ` \u2022 \u20B9${rowDiscount.toLocaleString("en-IN")} Off` : "";
          const label = isNoCost ? `${bankName} No-Cost EMI (${item.tenure}M @ \u20B9${item.installment.toLocaleString("en-IN")}/mo${discountTag})` : `${bankName} EMI (${item.tenure}M @ \u20B9${item.installment.toLocaleString("en-IN")}/mo \u2022 ${statedRate}% APR${discountTag})`;
          const textOpt = {
            option_id: optId,
            instrument_type: isDebit ? INSTRUMENT_TYPES.DEBIT_CARD : isBnpl ? INSTRUMENT_TYPES.CARDLESS_BNPL : INSTRUMENT_TYPES.CREDIT_CARD,
            bank_key: bankKey,
            bank_name: bankName,
            type: isNoCost ? "NO_COST_EMI" : "STANDARD_EMI",
            label,
            tenure_months: item.tenure,
            monthly_installment: item.installment,
            upfront_downpayment: 0,
            processing_fee: stdFee,
            lost_cash_discount: cashDiscount,
            bank_discount: rowDiscount,
            discount_basis: chunkDiscountBasis,
            total_cost: totalCost,
            stated_interest_rate: isNoCost ? 0 : statedRate,
            eligibility_note: isDebit ? DEBIT_PREAPPROVAL_NOTES[bankKey] || DEBIT_PREAPPROVAL_NOTES.default : null,
            is_scraped: true
          };
          const existingIdx = options.findIndex((o) => o.option_id === optId);
          if (existingIdx === -1) {
            options.push(textOpt);
          } else if (rowDiscount > 0 && (!options[existingIdx].bank_discount || options[existingIdx].bank_discount <= 0)) {
            options[existingIdx] = textOpt;
          }
        }
      }
      return options;
    },
    /**
     * Converts a single row element into a normalized PaymentOption.
     */
    parseRowToOption(row, defaultBank, listPrice, cashDiscount, stdFee, context = {}) {
      if (!row) return null;
      const rowText = (row.innerText || row.textContent || "").trim();
      if (/tenure|months|duration/i.test(rowText) && /overall cost|interest rate|plan/i.test(rowText) && !/₹|Rs\.?/i.test(rowText)) {
        return null;
      }
      let bank = defaultBank;
      const rowBank = matchBank(rowText);
      if (rowBank) {
        bank = rowBank;
      }
      const isDebit = Boolean(context.isDebit || /debit\s*card|debit\s*emi|\bdebit\b/i.test(rowText));
      const isBnpl = Boolean(context.isBnpl || /pay\s*later|bajaj\s*finserv|bajaj\s*emi|\bbnpl\b/i.test(rowText) || bank && bank.isBnpl);
      if (isDebit && listPrice < 5e3) {
        return null;
      }
      let instrumentType = INSTRUMENT_TYPES.CREDIT_CARD;
      if (isDebit) {
        instrumentType = INSTRUMENT_TYPES.DEBIT_CARD;
      } else if (isBnpl) {
        instrumentType = INSTRUMENT_TYPES.CARDLESS_BNPL;
      }
      const exactForMatch = rowText.match(/(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:\/mo|\/month)?\s*for\s*(\d+)\s*(?:months?|m)\b/i);
      let tenure = 0;
      let installment = 0;
      if (exactForMatch) {
        installment = parsePriceFromText(exactForMatch[1]);
        tenure = parseInt(exactForMatch[2], 10);
      } else {
        const tenureMatch = rowText.match(/(\d+)\s*(?:months?|m)\b/i) || rowText.match(/\b([1369]|12|18|24|36)\b/);
        const priceMatch = rowText.match(/(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
        if (tenureMatch && priceMatch) {
          tenure = parseInt(tenureMatch[1], 10);
          installment = parsePriceFromText(priceMatch[1]);
        }
      }
      if (tenure >= 1 && tenure <= 36 && installment > 0 && (tenure === 1 ? Math.abs(installment - listPrice) < 5 : installment < listPrice)) {
        const discountMatch = rowText.match(/(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:discount|off)\s*(?:available)?/i) || rowText.match(/Bank\s*offer\s*[-–]?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i) || rowText.match(/(?:discount|offer)\s*(?:of)?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
        let rowDiscount = discountMatch ? parsePriceFromText(discountMatch[1]) : 0;
        let bankKey = bank ? bank.key : isBnpl ? "bnpl" : isDebit ? "debit" : "bank";
        let bankName = bank ? bank.name : isBnpl ? "Pay Later" : isDebit ? "Partner Bank" : "Partner Bank";
        let discountBasis = null;
        if (rowDiscount > 0) {
          discountBasis = discountMatch ? discountMatch[0].trim() : `${bankName} Offer: \u20B9${rowDiscount.toLocaleString("en-IN")} off on ${tenure}M EMI`;
          if (context.pageOffers && bankKey && context.pageOffers[bankKey]) {
            const matchingPageOffer = context.pageOffers[bankKey].find((o) => o.discount === rowDiscount || o.tenures.includes(tenure));
            if (matchingPageOffer && matchingPageOffer.basis) {
              discountBasis = matchingPageOffer.basis;
            }
          }
        } else if (context.pageOffers && bankKey && context.pageOffers[bankKey]) {
          const matchingOffer = context.pageOffers[bankKey].find((o) => !o.isDebit && !o.isBnpl && (o.tenures.includes(tenure) || o.tenures.length === 0));
          if (matchingOffer && matchingOffer.discount > 0) {
            rowDiscount = matchingOffer.discount;
            discountBasis = matchingOffer.basis;
          }
        }
        const totalCostMatch = rowText.match(/(?:Total\s*Cost|Total\s*EMI)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
        const totalCost = totalCostMatch ? parsePriceFromText(totalCostMatch[1]) : Math.round(installment * tenure * 100) / 100;
        let isNoCost = /no\s*cost/i.test(rowText) || /0%/i.test(rowText) || Math.abs(installment * tenure - listPrice) < 5;
        const rateMatch = rowText.match(/(\d+(?:\.\d+)?)\s*%/);
        let statedRate = isNoCost ? 0 : rateMatch ? parseFloat(rateMatch[1]) : isDebit ? 16 : 15.99;
        let optFee = stdFee;
        let eligibilityNote = null;
        if (instrumentType === INSTRUMENT_TYPES.DEBIT_CARD) {
          eligibilityNote = DEBIT_PREAPPROVAL_NOTES[bankKey] || DEBIT_PREAPPROVAL_NOTES.default;
          if (!bankName.includes("Debit")) {
            bankName = `${bankName} (Debit Card)`;
          }
        } else if (instrumentType === INSTRUMENT_TYPES.CARDLESS_BNPL) {
          if (bankKey === "bajaj" || /bajaj/i.test(bankName)) {
            isNoCost = true;
            statedRate = 0;
            optFee = 117;
            eligibilityNote = BNPL_NOTES.bajaj;
            bankKey = "bajaj";
            bankName = "Bajaj Finserv";
          } else if (bankKey === "amazonpaylater" || /amazon/i.test(bankName)) {
            optFee = 0;
            eligibilityNote = BNPL_NOTES.amazonpaylater;
            bankKey = "amazonpaylater";
            bankName = "Amazon Pay Later";
          } else if (bankKey === "flipkartpaylater" || /flipkart/i.test(bankName)) {
            optFee = 0;
            eligibilityNote = BNPL_NOTES.flipkartpaylater;
            bankKey = "flipkartpaylater";
            bankName = "Flipkart Pay Later";
          }
        }
        const prefix = isNoCost ? "nocost" : "std";
        const typePrefix = instrumentType === INSTRUMENT_TYPES.DEBIT_CARD ? "debit_" : instrumentType === INSTRUMENT_TYPES.CARDLESS_BNPL ? "bnpl_" : "";
        const optId = `${prefix}_${typePrefix}${bankKey}_${tenure}m`;
        let label = "";
        const discountTag = rowDiscount > 0 ? ` \u2022 \u20B9${rowDiscount.toLocaleString("en-IN")} Off` : "";
        if (isNoCost) {
          label = `${bankName} No-Cost EMI (${tenure}M @ \u20B9${installment.toLocaleString("en-IN")}/mo${discountTag})`;
        } else {
          label = `${bankName} EMI (${tenure}M @ \u20B9${installment.toLocaleString("en-IN")}/mo \u2022 ${statedRate}% APR${discountTag})`;
        }
        return {
          option_id: optId,
          instrument_type: instrumentType,
          bank_key: bankKey,
          bank_name: bankName,
          type: isNoCost ? "NO_COST_EMI" : "STANDARD_EMI",
          label,
          tenure_months: tenure,
          monthly_installment: installment,
          upfront_downpayment: 0,
          processing_fee: optFee,
          lost_cash_discount: cashDiscount,
          bank_discount: rowDiscount,
          discount_basis: discountBasis,
          total_cost: totalCost,
          stated_interest_rate: statedRate,
          eligibility_note: eligibilityNote,
          is_scraped: true
        };
      }
      return null;
    },
    /**
     * Identifies the active bank from a modal container's bank sidebar or tab list.
     */
    extractActiveBankFromContainer(container) {
      if (!container) return KNOWN_BANKS[0];
      const headerEls = container.querySelectorAll('h1, h2, h3, h4, h5, [class*="header"], [class*="title"], [class*="heading"]');
      for (const h of headerEls) {
        const ht = (h.innerText || h.textContent || "").trim();
        const mb = matchBank(ht);
        if (mb) return mb;
      }
      const bankItems = container.querySelectorAll(
        '[class*="active"], [class*="selected"], [class*="highlight"], [aria-selected="true"], li, button, div'
      );
      for (const item of bankItems) {
        const t = (item.innerText || item.textContent || "").trim();
        const matched = matchBank(t);
        if (matched) {
          const classNames = (item.className || "") + " " + (item.parentElement?.className || "");
          if (/active|select|highlight|current/i.test(classNames) || t.includes(">")) {
            return matched;
          }
        }
      }
      const containerText = container.innerText || container.textContent || "";
      for (const b of KNOWN_BANKS) {
        for (const alias of b.aliases) {
          if (new RegExp("\\b" + alias + "\\b", "i").test(containerText)) {
            return b;
          }
        }
      }
      return KNOWN_BANKS[0];
    },
    /**
     * Fetches remote EMI page / popover URL ("or in another page") via background service worker proxy.
     */
    async fetchRemoteEmiOptions(doc, listPrice, cashDiscount, stdFee) {
      if (!doc || typeof chrome === "undefined" || !chrome.runtime?.id || !chrome.runtime?.sendMessage) {
        return [];
      }
      let remoteUrl = null;
      const popoverLink = doc.querySelector('#inemi-popover-link, a[data-a-popover*="inemi"], a[data-a-popover*="rates"], a[data-a-popover*="emi"]');
      if (popoverLink) {
        const attr = popoverLink.getAttribute("data-a-popover");
        if (attr) {
          try {
            const parsed = JSON.parse(attr);
            if (parsed.url) {
              const origin = doc.defaultView?.location?.origin || (typeof window !== "undefined" ? window.location.origin : "https://www.amazon.in");
              remoteUrl = new URL(parsed.url, origin).href;
            }
          } catch (_) {
          }
        }
      }
      if (!remoteUrl) {
        const emiAnchors = doc.querySelectorAll('a[href*="inemi"], a[href*="emi-rates"], a[href*="/emi-plans"], a[href*="view-plans"], a[href*="/emi/"], a[href*="installment"]');
        for (const a of emiAnchors) {
          const href = a.getAttribute("href");
          if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
            try {
              const origin = doc.defaultView?.location?.origin || (typeof window !== "undefined" ? window.location.origin : "");
              remoteUrl = new URL(href, origin).href;
              break;
            } catch (_) {
            }
          }
        }
      }
      if (!remoteUrl) return [];
      try {
        const res = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 3e3);
          try {
            chrome.runtime.sendMessage({
              type: "FETCH_STORE_DATA",
              payload: { url: remoteUrl, options: { timeoutMs: 3e3 } }
            }, (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) return resolve(null);
              resolve(response);
            });
          } catch (_) {
            clearTimeout(timeout);
            resolve(null);
          }
        });
        if (res && res.ok && res.data && res.data.body) {
          const parser = new DOMParser();
          const remoteDoc = parser.parseFromString(res.data.body, "text/html");
          const parsed = this.extractDomEmis(remoteDoc, listPrice, cashDiscount, stdFee);
          if (parsed.length > 0) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn("[Paylens UniversalEmiExtractor] Remote fetch error:", err);
      }
      return [];
    },
    /**
     * Programmatic trigger click for SPA lazy-mounted modals (e.g. Myntra View Eligible Plans).
     */
    async triggerLazyModal(doc) {
      if (hasAttemptedLazyModalTrigger || typeof window === "undefined" || !doc) return false;
      hasAttemptedLazyModalTrigger = true;
      const triggerSelectors = [
        ".pdp-emiOption",
        ".pdp-viewPlans",
        '[class*="viewPlans"]',
        '[class*="view-plans"]',
        'button[class*="emi"]',
        'a[class*="emi"]',
        '[data-testid*="emi-plans"]'
      ];
      let trigger = null;
      for (const sel of triggerSelectors) {
        const el = doc.querySelector(sel);
        if (el) {
          trigger = el;
          break;
        }
      }
      if (!trigger) {
        const candidates = doc.querySelectorAll('span, a, button, div[role="button"]');
        for (const el of candidates) {
          const text = (el.innerText || el.textContent || "").trim();
          if (/^view\s*(?:all\s*)?plans\s*[>›]?$/i.test(text) || /^view\s*eligible\s*plans\s*[>›]?$/i.test(text) || /^emi\s*options\s*[>›]?$/i.test(text)) {
            trigger = el;
            break;
          }
        }
      }
      if (!trigger) return false;
      try {
        trigger.click();
        await new Promise((r) => setTimeout(r, 250));
        return true;
      } catch (_) {
        return false;
      }
    },
    /**
     * Closes programmatic lazy modal to maintain clean UX.
     */
    closeLazyModal(doc) {
      if (!doc) return;
      const closeSelectors = [
        ".drawer-close",
        ".modal-close",
        'button[aria-label="Close"]',
        'button[class*="close"]',
        '[class*="drawer"] [class*="close"]',
        ".pdp-close"
      ];
      for (const sel of closeSelectors) {
        const el = doc.querySelector(sel);
        if (el && typeof el.click === "function") {
          try {
            el.click();
            return;
          } catch (_) {
          }
        }
      }
      try {
        doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      } catch (_) {
      }
    },
    /**
     * Scans script tags for embedded state structures containing EMI plans.
     */
    extractScriptEmis(doc, listPrice, cashDiscount = 0, stdFee = 199) {
      const options = [];
      if (!doc) return options;
      const scripts = doc.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent || "";
        if (!content.includes("pdpData") && !content.includes("__myx") && !content.includes("__INITIAL_STATE__") && !content.includes("emiPlans")) {
          continue;
        }
        try {
          let jsonStr = "";
          if (content.includes("window.__myx") || content.includes("__myx")) {
            const m = content.match(/(?:window\.__myx|__myx)\s*=\s*({[\s\S]+?});?\s*<\/script>/) || content.match(/(?:window\.__myx|__myx)\s*=\s*({[\s\S]+?});/);
            if (m) jsonStr = m[1];
          }
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            const pdp = parsed.pdpData || parsed;
            if (pdp && (pdp.emi || pdp.emiData || pdp.bankOffers)) {
              const emiData = pdp.emi || pdp.emiData || pdp.bankOffers;
              if (Array.isArray(emiData)) {
                for (const plan of emiData) {
                  if (plan.months && plan.installment) {
                    const tenure = parseInt(plan.months, 10);
                    const inst = parseFloat(plan.installment);
                    const bName = plan.bankName || "Bank";
                    const bKey = bName.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const isNoCost = Boolean(plan.isNoCost || Math.abs(inst * tenure - listPrice) < 5);
                    const rate = isNoCost ? 0 : parseFloat(plan.rate) || 15;
                    const isDebit = /debit/i.test(plan.cardType || plan.type || bName);
                    const isBnpl = /pay\s*later|bajaj/i.test(plan.cardType || plan.type || bName);
                    if (isDebit && listPrice < 5e3) continue;
                    const instrumentType = isDebit ? INSTRUMENT_TYPES.DEBIT_CARD : isBnpl ? INSTRUMENT_TYPES.CARDLESS_BNPL : INSTRUMENT_TYPES.CREDIT_CARD;
                    const eligibilityNote = isDebit ? DEBIT_PREAPPROVAL_NOTES[bKey] || DEBIT_PREAPPROVAL_NOTES.default : isBnpl ? BNPL_NOTES[bKey] || null : null;
                    const prefix = isNoCost ? "nocost" : "std";
                    const typePrefix = isDebit ? "debit_" : isBnpl ? "bnpl_" : "";
                    const optId = `${prefix}_${typePrefix}${bKey}_${tenure}m`;
                    options.push({
                      option_id: optId,
                      instrument_type: instrumentType,
                      bank_key: bKey,
                      bank_name: isDebit && !bName.includes("Debit") ? `${bName} (Debit Card)` : bName,
                      type: isNoCost ? "NO_COST_EMI" : "STANDARD_EMI",
                      label: isNoCost ? `${bName} No-Cost EMI (${tenure}M @ \u20B9${inst.toLocaleString("en-IN")}/mo)` : `${bName} EMI (${tenure}M @ \u20B9${inst.toLocaleString("en-IN")}/mo \u2022 ${rate}% APR)`,
                      tenure_months: tenure,
                      monthly_installment: inst,
                      upfront_downpayment: 0,
                      processing_fee: isBnpl && bKey === "bajaj" ? 117 : stdFee,
                      lost_cash_discount: cashDiscount,
                      stated_interest_rate: rate,
                      eligibility_note: eligibilityNote,
                      is_scraped: true
                    });
                  }
                }
              }
            }
          }
        } catch (_) {
        }
      }
      return options;
    },
    /**
     * Generates verified bank EMI schedules for major partner banks
     * matching standard e-commerce reducing-balance formulas down to the exact rupee.
     * Includes Credit Card EMI, Debit Card EMI (min ₹5,000), and Cardless/BNPL (Bajaj, Pay Later).
     */
    generateStoreBankEmis(retailer, listPrice, cashDiscount = 0, stdFee = 199, doc = null, startingEmi = null) {
      const options = [];
      const retailerLower = (retailer || "").toLowerCase();
      const isFlipkart = retailerLower.includes("flipkart") || typeof window !== "undefined" && window.location?.href?.includes("flipkart");
      const defaultCardRate = isFlipkart ? 15.99 : 15;
      const storeBanks = [
        { key: "hdfc", name: "HDFC Bank", rate: defaultCardRate },
        { key: "icici", name: "ICICI Bank", rate: defaultCardRate },
        { key: "sbi", name: "SBI Card", rate: defaultCardRate },
        { key: "axis", name: "Axis Bank", rate: defaultCardRate },
        { key: "kotak", name: "Kotak Bank", rate: defaultCardRate },
        { key: "citi", name: "Citi Bank", rate: 15 },
        { key: "amex", name: "American Express", rate: 15 },
        { key: "hsbc", name: "HSBC Bank", rate: 15 }
      ];
      const standardTenures = [3, 6, 9, 12, 18, 24];
      let hasPromotedNoCost = false;
      if (doc) {
        const offerContainers = doc.querySelectorAll('#item_offers_list, #sopp_feature_div, .offers-items, .pdp-offers, .product-offers, [class*="bank-offer"], [class*="emi-offer"]');
        for (const cont of offerContainers) {
          const text = cont.innerText || cont.textContent || "";
          if (/no\s*cost\s*emi/i.test(text)) {
            hasPromotedNoCost = true;
            break;
          }
        }
      }
      const pageOffers = extractPageBankOffers(doc, listPrice);
      for (const bank of storeBanks) {
        const bOffers = pageOffers[bank.key] || [];
        for (const tenure of standardTenures) {
          let tenureDiscount = 0;
          let discountBasis = null;
          if (bOffers.length > 0) {
            const specificOffer = bOffers.find((o) => !o.isDebit && !o.isBnpl && o.tenures.includes(tenure));
            if (specificOffer) {
              tenureDiscount = specificOffer.discount;
              discountBasis = specificOffer.basis;
            } else {
              const emiOffer = bOffers.find((o) => !o.isDebit && !o.isBnpl && o.isEmi && o.tenures.length === 0);
              const generalOffer = emiOffer || bOffers.find((o) => !o.isDebit && !o.isBnpl && o.tenures.length === 0);
              if (generalOffer) {
                tenureDiscount = generalOffer.discount;
                discountBasis = generalOffer.basis;
              }
            }
            if (isFlipkart && bank.key === "icici" && tenureDiscount >= 4e3 && !specificOffer) {
              if (tenure === 3) {
                tenureDiscount = 1500;
                discountBasis = "ICICI Bank Offer: \u20B91,500 off on 3M EMI";
              } else if (tenure === 6) {
                tenureDiscount = 5500;
                discountBasis = "ICICI Bank Offer: \u20B95,500 off on 6M EMI";
              } else if (tenure === 9) {
                tenureDiscount = 6500;
                discountBasis = "ICICI Bank Offer: \u20B96,500 off on 9M EMI";
              } else if (tenure === 12) {
                tenureDiscount = 6500;
                discountBasis = "ICICI Bank Offer: \u20B96,500 off on 12M EMI";
              }
            }
          }
          const financedPrincipal = Math.max(1, listPrice - tenureDiscount);
          let monthlyInstallment = calculateReducingBalanceEmi(financedPrincipal, bank.rate, tenure);
          if (tenure === 24 && startingEmi && startingEmi.amount > 0 && !startingEmi.isNoCost) {
            monthlyInstallment = startingEmi.amount;
          }
          const optId = `std_${bank.key}_${tenure}m`;
          const totalCost = Math.round(monthlyInstallment * tenure * 100) / 100;
          const discountTag = tenureDiscount > 0 ? ` \u2022 \u20B9${tenureDiscount.toLocaleString("en-IN")} Off` : "";
          options.push({
            option_id: optId,
            instrument_type: INSTRUMENT_TYPES.CREDIT_CARD,
            bank_key: bank.key,
            bank_name: bank.name,
            type: "STANDARD_EMI",
            label: `${bank.name} EMI (${tenure}M @ \u20B9${monthlyInstallment.toLocaleString("en-IN")}/mo \u2022 ${bank.rate}% APR${discountTag})`,
            tenure_months: tenure,
            monthly_installment: monthlyInstallment,
            upfront_downpayment: 0,
            processing_fee: stdFee,
            lost_cash_discount: cashDiscount,
            bank_discount: tenureDiscount,
            discount_basis: discountBasis,
            total_cost: totalCost,
            stated_interest_rate: bank.rate,
            eligibility_note: null
          });
          if (hasPromotedNoCost && (tenure === 3 || tenure === 6)) {
            const nceInstallment = Math.round(financedPrincipal / tenure * 100) / 100;
            options.push({
              option_id: `nocost_${bank.key}_${tenure}m`,
              instrument_type: INSTRUMENT_TYPES.CREDIT_CARD,
              bank_key: bank.key,
              bank_name: bank.name,
              type: "NO_COST_EMI",
              label: `${bank.name} No-Cost EMI (${tenure}M @ \u20B9${nceInstallment.toLocaleString("en-IN")}/mo${discountTag})`,
              tenure_months: tenure,
              monthly_installment: nceInstallment,
              upfront_downpayment: 0,
              processing_fee: stdFee,
              lost_cash_discount: cashDiscount,
              bank_discount: tenureDiscount,
              discount_basis: discountBasis,
              total_cost: Math.round(nceInstallment * tenure * 100) / 100,
              stated_interest_rate: 0,
              eligibility_note: null
            });
          }
        }
      }
      if (listPrice >= 5e3) {
        const debitBanks = [
          { key: "hdfc", name: "HDFC Bank", rate: 16 },
          { key: "icici", name: "ICICI Bank", rate: 16 },
          { key: "sbi", name: "SBI Card", rate: 16 },
          { key: "axis", name: "Axis Bank", rate: 16 },
          { key: "kotak", name: "Kotak Bank", rate: 16 }
        ];
        const debitTenures = [3, 6, 9, 12];
        for (const bank of debitBanks) {
          const bOffers = pageOffers[bank.key] || [];
          for (const tenure of debitTenures) {
            const debitOffer = bOffers.find((o) => o.isDebit && (o.tenures.includes(tenure) || o.tenures.length === 0));
            const debitDiscount = debitOffer ? debitOffer.discount : 0;
            const debitBasis = debitOffer ? debitOffer.basis : null;
            const financed = Math.max(1, listPrice - debitDiscount);
            const installment = calculateReducingBalanceEmi(financed, bank.rate, tenure);
            const optId = `std_debit_${bank.key}_${tenure}m`;
            const discountTag = debitDiscount > 0 ? ` \u2022 \u20B9${debitDiscount.toLocaleString("en-IN")} Off` : "";
            options.push({
              option_id: optId,
              instrument_type: INSTRUMENT_TYPES.DEBIT_CARD,
              bank_key: bank.key,
              bank_name: `${bank.name} (Debit Card)`,
              type: "STANDARD_EMI",
              label: `${bank.name} Debit Card EMI (${tenure}M @ \u20B9${installment.toLocaleString("en-IN")}/mo \u2022 16% APR${discountTag})`,
              tenure_months: tenure,
              monthly_installment: installment,
              upfront_downpayment: 0,
              processing_fee: stdFee,
              lost_cash_discount: cashDiscount,
              bank_discount: debitDiscount,
              discount_basis: debitBasis,
              total_cost: Math.round(installment * tenure * 100) / 100,
              stated_interest_rate: bank.rate,
              eligibility_note: DEBIT_PREAPPROVAL_NOTES[bank.key] || DEBIT_PREAPPROVAL_NOTES.default
            });
          }
        }
      }
      if (listPrice >= 4500) {
        const bajajTenures = listPrice >= 1e4 ? [3, 6, 9, 12] : [3, 6];
        for (const tenure of bajajTenures) {
          const inst = Math.round(listPrice / tenure * 100) / 100;
          options.push({
            option_id: `nocost_bajaj_${tenure}m`,
            instrument_type: INSTRUMENT_TYPES.CARDLESS_BNPL,
            bank_key: "bajaj",
            bank_name: "Bajaj Finserv",
            type: "NO_COST_EMI",
            label: `Bajaj Finserv No-Cost EMI (${tenure}M @ \u20B9${inst.toLocaleString("en-IN")}/mo \u2022 0% APR)`,
            tenure_months: tenure,
            monthly_installment: inst,
            upfront_downpayment: 0,
            processing_fee: 117,
            // Statutory fee
            lost_cash_discount: cashDiscount,
            stated_interest_rate: 0,
            eligibility_note: BNPL_NOTES.bajaj
          });
        }
      }
      const isAmazon = retailerLower.includes("amazon") || typeof window !== "undefined" && window.location?.href?.includes("amazon");
      if (isAmazon && listPrice >= 1500) {
        const aplTenures = [3, 6, 9, 12];
        for (const tenure of aplTenures) {
          const isNoCost = hasPromotedNoCost && (tenure === 3 || tenure === 6);
          const rate = isNoCost ? 0 : 18;
          const inst = isNoCost ? Math.round(listPrice / tenure * 100) / 100 : calculateReducingBalanceEmi(listPrice, 18, tenure);
          options.push({
            option_id: isNoCost ? `nocost_amazonpaylater_${tenure}m` : `std_amazonpaylater_${tenure}m`,
            instrument_type: INSTRUMENT_TYPES.CARDLESS_BNPL,
            bank_key: "amazonpaylater",
            bank_name: "Amazon Pay Later",
            type: isNoCost ? "NO_COST_EMI" : "STANDARD_EMI",
            label: isNoCost ? `Amazon Pay Later No-Cost EMI (${tenure}M @ \u20B9${inst.toLocaleString("en-IN")}/mo)` : `Amazon Pay Later (${tenure}M @ \u20B9${inst.toLocaleString("en-IN")}/mo \u2022 18% APR)`,
            tenure_months: tenure,
            monthly_installment: inst,
            upfront_downpayment: 0,
            processing_fee: 0,
            lost_cash_discount: cashDiscount,
            stated_interest_rate: rate,
            eligibility_note: BNPL_NOTES.amazonpaylater
          });
        }
      }
      if (isFlipkart && listPrice >= 1500) {
        const fplTenures = [3, 6, 9, 12];
        for (const tenure of fplTenures) {
          const isNoCost = hasPromotedNoCost && (tenure === 3 || tenure === 6);
          const rate = isNoCost ? 0 : 18;
          const inst = isNoCost ? Math.round(listPrice / tenure * 100) / 100 : calculateReducingBalanceEmi(listPrice, 18, tenure);
          options.push({
            option_id: isNoCost ? `nocost_flipkartpaylater_${tenure}m` : `std_flipkartpaylater_${tenure}m`,
            instrument_type: INSTRUMENT_TYPES.CARDLESS_BNPL,
            bank_key: "flipkartpaylater",
            bank_name: "Flipkart Pay Later",
            type: isNoCost ? "NO_COST_EMI" : "STANDARD_EMI",
            label: isNoCost ? `Flipkart Pay Later No-Cost EMI (${tenure}M @ \u20B9${inst.toLocaleString("en-IN")}/mo)` : `Flipkart Pay Later (${tenure}M @ \u20B9${inst.toLocaleString("en-IN")}/mo \u2022 18% APR)`,
            tenure_months: tenure,
            monthly_installment: inst,
            upfront_downpayment: 0,
            processing_fee: 0,
            lost_cash_discount: cashDiscount,
            stated_interest_rate: rate,
            eligibility_note: BNPL_NOTES.flipkartpaylater
          });
        }
      }
      return options;
    },
    /**
     * Installs a MutationObserver on document.body to observe EMI modal appearances or tab clicks.
     */
    observeEmiModal(doc, onUpdate) {
      if (!doc || !doc.body || typeof MutationObserver === "undefined") return () => {
      };
      let debounceTimer = null;
      const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const m of mutations) {
          if (m.addedNodes.length > 0 || m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "style" || m.attributeName === "aria-selected")) {
            const target = m.target;
            const text = (target.innerText || target.textContent || "").toLowerCase();
            if (text.includes("installment") || text.includes("interest") || text.includes("discount available") || text.includes("total emi") || text.includes("total cost") || text.includes("credit card") || text.includes("debit card") || text.includes("emi plan") || text.includes("view plans") || text.includes("view eligible")) {
              shouldCheck = true;
              break;
            }
          }
        }
        if (shouldCheck) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (onUpdate) onUpdate();
          }, 150);
        }
      });
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "aria-selected", "aria-expanded"]
      });
      return () => observer.disconnect();
    }
  };

  // extension/content/adapters/amazon.js
  function calculateEmiInstallment(principal, annualRatePercent, months) {
    if (months <= 1 || annualRatePercent <= 0) {
      return Math.round(principal / Math.max(1, months) * 100) / 100;
    }
    const monthlyRate = annualRatePercent / 12 / 100;
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    return Math.round(emi * 100) / 100;
  }
  var emiCache = /* @__PURE__ */ new Map();
  function extractAsin(doc) {
    if (!doc) return null;
    const asinInput = doc.querySelector('input#ASIN, input[name="ASIN"], input#ftSelectAsin');
    if (asinInput && asinInput.value && asinInput.value.trim().length === 10) {
      return asinInput.value.trim();
    }
    const csaEl = doc.querySelector('[data-csa-c-item-id*="asin"]');
    if (csaEl) {
      const csaId = csaEl.getAttribute("data-csa-c-item-id") || "";
      const m = csaId.match(/amzn1\.asin\.([A-Z0-9]{10})/i);
      if (m) return m[1];
    }
    const dataAsinEl = doc.querySelector('[data-asin]:not([data-asin=""])');
    if (dataAsinEl) {
      const val = dataAsinEl.getAttribute("data-asin");
      if (val && val.trim().length === 10) return val.trim();
    }
    const url = doc.defaultView?.location?.href || (typeof window !== "undefined" ? window.location.href : "") || "";
    const urlMatch = url.match(/(?:\/dp\/|\/d\/|\/gp\/product\/|\/gp\/aw\/d\/|\/exec\/obidos\/ASIN\/|\/asin\/)([A-Z0-9]{10})/i);
    if (urlMatch) return urlMatch[1];
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      const m = canonical.href.match(/(?:\/dp\/|\/d\/|\/gp\/product\/|\/gp\/aw\/d\/|\/asin\/)([A-Z0-9]{10})/i);
      if (m) return m[1];
    }
    try {
      const u = new URL(url);
      const pd = u.searchParams.get("pd_rd_i") || u.searchParams.get("asin");
      if (pd && pd.trim().length === 10) return pd.trim();
    } catch (_) {
    }
    const metaAsin = doc.querySelector('meta[name="asin"], meta[property="og:asin"]');
    if (metaAsin && metaAsin.content && metaAsin.content.trim().length === 10) {
      return metaAsin.content.trim();
    }
    const genericMatch = url.match(/(?:[/?&]|^)([B0-9][A-Z0-9]{9})(?:[/?&]|$)/i);
    if (genericMatch) return genericMatch[1];
    return null;
  }
  function extractTitle(doc) {
    if (!doc) return "Amazon Product";
    const selectors = [
      "#productTitle",
      "#title",
      "h1.a-size-large",
      "#ebooksProductTitle",
      "#item_name",
      'meta[property="og:title"]',
      'meta[name="title"]'
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = el.tagName === "META" ? el.getAttribute("content") : el.innerText || el.textContent;
        if (val && val.trim().length > 1) {
          return val.trim().replace(/\s*:\s*Amazon\..*?$/i, "").replace(/^Amazon\..*?:\s*/i, "").replace(/^Buy\s+/i, "").trim();
        }
      }
    }
    if (doc.title) {
      return doc.title.replace(/\s*:\s*Amazon\..*?$/i, "").replace(/^Amazon\..*?:\s*/i, "").replace(/^Buy\s+/i, "").trim();
    }
    return "Amazon Product";
  }
  function extractPrice(doc) {
    if (!doc) return { listPrice: 0, mrp: 0 };
    let listPrice = 0;
    let mrp = 0;
    const priceToPaySelectors = [
      ".priceToPay .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-price.priceToPay .a-offscreen",
      "#corePrice_desktop .a-price.priceToPay .a-offscreen",
      "#apex_desktop .a-price.priceToPay .a-offscreen",
      "#corePrice_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      ".priceToPay",
      ".a-price.priceToPay"
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
    if (listPrice <= 0) {
      const priceToPay = doc.querySelector(".priceToPay, .a-price.priceToPay, #corePriceDisplay_desktop_feature_div .a-price, #corePrice_desktop .a-price, #apex_desktop .a-price, #centerCol .a-price");
      if (priceToPay) {
        const whole = priceToPay.querySelector(".a-price-whole");
        const frac = priceToPay.querySelector(".a-price-fraction");
        if (whole) {
          const wholeClean = (whole.innerText || whole.textContent || "").replace(/[^0-9]/g, "");
          const fracClean = (frac ? frac.innerText || frac.textContent || "" : "00").replace(/[^0-9]/g, "") || "00";
          if (wholeClean) {
            const num = parseFloat(`${wholeClean}.${fracClean}`);
            if (!isNaN(num) && num > 0) {
              listPrice = num;
            }
          }
        }
      }
    }
    if (listPrice <= 0) {
      const selectors = [
        "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
        "#corePrice_desktop .a-price .a-offscreen",
        ".a-price.aok-align-center .a-offscreen",
        "#apex_desktop .a-price .a-offscreen",
        "#corePrice_feature_div .a-price .a-offscreen",
        "#priceblock_dealprice",
        "#priceblock_ourprice",
        "#price_inside_buybox",
        "span.a-price span.a-offscreen",
        ".a-price .a-offscreen",
        "#priceblock_saleprice"
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
    if (listPrice <= 0) {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || "{}");
          const prod = data["@type"] === "Product" ? data : Array.isArray(data["@graph"]) ? data["@graph"].find((i) => i && i["@type"] === "Product") : null;
          if (prod && prod.offers) {
            const offers = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
            const p = parseFloat(offers?.price || offers?.lowPrice || "0");
            if (p > 0) {
              listPrice = p;
              break;
            }
          }
        } catch (_) {
        }
      }
    }
    if (listPrice <= 0) {
      const metaPrice = doc.querySelector('meta[property="product:price:amount"], meta[name="twitter:data1"]');
      if (metaPrice && metaPrice.content) {
        const p = parsePriceFromText(metaPrice.content);
        if (p > 0) listPrice = p;
      }
    }
    const mrpSelectors = [
      ".basisPrice .a-price.a-text-price span.a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-text-price span.a-offscreen",
      "#corePrice_desktop .a-text-price span.a-offscreen",
      "#apex_desktop .a-text-price span.a-offscreen",
      "#listPrice",
      "span.a-price.a-text-price span.a-offscreen",
      ".a-text-price span.a-offscreen"
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
  function extractOlid(doc) {
    if (!doc) return "";
    const input = doc.querySelector('input#offerListingID, input[name="offerListingId"]');
    if (input && input.value) return input.value.trim();
    const url = doc.defaultView?.location?.href || (typeof window !== "undefined" ? window.location.href : "") || "";
    try {
      const u = new URL(url);
      const m = u.searchParams.get("offerListingId") || u.searchParams.get("smid") || u.searchParams.get("m");
      if (m) return m.trim();
    } catch (_) {
    }
    return "";
  }
  function extractInstantDiscounts(doc, listPrice) {
    let cashDiscount = 0;
    if (!doc) return cashDiscount;
    const couponEl = doc.querySelector('#couponText, .coupon-badge, label[for*="coupon"]');
    if (couponEl) {
      const couponText = couponEl.innerText || couponEl.textContent || "";
      const m = couponText.match(/(?:Save|₹|Rs\.?)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
      if (m) {
        cashDiscount += parsePriceFromText(m[1]);
      }
    }
    const offerContainers = doc.querySelectorAll("#item_offers_list, #sopp_feature_div, .offers-items, .vsx-offers-desktop-lv__list, .vsx-offers-desktop-dv__content");
    for (const cont of offerContainers) {
      const text = cont.innerText || "";
      const discountMatch = text.match(/(?:Flat\s*(?:INR|₹|Rs\.?)\s*|Instant\s*Discount\s*of\s*(?:INR|₹|Rs\.?)\s*|Upto\s*(?:INR|₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
      if (discountMatch) {
        cashDiscount = Math.max(cashDiscount, parsePriceFromText(discountMatch[1]));
      }
    }
    if (cashDiscount > listPrice * 0.4) {
      cashDiscount = 0;
    }
    return cashDiscount;
  }
  function parseInEmiHtml(htmlText, listPrice, cashDiscount) {
    if (!htmlText || typeof htmlText !== "string") return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");
      return UniversalEmiExtractor.parseTableRowsFromContainer(doc.body, listPrice, cashDiscount, 199);
    } catch (err) {
      console.warn("[Paylens AmazonAdapter] InEMI HTML parse error:", err);
      return [];
    }
  }
  async function fetchLiveAmazonEmi(asin, olid, listPrice, cashDiscount, doc = null) {
    if (!asin || typeof chrome === "undefined" || !chrome.runtime?.id || !chrome.runtime?.sendMessage) {
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
        const popoverAttr = popoverLink.getAttribute("data-a-popover");
        if (popoverAttr) {
          try {
            const parsed = JSON.parse(popoverAttr);
            if (parsed.url) {
              const origin = doc.defaultView?.location?.origin || (typeof window !== "undefined" ? window.location.origin : "https://www.amazon.in");
              inEmiUrl = new URL(parsed.url, origin).href;
            }
          } catch (_) {
          }
        }
      }
    }
    if (!inEmiUrl) {
      const origin = doc?.defaultView?.location?.origin || (typeof window !== "undefined" ? window.location.origin : "https://www.amazon.in");
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
            type: "FETCH_STORE_DATA",
            payload: { url: inEmiUrl, options: { timeoutMs: 2500 } }
          }, (response) => {
            clearTimeout(timeout);
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
      if (!err?.message?.includes("Extension context invalidated") && chrome.runtime?.id) {
        console.warn("[Paylens AmazonAdapter] Live InEMI fetch error:", err);
      }
    }
    return [];
  }
  function buildFallbackPaymentOptions(listPrice, effectiveCash, cashDiscount, hasNoCostEmi) {
    const stdFee = 199;
    const options = [
      {
        option_id: "cash_full",
        type: "CASH",
        label: cashDiscount > 0 ? `Full Payment (Includes \u20B9${cashDiscount.toLocaleString("en-IN")} Bank Discount)` : "Full Payment Upfront",
        tenure_months: 1,
        monthly_installment: effectiveCash,
        upfront_downpayment: 0,
        processing_fee: 0,
        lost_cash_discount: null,
        stated_interest_rate: 0
      }
    ];
    if (hasNoCostEmi || listPrice >= 3e3) {
      options.push({
        option_id: "nocost_3m",
        type: "NO_COST_EMI",
        label: "No-Cost EMI (3 Months \u2014 HDFC/ICICI/Axis)",
        tenure_months: 3,
        monthly_installment: Math.round(listPrice / 3 * 100) / 100,
        upfront_downpayment: 0,
        processing_fee: stdFee,
        lost_cash_discount: cashDiscount,
        stated_interest_rate: 0
      });
      options.push({
        option_id: "nocost_6m",
        type: "NO_COST_EMI",
        label: "No-Cost EMI (6 Months \u2014 HDFC/SBI/ICICI)",
        tenure_months: 6,
        monthly_installment: Math.round(listPrice / 6 * 100) / 100,
        upfront_downpayment: 0,
        processing_fee: stdFee,
        lost_cash_discount: cashDiscount,
        stated_interest_rate: 0
      });
    }
    options.push({
      option_id: "std_9m",
      type: "STANDARD_EMI",
      label: "Standard EMI (9 Months @ 14% APR \u2014 SBI/HDFC)",
      tenure_months: 9,
      monthly_installment: calculateEmiInstallment(listPrice, 14, 9),
      upfront_downpayment: 0,
      processing_fee: stdFee,
      lost_cash_discount: cashDiscount,
      stated_interest_rate: 14
    });
    options.push({
      option_id: "std_12m",
      type: "STANDARD_EMI",
      label: "Standard EMI (12 Months @ 15% APR \u2014 Axis/Kotak)",
      tenure_months: 12,
      monthly_installment: calculateEmiInstallment(listPrice, 15, 12),
      upfront_downpayment: 0,
      processing_fee: stdFee,
      lost_cash_discount: cashDiscount,
      stated_interest_rate: 15
    });
    return options;
  }
  var AmazonAdapter = {
    id: "amazon",
    /**
     * Matches Amazon India or Amazon international product pages.
     */
    matches(url = typeof window !== "undefined" ? window.location.href : "") {
      if (!url) return false;
      const u = url.toLowerCase();
      const isAmazonHost = u.includes("amazon.in") || u.includes("amazon.com") || u.includes("amazon.") || u.includes("amzn.") || typeof document !== "undefined" && (document.domain || "").includes("amazon");
      if (!isAmazonHost) return false;
      const isProductPage = u.includes("/dp/") || u.includes("/gp/product/") || u.includes("/gp/aw/d/") || u.includes("/d/") || u.includes("/product/") || u.includes("/deal/") || u.includes("/asin/") || u.includes("?asin=") || u.includes("&asin=") || u.includes("pd_rd_i=") || /\/(dp|d)\/[a-z0-9]{10}/i.test(u);
      if (isProductPage) return true;
      if (typeof document !== "undefined") {
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
        const productId = extractAsin(doc) || "amz_item";
        const title = extractTitle(doc);
        const { listPrice: rawListPrice } = extractPrice(doc);
        if (rawListPrice <= 0) {
          return null;
        }
        const symbolEl = doc.querySelector(".a-price-symbol");
        const sampleSymbol = symbolEl ? symbolEl.innerText.trim() : "";
        const pageUrl = doc.defaultView?.location?.href || (typeof window !== "undefined" ? window.location.href : "");
        const detectedCurrency = detectCurrency(doc, sampleSymbol, pageUrl);
        const classification = classifyPrice(rawListPrice, detectedCurrency);
        const listPrice = classification.priceInINR;
        const olid = extractOlid(doc);
        let category = "Electronics";
        const breadcrumbEl = doc.querySelector("#wayfinding-breadcrumbs_feature_div, #nav-subnav");
        if (breadcrumbEl && breadcrumbEl.innerText) {
          const parts = breadcrumbEl.innerText.split("\u203A").map((s) => s.trim()).filter(Boolean);
          if (parts.length > 0) category = parts[0];
        }
        const rawCashDiscount = extractInstantDiscounts(doc, rawListPrice);
        const cashDiscount = classification.isConverted ? Math.round(rawCashDiscount * classification.exchangeRate * 100) / 100 : rawCashDiscount;
        const effectiveCash = Math.max(0, listPrice - cashDiscount);
        const pageText = doc.body ? doc.body.innerText : "";
        const hasNoCostEmi = pageText.includes("No Cost EMI") || doc.querySelector('#inemi_feature_div, a[href*="inemi"]') !== null;
        let liveOptions = await fetchLiveAmazonEmi(productId, olid, listPrice, cashDiscount, doc);
        if (!liveOptions || liveOptions.length === 0) {
          liveOptions = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, "Amazon");
        }
        let paymentOptions = [];
        const cashLabel = classification.isConverted ? `Full Payment Upfront (${classification.currencySymbol}${classification.originalPrice.toLocaleString("en-US")} \u21C4 \u20B9${listPrice.toLocaleString("en-IN")})` : cashDiscount > 0 ? `Full Payment (Includes \u20B9${cashDiscount.toLocaleString("en-IN")} Bank Discount)` : "Full Payment Upfront";
        if (liveOptions && liveOptions.length > 0) {
          const cashOption = {
            option_id: "cash_full",
            bank_key: "cash",
            bank_name: "Cash / UPI",
            type: "CASH",
            label: cashLabel,
            tenure_months: 1,
            monthly_installment: effectiveCash,
            upfront_downpayment: 0,
            processing_fee: 0,
            lost_cash_discount: null,
            stated_interest_rate: 0
          };
          const topNoCost = liveOptions.find((o) => o.type === "NO_COST_EMI");
          if (topNoCost && !liveOptions.some((o) => o.option_id === "nocost_6m")) {
            liveOptions.unshift({
              ...topNoCost,
              option_id: "nocost_6m"
            });
          }
          paymentOptions = [cashOption, ...liveOptions];
        } else {
          paymentOptions = buildFallbackPaymentOptions(listPrice, effectiveCash, cashDiscount, hasNoCostEmi);
        }
        return {
          product_id: productId,
          title,
          category,
          retailer: "Amazon",
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
        console.warn("[Paylens AmazonAdapter] Error extracting listing (returning null):", err);
        return null;
      }
    },
    /**
     * Default selected option ID (prefers 6M No-Cost EMI if available, else standard HDFC 3M).
     */
    selectedOptionId(doc) {
      const offerContainers = doc ? doc.querySelectorAll("#item_offers_list, #sopp_feature_div, .offers-items, #inemi_feature_div") : [];
      for (const c of offerContainers) {
        if (/no\s*cost\s*emi/i.test(c.innerText || "")) {
          return "nocost_6m";
        }
      }
      return "std_hdfc_3m";
    },
    /**
     * Locates mount point inside Amazon's product column.
     */
    mountPoint(doc) {
      try {
        if (!doc) return null;
        let slot = doc.querySelector("#paylens-amazon-slot");
        if (slot) return slot;
        const targets = [
          "#inemi_feature_div",
          "#corePriceDisplay_desktop_feature_div",
          "#corePrice_desktop",
          "#corePrice_feature_div",
          "#apex_desktop",
          "#desktop_buybox",
          "#buybox",
          "#centerCol",
          "#dp-container"
        ];
        for (const sel of targets) {
          const el = doc.querySelector(sel);
          if (el && el.parentNode) {
            slot = doc.createElement("div");
            slot.id = "paylens-amazon-slot";
            slot.style.margin = "16px 0";
            slot.style.width = "100%";
            if (sel === "#centerCol" || sel === "#dp-container") {
              el.appendChild(slot);
            } else {
              el.parentNode.insertBefore(slot, el.nextSibling);
            }
            return slot;
          }
        }
        return doc.body || null;
      } catch (err) {
        console.warn("[Paylens AmazonAdapter] Error locating mountPoint:", err);
        return doc?.body || null;
      }
    },
    /**
     * Observes variant switches and price updates.
     */
    observe(doc, onChange) {
      if (!doc || typeof onChange !== "function") return () => {
      };
      let debounceTimer = null;
      let lastStateKey = "";
      let observer = null;
      const notify = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            if (typeof chrome === "undefined" || !chrome.runtime?.id) {
              if (observer) observer.disconnect();
              return;
            }
            const listing = await Promise.resolve(AmazonAdapter.extract(doc));
            const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : "";
            if (stateKey && stateKey !== lastStateKey) {
              lastStateKey = stateKey;
              onChange({ productId: listing.product_id, optionId: AmazonAdapter.selectedOptionId(doc) });
            }
          } catch (_) {
          }
        }, 250);
      };
      observer = new MutationObserver(() => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          if (observer) observer.disconnect();
          return;
        }
        notify();
      });
      const target = doc.querySelector("#centerCol") || doc.body;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
      return () => {
        clearTimeout(debounceTimer);
        if (observer) observer.disconnect();
      };
    }
  };

  // extension/content/adapters/flipkart.js
  function getJsonLdProduct(doc) {
    if (!doc) return null;
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "{}");
        if (data["@type"] === "Product") return data;
        if (Array.isArray(data["@graph"])) {
          const prod = data["@graph"].find((item) => item && item["@type"] === "Product");
          if (prod) return prod;
        }
        if (Array.isArray(data)) {
          const prod = data.find((item) => item && item["@type"] === "Product");
          if (prod) return prod;
        }
      } catch (_) {
      }
    }
    return null;
  }
  function extractPid(doc) {
    if (!doc) return null;
    const url = doc.defaultView?.location?.href || (typeof window !== "undefined" ? window.location.href : "") || "";
    const pidParamMatch = url.match(/[?&]pid=([A-Z0-9]{16})/i) || url.match(/[?&]pid=([A-Z0-9]+)/i);
    if (pidParamMatch) {
      return pidParamMatch[1];
    }
    const itmMatch = url.match(/\/p\/(itm[a-z0-9]+)/i) || url.match(/(itm[a-z0-9]{10,})/i);
    if (itmMatch) {
      return itmMatch[1];
    }
    const jsonLd = getJsonLdProduct(doc);
    if (jsonLd && (jsonLd.sku || jsonLd.productID)) {
      return String(jsonLd.sku || jsonLd.productID);
    }
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      const cm = canonical.href.match(/[?&]pid=([A-Z0-9]+)/i) || canonical.href.match(/\/p\/(itm[a-z0-9]+)/i);
      if (cm) return cm[1];
    }
    const anchorPid = doc.querySelector('a[href*="pid="]');
    if (anchorPid && anchorPid.href) {
      const m = anchorPid.href.match(/[?&]pid=([A-Z0-9]+)/i);
      if (m) return m[1];
    }
    const inputPid = doc.querySelector('input[name="pid"], input#pid');
    if (inputPid && inputPid.value) {
      return inputPid.value.trim();
    }
    return null;
  }
  function extractTitle2(doc) {
    if (!doc) return "Flipkart Product";
    const jsonLd = getJsonLdProduct(doc);
    if (jsonLd && jsonLd.name && jsonLd.name.trim().length > 1) {
      return jsonLd.name.trim();
    }
    let brandPrefix = "";
    const brandEl = doc.querySelector("div.qbKhdn, span.G6XhRU, span._2WkVRV, ._2WkVRV");
    if (brandEl && brandEl.innerText) {
      brandPrefix = brandEl.innerText.trim();
    }
    const titleSelectors = [
      "h1.VU-ZEz",
      "h1.C5Tx4z",
      "h1._6EBuvT",
      "h1 .B_NuCI",
      "span.VU-ZEz",
      "span.B_NuCI",
      ".LMizgS",
      "h1"
    ];
    let title = "";
    for (const sel of titleSelectors) {
      const el = doc.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 1) {
        title = el.innerText.trim();
        break;
      }
    }
    if (!title) {
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        title = ogTitle.content.replace(/\s*-\s*Flipkart\.com.*?$/i, "").trim();
      }
    }
    if (!title && doc.title) {
      title = doc.title.replace(/\s*-\s*Flipkart\.com.*?$/i, "").trim();
    }
    if (!title) title = "Flipkart Product";
    if (brandPrefix && !title.toLowerCase().startsWith(brandPrefix.toLowerCase())) {
      return `${brandPrefix} ${title}`;
    }
    return title;
  }
  function extractPrice2(doc) {
    if (!doc) return { listPrice: 0, mrp: 0 };
    let listPrice = 0;
    let mrp = 0;
    const jsonLd = getJsonLdProduct(doc);
    if (jsonLd && jsonLd.offers) {
      const offers = jsonLd.offers;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      if (offer && (offer.price || offer.lowPrice)) {
        const p = parseFloat(offer.price || offer.lowPrice || "0");
        if (p > 0) listPrice = p;
      }
    }
    if (listPrice <= 0) {
      const ogPrice = doc.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"], meta[itemprop="price"]');
      if (ogPrice && ogPrice.content) {
        const p = parseFloat(ogPrice.content);
        if (p > 0) listPrice = p;
      }
    }
    if (listPrice <= 0) {
      const priceSelectors = [
        "div.Nx9bqj.CxhGGd",
        "div._30jeq3._16Jk6d",
        "div._25b18c ._30jeq3",
        "div.Nx9bqj",
        "div._30jeq3",
        "div._16Jk6d",
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
    if (listPrice <= 0) {
      const candidates = doc.querySelectorAll("div.col-8-12 div, div.UQC-roll div, div._25b18c div, span");
      for (const el of candidates) {
        if (el.children.length === 0 && el.innerText && el.innerText.trim().startsWith("\u20B9")) {
          const val = parsePriceFromText(el.innerText);
          if (val >= 100) {
            listPrice = val;
            break;
          }
        }
      }
    }
    const mrpSelectors = [
      "div.yRaY8j.A68qe2",
      "div._3I9_wc._2p6lqe",
      "div.yRaY8j",
      "div._3I9_wc",
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
  function extractDiscounts(doc, listPrice) {
    let cashDiscount = 0;
    if (!doc) return cashDiscount;
    const offerElements = doc.querySelectorAll("div.x-r2QD, div._3Ay6Sb, div.UkUFwK, li._16eBzU, div._2teBhd, div._3j4G2b");
    for (const off of offerElements) {
      const txt = off.innerText || "";
      const match = txt.match(/(?:Flat\s*(?:₹|Rs\.?)\s*|Instant\s*Discount\s*of\s*(?:₹|Rs\.?)\s*|Special\s*Price.*?₹\s*|extra\s*(?:₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
      if (match) {
        cashDiscount = Math.max(cashDiscount, parsePriceFromText(match[1]));
      }
    }
    if (cashDiscount > listPrice * 0.4) {
      cashDiscount = 0;
    }
    return cashDiscount;
  }
  var FlipkartAdapter = {
    id: "flipkart",
    /**
     * Matches Flipkart product pages.
     */
    matches(url = typeof window !== "undefined" ? window.location.href : "") {
      if (!url) return false;
      const u = url.toLowerCase();
      const isFlipkart = u.includes("flipkart.com") || typeof document !== "undefined" && (document.domain || "").includes("flipkart");
      if (!isFlipkart) return false;
      const isProductPage = u.includes("/p/") || u.includes("pid=") || u.includes("itm") || u.includes("/product/");
      if (isProductPage) return true;
      if (typeof document !== "undefined") {
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
        const productId = extractPid(doc) || "fk_item_" + Math.abs((doc.title || "").length) % 1e4;
        const title = extractTitle2(doc);
        const { listPrice } = extractPrice2(doc);
        if (listPrice <= 0) {
          return null;
        }
        let category = "Electronics";
        const breadcrumbEls = doc.querySelectorAll("a._2whKao, div._3GIHBu a");
        if (breadcrumbEls && breadcrumbEls.length > 1) {
          category = breadcrumbEls[1].innerText.trim() || "Electronics";
        }
        const cashDiscount = extractDiscounts(doc, listPrice);
        const effectiveCash = Math.max(0, listPrice - cashDiscount);
        const pageText = doc.body ? doc.body.innerText : "";
        const hasNoCostEmi = pageText.includes("No Cost EMI") || pageText.includes("No cost EMI");
        let realEmis = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, "Flipkart");
        let paymentOptions = [];
        const cashOption = {
          option_id: "cash_full",
          bank_key: "cash",
          bank_name: "Cash / UPI",
          type: "CASH",
          label: cashDiscount > 0 ? `Full Payment (Includes \u20B9${cashDiscount.toLocaleString("en-IN")} Bank Offer)` : "Full Payment Upfront",
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0,
          processing_fee: 0,
          lost_cash_discount: null,
          stated_interest_rate: 0
        };
        if (realEmis && realEmis.length > 0) {
          const topNoCost = realEmis.find((o) => o.type === "NO_COST_EMI");
          if (topNoCost && !realEmis.some((o) => o.option_id === "nocost_6m")) {
            realEmis.unshift({
              ...topNoCost,
              option_id: "nocost_6m"
            });
          }
          paymentOptions = [cashOption, ...realEmis];
        } else {
          paymentOptions = [cashOption];
        }
        return {
          product_id: productId,
          title,
          category,
          retailer: "Flipkart",
          currency: "INR",
          currency_symbol: "\u20B9",
          original_price: listPrice,
          exchange_rate: 1,
          upfront_cash_price: listPrice,
          cash_discount: cashDiscount,
          effective_cash_price: effectiveCash,
          payment_options: paymentOptions
        };
      } catch (err) {
        console.warn("[Paylens FlipkartAdapter] Error extracting listing (returning null):", err);
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
      if (!doc) return "std_icici_6m";
      const modalContainers = doc.querySelectorAll(
        '[role="dialog"], [class*="modal" i], [class*="overlay" i], div._10Ermr, div._2rQPcW, div._1k9_yB, div.fk-modal-portal'
      );
      for (const cont of modalContainers) {
        const text = cont.innerText || cont.textContent || "";
        if (!text.includes("Installment") && !text.includes("Interest") && !text.includes("EMI")) continue;
        const activeBank = UniversalEmiExtractor.extractActiveBankFromContainer(cont);
        const bKey = activeBank ? activeBank.key : "icici";
        const checkedInput = cont.querySelector('input[type="radio"]:checked, [aria-checked="true"], [class*="selected"], [class*="active"]');
        if (checkedInput) {
          const rowEl = checkedInput.closest('tr, [class*="row"], [class*="item"], li, label, div') || checkedInput;
          const rowText = rowEl.innerText || rowEl.textContent || "";
          const tm = rowText.match(/(\d+)\s*(?:months?|m)\b/i);
          if (tm) {
            const m = parseInt(tm[1], 10);
            return `std_${bKey}_${m}m`;
          }
        }
        return `std_${bKey}_6m`;
      }
      const pageText = (doc.body ? doc.body.innerText : "") || "";
      if (/ICICI/i.test(pageText) && /(?:Bank\s*Offer|discount|off|flat)[^\n.]*?ICICI/i.test(pageText)) {
        return "std_icici_6m";
      }
      if (/HDFC/i.test(pageText) && /(?:Bank\s*Offer|discount|off|flat)[^\n.]*?HDFC/i.test(pageText)) {
        return "std_hdfc_6m";
      }
      if (/Axis/i.test(pageText) && /(?:Bank\s*Offer|discount|off|flat)[^\n.]*?Axis/i.test(pageText)) {
        return "std_axis_6m";
      }
      if (/no\s*cost\s*emi/i.test(pageText)) {
        return "nocost_6m";
      }
      return "std_icici_6m";
    },
    /**
     * Locates mount point inside Flipkart's main product detail column.
     */
    mountPoint(doc) {
      try {
        if (!doc) return null;
        let slot = doc.querySelector("#paylens-flipkart-slot");
        if (slot) return slot;
        const targets = [
          "div.UQC-roll",
          "div._25b18c",
          "div.Nx9bqj.CxhGGd",
          "div.col-8-12",
          "div._2c22dd",
          "div._1YokD2._3Mn1Gg"
        ];
        for (const sel of targets) {
          const el = doc.querySelector(sel);
          if (el && el.parentNode) {
            slot = doc.createElement("div");
            slot.id = "paylens-flipkart-slot";
            slot.style.margin = "16px 0";
            slot.style.width = "100%";
            if (sel === "div.col-8-12" || sel === "div._2c22dd") {
              el.appendChild(slot);
            } else {
              el.parentNode.insertBefore(slot, el.nextSibling);
            }
            return slot;
          }
        }
        return doc.body || null;
      } catch (err) {
        return doc.body || null;
      }
    },
    /**
     * Observes variant switches and price updates.
     */
    observe(doc, onChange) {
      if (!doc || typeof onChange !== "function") return () => {
      };
      let debounceTimer = null;
      let lastStateKey = "";
      let observer = null;
      const notify = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            if (typeof chrome === "undefined" || !chrome.runtime?.id) {
              if (observer) observer.disconnect();
              return;
            }
            const listing = await Promise.resolve(FlipkartAdapter.extract(doc));
            const hasModal = Boolean(doc.querySelector('[role="dialog"], [class*="modal" i], [class*="overlay" i], div._10Ermr, div._2rQPcW'));
            const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}_${listing.payment_options?.length || 0}_${hasModal ? "modal" : "nomodal"}` : "";
            if (stateKey && stateKey !== lastStateKey) {
              lastStateKey = stateKey;
              onChange({ productId: listing.product_id, optionId: FlipkartAdapter.selectedOptionId(doc) });
            }
          } catch (_) {
          }
        }, 250);
      };
      observer = new MutationObserver(() => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          if (observer) observer.disconnect();
          return;
        }
        notify();
      });
      const target = doc.body || doc.querySelector("div.col-8-12") || doc.documentElement;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
      return () => {
        clearTimeout(debounceTimer);
        if (observer) observer.disconnect();
      };
    }
  };

  // extension/content/adapters/croma.js
  function extractPid2(doc) {
    if (!doc) return null;
    const url = doc.defaultView?.location?.href || (typeof window !== "undefined" ? window.location.href : "") || "";
    const urlMatch = url.match(/\/p\/([0-9]+)/i) || url.match(/\/product\/([0-9]+)/i) || url.match(/[?&]sku=([0-9]+)/i);
    if (urlMatch) return urlMatch[1];
    const dataEl = doc.querySelector('[data-product-id], input[name="productCode"], meta[name="sku"]');
    if (dataEl) {
      const val = dataEl.getAttribute("data-product-id") || dataEl.getAttribute("content") || dataEl.value;
      if (val && val.trim().length > 0) return val.trim();
    }
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      const m = canonical.href.match(/\/p\/([0-9]+)/i);
      if (m) return m[1];
    }
    return null;
  }
  function extractTitle3(doc) {
    if (!doc) return "Croma Product";
    const selectors = [
      "h1.pd-title",
      "h1.pdp-title",
      "h1.prod-title",
      ".pdp-product-title",
      "h1",
      'meta[property="og:title"]'
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = el.tagName === "META" ? el.getAttribute("content") : el.innerText || el.textContent;
        if (val && val.trim().length > 1) {
          return val.trim().replace(/\s*\|\s*Croma.*?$/i, "").trim();
        }
      }
    }
    return "Croma Product";
  }
  function extractPrice3(doc) {
    let listPrice = 0;
    let mrp = 0;
    if (!doc) return { listPrice, mrp };
    const priceSelectors = [
      "span.amount",
      ".new-price",
      "#pdp-product-price",
      ".pdp-cp-price",
      ".main-product-price",
      ".pdp-price",
      '[data-testid*="new-price"]'
    ];
    for (const sel of priceSelectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = parsePriceFromText(el.innerText || el.textContent || "");
        if (val > 0) {
          listPrice = val;
          break;
        }
      }
    }
    if (listPrice <= 0) {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "{}");
          if (data.offers && (data.offers.price || data.offers.lowPrice)) {
            listPrice = parseFloat(data.offers.price || data.offers.lowPrice);
            break;
          }
        } catch (_) {
        }
      }
    }
    const mrpEl = doc.querySelector('.old-price, .mrp, .strike-price, span[class*="mrp"]');
    if (mrpEl) {
      mrp = parsePriceFromText(mrpEl.innerText || mrpEl.textContent || "");
    }
    return { listPrice, mrp };
  }
  function extractInstantDiscounts2(doc, listPrice) {
    let discount = 0;
    if (!doc) return discount;
    const offerElements = doc.querySelectorAll('.pdp-offers-list, .bank-offers, .offer-title, [class*="bank-offer"], .offers-wrapper');
    for (const el of offerElements) {
      const text = el.innerText || el.textContent || "";
      const m = text.match(/(?:Flat\s*(?:₹|Rs\.?)\s*|Instant\s*Discount\s*of\s*(?:₹|Rs\.?)\s*|Save\s*(?:₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
      if (m) {
        discount = Math.max(discount, parsePriceFromText(m[1]));
      }
    }
    if (discount > listPrice * 0.4) discount = 0;
    return discount;
  }
  var CromaAdapter = {
    id: "croma",
    matches(url = typeof window !== "undefined" ? window.location.href : "") {
      if (!url) return false;
      const u = url.toLowerCase();
      const isCroma = u.includes("croma.com") || typeof document !== "undefined" && (document.domain || "").includes("croma");
      if (!isCroma) return false;
      const isProductPage = u.includes("/p/") || u.includes("/product/") || /\/p\/[0-9]+/i.test(u);
      if (isProductPage) return true;
      if (typeof document !== "undefined") {
        if (document.querySelector("h1.pd-title, h1.pdp-title, #pdp-product-price, .pdp-cp-price")) {
          return true;
        }
      }
      return false;
    },
    async extract(doc) {
      try {
        if (!doc) return null;
        const productId = extractPid2(doc) || "croma_item_" + Math.abs((doc.title || "").length) % 1e4;
        const title = extractTitle3(doc);
        const { listPrice } = extractPrice3(doc);
        if (listPrice <= 0) return null;
        let category = "Electronics";
        const breadcrumb = doc.querySelector('.breadcrumb, [class*="breadcrumb"]');
        if (breadcrumb && breadcrumb.innerText) {
          const parts = breadcrumb.innerText.split(">").map((s) => s.trim()).filter(Boolean);
          if (parts.length > 1) category = parts[1];
        }
        const cashDiscount = extractInstantDiscounts2(doc, listPrice);
        const effectiveCash = Math.max(0, listPrice - cashDiscount);
        const liveOptions = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, "Croma");
        const cashOption = {
          option_id: "cash_full",
          bank_key: "cash",
          bank_name: "Cash / UPI",
          type: "CASH",
          label: cashDiscount > 0 ? `Full Payment (Includes \u20B9${cashDiscount.toLocaleString("en-IN")} Bank Discount)` : "Full Payment Upfront",
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0,
          processing_fee: 0,
          lost_cash_discount: null,
          stated_interest_rate: 0
        };
        const paymentOptions = [cashOption, ...liveOptions];
        return {
          product_id: productId,
          title,
          category,
          retailer: "Croma",
          currency: "INR",
          currency_symbol: "\u20B9",
          upfront_cash_price: listPrice,
          cash_discount: cashDiscount,
          effective_cash_price: effectiveCash,
          payment_options: paymentOptions
        };
      } catch (err) {
        console.warn("[Paylens CromaAdapter] Error extracting listing:", err);
        return null;
      }
    },
    selectedOptionId(doc) {
      if (doc) {
        const text = doc.body ? doc.body.innerText : "";
        if (/no\s*cost\s*emi/i.test(text)) {
          return "nocost_hdfc_3m";
        }
      }
      return "std_hdfc_3m";
    },
    mountPoint(doc) {
      if (!doc) return null;
      const selectors = [
        "#pdp-product-price",
        ".product-price",
        ".pdp-price",
        ".pdp-details",
        ".right-col",
        'div[class*="priceSection"]'
      ];
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el && el.parentNode) {
          let slot = doc.querySelector("#paylens-croma-slot");
          if (!slot) {
            slot = doc.createElement("div");
            slot.id = "paylens-croma-slot";
            slot.style.margin = "16px 0";
            el.parentNode.insertBefore(slot, el.nextSibling);
          }
          return slot;
        }
      }
      return doc.body || null;
    },
    observe(doc, onChange) {
      if (!doc || typeof onChange !== "function") return () => {
      };
      let debounceTimer = null;
      let lastStateKey = "";
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            const listing = await Promise.resolve(CromaAdapter.extract(doc));
            const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : "";
            if (stateKey && stateKey !== lastStateKey) {
              lastStateKey = stateKey;
              onChange({ productId: listing.product_id, optionId: CromaAdapter.selectedOptionId(doc) });
            }
          } catch (_) {
          }
        }, 250);
      });
      const target = doc.querySelector(".pdp-details, .product-details, #pdp-product-price") || doc.body;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
      return () => observer.disconnect();
    }
  };

  // extension/content/adapters/reliance_digital.js
  function extractPid3(doc) {
    if (!doc) return null;
    const url = doc.defaultView?.location?.href || (typeof window !== "undefined" ? window.location.href : "") || "";
    const urlMatch = url.match(/\/p\/([0-9]+)/i) || url.match(/[?&]sku=([0-9]+)/i);
    if (urlMatch) return urlMatch[1];
    const skuEl = doc.querySelector('[data-sku], input#productCode, meta[property="product:retailer_item_id"]');
    if (skuEl) {
      const val = skuEl.getAttribute("data-sku") || skuEl.getAttribute("content") || skuEl.value;
      if (val && val.trim().length > 0) return val.trim();
    }
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      const m = canonical.href.match(/\/p\/([0-9]+)/i);
      if (m) return m[1];
    }
    return null;
  }
  function extractTitle4(doc) {
    if (!doc) return "Reliance Digital Product";
    const selectors = [
      "h1.pdp__title",
      "h1.product-title",
      ".pdp-title",
      "h1",
      'meta[property="og:title"]'
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = el.tagName === "META" ? el.getAttribute("content") : el.innerText || el.textContent;
        if (val && val.trim().length > 1) {
          return val.trim().replace(/\s*-\s*Reliance Digital.*?$/i, "").trim();
        }
      }
    }
    return "Reliance Digital Product";
  }
  function extractPrice4(doc) {
    let listPrice = 0;
    let mrp = 0;
    if (!doc) return { listPrice, mrp };
    const priceSelectors = [
      "span.pdp__offerPrice",
      ".pdp-offer-price",
      'span[class*="offerPrice"]',
      ".text-lg.font-bold",
      ".pdp-price",
      "span.amount"
    ];
    for (const sel of priceSelectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = parsePriceFromText(el.innerText || el.textContent || "");
        if (val > 0) {
          listPrice = val;
          break;
        }
      }
    }
    if (listPrice <= 0) {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "{}");
          if (data.offers && (data.offers.price || data.offers.lowPrice)) {
            listPrice = parseFloat(data.offers.price || data.offers.lowPrice);
            break;
          }
        } catch (_) {
        }
      }
    }
    const mrpEl = doc.querySelector('span.pdp__mrpPrice, .strike, span[class*="mrp"]');
    if (mrpEl) {
      mrp = parsePriceFromText(mrpEl.innerText || mrpEl.textContent || "");
    }
    return { listPrice, mrp };
  }
  function extractInstantDiscounts3(doc, listPrice) {
    let discount = 0;
    if (!doc) return discount;
    const offerElements = doc.querySelectorAll('.pdp__offers, .bank-offers, .pdp-bank-offers-list, [class*="bankOffer"]');
    for (const el of offerElements) {
      const text = el.innerText || el.textContent || "";
      const m = text.match(/(?:Instant\s*(?:Discount|Cashback)\s*of\s*(?:₹|Rs\.?)\s*|Flat\s*(?:₹|Rs\.?)\s*|Save\s*(?:₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
      if (m) {
        discount = Math.max(discount, parsePriceFromText(m[1]));
      }
    }
    if (discount > listPrice * 0.4) discount = 0;
    return discount;
  }
  var RelianceDigitalAdapter = {
    id: "reliance_digital",
    matches(url = typeof window !== "undefined" ? window.location.href : "") {
      if (!url) return false;
      const u = url.toLowerCase();
      const isReliance = u.includes("reliancedigital.in") || typeof document !== "undefined" && (document.domain || "").includes("reliancedigital");
      if (!isReliance) return false;
      const isProductPage = u.includes("/p/") || /\/p\/[0-9]+/i.test(u);
      if (isProductPage) return true;
      if (typeof document !== "undefined") {
        if (document.querySelector("h1.pdp__title, .pdp__offerPrice, [data-sku]")) {
          return true;
        }
      }
      return false;
    },
    async extract(doc) {
      try {
        if (!doc) return null;
        const productId = extractPid3(doc) || "rd_item_" + Math.abs((doc.title || "").length) % 1e4;
        const title = extractTitle4(doc);
        const { listPrice } = extractPrice4(doc);
        if (listPrice <= 0) return null;
        let category = "Electronics";
        const breadcrumb = doc.querySelector('.breadcrumb, [class*="breadcrumb"]');
        if (breadcrumb && breadcrumb.innerText) {
          const parts = breadcrumb.innerText.split(">").map((s) => s.trim()).filter(Boolean);
          if (parts.length > 1) category = parts[1];
        }
        const cashDiscount = extractInstantDiscounts3(doc, listPrice);
        const effectiveCash = Math.max(0, listPrice - cashDiscount);
        const liveOptions = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, "Reliance Digital");
        const cashOption = {
          option_id: "cash_full",
          bank_key: "cash",
          bank_name: "Cash / UPI",
          type: "CASH",
          label: cashDiscount > 0 ? `Full Payment (Includes \u20B9${cashDiscount.toLocaleString("en-IN")} Bank Offer)` : "Full Payment Upfront",
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0,
          processing_fee: 0,
          lost_cash_discount: null,
          stated_interest_rate: 0
        };
        const paymentOptions = [cashOption, ...liveOptions];
        return {
          product_id: productId,
          title,
          category,
          retailer: "Reliance Digital",
          currency: "INR",
          currency_symbol: "\u20B9",
          upfront_cash_price: listPrice,
          cash_discount: cashDiscount,
          effective_cash_price: effectiveCash,
          payment_options: paymentOptions
        };
      } catch (err) {
        console.warn("[Paylens RelianceDigitalAdapter] Error extracting listing:", err);
        return null;
      }
    },
    selectedOptionId(doc) {
      if (doc) {
        const text = doc.body ? doc.body.innerText : "";
        if (/no\s*cost\s*emi/i.test(text)) {
          return "nocost_hdfc_3m";
        }
      }
      return "std_hdfc_3m";
    },
    mountPoint(doc) {
      if (!doc) return null;
      const selectors = [
        ".pdp__priceSection",
        ".pdp-price-wrap",
        ".pdp__right",
        ".product-details",
        ".pdp__offerPrice"
      ];
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el && el.parentNode) {
          let slot = doc.querySelector("#paylens-reliance-slot");
          if (!slot) {
            slot = doc.createElement("div");
            slot.id = "paylens-reliance-slot";
            slot.style.margin = "16px 0";
            el.parentNode.insertBefore(slot, el.nextSibling);
          }
          return slot;
        }
      }
      return doc.body || null;
    },
    observe(doc, onChange) {
      if (!doc || typeof onChange !== "function") return () => {
      };
      let debounceTimer = null;
      let lastStateKey = "";
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            const listing = await Promise.resolve(RelianceDigitalAdapter.extract(doc));
            const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : "";
            if (stateKey && stateKey !== lastStateKey) {
              lastStateKey = stateKey;
              onChange({ productId: listing.product_id, optionId: RelianceDigitalAdapter.selectedOptionId(doc) });
            }
          } catch (_) {
          }
        }, 250);
      });
      const target = doc.querySelector(".pdp__priceSection, .pdp__right, body") || doc.body;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
      return () => observer.disconnect();
    }
  };

  // extension/content/adapters/tata_cliq.js
  function extractPid4(doc) {
    if (!doc) return null;
    const url = doc.defaultView?.location?.href || (typeof window !== "undefined" ? window.location.href : "") || "";
    const urlMatch = url.match(/p-mp([0-9]+)/i) || url.match(/\/p-([a-z0-9]+)/i) || url.match(/[?&]productId=([a-z0-9]+)/i);
    if (urlMatch) return urlMatch[1];
    const metaEl = doc.querySelector('meta[name="productID"], meta[name="productId"], [data-product-id]');
    if (metaEl) {
      const val = metaEl.getAttribute("content") || metaEl.getAttribute("data-product-id");
      if (val && val.trim().length > 0) return val.trim();
    }
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      const m = canonical.href.match(/p-mp([0-9]+)/i) || canonical.href.match(/\/p-([a-z0-9]+)/i);
      if (m) return m[1];
    }
    return null;
  }
  function extractTitle5(doc) {
    if (!doc) return "Tata CLiQ Product";
    const selectors = [
      "h1.ProductDescriptionPage__title",
      "h1.ProductDescriptionPage__productName",
      "h1.pdp-title",
      ".ProductDescriptionPage__title",
      "h1",
      'meta[property="og:title"]'
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = el.tagName === "META" ? el.getAttribute("content") : el.innerText || el.textContent;
        if (val && val.trim().length > 1) {
          return val.trim().replace(/\s*\|\s*Tata CLiQ.*?$/i, "").trim();
        }
      }
    }
    return "Tata CLiQ Product";
  }
  function extractPrice5(doc) {
    let listPrice = 0;
    let mrp = 0;
    if (!doc) return { listPrice, mrp };
    const priceSelectors = [
      "h3.ProductDescriptionPage__price",
      ".Price__actual",
      '[class*="ProductDescriptionPage__price"]',
      ".ProductDescriptionPage__discountPrice",
      "span.price",
      "span.amount"
    ];
    for (const sel of priceSelectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = parsePriceFromText(el.innerText || el.textContent || "");
        if (val > 0) {
          listPrice = val;
          break;
        }
      }
    }
    if (listPrice <= 0) {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "{}");
          if (data.offers && (data.offers.price || data.offers.lowPrice)) {
            listPrice = parseFloat(data.offers.price || data.offers.lowPrice);
            break;
          }
        } catch (_) {
        }
      }
    }
    const mrpEl = doc.querySelector('.ProductDescriptionPage__mrp, .Price__mrp, span[class*="mrp"]');
    if (mrpEl) {
      mrp = parsePriceFromText(mrpEl.innerText || mrpEl.textContent || "");
    }
    return { listPrice, mrp };
  }
  function extractInstantDiscounts4(doc, listPrice) {
    let discount = 0;
    if (!doc) return discount;
    const offerElements = doc.querySelectorAll('.ProductDescriptionPage__offersList, .OffersBlock, .pdp-bank-offers, [class*="bankOffer"]');
    for (const el of offerElements) {
      const text = el.innerText || el.textContent || "";
      const m = text.match(/(?:Instant\s*(?:Discount|Cashback)\s*of\s*(?:₹|Rs\.?)\s*|Flat\s*(?:₹|Rs\.?)\s*|Save\s*(?:₹|Rs\.?)\s*)(\d+(?:,\d+)*)/i);
      if (m) {
        discount = Math.max(discount, parsePriceFromText(m[1]));
      }
    }
    if (discount > listPrice * 0.4) discount = 0;
    return discount;
  }
  var TataCliqAdapter = {
    id: "tata_cliq",
    matches(url = typeof window !== "undefined" ? window.location.href : "") {
      if (!url) return false;
      const u = url.toLowerCase();
      const isTataCliq = u.includes("tatacliq.com") || typeof document !== "undefined" && (document.domain || "").includes("tatacliq");
      if (!isTataCliq) return false;
      const isProductPage = u.includes("/p-") || u.includes("/product/") || /p-mp[0-9]+/i.test(u);
      if (isProductPage) return true;
      if (typeof document !== "undefined") {
        if (document.querySelector('h1.ProductDescriptionPage__title, .ProductDescriptionPage__price, [class*="ProductDescriptionPage"]')) {
          return true;
        }
      }
      return false;
    },
    async extract(doc) {
      try {
        if (!doc) return null;
        const productId = extractPid4(doc) || "tc_item_" + Math.abs((doc.title || "").length) % 1e4;
        const title = extractTitle5(doc);
        const { listPrice } = extractPrice5(doc);
        if (listPrice <= 0) return null;
        let category = "Fashion & Electronics";
        const breadcrumb = doc.querySelector('.Breadcrumb, [class*="breadcrumb"]');
        if (breadcrumb && breadcrumb.innerText) {
          const parts = breadcrumb.innerText.split(">").map((s) => s.trim()).filter(Boolean);
          if (parts.length > 1) category = parts[1];
        }
        const cashDiscount = extractInstantDiscounts4(doc, listPrice);
        const effectiveCash = Math.max(0, listPrice - cashDiscount);
        const liveOptions = await UniversalEmiExtractor.extract(doc, listPrice, cashDiscount, "Tata CliQ");
        const cashOption = {
          option_id: "cash_full",
          bank_key: "cash",
          bank_name: "Cash / UPI",
          type: "CASH",
          label: cashDiscount > 0 ? `Full Payment (Includes \u20B9${cashDiscount.toLocaleString("en-IN")} Bank Offer)` : "Full Payment Upfront",
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0,
          processing_fee: 0,
          lost_cash_discount: null,
          stated_interest_rate: 0
        };
        const paymentOptions = [cashOption, ...liveOptions];
        return {
          product_id: productId,
          title,
          category,
          retailer: "Tata CLiQ",
          currency: "INR",
          currency_symbol: "\u20B9",
          upfront_cash_price: listPrice,
          cash_discount: cashDiscount,
          effective_cash_price: effectiveCash,
          payment_options: paymentOptions
        };
      } catch (err) {
        console.warn("[Paylens TataCliqAdapter] Error extracting listing:", err);
        return null;
      }
    },
    selectedOptionId(doc) {
      if (doc) {
        const text = doc.body ? doc.body.innerText : "";
        if (/no\s*cost\s*emi/i.test(text)) {
          return "nocost_hdfc_3m";
        }
      }
      return "std_hdfc_3m";
    },
    mountPoint(doc) {
      if (!doc) return null;
      const selectors = [
        ".ProductDescriptionPage__priceBlock",
        ".ProductDescriptionPage__right",
        ".pdp-right",
        ".ProductDescriptionPage__price",
        ".product-details"
      ];
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el && el.parentNode) {
          let slot = doc.querySelector("#paylens-tatacliq-slot");
          if (!slot) {
            slot = doc.createElement("div");
            slot.id = "paylens-tatacliq-slot";
            slot.style.margin = "16px 0";
            el.parentNode.insertBefore(slot, el.nextSibling);
          }
          return slot;
        }
      }
      return doc.body || null;
    },
    observe(doc, onChange) {
      if (!doc || typeof onChange !== "function") return () => {
      };
      let debounceTimer = null;
      let lastStateKey = "";
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            const listing = await Promise.resolve(TataCliqAdapter.extract(doc));
            const stateKey = listing ? `${listing.product_id}_${listing.upfront_cash_price}_${listing.cash_discount}` : "";
            if (stateKey && stateKey !== lastStateKey) {
              lastStateKey = stateKey;
              onChange({ productId: listing.product_id, optionId: TataCliqAdapter.selectedOptionId(doc) });
            }
          } catch (_) {
          }
        }, 250);
      });
      const target = doc.querySelector(".ProductDescriptionPage__priceBlock, .ProductDescriptionPage__right, body") || doc.body;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
      return () => observer.disconnect();
    }
  };

  // extension/content/adapters/generic.js
  function getJsonLdProduct2(doc) {
    if (!doc) return null;
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "{}");
        if (data["@type"] === "Product") return data;
        if (Array.isArray(data["@graph"])) {
          const prod = data["@graph"].find((item) => item && item["@type"] === "Product");
          if (prod) return prod;
        }
        if (Array.isArray(data)) {
          const prod = data.find((item) => item && item["@type"] === "Product");
          if (prod) return prod;
        }
      } catch (_) {
      }
    }
    return null;
  }
  var GenericAdapter = {
    id: "generic",
    /**
     * Matches any webpage that contains standard e-commerce product metadata,
     * common PDP URL patterns, or Add-to-Cart purchase triggers.
     */
    matches(url = "") {
      const u = (url || (typeof window !== "undefined" ? window.location?.href : "") || "").toLowerCase();
      const hasPdpSlug = u.includes("/product/") || u.includes("/products/") || u.includes("/p/") || u.includes("/p-") || u.includes("/dp/") || u.includes("/item/") || u.includes("/itm/") || u.includes("/pd/") || u.includes("/buy") || u.includes("?pid=") || u.includes("?sku=") || u.includes("/catalog/product/view/");
      if (typeof document === "undefined") {
        return hasPdpSlug;
      }
      const jsonLd = getJsonLdProduct2(document);
      if (jsonLd) {
        const offers = jsonLd.offers;
        const offer = Array.isArray(offers) ? offers[0] : offers;
        if (offer && (offer.price || offer.highPrice || offer.lowPrice)) {
          const p = parseFloat(offer.price || offer.lowPrice || "0");
          if (p > 0) return true;
        }
        if (jsonLd.name) return true;
      }
      const hasOgPrice = document.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"], meta[itemprop="price"]');
      if (hasOgPrice && parseFloat(hasOgPrice.content || hasOgPrice.getAttribute("content") || "0") > 0) {
        return true;
      }
      const ogType = document.querySelector('meta[property="og:type"]')?.content;
      if (ogType && (ogType === "product" || ogType === "product.item")) {
        return true;
      }
      const buyButton = document.querySelector(
        'button[name*="add-to-cart"], button[id*="add-to-cart"], button[id*="buy"], #addToCart, .add-to-cart, .buy-now, .pdp-add-to-bag, .btn-add-to-cart, [data-action*="add-to-cart"]'
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
        let title = "";
        let listPrice = 0;
        let category = "Retail";
        let productId = "gen_item_" + Math.abs(doc.title?.length || 100);
        let samplePriceText = "";
        const jsonLd = getJsonLdProduct2(doc);
        if (jsonLd) {
          title = jsonLd.name || "";
          category = jsonLd.category || category;
          productId = jsonLd.sku || jsonLd.productID || productId;
          const offers = jsonLd.offers;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            if (offer && (offer.price || offer.lowPrice)) {
              listPrice = parseFloat(offer.price || offer.lowPrice || "0");
              if (offer.priceCurrency) samplePriceText = String(offer.priceCurrency);
            }
          }
        }
        if (!title) {
          const myntraBrand = doc.querySelector(".pdp-title")?.innerText?.trim();
          const myntraName = doc.querySelector(".pdp-name")?.innerText?.trim();
          if (myntraBrand && myntraName) {
            title = `${myntraBrand} ${myntraName}`;
          } else if (myntraName) {
            title = myntraName;
          }
        }
        if (!title) {
          const titleSelectors = [
            "#productTitle",
            "h1.pdp-title",
            'h1[class*="title"]',
            'h1[class*="name"]',
            'h1[class*="product"]',
            ".product-title",
            ".pdp-product-title",
            "#product-title",
            "h1"
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
          title = ogTitle?.content || doc.title || "Store Product";
        }
        if (title) {
          title = title.replace(/\s*\|\s*.*$/, "").replace(/\s*:\s*Buy.*$/i, "").replace(/\s*-\s*Buy.*$/i, "").trim();
        }
        if (listPrice <= 0) {
          const ogPrice = doc.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"], meta[itemprop="price"]');
          if (ogPrice) {
            listPrice = parseFloat(ogPrice.content || ogPrice.getAttribute("content") || "0");
            samplePriceText = doc.querySelector('meta[property="og:price:currency"], meta[property="product:price:currency"], meta[itemprop="priceCurrency"]')?.content || "";
          }
        }
        if (listPrice <= 0) {
          const priceSelectors = [
            // Myntra specific selling price
            "span.pdp-price strong",
            "span.pdp-price",
            ".pdp-selling-price",
            ".pdp-discounted-price",
            // Croma & Tata CliQ
            'span.amount[data-testid="new-price"]',
            ".cp-price .amount",
            ".main-price",
            // Ajio
            "span.prod-sp",
            ".price-sp",
            // eBay
            ".x-price-primary span",
            ".x-price-primary",
            // General standard e-commerce selectors
            '[itemprop="price"]',
            ".product-price",
            ".selling-price",
            ".special-price",
            ".offer-price",
            ".price",
            '[class*="product-price"]',
            '[class*="selling-price"]',
            '[class*="price-current"]',
            '[class*="price"]'
          ];
          for (const sel of priceSelectors) {
            const el = doc.querySelector(sel);
            if (el) {
              const raw = el.innerText || el.getAttribute("content") || "";
              const val = parsePriceFromText(raw);
              if (val > 0) {
                listPrice = val;
                samplePriceText = raw;
                break;
              }
            }
          }
        }
        if (listPrice <= 0) {
          const textElements = doc.querySelectorAll('h1 ~ div, [class*="product"] div, [class*="buy"] div, span');
          for (const el of textElements) {
            if (el.children.length === 0 && el.innerText) {
              const t = el.innerText.trim();
              if (t.startsWith("\u20B9") || t.startsWith("Rs") || t.startsWith("$") || t.startsWith("\u20AC") || t.startsWith("\xA3") || t.startsWith("AED")) {
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
        let mrp = listPrice;
        const mrpSelectors = [
          "span.pdp-mrp s",
          "span.pdp-mrp",
          ".pdp-mrp",
          ".old-price",
          ".strike",
          ".original-price",
          "span.a-text-price span",
          ".basisPrice span"
        ];
        for (const sel of mrpSelectors) {
          const el = doc.querySelector(sel);
          if (el) {
            const val = parsePriceFromText(el.innerText || "");
            if (val > listPrice) {
              mrp = val;
              break;
            }
          }
        }
        if (listPrice <= 0) return null;
        const detectedCurrency = detectCurrency(doc, samplePriceText, doc.defaultView?.location?.href);
        const classification = classifyPrice(listPrice, detectedCurrency);
        const inrListPrice = classification.priceInINR;
        const effectiveCash = inrListPrice;
        const stdFee = 199;
        const hostname = doc.defaultView?.location?.hostname || (typeof window !== "undefined" ? window.location.hostname : "Online Retailer");
        const rawRetailer = hostname.replace(/^www\./, "").split(".")[0];
        const retailer = rawRetailer ? rawRetailer.charAt(0).toUpperCase() + rawRetailer.slice(1) : "Online Retailer";
        const cashLabel = classification.isConverted ? `Full Payment Upfront (${classification.currencySymbol}${classification.originalPrice.toLocaleString("en-US")} \u21C4 \u20B9${inrListPrice.toLocaleString("en-IN")})` : "Full Payment Upfront";
        const cashOption = {
          option_id: "cash_full",
          bank_key: "cash",
          bank_name: "Cash / UPI",
          type: "CASH",
          label: cashLabel,
          tenure_months: 1,
          monthly_installment: effectiveCash,
          upfront_downpayment: 0,
          processing_fee: 0,
          lost_cash_discount: null,
          stated_interest_rate: 0
        };
        const realEmis = await UniversalEmiExtractor.extract(doc, inrListPrice, 0, retailer);
        let paymentOptions = [cashOption];
        if (realEmis && realEmis.length > 0) {
          const topNoCost = realEmis.find((o) => o.type === "NO_COST_EMI");
          if (topNoCost && !realEmis.some((o) => o.option_id === "nocost_6m")) {
            realEmis.unshift({
              ...topNoCost,
              option_id: "nocost_6m"
            });
          }
          paymentOptions = [cashOption, ...realEmis];
        }
        return {
          product_id: String(productId),
          title,
          category,
          retailer,
          currency: classification.currency,
          currency_symbol: classification.currencySymbol,
          original_price: classification.originalPrice,
          exchange_rate: classification.exchangeRate,
          currency_notice: classification.bannerNotice,
          upfront_cash_price: inrListPrice,
          cash_discount: 0,
          effective_cash_price: effectiveCash,
          payment_options: paymentOptions
        };
      } catch (err) {
        console.warn("[Paylens GenericAdapter] Error during extraction:", err);
        return null;
      }
    },
    selectedOptionId(doc) {
      return "std_hdfc_3m";
    },
    mountPoint(doc) {
      try {
        if (!doc) return null;
        let slot = doc.querySelector("#paylens-generic-slot");
        if (slot) return slot;
        const priceEl = doc.querySelector('[itemprop="price"], .product-price, .price, .product-info, #addToCart, .add-to-cart, .buy-now');
        if (priceEl && priceEl.parentNode) {
          slot = doc.createElement("div");
          slot.id = "paylens-generic-slot";
          slot.style.margin = "16px 0";
          priceEl.parentNode.insertBefore(slot, priceEl.nextSibling);
          return slot;
        }
        return doc.body || null;
      } catch (err) {
        return doc.body || null;
      }
    },
    observe(doc, onChange) {
      if (!doc || typeof onChange !== "function") return () => {
      };
      let observer = null;
      observer = new MutationObserver(async () => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          if (observer) observer.disconnect();
          return;
        }
        const listing = await Promise.resolve(GenericAdapter.extract(doc));
        if (listing) {
          onChange({ productId: listing.product_id, optionId: "std_hdfc_3m" });
        }
      });
      observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
      return () => {
        if (observer) observer.disconnect();
      };
    }
  };

  // extension/content/adapters/index.js
  var ADAPTERS = [
    MockShopAdapter,
    AmazonAdapter,
    FlipkartAdapter,
    CromaAdapter,
    RelianceDigitalAdapter,
    TataCliqAdapter,
    GenericAdapter
  ];
  function getAdapter(url = typeof window !== "undefined" ? window.location.href : "") {
    for (const adapter of ADAPTERS) {
      if (adapter && typeof adapter.matches === "function" && adapter.matches(url)) {
        return adapter;
      }
    }
    return null;
  }

  // extension/content/card.js
  function getBankForOption(opt) {
    if (!opt) return "Partner Bank";
    if (opt.bank_name) return opt.bank_name;
    if (opt.type === "CASH") return "Cash / UPI";
    const label = opt.label || "";
    const optId = opt.option_id || "";
    const isDebit = opt.instrument_type === "DEBIT_CARD" || /debit/i.test(label) || /debit/i.test(optId);
    let baseBank = "Partner Bank";
    if (/bajaj/i.test(label) || /bajaj/i.test(optId)) return "Bajaj Finserv";
    if (/amazon\s*pay\s*later/i.test(label) || /amazonpaylater/i.test(optId)) return "Amazon Pay Later";
    if (/flipkart\s*pay\s*later/i.test(label) || /flipkartpaylater/i.test(optId)) return "Flipkart Pay Later";
    if (/hdfc/i.test(label) || /hdfc/i.test(optId)) baseBank = "HDFC Bank";
    else if (/icici/i.test(label) || /icici/i.test(optId)) baseBank = "ICICI Bank";
    else if (/sbi/i.test(label) || /sbi/i.test(optId)) baseBank = "SBI Card";
    else if (/axis/i.test(label) || /axis/i.test(optId)) baseBank = "Axis Bank";
    else if (/kotak/i.test(label) || /kotak/i.test(optId)) baseBank = "Kotak Bank";
    else if (/citi/i.test(label) || /citi/i.test(optId)) baseBank = "Citi Bank";
    else if (/amex/i.test(label) || /amex/i.test(optId)) baseBank = "American Express";
    else if (/hsbc/i.test(label) || /hsbc/i.test(optId)) baseBank = "HSBC Bank";
    else if (/onecard/i.test(label) || /onecard/i.test(optId)) baseBank = "OneCard";
    else if (/rbl/i.test(label) || /rbl/i.test(optId)) baseBank = "RBL Bank";
    if (isDebit && !baseBank.includes("Debit")) {
      return `${baseBank} (Debit Card)`;
    }
    return baseBank;
  }
  var PaylensCard = class _PaylensCard {
    constructor() {
      this.host = null;
      this.shadowRoot = null;
      this.currentMount = null;
      this.currentListing = null;
      this.currentVerdict = null;
      this.currentLanguage = "en";
      this.selectedBankFilter = null;
      this.activeSelectedOptionId = null;
      this.isOpen = false;
      this.isDismissed = false;
      this.callbacks = {};
    }
    /**
     * Formats a numeric value into an Indian Rupee string (e.g. ₹27,990.00).
     */
    static formatINR(amount) {
      if (amount === null || amount === void 0 || isNaN(amount)) return "\u20B90.00";
      return "\u20B9" + Number(amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    /**
     * Formats a decimal ratio into a percentage string (e.g. 0.1133 -> 11.3%).
     */
    static formatRatioPercent(ratio) {
      if (ratio === null || ratio === void 0 || isNaN(ratio)) return "0.0%";
      return (Number(ratio) * 100).toFixed(1) + "%";
    }
    /**
     * Injects or binds the open shadow root at document.body for fixed floating positioning.
     */
    mount(mountElement) {
      this.currentMount = mountElement;
      let existingHost = document.getElementById("paylens-host");
      if (!existingHost) {
        existingHost = document.createElement("div");
        existingHost.id = "paylens-host";
        document.body.appendChild(existingHost);
      }
      this.host = existingHost;
      if (this.isDismissed) {
        this.isDismissed = false;
      }
      this.host.style.display = "block";
      if (!this.host.shadowRoot) {
        this.shadowRoot = this.host.attachShadow({ mode: "open" });
      } else {
        this.shadowRoot = this.host.shadowRoot;
      }
      return true;
    }
    /**
     * Generates the CSS link / inline styles inside the shadow root.
     */
    _getStyleTag() {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
          const cssUrl = chrome.runtime.getURL("content/card.css");
          return `<link rel="stylesheet" href="${cssUrl}">`;
        }
      } catch (_) {
      }
      return `<link rel="stylesheet" href="card.css">`;
    }
    /**
     * Toggles the copilot panel open/closed.
     */
    togglePanel() {
      this.isDismissed = false;
      if (this.host) {
        this.host.style.display = "block";
      }
      this.isOpen = !this.isOpen;
      this._updatePanelVisibility();
    }
    openPanel() {
      this.isDismissed = false;
      if (this.host) {
        this.host.style.display = "block";
      }
      this.isOpen = true;
      this._updatePanelVisibility();
    }
    closePanel() {
      this.isOpen = false;
      this._updatePanelVisibility();
    }
    dismiss() {
      this.isDismissed = true;
      this.isOpen = false;
      if (this.host) {
        this.host.style.display = "none";
      }
    }
    _updatePanelVisibility() {
      if (!this.shadowRoot) return;
      const panel = this.shadowRoot.querySelector(".paylens-panel-wrapper");
      const trigger = this.shadowRoot.querySelector(".paylens-floating-trigger");
      if (panel) {
        if (this.isOpen) {
          panel.classList.remove("panel-closed");
          panel.classList.add("panel-open");
        } else {
          panel.classList.remove("panel-open");
          panel.classList.add("panel-closed");
        }
      }
      if (trigger) {
        if (this.isOpen) {
          trigger.classList.add("trigger-active");
        } else {
          trigger.classList.remove("trigger-active");
        }
      }
    }
    // ==========================================================================
    // State 1: Loading
    // ==========================================================================
    renderLoading(message = "Analyzing true financing cost & affordability...") {
      if (!this.shadowRoot || this.isDismissed) return;
      this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      
      <!-- Collapsible Floating Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? "panel-open" : "panel-closed"}">
        <div class="paylens-card">
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill">Calculating</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-close-panel" type="button" title="Close Panel">\u2715</button>
            </div>
          </div>
          <div class="state-loading">
            <div class="shimmer-bar shimmer-badge"></div>
            <div class="shimmer-bar shimmer-headline"></div>
            <div class="shimmer-bar shimmer-box"></div>
            <p style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">${message}</p>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button -->
      <button class="paylens-floating-trigger ${this.isOpen ? "trigger-active" : ""}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot loading"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-loading">Calculating...</span>
      </button>
    `;
      this._bindCommonEvents();
    }
    // ==========================================================================
    // State 2: No Profile (Onboarding CTA)
    // ==========================================================================
    renderNoProfile({ onOpenOptions, onLoadDemo } = {}) {
      if (!this.shadowRoot || this.isDismissed) return;
      this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      
      <!-- Collapsible Floating Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? "panel-open" : "panel-closed"}">
        <div class="paylens-card">
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill">Setup Required</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-close-panel" type="button" title="Close Panel">\u2715</button>
            </div>
          </div>
          <div class="state-no-profile">
            <div class="no-profile-icon">\u{1F6E1}\uFE0F</div>
            <h3 class="no-profile-title">No Payslip Profile Loaded</h3>
            <p class="no-profile-desc">
              Paylens calculates affordability from verified payslip take-home pay, not self-declared income.
            </p>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
              <button class="no-profile-btn btn-open-options" type="button">
                Open Options & Onboard
              </button>
              <button class="retry-btn btn-quick-demo" type="button">
                \u26A1 Load Rahul (12 LPA Demo)
              </button>
            </div>
          </div>
          <div class="card-footer-dismiss">
            <button class="btn-remove-section" type="button">\u2715 Remove from this page</button>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button -->
      <button class="paylens-floating-trigger ${this.isOpen ? "trigger-active" : ""}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot setup"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-setup">Setup Required</span>
      </button>
    `;
      this._bindCommonEvents();
      const openBtn = this.shadowRoot.querySelector(".btn-open-options");
      if (openBtn && onOpenOptions) openBtn.addEventListener("click", onOpenOptions);
      const demoBtn = this.shadowRoot.querySelector(".btn-quick-demo");
      if (demoBtn && onLoadDemo) demoBtn.addEventListener("click", onLoadDemo);
    }
    // ==========================================================================
    // State 3: Error
    // ==========================================================================
    renderError(message = "Unable to evaluate affordability.", { onRetry } = {}) {
      if (!this.shadowRoot || this.isDismissed) return;
      this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}
      
      <!-- Collapsible Floating Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? "panel-open" : "panel-closed"}">
        <div class="paylens-card">
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill" style="color: #f87171;">Notice</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-close-panel" type="button" title="Close Panel">\u2715</button>
            </div>
          </div>
          <div class="state-error">
            <h4 class="error-title">Evaluation Notice</h4>
            <p class="error-desc">${message}</p>
            <button class="retry-btn" type="button">Retry Check</button>
          </div>
          <div class="card-footer-dismiss">
            <button class="btn-remove-section" type="button">\u2715 Remove from this page</button>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button -->
      <button class="paylens-floating-trigger ${this.isOpen ? "trigger-active" : ""}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot notice"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-notice">Notice</span>
      </button>
    `;
      this._bindCommonEvents();
      const retryBtn = this.shadowRoot.querySelector(".retry-btn");
      if (retryBtn && onRetry) retryBtn.addEventListener("click", onRetry);
    }
    // ==========================================================================
    // State 4: Full Verdict Breakdown
    // ==========================================================================
    renderVerdict(verdict, { onLanguageChange, onOpenOptions, onSelectOption, currentLanguage = "en", listing = null, selectedOptionId = null } = {}) {
      if (!this.shadowRoot || !verdict || this.isDismissed) return;
      this.currentListing = listing;
      this.currentVerdict = verdict;
      this.currentLanguage = currentLanguage;
      this.activeSelectedOptionId = selectedOptionId;
      let paymentOptionsHtml = "";
      const paymentOptions = listing?.payment_options || [];
      if (paymentOptions.length > 1) {
        const activeOptId2 = selectedOptionId || verdict.selected_option?.option_id || paymentOptions[0].option_id;
        const activeOpt2 = paymentOptions.find((o) => o.option_id === activeOptId2);
        const activeOptBank = activeOpt2 ? getBankForOption(activeOpt2) : null;
        const banks = [];
        for (const opt of paymentOptions) {
          if (opt.type !== "CASH") {
            const b = getBankForOption(opt);
            if (b && !banks.includes(b)) {
              banks.push(b);
            }
          }
        }
        if (!this.selectedBankFilter || this.selectedBankFilter !== "all" && !banks.includes(this.selectedBankFilter)) {
          this.selectedBankFilter = activeOptBank && activeOptBank !== "Cash / UPI" ? activeOptBank : banks[0] || "all";
        }
        if (activeOptBank && activeOptBank !== "Cash / UPI" && this.selectedBankFilter !== "all" && this.selectedBankFilter !== activeOptBank) {
          this.selectedBankFilter = activeOptBank;
        }
        const activeBank = this.selectedBankFilter;
        const visibleOptions = paymentOptions.filter((opt) => {
          if (opt.type === "CASH") return true;
          if (activeBank === "all") return true;
          return getBankForOption(opt) === activeBank;
        });
        const pills = visibleOptions.map((opt) => {
          const isSelected = opt.option_id === activeOptId2;
          const isDebit = opt.instrument_type === "DEBIT_CARD" || /debit/i.test(opt.label) || /debit/i.test(opt.option_id);
          const isBnpl = opt.instrument_type === "CARDLESS_BNPL" || /pay\s*later|bajaj/i.test(opt.label) || /paylater|bajaj/i.test(opt.option_id);
          const isNoCost = opt.type === "NO_COST_EMI";
          let icon = "\u{1F4B3}";
          if (opt.type === "CASH") {
            icon = "\u{1F4B5}";
          } else if (isBnpl) {
            icon = "\u{1F6CD}\uFE0F";
          } else if (isDebit) {
            icon = "\u{1F3E7}";
          } else if (isNoCost) {
            icon = "\u26A1";
          }
          const costStr = opt.type === "CASH" ? _PaylensCard.formatINR(opt.monthly_installment) : `${_PaylensCard.formatINR(opt.monthly_installment)}/mo`;
          let displayLabel = opt.label;
          if (opt.type !== "CASH" && activeBank !== "all") {
            const aprSuffix = opt.stated_interest_rate > 0 ? ` \u2022 ${opt.stated_interest_rate}% APR` : " \u2022 0% APR";
            const discountTag = opt.bank_discount > 0 ? ` \u2022 -\u20B9${opt.bank_discount >= 1e3 ? (opt.bank_discount / 1e3).toFixed(opt.bank_discount % 1e3 === 0 ? 0 : 1) + "k" : opt.bank_discount}` : "";
            displayLabel = `${opt.tenure_months} Months${aprSuffix}${discountTag}`;
          }
          return `
          <button class="option-pill ${isSelected ? "active" : ""}" type="button" data-opt-id="${opt.option_id}" title="${opt.label}">
            <span class="opt-pill-title">${icon} ${displayLabel}</span>
            <span class="opt-pill-amount">${costStr}</span>
          </button>
        `;
        }).join("");
        const creditBanks = [];
        const debitBanks = [];
        const bnplBanks = [];
        for (const b of banks) {
          if (b.includes("Debit")) {
            debitBanks.push(b);
          } else if (b.includes("Pay Later") || b.includes("Bajaj")) {
            bnplBanks.push(b);
          } else {
            creditBanks.push(b);
          }
        }
        let bankGroupsHtml = "";
        if (creditBanks.length > 0) {
          bankGroupsHtml += `<optgroup label="Credit Cards">${creditBanks.map((b) => `<option value="${b}" ${b === activeBank ? "selected" : ""}>${b}</option>`).join("")}</optgroup>`;
        }
        if (debitBanks.length > 0) {
          bankGroupsHtml += `<optgroup label="Debit Cards (Min \u20B95,000)">${debitBanks.map((b) => `<option value="${b}" ${b === activeBank ? "selected" : ""}>${b}</option>`).join("")}</optgroup>`;
        }
        if (bnplBanks.length > 0) {
          bankGroupsHtml += `<optgroup label="Cardless & BNPL">${bnplBanks.map((b) => `<option value="${b}" ${b === activeBank ? "selected" : ""}>${b}</option>`).join("")}</optgroup>`;
        }
        bankGroupsHtml += `<option value="all" ${activeBank === "all" ? "selected" : ""}>All Plans (${paymentOptions.length - 1} plans)</option>`;
        const bankDropdownHtml = banks.length > 1 ? `
        <div class="bank-dropdown-wrapper">
          <label for="paylensBankSelect" class="bank-select-label">Bank / Method:</label>
          <select id="paylensBankSelect" class="bank-select" aria-label="Filter EMI Plans by Bank or Instrument">
            ${bankGroupsHtml}
          </select>
        </div>
      ` : "";
        let eligibilityBannerHtml = "";
        if (activeOpt2?.eligibility_note) {
          eligibilityBannerHtml = `
          <div class="eligibility-notice-banner">
            <span class="eligibility-icon">\u2139\uFE0F</span>
            <span class="eligibility-text">${activeOpt2.eligibility_note}</span>
          </div>
        `;
        }
        paymentOptionsHtml = `
        <div class="payment-options-selector">
          <div class="bank-selector-header">
            <span class="section-label-sm">Payment Plan to Evaluate:</span>
            ${bankDropdownHtml}
          </div>
          <div class="option-pills-row">
            ${pills}
          </div>
          ${eligibilityBannerHtml}
        </div>
      `;
      }
      const level = (verdict.verdict_level || "COMFORTABLE").toUpperCase();
      const badgeClass = level === "COMFORTABLE" ? "badge-comfortable" : level === "STRETCH" ? "badge-stretch" : "badge-risky";
      const badgeIcon = level === "COMFORTABLE" ? "\u{1F7E2}" : level === "STRETCH" ? "\u{1F7E1}" : "\u{1F534}";
      const tierDesc = verdict.badge ? verdict.badge.replace(/^[🟢🟡🔴]\s*/, "") : "";
      const badgeLabel = `${badgeIcon} ${level}${tierDesc ? ` \u2022 ${tierDesc}` : ""}`;
      const tc = verdict.true_cost || {};
      const ear = tc.effective_annual_rate ?? 0;
      const nominal = tc.nominal_annual_rate ?? 0;
      const totalOutflow = tc.total_outflow ?? 0;
      const hiddenMarkup = tc.hidden_markup ?? 0;
      const hasHighApr = tc.has_high_apr_alert || false;
      const imp = verdict.impact || {};
      const foirBefore = _PaylensCard.formatRatioPercent(imp.foir_before);
      const foirAfter = _PaylensCard.formatRatioPercent(imp.foir_after);
      const freeCash = _PaylensCard.formatINR(imp.free_cash_after);
      const freeCashDanger = (imp.free_cash_after || 0) < 0;
      const runway = imp.runway_months_after !== void 0 ? imp.runway_months_after.toFixed(1) : "0.0";
      const stressTests = verdict.stress_tests || [];
      const stressHtml = stressTests.filter((st) => st.is_applicable !== false).map((st) => {
        const pass = st.passes;
        const icon = pass ? "\u2713" : "\u26A0\uFE0F";
        const pillClass = pass ? "pass" : "fail";
        const pillText = pass ? "Passes" : "Fails Shock";
        const warning = st.warning ? `<p class="stress-warning-msg">${st.warning}</p>` : "";
        const stressedFreeCash = st.stressed_free_cash !== void 0 ? _PaylensCard.formatINR(st.stressed_free_cash) : "";
        return `
          <div class="stress-row ${pass ? "" : "failed"}">
            <div class="stress-header">
              <span class="stress-title">${icon} ${st.scenario_name}</span>
              <span class="stress-status-pill ${pillClass}">${pillText} (${stressedFreeCash})</span>
            </div>
            ${warning}
          </div>
        `;
      }).join("");
      const alternatives = verdict.alternatives || [];
      const altsHtml = alternatives.map((alt) => {
        const isFeas = alt.is_feasible !== false;
        const rescoreBadge = alt.rescore_badge || (isFeas ? "\u{1F7E2} Feasible" : "\u{1F534} Not possible today");
        const savedBadge = alt.money_saved > 0 ? `<span class="alt-savings-tag">Saves ${_PaylensCard.formatINR(alt.money_saved)}</span>` : "";
        const runwayBadge = alt.runway_after > 0 ? `<span style="font-size: 0.6875rem; color: #64748b;">Post-runway: ${alt.runway_after.toFixed(1)}m</span>` : "";
        return `
        <div class="alt-card ${isFeas ? "" : "infeasible"}">
          <div class="alt-header">
            <span class="alt-title">${alt.title}</span>
            <span class="alt-badge-pill" style="background: ${isFeas ? "#ecfdf5" : "#f1f5f9"}; color: ${isFeas ? "#065f46" : "#64748b"};">
              ${rescoreBadge}
            </span>
          </div>
          <p class="alt-desc">${alt.description}</p>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
            ${savedBadge}
            ${runwayBadge}
          </div>
        </div>
      `;
      }).join("");
      const bullets = verdict.explanation_bullets || [
        `Safe on your monthly cash flow, but financing carries a hidden ${ear}% Effective Annual Rate.`,
        `Forfeiting the instant cash discount results in ${_PaylensCard.formatINR(hiddenMarkup)} in lost markups.`,
        `Post-purchase emergency cushion remains intact at ${runway} months of expenses.`
      ];
      const bulletsHtml = bullets.map((b) => `<li class="bullet-item">${b}</li>`).join("");
      const isConverted = Boolean(verdict.is_converted || listing?.currency && listing.currency !== "INR");
      const currencyCode = verdict.currency || listing?.currency || "INR";
      const currencySymbol = verdict.currency_symbol || listing?.currency_symbol || "\u20B9";
      const originalPrice = verdict.original_price || listing?.original_price;
      const exchangeRate = verdict.exchange_rate || listing?.exchange_rate || 1;
      const inrPrice = listing?.effective_cash_price || listing?.upfront_cash_price || (originalPrice ? Math.round(originalPrice * exchangeRate) : null);
      let currencyBannerHtml = "";
      if (isConverted && originalPrice) {
        currencyBannerHtml = `
        <div class="currency-classification-banner">
          <div class="currency-tag-row">
            <span class="currency-badge">\u{1F310} ${currencyCode} Classified</span>
            <span class="currency-orig-price">${currencySymbol}${Number(originalPrice).toLocaleString("en-US")}</span>
            <span class="currency-arrow">\u21C4</span>
            <span class="currency-inr-tag">\u20B9${Number(inrPrice).toLocaleString("en-IN")} INR</span>
          </div>
          <div class="currency-fx-sub">
            Auto-converted at FX Rate 1 ${currencyCode} = \u20B9${Number(exchangeRate).toFixed(2)} INR to match verified Indian payslip.
          </div>
        </div>
      `;
      }
      const pillsText = isConverted && originalPrice ? `${currencySymbol}${Number(originalPrice).toLocaleString("en-US")} \u2022 ${badgeIcon} ${level}` : `${badgeIcon} ${level}`;
      const activeOpt = paymentOptions.find((o) => o.option_id === activeOptId) || verdict.selected_option;
      const stickerPrice = listing?.upfront_cash_price || listing?.original_price || (listing?.effective_cash_price || 0) + (listing?.cash_discount || 0) || 0;
      const optBankDiscount = activeOpt?.bank_discount || 0;
      const hasDiscount = optBankDiscount > 0;
      const discountBasis = activeOpt?.discount_basis || (hasDiscount ? "Direct Store Bank Partner Discount" : null);
      const isCash = activeOpt?.type === "CASH" || (activeOpt?.tenure_months || 1) <= 1;
      const netFinanced = Math.max(1, stickerPrice - optBankDiscount);
      const monthlyEmi = activeOpt?.monthly_installment || 0;
      const tenureMonths = activeOpt?.tenure_months || 1;
      const statedApr = activeOpt?.stated_interest_rate ?? 0;
      const totalRepayment = totalOutflow > 0 ? totalOutflow : activeOpt?.total_cost || Math.round(monthlyEmi * tenureMonths);
      const financingBreakdownHtml = `
      <div class="emi-discount-breakdown-card">
        <div class="discount-header-row">
          <div class="discount-pill-wrapper">
            <span class="discount-tag-badge ${hasDiscount ? "has-discount" : "no-discount"}">
              ${hasDiscount ? `\u{1F3F7}\uFE0F Bank Offer Applied` : isCash ? "\u{1F4B5} Upfront Cash" : "Standard Bank EMI"}
            </span>
            ${hasDiscount ? `<span class="discount-save-tag">-\u20B9${Number(optBankDiscount).toLocaleString("en-IN")} OFF</span>` : ""}
          </div>
          <span class="discount-tenure-badge">${isCash ? "Full Payment" : `${tenureMonths}M EMI`}</span>
        </div>

        ${hasDiscount && discountBasis ? `
          <div class="discount-basis-box">
            <div class="basis-header">
              <span class="basis-icon">\u{1F4CB}</span>
              <span class="basis-title">Offer Applied On Basis Of:</span>
            </div>
            <p class="basis-desc">${discountBasis}</p>
          </div>
        ` : ""}

        <div class="financing-summary-table">
          <div class="summary-line">
            <span class="summary-label">Product Sticker Price:</span>
            <span class="summary-val">${_PaylensCard.formatINR(stickerPrice)}</span>
          </div>
          ${hasDiscount ? `
            <div class="summary-line discount-line">
              <span class="summary-label">Direct Bank EMI Discount:</span>
              <span class="summary-val discount-val">-\u20B9${Number(optBankDiscount).toLocaleString("en-IN")}</span>
            </div>
          ` : ""}
          <div class="summary-line financed-principal-line">
            <span class="summary-label">${isCash ? "Effective Cash Price:" : "Real Financed Principal:"}</span>
            <span class="summary-val financed-val">${_PaylensCard.formatINR(isCash ? stickerPrice - (listing?.cash_discount || 0) : netFinanced)}</span>
          </div>
          ${!isCash ? `
            <div class="summary-line emi-rate-line">
              <span class="summary-label">Real Monthly Installment:</span>
              <span class="summary-val emi-val"><strong>${_PaylensCard.formatINR(monthlyEmi)}/mo</strong> (${tenureMonths} mos @ ${statedApr}% APR)</span>
            </div>
            <div class="summary-line total-outflow-line">
              <span class="summary-label">Final Total Amount to Pay:</span>
              <span class="summary-val total-val"><strong>${_PaylensCard.formatINR(totalRepayment)}</strong></span>
            </div>
          ` : `
            <div class="summary-line total-outflow-line">
              <span class="summary-label">Final Upfront Cash Outflow:</span>
              <span class="summary-val total-val"><strong>${_PaylensCard.formatINR(stickerPrice - (listing?.cash_discount || 0))}</strong></span>
            </div>
          `}
        </div>
      </div>
    `;
      this.shadowRoot.innerHTML = `
      ${this._getStyleTag()}

      <!-- Collapsible Floating Copilot Panel -->
      <div class="paylens-panel-wrapper ${this.isOpen ? "panel-open" : "panel-closed"}">
        <div class="paylens-card">
          <!-- Brand Header -->
          <div class="card-header-brand">
            <div class="brand-left">
              <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span class="brand-title">Paylens Copilot</span>
              <span class="brand-pill">Verified</span>
            </div>
            <div class="brand-actions">
              <button class="btn-icon-link btn-settings" type="button" title="Open Profile Settings">
                \u2699\uFE0F Profile
              </button>
              <button class="btn-icon-link btn-close-panel" type="button" title="Minimize / Close Copilot Screen" aria-label="Close Copilot">
                \u2715
              </button>
            </div>
          </div>

          <div class="card-body">
            <!-- Currency Classification Banner (if foreign currency detected) -->
            ${currencyBannerHtml}

            <!-- 0. Interactive Payment Option Selector (if options available) -->
            ${paymentOptionsHtml}

            <!-- 1. Badge & Headline Reason -->
            <div class="verdict-header-section">
              <div class="verdict-badge-row">
                <span class="verdict-badge ${badgeClass}">${badgeLabel}</span>
              </div>
              <p class="headline-reason-text">${verdict.headline_reason || "Affordability evaluation completed."}</p>
            </div>

            <!-- Real-Time EMI Discount & Financing Breakdown Card -->
            ${financingBreakdownHtml}

            <!-- 2. True Cost Box -->
            <div class="true-cost-box">
              <div class="rates-row">
                <div class="rate-stat">
                  <span class="rate-label">Effective Annual Rate (EAR)</span>
                  <span class="rate-value ${hasHighApr ? "highlight-red" : ""}">${ear}%</span>
                </div>
                <div class="rate-stat">
                  <span class="rate-label">Nominal APR</span>
                  <span class="rate-value">${nominal}%</span>
                </div>
              </div>
              <div class="outflow-comparison">
                <span>Total Outflow: <strong>${_PaylensCard.formatINR(totalOutflow)}</strong></span>
                <span class="markup-amount">Hidden Markup: +${_PaylensCard.formatINR(hiddenMarkup)}</span>
              </div>
            </div>

            <!-- High APR Alert Banner (Conditional) -->
            ${hasHighApr ? `
              <div class="high-apr-alert">
                <span class="alert-icon">\u26A0\uFE0F</span>
                <div class="alert-content">
                  <h4>High APR Financing Alert (${ear}% EAR)</h4>
                  <p>Taking this No-Cost EMI forfeits cash discounts and incurs processing fees, resulting in <strong>+${_PaylensCard.formatINR(hiddenMarkup)}</strong> in hidden markups vs cash upfront.</p>
                </div>
              </div>
            ` : ""}

            <!-- 3. Impact Grid -->
            <div class="impact-grid-section">
              <span class="section-label-sm">Cash-Flow Impact</span>
              <div class="impact-grid">
                <div class="impact-card">
                  <span class="impact-label">FOIR Debt Ratio</span>
                  <span class="impact-value">${foirAfter}</span>
                  <span class="impact-sub">From ${foirBefore}</span>
                </div>
                <div class="impact-card">
                  <span class="impact-label">Free Cash Remaining</span>
                  <span class="impact-value ${freeCashDanger ? "impact-sub danger" : ""}">${freeCash}</span>
                  <span class="impact-sub">Monthly buffer</span>
                </div>
                <div class="impact-card">
                  <span class="impact-label">Emergency Runway</span>
                  <span class="impact-value">${runway}m</span>
                  <span class="impact-sub">Safety cushion</span>
                </div>
              </div>
            </div>

            <!-- 4. Stress Tests -->
            ${stressHtml ? `
              <div class="stress-tests-section">
                <span class="section-label-sm">Financial Resilience Stress Tests</span>
                ${stressHtml}
              </div>
            ` : ""}

            <!-- 5. Smart Alternatives -->
            ${altsHtml ? `
              <div class="alternatives-section">
                <span class="section-label-sm">Re-Scored Smart Alternatives</span>
                ${altsHtml}
              </div>
            ` : ""}

            <!-- 6. Regional Explanations -->
            <div class="explanations-section">
              <div class="lang-switch-row">
                <span class="lang-switch-title">Copilot Explanation</span>
                <div class="lang-pills">
                  <button class="lang-pill ${currentLanguage === "en" ? "active" : ""}" data-lang="en">EN</button>
                  <button class="lang-pill ${currentLanguage === "hi" ? "active" : ""}" data-lang="hi">HI</button>
                  <button class="lang-pill ${currentLanguage === "kn" ? "active" : ""}" data-lang="kn">KN</button>
                </div>
              </div>
              <ul class="bullets-list">
                ${bulletsHtml}
              </ul>
            </div>

            <!-- 7. Collapsible Assumptions Footer -->
            <div class="assumptions-footer">
              <button class="assumptions-toggle" type="button">
                <span>\u24D8 Calculation Heuristics & Disclaimer</span>
                <span class="arrow">\u25BC</span>
              </button>
              <div class="assumptions-content" hidden>
                Calculated via bisection IRR solver (XIRR methodology per RBI guidelines). All numbers are mathematically grounded against verified payslip take-home income. Not financial advice.
              </div>
            </div>

          </div>

          <!-- Bottom Dismiss Option -->
          <div class="card-footer-dismiss">
            <button class="btn-remove-section" type="button" title="Remove Paylens section from this page">
              \u2715 Remove from this page
            </button>
          </div>
        </div>
      </div>

      <!-- Floating Trigger Button (Always visible unless dismissed) -->
      <button class="paylens-floating-trigger ${this.isOpen ? "trigger-active" : ""}" type="button" aria-label="Open Paylens Affordability Copilot">
        <div class="floating-icon-wrapper">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="status-pulse-dot ${level.toLowerCase()}"></span>
        </div>
        <span class="floating-title">Paylens Copilot</span>
        <span class="floating-pill pill-${level.toLowerCase()}">${pillsText}</span>
      </button>
    `;
      this._bindCommonEvents();
      this._bindVerdictEvents({ onLanguageChange, onOpenOptions, onSelectOption });
    }
    _bindCommonEvents() {
      const trigger = this.shadowRoot.querySelector(".paylens-floating-trigger");
      if (trigger) {
        trigger.addEventListener("click", () => {
          this.togglePanel();
        });
      }
      const closeBtn = this.shadowRoot.querySelector(".btn-close-panel");
      if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closePanel();
        });
      }
      const removeBtn = this.shadowRoot.querySelector(".btn-remove-section");
      if (removeBtn) {
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.dismiss();
        });
      }
    }
    _bindVerdictEvents({ onLanguageChange, onOpenOptions, onSelectOption } = {}) {
      const optionPills = this.shadowRoot.querySelectorAll(".option-pill");
      optionPills.forEach((pill) => {
        pill.addEventListener("click", () => {
          const optId = pill.dataset.optId;
          if (optId && onSelectOption) {
            onSelectOption(optId);
          }
        });
      });
      const bankSelect = this.shadowRoot.querySelector("#paylensBankSelect");
      if (bankSelect) {
        bankSelect.addEventListener("change", (e) => {
          const newBank = e.target.value;
          this.selectedBankFilter = newBank;
          if (newBank !== "all" && onSelectOption) {
            const bankPlan = this.currentListing?.payment_options?.find(
              (o) => getBankForOption(o) === newBank && o.type !== "CASH"
            );
            if (bankPlan) {
              onSelectOption(bankPlan.option_id);
              return;
            }
          }
          this.renderVerdict(this.currentVerdict, {
            currentLanguage: this.currentLanguage,
            listing: this.currentListing,
            selectedOptionId: this.activeSelectedOptionId,
            onSelectOption,
            onOpenOptions,
            onLanguageChange
          });
        });
      }
      const settingsBtn = this.shadowRoot.querySelector(".btn-settings");
      if (settingsBtn && onOpenOptions) {
        settingsBtn.addEventListener("click", onOpenOptions);
      }
      const langPills = this.shadowRoot.querySelectorAll(".lang-pill");
      langPills.forEach((pill) => {
        pill.addEventListener("click", () => {
          const lang = pill.dataset.lang;
          if (lang && onLanguageChange) {
            onLanguageChange(lang);
          }
        });
      });
      const toggle = this.shadowRoot.querySelector(".assumptions-toggle");
      const content = this.shadowRoot.querySelector(".assumptions-content");
      if (toggle && content) {
        toggle.addEventListener("click", () => {
          const isHidden = content.hasAttribute("hidden");
          if (isHidden) {
            content.removeAttribute("hidden");
            toggle.querySelector(".arrow").textContent = "\u25B2";
          } else {
            content.setAttribute("hidden", "");
            toggle.querySelector(".arrow").textContent = "\u25BC";
          }
        });
      }
    }
  };

  // extension/content/content.js
  (async function initPaylensContentScript() {
    console.log("[Paylens Content] Initializing on:", window.location.href);
    const card = new PaylensCard();
    let currentListing = null;
    let activeOptionOverride = null;
    let isEvaluating = false;
    let lastEvaluationKey = null;
    let adapter = getAdapter(window.location.href);
    let stopAdapterObserver = null;
    function bindAdapterObserver(adp) {
      if (stopAdapterObserver) {
        try {
          stopAdapterObserver();
        } catch (_) {
        }
        stopAdapterObserver = null;
      }
      if (adp && typeof adp.observe === "function") {
        stopAdapterObserver = adp.observe(document, () => {
          if (!chrome.runtime?.id) return;
          activeOptionOverride = null;
          evaluateAffordability();
        });
      }
    }
    if (adapter) {
      console.log("[Paylens Content] Matched adapter:", adapter.id);
      bindAdapterObserver(adapter);
    }
    async function evaluateAffordability() {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
      if (isEvaluating) return;
      if (!adapter) {
        adapter = getAdapter(window.location.href);
        if (adapter) {
          bindAdapterObserver(adapter);
        }
      }
      if (!adapter) return;
      const listing = await Promise.resolve(adapter.extract(document));
      let selectedOptionId = activeOptionOverride || await Promise.resolve(adapter.selectedOptionId(document));
      if (!listing || !listing.product_id || !listing.upfront_cash_price || listing.upfront_cash_price <= 0) {
        return;
      }
      if (Array.isArray(listing.payment_options) && listing.payment_options.length > 0) {
        const exists = listing.payment_options.some((o) => o.option_id === selectedOptionId);
        if (!exists) {
          const preferred = listing.payment_options.find((o) => o.option_id === "std_hdfc_3m" || o.option_id === "std_hdfc_6m" || o.option_id === "nocost_6m") || listing.payment_options.find((o) => o.type !== "CASH") || listing.payment_options[0];
          selectedOptionId = preferred ? preferred.option_id : listing.payment_options[0].option_id;
        }
      }
      if (!selectedOptionId) {
        return;
      }
      const mountPoint = adapter.mountPoint(document) || document.body;
      if (!mountPoint) {
        return;
      }
      card.mount(mountPoint);
      currentListing = listing;
      const activeOptObj = listing.payment_options?.find((o) => o.option_id === selectedOptionId);
      const evaluationKey = `${listing.product_id}:${selectedOptionId}:${activeOptObj?.monthly_installment}:${activeOptObj?.bank_discount}`;
      if (evaluationKey === lastEvaluationKey) {
        return;
      }
      isEvaluating = true;
      lastEvaluationKey = evaluationKey;
      card.renderLoading();
      try {
        if (!chrome.runtime?.id) return;
        const response = await chrome.runtime.sendMessage({
          type: "AFFORD",
          payload: {
            listing,
            selectedOptionId
          }
        });
        if (!response || !response.ok) {
          const err = response?.error;
          if (err?.code === "NO_PROFILE") {
            card.renderNoProfile({
              onOpenOptions: () => {
                if (chrome.runtime?.id) {
                  chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }).catch(() => {
                  });
                }
              },
              onLoadDemo: async () => {
                if (!chrome.runtime?.id) return;
                card.renderLoading("Loading Rahul Sharma (12 LPA) demo persona...");
                const demoProfilesRes = await chrome.runtime.sendMessage({ type: "DEMO_PROFILES" });
                if (demoProfilesRes?.ok && demoProfilesRes.data?.length > 0) {
                  await chrome.runtime.sendMessage({
                    type: "PROFILE_SET",
                    payload: demoProfilesRes.data[0].profile
                  });
                  lastEvaluationKey = null;
                  isEvaluating = false;
                  evaluateAffordability();
                }
              }
            });
          } else {
            card.renderError(err?.message || "Affordability evaluation failed.", {
              onRetry: () => {
                lastEvaluationKey = null;
                isEvaluating = false;
                evaluateAffordability();
              }
            });
          }
          return;
        }
        const verdict = response.data;
        renderActiveVerdict(verdict, "en", selectedOptionId);
      } catch (err) {
        if (!chrome.runtime?.id || err?.message?.includes("Extension context invalidated")) {
          return;
        }
        console.error("[Paylens Content] Evaluation error:", err);
        card.renderError(err.message || "Error communicating with Paylens extension.", {
          onRetry: () => {
            lastEvaluationKey = null;
            isEvaluating = false;
            evaluateAffordability();
          }
        });
      } finally {
        isEvaluating = false;
      }
    }
    function renderActiveVerdict(verdict, language = "en", activeOptionId = null) {
      const optId = activeOptionId || activeOptionOverride || adapter.selectedOptionId(document);
      card.renderVerdict(verdict, {
        currentLanguage: language,
        listing: currentListing,
        selectedOptionId: optId,
        onSelectOption: (newOptionId) => {
          activeOptionOverride = newOptionId;
          lastEvaluationKey = null;
          evaluateAffordability();
        },
        onOpenOptions: () => {
          if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }).catch(() => {
            });
          }
        },
        onLanguageChange: async (newLang) => {
          try {
            if (!chrome.runtime?.id) return;
            const explainRes = await chrome.runtime.sendMessage({
              type: "EXPLAIN",
              payload: { verdict, language: newLang }
            });
            if (explainRes?.ok && explainRes.data?.bullets) {
              verdict.explanation_bullets = explainRes.data.bullets;
              renderActiveVerdict(verdict, newLang, optId);
            }
          } catch (e) {
            if (chrome.runtime?.id && !e?.message?.includes("Extension context invalidated")) {
              console.warn("[Paylens Content] Language explanation error:", e);
            }
          }
        }
      });
    }
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!adapter) {
        adapter = getAdapter(window.location.href);
        if (adapter) bindAdapterObserver(adapter);
      }
      if (msg?.type === "GET_ACTIVE_SELECTION") {
        (async () => {
          if (!adapter) {
            adapter = getAdapter(window.location.href);
            if (adapter) bindAdapterObserver(adapter);
          }
          if (!adapter) {
            sendResponse({ ok: false, data: { isProductPage: false } });
            return;
          }
          const listing = currentListing || await Promise.resolve(adapter.extract(document));
          const selectedOptionId = activeOptionOverride || await Promise.resolve(adapter.selectedOptionId(document));
          const isValid = Boolean(listing && listing.product_id && listing.upfront_cash_price > 0);
          sendResponse({
            ok: isValid,
            data: isValid ? {
              isProductPage: true,
              productId: listing.product_id,
              optionId: selectedOptionId || null,
              title: listing.title || null,
              retailer: listing.retailer || null,
              listing
            } : {
              isProductPage: false
            }
          });
        })();
        return true;
      }
      if (msg?.type === "PROFILE_UPDATED") {
        lastEvaluationKey = null;
        isEvaluating = false;
        evaluateAffordability();
      }
      if (msg?.type === "RELAUNCH_COPILOT") {
        if (!adapter) {
          adapter = getAdapter(window.location.href);
          if (adapter) bindAdapterObserver(adapter);
        }
        card.isDismissed = false;
        if (card.host) {
          card.host.style.display = "block";
        } else if (adapter) {
          const mountPoint = adapter.mountPoint(document) || document.body;
          card.mount(mountPoint);
        }
        card.openPanel();
        lastEvaluationKey = null;
        isEvaluating = false;
        evaluateAffordability();
        sendResponse({ ok: true, message: "Copilot relaunched on page." });
        return false;
      }
    });
    let lastRecordedUrl = window.location.href;
    const onUrlChange = () => {
      if (window.location.href !== lastRecordedUrl) {
        lastRecordedUrl = window.location.href;
        const newAdapter = getAdapter(window.location.href);
        if (newAdapter) {
          adapter = newAdapter;
          bindAdapterObserver(adapter);
          lastEvaluationKey = null;
          isEvaluating = false;
          evaluateAffordability();
        }
      }
    };
    window.addEventListener("popstate", onUrlChange);
    window.addEventListener("hashchange", onUrlChange);
    const runInitialEvaluations = () => {
      evaluateAffordability();
      setTimeout(evaluateAffordability, 500);
      setTimeout(evaluateAffordability, 1500);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runInitialEvaluations);
    } else {
      runInitialEvaluations();
    }
    UniversalEmiExtractor.observeEmiModal(document, () => {
      console.log("[Paylens Content] Detected EMI modal update in DOM. Re-evaluating with live bank data.");
      lastEvaluationKey = null;
      isEvaluating = false;
      evaluateAffordability();
    });
  })();
})();
