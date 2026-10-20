/**
 * tests/test_storefront_adapters.mjs
 * Unit test suite for Croma, Reliance Digital, and Tata CLiQ storefront adapters.
 */

import assert from 'node:assert';
import { getAdapter } from '../extension/content/adapters/index.js';
import { CromaAdapter } from '../extension/content/adapters/croma.js';
import { RelianceDigitalAdapter } from '../extension/content/adapters/reliance_digital.js';
import { TataCliqAdapter } from '../extension/content/adapters/tata_cliq.js';

console.log('--- TEST 1: Adapter URL Matching & Resolution ---');
{
  const cromaUrl = 'https://www.croma.com/apple-iphone-15-128gb-black/p/300652';
  const rdUrl = 'https://www.reliancedigital.in/apple-iphone-15-128-gb-black/p/493838421';
  const tataUrl = 'https://www.tatacliq.com/apple-iphone-15-128-gb-black/p-mp000000020138402';
  const genericUrl = 'https://www.myntra.com/shoes/nike/nike-air-max/123456/buy';

  assert.strictEqual(getAdapter(cromaUrl)?.id, 'croma', 'Croma URL should resolve CromaAdapter');
  assert.strictEqual(getAdapter(rdUrl)?.id, 'reliance_digital', 'Reliance Digital URL should resolve RelianceDigitalAdapter');
  assert.strictEqual(getAdapter(tataUrl)?.id, 'tata_cliq', 'Tata CLiQ URL should resolve TataCliqAdapter');
  assert.strictEqual(getAdapter(genericUrl)?.id, 'generic', 'Generic e-commerce URL should resolve GenericAdapter');
  console.log('✓ TEST 1 PASSED: Storefront URLs correctly resolve to dedicated adapters.');
}

console.log('--- TEST 2: Croma Extraction with Debit EMI & Bajaj Finserv ---');
{
  const mockCromaDoc = {
    defaultView: { location: { href: 'https://www.croma.com/apple-iphone-15-128gb-black/p/300652' } },
    title: 'Apple iPhone 15 (128GB, Black) | Croma',
    querySelector: (sel) => {
      if (sel.includes('.pd-title') || sel.includes('h1')) {
        return { innerText: 'Apple iPhone 15 (128GB, Black)' };
      }
      if (sel.includes('amount') || sel.includes('new-price')) {
        return { innerText: '₹69,999' };
      }
      if (sel.includes('.breadcrumb')) {
        return { innerText: 'Home > Smartphones > Apple' };
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('pdp-offers-list') || sel.includes('bank-offers')) {
        return [{ innerText: 'Instant Discount of ₹3,000 on HDFC Bank Credit Card.' }];
      }
      return [];
    },
    body: { innerText: 'Apple iPhone 15 (128GB, Black) ₹69,999. Instant Discount of ₹3,000.' }
  };

  const listing = await CromaAdapter.extract(mockCromaDoc);
  assert.ok(listing, 'Croma listing should be extracted');
  assert.strictEqual(listing.product_id, '300652', 'PID should be extracted from /p/300652');
  assert.strictEqual(listing.title, 'Apple iPhone 15 (128GB, Black)');
  assert.strictEqual(listing.retailer, 'Croma');
  assert.strictEqual(listing.upfront_cash_price, 69999);
  assert.strictEqual(listing.cash_discount, 3000);
  assert.strictEqual(listing.effective_cash_price, 66999);

  // Check options
  const cashOpt = listing.payment_options.find(o => o.type === 'CASH');
  assert.ok(cashOpt, 'Cash Full option should exist');
  assert.strictEqual(cashOpt.monthly_installment, 66999);

  // Check Debit Card EMI (since price 69,999 >= 5,000)
  const debitOpt = listing.payment_options.find(o => o.instrument_type === 'DEBIT_CARD' && o.bank_key === 'hdfc');
  assert.ok(debitOpt, 'Debit Card EMI should exist for Croma item >= ₹5,000');
  assert.strictEqual(debitOpt.stated_interest_rate, 16.0);
  assert.ok(debitOpt.eligibility_note.includes('MYHDFC'));

  // Check Bajaj Finserv (price 69,999 >= 4,500)
  const bajajOpt = listing.payment_options.find(o => o.bank_key === 'bajaj');
  assert.ok(bajajOpt, 'Bajaj Finserv No Cost EMI should exist');
  assert.strictEqual(bajajOpt.stated_interest_rate, 0.0);
  assert.strictEqual(bajajOpt.processing_fee, 117);

  console.log('✓ TEST 2 PASSED: CromaAdapter extracts PID, price, discount, Debit Card EMI, and Bajaj Finserv.');
}

console.log('--- TEST 3: Reliance Digital Extraction ---');
{
  const mockRdDoc = {
    defaultView: { location: { href: 'https://www.reliancedigital.in/sony-bravia-108-cm-4k-tv/p/493838421' } },
    title: 'Sony Bravia 108 cm (43 inch) 4K Ultra HD Smart LED Google TV - Reliance Digital',
    querySelector: (sel) => {
      if (sel.includes('.pdp__title') || sel.includes('h1')) {
        return { innerText: 'Sony Bravia 108 cm 4K Ultra HD Smart LED Google TV' };
      }
      if (sel.includes('pdp__offerPrice') || sel.includes('offerPrice')) {
        return { innerText: '₹41,990' };
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('pdp__offers') || sel.includes('bank-offers')) {
        return [{ innerText: 'Flat ₹2,000 Instant Discount on ICICI Bank Cards.' }];
      }
      return [];
    },
    body: { innerText: 'Sony Bravia 4K TV ₹41,990. Flat ₹2,000 Instant Discount.' }
  };

  const listing = await RelianceDigitalAdapter.extract(mockRdDoc);
  assert.ok(listing, 'Reliance Digital listing should be extracted');
  assert.strictEqual(listing.product_id, '493838421');
  assert.strictEqual(listing.retailer, 'Reliance Digital');
  assert.strictEqual(listing.upfront_cash_price, 41990);
  assert.strictEqual(listing.cash_discount, 2000);
  assert.strictEqual(listing.effective_cash_price, 39990);

  const debitOpt = listing.payment_options.find(o => o.instrument_type === 'DEBIT_CARD');
  assert.ok(debitOpt, 'Debit Card EMI should be generated');

  const bajajOpt = listing.payment_options.find(o => o.bank_key === 'bajaj');
  assert.ok(bajajOpt, 'Bajaj Finserv EMI Card should be generated');

  console.log('✓ TEST 3 PASSED: RelianceDigitalAdapter extracts product, price, discount, and financing.');
}

console.log('--- TEST 4: Tata CLiQ Extraction ---');
{
  const mockTataDoc = {
    defaultView: { location: { href: 'https://www.tatacliq.com/apple-macbook-air-m2/p-mp000000018921832' } },
    title: 'Apple MacBook Air M2 (8GB RAM, 256GB SSD) | Tata CLiQ',
    querySelector: (sel) => {
      if (sel.includes('ProductDescriptionPage__title') || sel.includes('h1')) {
        return { innerText: 'Apple MacBook Air M2 (8GB RAM, 256GB SSD)' };
      }
      if (sel.includes('ProductDescriptionPage__price') || sel.includes('Price__actual')) {
        return { innerText: '₹84,990' };
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('ProductDescriptionPage__offersList')) {
        return [{ innerText: 'Instant Discount of ₹5,000 on Tata Neu HDFC Bank Credit Card.' }];
      }
      return [];
    },
    body: { innerText: 'Apple MacBook Air M2 ₹84,990. Instant Discount of ₹5,000.' }
  };

  const listing = await TataCliqAdapter.extract(mockTataDoc);
  assert.ok(listing, 'Tata CLiQ listing should be extracted');
  assert.strictEqual(listing.product_id, '000000018921832');
  assert.strictEqual(listing.retailer, 'Tata CLiQ');
  assert.strictEqual(listing.upfront_cash_price, 84990);
  assert.strictEqual(listing.cash_discount, 5000);
  assert.strictEqual(listing.effective_cash_price, 79990);

  const debitOpt = listing.payment_options.find(o => o.instrument_type === 'DEBIT_CARD' && o.bank_key === 'icici');
  assert.ok(debitOpt, 'ICICI Debit Card plan should exist');
  assert.strictEqual(debitOpt.stated_interest_rate, 16.0);
  assert.ok(debitOpt.eligibility_note.includes('DCEMI'));

  console.log('✓ TEST 4 PASSED: TataCliqAdapter extracts listing with instant discount and debit plans.');
}

console.log('--- ALL STOREFRONT ADAPTER UNIT TESTS PASSED ---');
