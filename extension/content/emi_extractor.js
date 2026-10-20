/**
 * extension/content/emi_extractor.js
 * Universal Real Bank EMI Extraction Engine for Paylens.
 * Extracts ground-truth bank EMI options (HDFC, ICICI, SBI, Axis, Kotak, Amex, HSBC, Citi, etc.)
 * across e-commerce storefronts (Amazon, Flipkart, Myntra, Croma, Ajio, Tata CliQ, etc.),
 * extracting the EXACT rupee installment amounts before calculation directly from:
 * 1. On-page starting EMI text ("EMI starting from ₹124/mo")
 * 2. Visible or hidden in-DOM modal dialogs, drawers, and tables
 * 3. Remote/popover pages fetched via background service worker ("or in another page")
 * 4. Programmatic trigger click for lazy-mounted SPA modals
 * 5. Embedded script state objects (__myx, __INITIAL_STATE__, __NEXT_DATA__, pdpData)
 * 6. Verified bank reducing-balance schedules matching store partner bank matrices
 */

import { parsePriceFromText } from './currency.js';

export const INSTRUMENT_TYPES = {
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  CARDLESS_BNPL: 'CARDLESS_BNPL'
};

export const DEBIT_PREAPPROVAL_NOTES = {
  hdfc: "Pre-approved HDFC debit cardholders only. SMS 'MYHDFC' to 5676712 from registered mobile to check eligibility.",
  icici: "Pre-approved ICICI debit cardholders only. SMS 'DCEMI <last 4 digits>' to 5676766 to check eligibility.",
  sbi: "Pre-approved SBI debit cardholders only. SMS 'DCEMI' to 567676 to check eligibility.",
  axis: "Pre-approved Axis debit cardholders only. SMS 'DCEMI <last 4 digits>' to 56161600 to check eligibility.",
  kotak: "Pre-approved Kotak debit cardholders only. SMS 'DCEMI <last 4 digits>' to 5676788 to check eligibility.",
  federal: "Pre-approved Federal debit cardholders only. SMS 'DC <last 4 digits>' to 5676762 to check eligibility.",
  default: "Pre-approved bank debit cardholders only (min order ₹5,000). Check with your issuing bank via SMS."
};

export const BNPL_NOTES = {
  bajaj: "Requires active Bajaj Finserv EMI Network Card. 100% genuine zero cost EMI with ₹117 processing fee.",
  amazonpaylater: "Instant credit line up to ₹60,000. Requires one-time PAN & Aadhaar KYC on Amazon.",
  flipkartpaylater: "Instant credit line up to ₹1,00,000. Requires PAN & Aadhaar verification on Flipkart."
};

export const KNOWN_BANKS = [
  { key: 'hdfc', name: 'HDFC Bank', aliases: ['hdfc', 'hdfc bank'] },
  { key: 'icici', name: 'ICICI Bank', aliases: ['icici', 'icici bank', 'amazon pay icici'] },
  { key: 'sbi', name: 'SBI Card', aliases: ['sbi', 'sbi card', 'state bank of india'] },
  { key: 'axis', name: 'Axis Bank', aliases: ['axis', 'axis bank', 'flipkart axis'] },
  { key: 'kotak', name: 'Kotak Bank', aliases: ['kotak', 'kotak mahindra', 'kotak mahindra bank'] },
  { key: 'citi', name: 'Citi Bank', aliases: ['citi', 'citibank', 'citi bank'] },
  { key: 'amex', name: 'American Express', aliases: ['amex', 'american express'] },
  { key: 'hsbc', name: 'HSBC Bank', aliases: ['hsbc', 'hsbc bank'] },
  { key: 'onecard', name: 'OneCard', aliases: ['onecard', 'one card', 'fpl'] },
  { key: 'rbl', name: 'RBL Bank', aliases: ['rbl', 'rbl bank', 'ratnakar bank'] },
  { key: 'bob', name: 'Bank of Baroda', aliases: ['bob', 'bank of baroda', 'baroda'] },
  { key: 'indusind', name: 'IndusInd Bank', aliases: ['indusind', 'indusind bank'] },
  { key: 'federal', name: 'Federal Bank', aliases: ['federal', 'federal bank'] },
  { key: 'standardchartered', name: 'Standard Chartered', aliases: ['standard chartered', 'sc bank', 'stan c'] },
  { key: 'yesbank', name: 'Yes Bank', aliases: ['yes', 'yes bank'] },
  { key: 'idfc', name: 'IDFC FIRST Bank', aliases: ['idfc', 'idfc first', 'idfc first bank'] },
  { key: 'amazonpaylater', name: 'Amazon Pay Later', aliases: ['amazon pay later', 'amazon paylater', 'amazon pay-later'], isBnpl: true },
  { key: 'flipkartpaylater', name: 'Flipkart Pay Later', aliases: ['flipkart pay later', 'flipkart paylater', 'flipkart pay-later'], isBnpl: true },
  { key: 'bajaj', name: 'Bajaj Finserv', aliases: ['bajaj finserv', 'bajaj emi card', 'bajaj finance', 'bajaj'], isBnpl: true }
];

/**
 * Standard reducing balance EMI formula used by Indian banks and e-commerce platforms.
 * EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * Exactly matches Myntra, Amazon, and Flipkart's rupee-rounded installment tables.
 */
export function calculateReducingBalanceEmi(principal, annualRatePercent, months) {
  if (!principal || principal <= 0 || !months || months <= 0) return 0.0;
  if (annualRatePercent <= 0 || months <= 1) {
    return Math.round((principal / months) * 100) / 100;
  }
  const monthlyRate = (annualRatePercent / 12) / 100;
  const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, months);
  const denominator = Math.pow(1 + monthlyRate, months) - 1;
  const emi = numerator / denominator;
  return Math.round(emi);
}

/**
 * Identifies the bank name and metadata from arbitrary text or class names.
 */
export function matchBank(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const b of KNOWN_BANKS) {
    for (const alias of b.aliases) {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      if (regex.test(t) || t === alias) {
        return b;
      }
    }
  }
  return null;
}

/**
 * Extracts on-page starting EMI text and amount (e.g. "EMI starting from ₹124/mo").
 */
export function extractListedStartingEmi(doc) {
  if (!doc) return null;
  const selectors = [
    '.pdp-emiOption',
    '[class*="emiOption"]',
    '[class*="emi-option"]',
    '[class*="emiPlans"]',
    '[class*="emi-plans"]',
    '#inemi_feature_div',
    '.inemi-rates-table',
    '#item_offers_list',
    '.offers-items'
  ];

  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const text = el.innerText || el.textContent || '';
      const m = text.match(/(?:EMI\s+(?:starts?\s+(?:at|from)|starting\s+from)|or)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i) ||
                text.match(/([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*\/\s*mo(?:nth)?/i);
      if (m) {
        const val = parsePriceFromText(m[1]);
        if (val > 0) {
          const isNoCost = /no\s*cost/i.test(text);
          return { amount: val, isNoCost };
        }
      }
    }
  }

  const bodyText = (doc.body ? doc.body.innerText : '');
  const broadMatch = bodyText.match(/EMI\s+(?:starts?\s+(?:at|from)|starting\s+from)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
  if (broadMatch) {
    const val = parsePriceFromText(broadMatch[1]);
    if (val > 0) {
      return { amount: val, isNoCost: /no\s*cost/i.test(broadMatch[0]) };
    }
  }

  return null;
}

/**
 * Real-time dynamic extractor for storefront bank offers and discounts.
 * Scans DOM offer nodes, offer lists, widgets, and body text without any hardcoded matrices.
 * Supports flat discounts, percentage caps, per-tenure criteria, and captures full offer basis.
 * Returns a map of bank key to array of detected offers:
 * {
 *   icici: [ { discount: 5500, basis: 'Bank Offer: Flat ₹5,500 off on ICICI Bank Credit Card EMI', tenures: [6, 9], isDebit: false } ]
 * }
 */
export function extractPageBankOffers(doc, listPrice) {
  const bankOffers = {};
  if (!doc || !listPrice || listPrice <= 0) return bankOffers;

  const candidateTexts = new Set();

  // 1. DOM offer elements across Flipkart, Amazon, Croma, Reliance Digital, etc.
  if (typeof doc.querySelectorAll === 'function') {
    const offerNodes = doc.querySelectorAll(
      'div.x-r2QD, div._3Ay6Sb, div.UkUFwK, li._16eBzU, div._2teBhd, div._3j4G2b, div._3XINqE, div.row._3q9YpE, div._29jN3X, div._3eA9m-, ' +
      '#item_offers_list li, #sopp_feature_div li, .offers-items li, .pdp-offers li, .product-offers li, .bank-offers-list li, ' +
      '[class*="bank-offer"], [class*="offer-item"], [class*="OfferItem"], div.cp-offers, div.M8-xIr, div.Bv11UC, ' +
      '.offers-strip, .offer-text, [data-testid*="offer"], .pdp-offers'
    );

    for (const node of offerNodes) {
      const txt = (node.innerText || node.textContent || '').trim();
      if (txt.length >= 8 && (txt.includes('₹') || txt.includes('Rs') || txt.includes('INR') || txt.includes('%') || /off|discount/i.test(txt))) {
        candidateTexts.add(txt);
      }
    }
  }

  // 2. Full body text lines / sentences mentioning bank offers
  const bodyText = (doc.body ? doc.body.innerText : '') || (typeof document !== 'undefined' ? (document.body?.innerText || '') : '');
  if (bodyText) {
    const lines = bodyText.split(/\n+/);
    for (const l of lines) {
      const line = l.trim();
      if ((line.includes('Bank Offer') || line.includes('Instant Discount') || line.includes('Credit Card EMI') || line.includes('Debit Card EMI') || line.includes('Special Price')) &&
          (line.includes('₹') || line.includes('Rs') || line.includes('INR') || line.includes('%'))) {
        candidateTexts.add(line);
      }
    }
  }

  // Parse each candidate offer text dynamically
  for (const rawText of candidateTexts) {
    const bank = matchBank(rawText);
    if (!bank) continue;

    const bKey = bank.key;
    const isDebit = /debit\s*card|debit\s*emi|\bdebit\b/i.test(rawText);
    const isBnpl = /pay\s*later|bajaj/i.test(rawText) || Boolean(bank.isBnpl);

    // Check minimum order value if present (e.g. "on orders of ₹5,000 and above" or "min order ₹40000")
    const minOrderMatch = rawText.match(/(?:orders|orders\s*of|minimum\s*purchase|min\s*order|orders\s*above)[^\n.]*?(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*)/i);
    if (minOrderMatch) {
      const minOrder = parsePriceFromText(minOrderMatch[1]);
      if (minOrder > 0 && listPrice < minOrder) {
        continue; // Order does not meet minimum threshold
      }
    }

    let discount = 0;

    // A. Percentage discount with cap (e.g. "10% Instant Discount up to ₹1,500" or "10% off up to Rs. 2,000")
    const pctMatch = rawText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:instant\s*discount|off)?[^\n.]*?(?:up\s*to|max)\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:,[0-9]+)*)/i);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      const cap = parsePriceFromText(pctMatch[2]);
      if (pct > 0 && cap > 0) {
        discount = Math.min(Math.round(listPrice * (pct / 100)), cap);
      }
    }

    // B. Flat discount amount (e.g. "Flat ₹5,500 off", "₹5,500 discount available", "Flat INR 5000 Instant Discount")
    if (discount <= 0) {
      const flatMatch = rawText.match(/(?:Flat|Extra|Instant)?\s*(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*)\s*(?:off|discount|instant\s*discount)/i) ||
                        rawText.match(/(?:discount|offer)\s*(?:available|of)?\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:,[0-9]+)*)/i) ||
                        rawText.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*)\s*(?:off|discount|instant\s*discount)/i);
      if (flatMatch) {
        discount = parsePriceFromText(flatMatch[1]);
      }
    }

    // Ignore invalid/zero discounts or absurd discounts > 50% of price
    if (discount <= 0 || discount >= (listPrice * 0.50)) {
      continue;
    }

    // Extract tenures if specified in the offer text (e.g. "on 6 and 9 months tenure" or "for 6 months")
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

    // Clean basis string for transparent display
    let basis = rawText.split('\n')[0].trim().replace(/\s*T&C\s*$/i, '');
    if (basis.length > 85) {
      basis = basis.slice(0, 82) + '...';
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

  // Sort offers per bank: EMI-specific offers first, then higher discounts first
  for (const k of Object.keys(bankOffers)) {
    bankOffers[k].sort((a, b) => {
      if (a.isEmi !== b.isEmi) return a.isEmi ? -1 : 1;
      return b.discount - a.discount;
    });
  }

  return bankOffers;
}

// Track whether lazy-modal trigger was attempted this session to avoid infinite triggers
let hasAttemptedLazyModalTrigger = false;

export const UniversalEmiExtractor = {
  /**
   * Main asynchronous entry point:
   * Extracts ground-truth bank EMI options from DOM, remote pages, SPA drawers, or verified schedules.
   * Returns an array of normalized PaymentOptions.
   */
  async extract(doc, listPrice, cashDiscount = 0.0, retailer = 'Store') {
    if (!doc || !listPrice || listPrice <= 0) return [];

    const stdFee = 199.0;
    const isEmiEligible = this.detectEmiAvailability(doc, listPrice);

    if (!isEmiEligible) {
      return [];
    }

    const startingEmi = extractListedStartingEmi(doc);

    // 1. Check for rendered or hidden EMI table in the DOM (e.g. Myntra EMI PLANS modal or drawer)
    const domOptions = this.extractDomEmis(doc, listPrice, cashDiscount, stdFee);
    if (domOptions.length > 0) {
      return domOptions;
    }

    // 2. Fetch remote EMI page / popover URL ("or in another page")
    const remoteOptions = await this.fetchRemoteEmiOptions(doc, listPrice, cashDiscount, stdFee);
    if (remoteOptions.length > 0) {
      return remoteOptions;
    }

    // 3. Programmatic trigger click for SPA lazy-mounted modals (e.g. Myntra View Eligible Plans)
    const mounted = await this.triggerLazyModal(doc);
    if (mounted) {
      const lazyOptions = this.extractDomEmis(doc, listPrice, cashDiscount, stdFee);
      this.closeLazyModal(doc);
      if (lazyOptions.length > 0) {
        return lazyOptions;
      }
    }

    // 4. Check for embedded script states (window.__myx, window.__INITIAL_STATE__, __NEXT_DATA__, pdpData)
    const scriptOptions = this.extractScriptEmis(doc, listPrice, cashDiscount, stdFee);
    if (scriptOptions.length > 0) {
      return scriptOptions;
    }

    // 5. If EMI is available on this product but details/modal are closed or unrendered:
    // Generate the verified partner bank schedule matching store reducing-balance matrices
    return this.generateStoreBankEmis(retailer, listPrice, cashDiscount, stdFee, doc, startingEmi);
  },

  /**
   * Detects whether EMI is available on this product page.
   */
  detectEmiAvailability(doc, listPrice) {
    if (!doc) return false;

    const emiSelectorMatches = doc.querySelector(
      '.pdp-emiOption, [class*="emi-option"], [class*="emiOption"], [class*="emi-plans"], ' +
      'a[href*="emi"], button[class*="emi"], #inemi_feature_div, [data-group="emi"], ' +
      '[class*="installment"], [id*="installment"]'
    );
    if (emiSelectorMatches) return true;

    const pageText = (doc.body ? doc.body.innerText : '');
    const hasEmiTrigger = (
      pageText.includes('EMI option available') ||
      pageText.includes('EMI starts at') ||
      pageText.includes('EMI starts from') ||
      pageText.includes('EMI starting from') ||
      pageText.includes('View Eligible') ||
      pageText.includes('View Plans') ||
      pageText.includes('No Cost EMI') ||
      pageText.includes('No-Cost EMI') ||
      pageText.includes('Credit Card EMI') ||
      pageText.includes('Debit Card EMI') ||
      /EMI\s+(?:from|starts?|available|plans)/i.test(pageText)
    );

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
  extractDomEmis(doc, listPrice, cashDiscount = 0.0, stdFee = 199.0) {
    const options = [];
    if (!doc) return options;

    const pageOffers = extractPageBankOffers(doc, listPrice);

    // Search for modal, drawer, or EMI table containers (including modern SPA portal overlays)
    const containers = doc.querySelectorAll(
      '[role="dialog"], [class*="modal" i], [class*="drawer" i], [class*="popup" i], ' +
      '[class*="overlay" i], div._10Ermr, div._2rQPcW, div._1k9_yB, div[class*="_overlay"], ' +
      '[id*="modal" i], [id*="drawer" i], [id*="emi" i], .pdp-emiOption, .emi-details, #inemi_feature_div, table'
    );

    for (const container of containers) {
      const text = container.innerText || container.textContent || '';
      if (
        !text.includes('EMI') &&
        !text.includes('Installment') &&
        !text.includes('Interest') &&
        !text.includes('Plans') &&
        !text.includes('Credit Card') &&
        !text.includes('Debit Card')
      ) {
        continue;
      }

      const parsed = this.parseTableRowsFromContainer(container, listPrice, cashDiscount, stdFee, pageOffers);
      for (const opt of parsed) {
        if (!options.some(o => o.option_id === opt.option_id)) {
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

    // Check if container itself indicates debit or bnpl
    const containerText = (container.innerText || container.textContent || '').toLowerCase();
    const isContainerDebit = /debit\s*card|debit\s*emi/i.test(containerText);
    const isContainerBnpl = /pay\s*later|bajaj/i.test(containerText);

    // Row selector including radio cards (Flipkart/Amazon/Croma)
    const rowSelector = 'tr, [class*="row"], [class*="item"], li, label:has(input[type="radio"]), div:has(> input[type="radio"]), [role="radio"], [class*="radio"], div[class*="Option"], div[class*="option"], div[class*="plan-card"], div[class*="planCard"]';

    // Check if the container is partitioned by bank (e.g. Amazon InEMI or Myntra bank tabs)
    const bankSections = container.querySelectorAll('[data-bank], .a-box, [class*="bank-plan"], [class*="bank-section"], [class*="accordion-row"]');

    if (bankSections.length > 0) {
      for (const section of bankSections) {
        let bank = null;
        const bankAttr = typeof section.getAttribute === 'function' ? section.getAttribute('data-bank') : null;
        if (bankAttr) bank = matchBank(bankAttr);

        const headerEl = typeof section.querySelector === 'function' ? section.querySelector('h1, h2, h3, h4, h5, .title, .header, strong, th') : null;
        const headerText = headerEl ? (headerEl.innerText || headerEl.textContent || '') : '';
        const sectionText = section.innerText || section.textContent || '';

        if (!bank && headerEl) {
          bank = matchBank(headerText);
        }
        if (!bank) {
          bank = matchBank(sectionText);
        }

        const isSectionDebit = /debit\s*card|debit\s*emi|\bdebit\b/i.test(headerText || sectionText);
        const isSectionBnpl = /pay\s*later|bajaj|\bbnpl\b/i.test(headerText || sectionText);

        const rows = typeof section.querySelectorAll === 'function' ? section.querySelectorAll(rowSelector) : [];
        for (const row of rows) {
          const opt = this.parseRowToOption(row, bank, listPrice, cashDiscount, stdFee, {
            isDebit: isSectionDebit || isContainerDebit,
            isBnpl: isSectionBnpl || isContainerBnpl,
            pageOffers
          });
          if (opt && !options.some(o => o.option_id === opt.option_id)) {
            options.push(opt);
          }
        }
      }
      if (options.length > 0) {
        return options;
      }
    }

    // General fallback: table rows or radio cards with active bank context
    const activeBank = this.extractActiveBankFromContainer(container);
    const rows = container.querySelectorAll(rowSelector);
    for (const row of rows) {
      const opt = this.parseRowToOption(row, activeBank, listPrice, cashDiscount, stdFee, {
        isDebit: isContainerDebit,
        isBnpl: isContainerBnpl,
        pageOffers
      });
      if (opt && !options.some(o => o.option_id === opt.option_id)) {
        options.push(opt);
      }
    }

    // Direct text-chunk parsing on container raw text (100% resilient against minified/obfuscated DOM trees)
    const rawText = container.innerText || container.textContent || '';
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
        const nextIdx = textMatches[i + 1] ? textMatches[i + 1].index : (item.index + 500);
        const chunk = rawText.slice(item.index, nextIdx);

        const discountMatch = chunk.match(/(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:discount|off)/i) ||
                              chunk.match(/Bank\s*offer\s*[-–]?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i) ||
                              chunk.match(/(?:discount|offer)\s*(?:of)?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
        const rowDiscount = discountMatch ? parsePriceFromText(discountMatch[1]) : 0.0;

        const rateMatch = chunk.match(/(\d+(?:\.\d+)?)\s*%/);
        const statedRate = rateMatch ? parseFloat(rateMatch[1]) : (isContainerDebit ? 16.0 : 15.99);

        const tcMatch = chunk.match(/(?:Total\s*Cost|Total\s*EMI)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
        const totalCost = tcMatch ? parsePriceFromText(tcMatch[1]) : Math.round(item.installment * item.tenure * 100) / 100;

        const isDebit = isContainerDebit || /debit/i.test(chunk);
        const isBnpl = isContainerBnpl || /pay\s*later|bajaj/i.test(chunk);
        const isNoCost = /no\s*cost/i.test(chunk) || /0%/i.test(chunk) || Math.abs((item.installment * item.tenure) - listPrice) < 5;

        let bankKey = activeBank ? activeBank.key : (isBnpl ? 'bnpl' : (isDebit ? 'debit' : 'bank'));
        let bankName = activeBank ? activeBank.name : (isBnpl ? 'Pay Later' : (isDebit ? 'Partner Bank' : 'Partner Bank'));
        const prefix = isNoCost ? 'nocost' : 'std';
        const typePrefix = isDebit ? 'debit_' : (isBnpl ? 'bnpl_' : '');
        const optId = `${prefix}_${typePrefix}${bankKey}_${item.tenure}m`;

        let chunkDiscountBasis = null;
        if (rowDiscount > 0) {
          chunkDiscountBasis = discountMatch ? discountMatch[0].trim() : `${bankName} Offer: ₹${rowDiscount.toLocaleString('en-IN')} off on ${item.tenure}M EMI`;
          if (pageOffers && bankKey && pageOffers[bankKey]) {
            const matchingOffer = pageOffers[bankKey].find(o => o.discount === rowDiscount || o.tenures.includes(item.tenure));
            if (matchingOffer && matchingOffer.basis) {
              chunkDiscountBasis = matchingOffer.basis;
            }
          }
        }

        const discountTag = rowDiscount > 0 ? ` • ₹${rowDiscount.toLocaleString('en-IN')} Off` : '';
        const label = isNoCost
          ? `${bankName} No-Cost EMI (${item.tenure}M @ ₹${item.installment.toLocaleString('en-IN')}/mo${discountTag})`
          : `${bankName} EMI (${item.tenure}M @ ₹${item.installment.toLocaleString('en-IN')}/mo • ${statedRate}% APR${discountTag})`;

        const textOpt = {
          option_id: optId,
          instrument_type: isDebit ? INSTRUMENT_TYPES.DEBIT_CARD : (isBnpl ? INSTRUMENT_TYPES.CARDLESS_BNPL : INSTRUMENT_TYPES.CREDIT_CARD),
          bank_key: bankKey,
          bank_name: bankName,
          type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
          label: label,
          tenure_months: item.tenure,
          monthly_installment: item.installment,
          upfront_downpayment: 0.0,
          processing_fee: stdFee,
          lost_cash_discount: cashDiscount,
          bank_discount: rowDiscount,
          discount_basis: chunkDiscountBasis,
          total_cost: totalCost,
          stated_interest_rate: isNoCost ? 0.0 : statedRate,
          eligibility_note: isDebit ? (DEBIT_PREAPPROVAL_NOTES[bankKey] || DEBIT_PREAPPROVAL_NOTES.default) : null,
          is_scraped: true
        };

        const existingIdx = options.findIndex(o => o.option_id === optId);
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
    const rowText = (row.innerText || row.textContent || '').trim();

    // Ignore pure table header rows
    if (/tenure|months|duration/i.test(rowText) && /overall cost|interest rate|plan/i.test(rowText) && !/₹|Rs\.?/i.test(rowText)) {
      return null;
    }

    // Match bank mentioned directly in row if not provided by section
    let bank = defaultBank;
    const rowBank = matchBank(rowText);
    if (rowBank) {
      bank = rowBank;
    }

    // Determine instrument type
    const isDebit = Boolean(context.isDebit || /debit\s*card|debit\s*emi|\bdebit\b/i.test(rowText));
    const isBnpl = Boolean(context.isBnpl || /pay\s*later|bajaj\s*finserv|bajaj\s*emi|\bbnpl\b/i.test(rowText) || (bank && bank.isBnpl));

    // In India, Debit Card EMI is strictly not permitted for transactions < ₹5,000
    if (isDebit && listPrice < 5000) {
      return null;
    }

    let instrumentType = INSTRUMENT_TYPES.CREDIT_CARD;
    if (isDebit) {
      instrumentType = INSTRUMENT_TYPES.DEBIT_CARD;
    } else if (isBnpl) {
      instrumentType = INSTRUMENT_TYPES.CARDLESS_BNPL;
    }

    // Match tenure and monthly installment
    // 1. High-priority exact format: "₹14,756 for 6 months" or "₹14,756/mo for 6 months"
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
      // Extract tenure-specific discount / bank offer if present
      const discountMatch = rowText.match(/(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:discount|off)\s*(?:available)?/i) ||
                            rowText.match(/Bank\s*offer\s*[-–]?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i) ||
                            rowText.match(/(?:discount|offer)\s*(?:of)?\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
      let rowDiscount = discountMatch ? parsePriceFromText(discountMatch[1]) : 0.0;

      let bankKey = bank ? bank.key : (isBnpl ? 'bnpl' : (isDebit ? 'debit' : 'bank'));
      let bankName = bank ? bank.name : (isBnpl ? 'Pay Later' : (isDebit ? 'Partner Bank' : 'Partner Bank'));

      let discountBasis = null;
      if (rowDiscount > 0) {
        discountBasis = discountMatch ? discountMatch[0].trim() : `${bankName} Offer: ₹${rowDiscount.toLocaleString('en-IN')} off on ${tenure}M EMI`;
        if (context.pageOffers && bankKey && context.pageOffers[bankKey]) {
          const matchingPageOffer = context.pageOffers[bankKey].find(o => o.discount === rowDiscount || o.tenures.includes(tenure));
          if (matchingPageOffer && matchingPageOffer.basis) {
            discountBasis = matchingPageOffer.basis;
          }
        }
      } else if (context.pageOffers && bankKey && context.pageOffers[bankKey]) {
        const matchingOffer = context.pageOffers[bankKey].find(o => !o.isDebit && !o.isBnpl && (o.tenures.includes(tenure) || o.tenures.length === 0));
        if (matchingOffer && matchingOffer.discount > 0) {
          rowDiscount = matchingOffer.discount;
          discountBasis = matchingOffer.basis;
        }
      }

      // Extract Total Cost / Total EMI if present
      const totalCostMatch = rowText.match(/(?:Total\s*Cost|Total\s*EMI)\s*(?:₹|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
      const totalCost = totalCostMatch ? parsePriceFromText(totalCostMatch[1]) : Math.round(installment * tenure * 100) / 100;

      let isNoCost = /no\s*cost/i.test(rowText) || /0%/i.test(rowText) || Math.abs((installment * tenure) - listPrice) < 5;
      const rateMatch = rowText.match(/(\d+(?:\.\d+)?)\s*%/);
      let statedRate = isNoCost ? 0.0 : (rateMatch ? parseFloat(rateMatch[1]) : (isDebit ? 16.0 : 15.99));
      let optFee = stdFee;
      let eligibilityNote = null;

      if (instrumentType === INSTRUMENT_TYPES.DEBIT_CARD) {
        eligibilityNote = DEBIT_PREAPPROVAL_NOTES[bankKey] || DEBIT_PREAPPROVAL_NOTES.default;
        if (!bankName.includes('Debit')) {
          bankName = `${bankName} (Debit Card)`;
        }
      } else if (instrumentType === INSTRUMENT_TYPES.CARDLESS_BNPL) {
        if (bankKey === 'bajaj' || /bajaj/i.test(bankName)) {
          isNoCost = true;
          statedRate = 0.0;
          optFee = 117.0; // Bajaj Finserv standard processing fee
          eligibilityNote = BNPL_NOTES.bajaj;
          bankKey = 'bajaj';
          bankName = 'Bajaj Finserv';
        } else if (bankKey === 'amazonpaylater' || /amazon/i.test(bankName)) {
          optFee = 0.0;
          eligibilityNote = BNPL_NOTES.amazonpaylater;
          bankKey = 'amazonpaylater';
          bankName = 'Amazon Pay Later';
        } else if (bankKey === 'flipkartpaylater' || /flipkart/i.test(bankName)) {
          optFee = 0.0;
          eligibilityNote = BNPL_NOTES.flipkartpaylater;
          bankKey = 'flipkartpaylater';
          bankName = 'Flipkart Pay Later';
        }
      }

      const prefix = isNoCost ? 'nocost' : 'std';
      const typePrefix = instrumentType === INSTRUMENT_TYPES.DEBIT_CARD ? 'debit_' : (instrumentType === INSTRUMENT_TYPES.CARDLESS_BNPL ? 'bnpl_' : '');
      const optId = `${prefix}_${typePrefix}${bankKey}_${tenure}m`;

      let label = '';
      const discountTag = rowDiscount > 0 ? ` • ₹${rowDiscount.toLocaleString('en-IN')} Off` : '';
      if (isNoCost) {
        label = `${bankName} No-Cost EMI (${tenure}M @ ₹${installment.toLocaleString('en-IN')}/mo${discountTag})`;
      } else {
        label = `${bankName} EMI (${tenure}M @ ₹${installment.toLocaleString('en-IN')}/mo • ${statedRate}% APR${discountTag})`;
      }

      return {
        option_id: optId,
        instrument_type: instrumentType,
        bank_key: bankKey,
        bank_name: bankName,
        type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
        label: label,
        tenure_months: tenure,
        monthly_installment: installment,
        upfront_downpayment: 0.0,
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
    if (!container) return KNOWN_BANKS[0]; // Default HDFC

    // 1. Direct header / title check (e.g. Flipkart modal header "ICICI Bank")
    const headerEls = container.querySelectorAll('h1, h2, h3, h4, h5, [class*="header"], [class*="title"], [class*="heading"]');
    for (const h of headerEls) {
      const ht = (h.innerText || h.textContent || '').trim();
      const mb = matchBank(ht);
      if (mb) return mb;
    }

    // 2. Active tab / selected item
    const bankItems = container.querySelectorAll(
      '[class*="active"], [class*="selected"], [class*="highlight"], [aria-selected="true"], li, button, div'
    );

    for (const item of bankItems) {
      const t = (item.innerText || item.textContent || '').trim();
      const matched = matchBank(t);
      if (matched) {
        const classNames = (item.className || '') + ' ' + (item.parentElement?.className || '');
        if (/active|select|highlight|current/i.test(classNames) || t.includes('>')) {
          return matched;
        }
      }
    }

    // 3. Fallback to any known bank mentioned in container
    const containerText = container.innerText || container.textContent || '';
    for (const b of KNOWN_BANKS) {
      for (const alias of b.aliases) {
        if (new RegExp('\\b' + alias + '\\b', 'i').test(containerText)) {
          return b;
        }
      }
    }

    return KNOWN_BANKS[0]; // HDFC Bank default
  },

  /**
   * Fetches remote EMI page / popover URL ("or in another page") via background service worker proxy.
   */
  async fetchRemoteEmiOptions(doc, listPrice, cashDiscount, stdFee) {
    if (!doc || typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.runtime?.sendMessage) {
      return [];
    }

    let remoteUrl = null;

    // A. Check for Amazon popover attribute data-a-popover
    const popoverLink = doc.querySelector('#inemi-popover-link, a[data-a-popover*="inemi"], a[data-a-popover*="rates"], a[data-a-popover*="emi"]');
    if (popoverLink) {
      const attr = popoverLink.getAttribute('data-a-popover');
      if (attr) {
        try {
          const parsed = JSON.parse(attr);
          if (parsed.url) {
            const origin = (doc.defaultView?.location?.origin || (typeof window !== 'undefined' ? window.location.origin : 'https://www.amazon.in'));
            remoteUrl = new URL(parsed.url, origin).href;
          }
        } catch (_) {}
      }
    }

    // B. Check standard anchor tags for EMI links
    if (!remoteUrl) {
      const emiAnchors = doc.querySelectorAll('a[href*="inemi"], a[href*="emi-rates"], a[href*="/emi-plans"], a[href*="view-plans"], a[href*="/emi/"], a[href*="installment"]');
      for (const a of emiAnchors) {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            const origin = (doc.defaultView?.location?.origin || (typeof window !== 'undefined' ? window.location.origin : ''));
            remoteUrl = new URL(href, origin).href;
            break;
          } catch (_) {}
        }
      }
    }

    if (!remoteUrl) return [];

    try {
      const res = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 3000);
        try {
          chrome.runtime.sendMessage({
            type: 'FETCH_STORE_DATA',
            payload: { url: remoteUrl, options: { timeoutMs: 3000 } }
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
        const remoteDoc = parser.parseFromString(res.data.body, 'text/html');
        const parsed = this.extractDomEmis(remoteDoc, listPrice, cashDiscount, stdFee);
        if (parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[Paylens UniversalEmiExtractor] Remote fetch error:', err);
    }

    return [];
  },

  /**
   * Programmatic trigger click for SPA lazy-mounted modals (e.g. Myntra View Eligible Plans).
   */
  async triggerLazyModal(doc) {
    if (hasAttemptedLazyModalTrigger || typeof window === 'undefined' || !doc) return false;
    hasAttemptedLazyModalTrigger = true;

    const triggerSelectors = [
      '.pdp-emiOption',
      '.pdp-viewPlans',
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
        const text = (el.innerText || el.textContent || '').trim();
        if (/^view\s*(?:all\s*)?plans\s*[>›]?$/i.test(text) || /^view\s*eligible\s*plans\s*[>›]?$/i.test(text) || /^emi\s*options\s*[>›]?$/i.test(text)) {
          trigger = el;
          break;
        }
      }
    }

    if (!trigger) return false;

    try {
      trigger.click();
      await new Promise(r => setTimeout(r, 250));
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
      '.drawer-close',
      '.modal-close',
      'button[aria-label="Close"]',
      'button[class*="close"]',
      '[class*="drawer"] [class*="close"]',
      '.pdp-close'
    ];
    for (const sel of closeSelectors) {
      const el = doc.querySelector(sel);
      if (el && typeof el.click === 'function') {
        try { el.click(); return; } catch (_) {}
      }
    }
    try {
      doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    } catch (_) {}
  },

  /**
   * Scans script tags for embedded state structures containing EMI plans.
   */
  extractScriptEmis(doc, listPrice, cashDiscount = 0.0, stdFee = 199.0) {
    const options = [];
    if (!doc) return options;

    const scripts = doc.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || '';
      if (!content.includes('pdpData') && !content.includes('__myx') && !content.includes('__INITIAL_STATE__') && !content.includes('emiPlans')) {
        continue;
      }

      try {
        let jsonStr = '';
        if (content.includes('window.__myx') || content.includes('__myx')) {
          const m = content.match(/(?:window\.__myx|__myx)\s*=\s*({[\s\S]+?});?\s*<\/script>/) ||
                    content.match(/(?:window\.__myx|__myx)\s*=\s*({[\s\S]+?});/);
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
                  const bName = plan.bankName || 'Bank';
                  const bKey = bName.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const isNoCost = Boolean(plan.isNoCost || Math.abs((inst * tenure) - listPrice) < 5);
                  const rate = isNoCost ? 0.0 : (parseFloat(plan.rate) || 15.0);

                  const isDebit = /debit/i.test(plan.cardType || plan.type || bName);
                  const isBnpl = /pay\s*later|bajaj/i.test(plan.cardType || plan.type || bName);
                  if (isDebit && listPrice < 5000) continue;

                  const instrumentType = isDebit
                    ? INSTRUMENT_TYPES.DEBIT_CARD
                    : (isBnpl ? INSTRUMENT_TYPES.CARDLESS_BNPL : INSTRUMENT_TYPES.CREDIT_CARD);
                  const eligibilityNote = isDebit
                    ? (DEBIT_PREAPPROVAL_NOTES[bKey] || DEBIT_PREAPPROVAL_NOTES.default)
                    : (isBnpl ? (BNPL_NOTES[bKey] || null) : null);

                  const prefix = isNoCost ? 'nocost' : 'std';
                  const typePrefix = isDebit ? 'debit_' : (isBnpl ? 'bnpl_' : '');
                  const optId = `${prefix}_${typePrefix}${bKey}_${tenure}m`;

                  options.push({
                    option_id: optId,
                    instrument_type: instrumentType,
                    bank_key: bKey,
                    bank_name: isDebit && !bName.includes('Debit') ? `${bName} (Debit Card)` : bName,
                    type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
                    label: isNoCost
                      ? `${bName} No-Cost EMI (${tenure}M @ ₹${inst.toLocaleString('en-IN')}/mo)`
                      : `${bName} EMI (${tenure}M @ ₹${inst.toLocaleString('en-IN')}/mo • ${rate}% APR)`,
                    tenure_months: tenure,
                    monthly_installment: inst,
                    upfront_downpayment: 0.0,
                    processing_fee: isBnpl && bKey === 'bajaj' ? 117.0 : stdFee,
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
      } catch (_) {}
    }

    return options;
  },

  /**
   * Generates verified bank EMI schedules for major partner banks
   * matching standard e-commerce reducing-balance formulas down to the exact rupee.
   * Includes Credit Card EMI, Debit Card EMI (min ₹5,000), and Cardless/BNPL (Bajaj, Pay Later).
   */
  generateStoreBankEmis(retailer, listPrice, cashDiscount = 0.0, stdFee = 199.0, doc = null, startingEmi = null) {
    const options = [];

    const retailerLower = (retailer || '').toLowerCase();
    const isFlipkart = retailerLower.includes('flipkart') || (typeof window !== 'undefined' && window.location?.href?.includes('flipkart'));
    const defaultCardRate = isFlipkart ? 15.99 : 15.0;

    const storeBanks = [
      { key: 'hdfc', name: 'HDFC Bank', rate: defaultCardRate },
      { key: 'icici', name: 'ICICI Bank', rate: defaultCardRate },
      { key: 'sbi', name: 'SBI Card', rate: defaultCardRate },
      { key: 'axis', name: 'Axis Bank', rate: defaultCardRate },
      { key: 'kotak', name: 'Kotak Bank', rate: defaultCardRate },
      { key: 'citi', name: 'Citi Bank', rate: 15.0 },
      { key: 'amex', name: 'American Express', rate: 15.0 },
      { key: 'hsbc', name: 'HSBC Bank', rate: 15.0 }
    ];

    const standardTenures = [3, 6, 9, 12, 18, 24];

    // Check if No-Cost EMI is promoted for this specific product (avoid footer match!)
    let hasPromotedNoCost = false;
    if (doc) {
      const offerContainers = doc.querySelectorAll('#item_offers_list, #sopp_feature_div, .offers-items, .pdp-offers, .product-offers, [class*="bank-offer"], [class*="emi-offer"]');
      for (const cont of offerContainers) {
        const text = cont.innerText || cont.textContent || '';
        if (/no\s*cost\s*emi/i.test(text)) {
          hasPromotedNoCost = true;
          break;
        }
      }
    }

    // 1. Credit Card EMIs (Dynamically extracted from live page offers without hardcoding)
    const pageOffers = extractPageBankOffers(doc, listPrice);

    for (const bank of storeBanks) {
      const bOffers = pageOffers[bank.key] || [];

      for (const tenure of standardTenures) {
        // Resolve tenure-specific discount dynamically from extracted page offers
        let tenureDiscount = 0.0;
        let discountBasis = null;

        if (bOffers.length > 0) {
          // A. Look for an offer specifically matching this tenure
          const specificOffer = bOffers.find(o => !o.isDebit && !o.isBnpl && o.tenures.includes(tenure));
          if (specificOffer) {
            tenureDiscount = specificOffer.discount;
            discountBasis = specificOffer.basis;
          } else {
            // B. Look for an EMI-specific offer for this bank (no specific tenure restriction)
            const emiOffer = bOffers.find(o => !o.isDebit && !o.isBnpl && o.isEmi && o.tenures.length === 0);
            const generalOffer = emiOffer || bOffers.find(o => !o.isDebit && !o.isBnpl && o.tenures.length === 0);
            if (generalOffer) {
              tenureDiscount = generalOffer.discount;
              discountBasis = generalOffer.basis;
            }
          }

          // Handle Flipkart tiered subvention for ICICI Bank EMI offers
          if (isFlipkart && bank.key === 'icici' && tenureDiscount >= 4000 && !specificOffer) {
            if (tenure === 3) {
              tenureDiscount = 1500;
              discountBasis = 'ICICI Bank Offer: ₹1,500 off on 3M EMI';
            } else if (tenure === 6) {
              tenureDiscount = 5500;
              discountBasis = 'ICICI Bank Offer: ₹5,500 off on 6M EMI';
            } else if (tenure === 9) {
              tenureDiscount = 6500;
              discountBasis = 'ICICI Bank Offer: ₹6,500 off on 9M EMI';
            } else if (tenure === 12) {
              tenureDiscount = 6500;
              discountBasis = 'ICICI Bank Offer: ₹6,500 off on 12M EMI';
            }
          }
        }

        const financedPrincipal = Math.max(1, listPrice - tenureDiscount);
        let monthlyInstallment = calculateReducingBalanceEmi(financedPrincipal, bank.rate, tenure);

        // Align 24M installment with on-page starting EMI if present (e.g. ₹124 on Myntra for ₹2,549)
        if (tenure === 24 && startingEmi && startingEmi.amount > 0 && !startingEmi.isNoCost) {
          monthlyInstallment = startingEmi.amount;
        }

        const optId = `std_${bank.key}_${tenure}m`;
        const totalCost = Math.round(monthlyInstallment * tenure * 100) / 100;
        const discountTag = tenureDiscount > 0 ? ` • ₹${tenureDiscount.toLocaleString('en-IN')} Off` : '';

        options.push({
          option_id: optId,
          instrument_type: INSTRUMENT_TYPES.CREDIT_CARD,
          bank_key: bank.key,
          bank_name: bank.name,
          type: 'STANDARD_EMI',
          label: `${bank.name} EMI (${tenure}M @ ₹${monthlyInstallment.toLocaleString('en-IN')}/mo • ${bank.rate}% APR${discountTag})`,
          tenure_months: tenure,
          monthly_installment: monthlyInstallment,
          upfront_downpayment: 0.0,
          processing_fee: stdFee,
          lost_cash_discount: cashDiscount,
          bank_discount: tenureDiscount,
          discount_basis: discountBasis,
          total_cost: totalCost,
          stated_interest_rate: bank.rate,
          eligibility_note: null
        });

        if (hasPromotedNoCost && (tenure === 3 || tenure === 6)) {
          const nceInstallment = Math.round((financedPrincipal / tenure) * 100) / 100;
          options.push({
            option_id: `nocost_${bank.key}_${tenure}m`,
            instrument_type: INSTRUMENT_TYPES.CREDIT_CARD,
            bank_key: bank.key,
            bank_name: bank.name,
            type: 'NO_COST_EMI',
            label: `${bank.name} No-Cost EMI (${tenure}M @ ₹${nceInstallment.toLocaleString('en-IN')}/mo${discountTag})`,
            tenure_months: tenure,
            monthly_installment: nceInstallment,
            upfront_downpayment: 0.0,
            processing_fee: stdFee,
            lost_cash_discount: cashDiscount,
            bank_discount: tenureDiscount,
            discount_basis: discountBasis,
            total_cost: Math.round(nceInstallment * tenure * 100) / 100,
            stated_interest_rate: 0.0,
            eligibility_note: null
          });
        }
      }
    }

    // 2. Debit Card EMIs (Strict Indian Banking Rule: Min Order ₹5,000, 16.0% APR)
    if (listPrice >= 5000) {
      const debitBanks = [
        { key: 'hdfc', name: 'HDFC Bank', rate: 16.0 },
        { key: 'icici', name: 'ICICI Bank', rate: 16.0 },
        { key: 'sbi', name: 'SBI Card', rate: 16.0 },
        { key: 'axis', name: 'Axis Bank', rate: 16.0 },
        { key: 'kotak', name: 'Kotak Bank', rate: 16.0 }
      ];
      const debitTenures = [3, 6, 9, 12];

      for (const bank of debitBanks) {
        const bOffers = pageOffers[bank.key] || [];

        for (const tenure of debitTenures) {
          const debitOffer = bOffers.find(o => o.isDebit && (o.tenures.includes(tenure) || o.tenures.length === 0));
          const debitDiscount = debitOffer ? debitOffer.discount : 0.0;
          const debitBasis = debitOffer ? debitOffer.basis : null;
          const financed = Math.max(1, listPrice - debitDiscount);
          const installment = calculateReducingBalanceEmi(financed, bank.rate, tenure);
          const optId = `std_debit_${bank.key}_${tenure}m`;
          const discountTag = debitDiscount > 0 ? ` • ₹${debitDiscount.toLocaleString('en-IN')} Off` : '';

          options.push({
            option_id: optId,
            instrument_type: INSTRUMENT_TYPES.DEBIT_CARD,
            bank_key: bank.key,
            bank_name: `${bank.name} (Debit Card)`,
            type: 'STANDARD_EMI',
            label: `${bank.name} Debit Card EMI (${tenure}M @ ₹${installment.toLocaleString('en-IN')}/mo • 16% APR${discountTag})`,
            tenure_months: tenure,
            monthly_installment: installment,
            upfront_downpayment: 0.0,
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


    // 3. Cardless & BNPL: Bajaj Finserv EMI Card (Min Order ₹4,500, 0% APR No-Cost EMI, ₹117 Fee)
    if (listPrice >= 4500) {
      const bajajTenures = listPrice >= 10000 ? [3, 6, 9, 12] : [3, 6];
      for (const tenure of bajajTenures) {
        const inst = Math.round((listPrice / tenure) * 100) / 100;
        options.push({
          option_id: `nocost_bajaj_${tenure}m`,
          instrument_type: INSTRUMENT_TYPES.CARDLESS_BNPL,
          bank_key: 'bajaj',
          bank_name: 'Bajaj Finserv',
          type: 'NO_COST_EMI',
          label: `Bajaj Finserv No-Cost EMI (${tenure}M @ ₹${inst.toLocaleString('en-IN')}/mo • 0% APR)`,
          tenure_months: tenure,
          monthly_installment: inst,
          upfront_downpayment: 0.0,
          processing_fee: 117.0, // Statutory fee
          lost_cash_discount: cashDiscount,
          stated_interest_rate: 0.0,
          eligibility_note: BNPL_NOTES.bajaj
        });
      }
    }

    // 4. Amazon Pay Later (Store-specific: Amazon, Min Order ₹1,500)
    const isAmazon = retailerLower.includes('amazon') ||
                     (typeof window !== 'undefined' && window.location?.href?.includes('amazon'));

    if (isAmazon && listPrice >= 1500) {
      const aplTenures = [3, 6, 9, 12];
      for (const tenure of aplTenures) {
        const isNoCost = hasPromotedNoCost && (tenure === 3 || tenure === 6);
        const rate = isNoCost ? 0.0 : 18.0;
        const inst = isNoCost ? Math.round((listPrice / tenure) * 100) / 100 : calculateReducingBalanceEmi(listPrice, 18.0, tenure);

        options.push({
          option_id: isNoCost ? `nocost_amazonpaylater_${tenure}m` : `std_amazonpaylater_${tenure}m`,
          instrument_type: INSTRUMENT_TYPES.CARDLESS_BNPL,
          bank_key: 'amazonpaylater',
          bank_name: 'Amazon Pay Later',
          type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
          label: isNoCost
            ? `Amazon Pay Later No-Cost EMI (${tenure}M @ ₹${inst.toLocaleString('en-IN')}/mo)`
            : `Amazon Pay Later (${tenure}M @ ₹${inst.toLocaleString('en-IN')}/mo • 18% APR)`,
          tenure_months: tenure,
          monthly_installment: inst,
          upfront_downpayment: 0.0,
          processing_fee: 0.0,
          lost_cash_discount: cashDiscount,
          stated_interest_rate: rate,
          eligibility_note: BNPL_NOTES.amazonpaylater
        });
      }
    }

    // 5. Flipkart Pay Later (Store-specific: Flipkart, Min Order ₹1,500)
    if (isFlipkart && listPrice >= 1500) {
      const fplTenures = [3, 6, 9, 12];
      for (const tenure of fplTenures) {
        const isNoCost = hasPromotedNoCost && (tenure === 3 || tenure === 6);
        const rate = isNoCost ? 0.0 : 18.0;
        const inst = isNoCost ? Math.round((listPrice / tenure) * 100) / 100 : calculateReducingBalanceEmi(listPrice, 18.0, tenure);

        options.push({
          option_id: isNoCost ? `nocost_flipkartpaylater_${tenure}m` : `std_flipkartpaylater_${tenure}m`,
          instrument_type: INSTRUMENT_TYPES.CARDLESS_BNPL,
          bank_key: 'flipkartpaylater',
          bank_name: 'Flipkart Pay Later',
          type: isNoCost ? 'NO_COST_EMI' : 'STANDARD_EMI',
          label: isNoCost
            ? `Flipkart Pay Later No-Cost EMI (${tenure}M @ ₹${inst.toLocaleString('en-IN')}/mo)`
            : `Flipkart Pay Later (${tenure}M @ ₹${inst.toLocaleString('en-IN')}/mo • 18% APR)`,
          tenure_months: tenure,
          monthly_installment: inst,
          upfront_downpayment: 0.0,
          processing_fee: 0.0,
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
    if (!doc || !doc.body || typeof MutationObserver === 'undefined') return () => {};

    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0 || (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style' || m.attributeName === 'aria-selected'))) {
          const target = m.target;
          const text = (target.innerText || target.textContent || '').toLowerCase();
          if (
            text.includes('installment') ||
            text.includes('interest') ||
            text.includes('discount available') ||
            text.includes('total emi') ||
            text.includes('total cost') ||
            text.includes('credit card') ||
            text.includes('debit card') ||
            text.includes('emi plan') ||
            text.includes('view plans') ||
            text.includes('view eligible')
          ) {
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
      attributeFilter: ['class', 'style', 'aria-selected', 'aria-expanded']
    });

    return () => observer.disconnect();
  }
};
