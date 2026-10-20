/**
 * tests/test_emi_extraction.mjs
 * Unit test suite for Universal Real Bank EMI Extraction Engine.
 */

import assert from 'node:assert';
import {
  calculateReducingBalanceEmi,
  matchBank,
  extractListedStartingEmi,
  UniversalEmiExtractor,
  KNOWN_BANKS
} from '../extension/content/emi_extractor.js';

console.log('--- TEST 1: Reducing balance calculation matches store rupee rounding ---');
{
  const principal = 2549;
  const rate = 15.0;

  const emi3 = calculateReducingBalanceEmi(principal, rate, 3);
  const emi6 = calculateReducingBalanceEmi(principal, rate, 6);
  const emi9 = calculateReducingBalanceEmi(principal, rate, 9);
  const emi12 = calculateReducingBalanceEmi(principal, rate, 12);
  const emi18 = calculateReducingBalanceEmi(principal, rate, 18);
  const emi24 = calculateReducingBalanceEmi(principal, rate, 24);

  console.log(`P = ₹2,549 @ 15% -> 3M: ₹${emi3}, 6M: ₹${emi6}, 9M: ₹${emi9}, 12M: ₹${emi12}, 18M: ₹${emi18}, 24M: ₹${emi24}`);

  assert.strictEqual(emi3, 871, '3M EMI should be 871');
  assert.strictEqual(emi6, 444, '6M EMI should be 444');
  assert.strictEqual(emi9, 301, '9M EMI should be 301');
  assert.strictEqual(emi12, 230, '12M EMI should be 230');
  assert.strictEqual(emi18, 159, '18M EMI should be 159');
  assert.strictEqual(emi24, 124, '24M EMI should be 124');
  console.log('✓ TEST 1 PASSED: Exact rupee matches for Myntra/Amazon installment tables.');
}

console.log('--- TEST 2: Bank matching from text ---');
{
  assert.strictEqual(matchBank('HDFC Bank Credit Card')?.key, 'hdfc');
  assert.strictEqual(matchBank('ICICI NetBanking / Card')?.key, 'icici');
  assert.strictEqual(matchBank('State Bank of India')?.key, 'sbi');
  assert.strictEqual(matchBank('Flipkart Axis Bank Credit Card')?.key, 'axis');
  assert.strictEqual(matchBank('Kotak Mahindra Bank')?.key, 'kotak');
  assert.strictEqual(matchBank('American Express Card')?.key, 'amex');
  assert.strictEqual(matchBank('Unknown Random Bank'), null);
  console.log('✓ TEST 2 PASSED: Bank names and aliases match correctly.');
}

console.log('--- TEST 3: Starting EMI extraction from PDP text ---');
{
  // Mock doc with .pdp-emiOption element
  const mockDoc = {
    querySelector: (sel) => {
      if (sel === '.pdp-emiOption') {
        return { innerText: 'EMI starting from ₹124/mo View Eligible Plans' };
      }
      return null;
    },
    body: { innerText: 'Some product page' }
  };

  const startingEmi = extractListedStartingEmi(mockDoc);
  assert.ok(startingEmi, 'Starting EMI should be extracted');
  assert.strictEqual(startingEmi.amount, 124, 'Starting EMI amount should be 124');
  assert.strictEqual(startingEmi.isNoCost, false, 'Starting EMI should not be flagged as No-Cost');
  console.log('✓ TEST 3 PASSED: Starting EMI extracted accurately before modal click.');
}

console.log('--- TEST 4: Verified Store Bank EMI generation does NOT invent fake No-Cost EMI ---');
{
  // When product offers have NO "No Cost EMI"
  const mockDocNoOffer = {
    querySelectorAll: () => [],
    body: { innerText: 'Standard terms and conditions apply. No Cost EMI disclaimer in site footer.' }
  };

  const startingEmi = { amount: 124, isNoCost: false };
  const emis = UniversalEmiExtractor.generateStoreBankEmis('Myntra', 2549, 0, 199, mockDocNoOffer, startingEmi);

  const noCostOptions = emis.filter(o => o.type === 'NO_COST_EMI');
  assert.strictEqual(noCostOptions.length, 0, 'No fake No-Cost EMI should be created when not in product offers');

  const hdfc3m = emis.find(o => o.option_id === 'std_hdfc_3m');
  assert.ok(hdfc3m, 'HDFC 3M plan should exist');
  assert.strictEqual(hdfc3m.monthly_installment, 871, 'HDFC 3M should be ₹871');
  assert.strictEqual(hdfc3m.bank_key, 'hdfc');
  assert.strictEqual(hdfc3m.bank_name, 'HDFC Bank');

  const hdfc24m = emis.find(o => o.option_id === 'std_hdfc_24m');
  assert.ok(hdfc24m, 'HDFC 24M plan should exist');
  assert.strictEqual(hdfc24m.monthly_installment, 124, 'HDFC 24M should match listed starting EMI ₹124');

  console.log('✓ TEST 4 PASSED: Standard plans generated accurately without fake No-Cost EMI.');
}

console.log('--- TEST 5: Verified Store Bank EMI generation includes No-Cost EMI when genuine in product offers ---');
{
  const mockDocWithOffer = {
    querySelectorAll: (sel) => {
      if (sel.includes('item_offers_list')) {
        return [{ innerText: 'Special Bank Offer: No Cost EMI available on HDFC Bank and ICICI Bank cards.' }];
      }
      return [];
    },
    body: { innerText: 'Product details' }
  };

  const emis = UniversalEmiExtractor.generateStoreBankEmis('Amazon', 60000, 0, 199, mockDocWithOffer);
  const noCostOptions = emis.filter(o => o.type === 'NO_COST_EMI');
  assert.ok(noCostOptions.length > 0, 'No-Cost EMI options should exist when genuine offer is present');

  const hdfc3mNce = emis.find(o => o.option_id === 'nocost_hdfc_3m');
  assert.ok(hdfc3mNce, 'HDFC 3M No-Cost should exist');
  assert.strictEqual(hdfc3mNce.monthly_installment, 20000, '60000 / 3 should be 20000');
  assert.strictEqual(hdfc3mNce.stated_interest_rate, 0);

  console.log('✓ TEST 5 PASSED: Genuine No-Cost EMI options generated when offer is present.');
}

console.log('--- TEST 6: Debit Card EMI strictly excluded when listPrice < ₹5,000 ---');
{
  const emis = UniversalEmiExtractor.generateStoreBankEmis('Myntra', 2549, 0, 199, null);
  const debitPlans = emis.filter(o => o.instrument_type === 'DEBIT_CARD' || o.option_id.includes('debit'));
  assert.strictEqual(debitPlans.length, 0, 'Debit card EMI plans must NOT be generated for transactions < ₹5,000');
  console.log('✓ TEST 6 PASSED: Debit Card EMI strictly excluded under ₹5,000 threshold.');
}

console.log('--- TEST 7: Debit Card EMI included when listPrice >= ₹5,000 with 16% APR and pre-approval guidance ---');
{
  const price = 24000;
  const emis = UniversalEmiExtractor.generateStoreBankEmis('Amazon', price, 0, 199, null);
  const debitPlans = emis.filter(o => o.instrument_type === 'DEBIT_CARD');
  assert.ok(debitPlans.length > 0, 'Debit card EMI plans should be generated for transactions >= ₹5,000');

  const hdfcDebit3m = debitPlans.find(o => o.option_id === 'std_debit_hdfc_3m');
  assert.ok(hdfcDebit3m, 'HDFC Debit Card 3M plan should exist');
  assert.strictEqual(hdfcDebit3m.stated_interest_rate, 16.0, 'Debit EMI rate should be 16% APR');
  assert.strictEqual(hdfcDebit3m.instrument_type, 'DEBIT_CARD');
  assert.strictEqual(hdfcDebit3m.bank_name, 'HDFC Bank (Debit Card)');
  assert.ok(hdfcDebit3m.eligibility_note.includes('MYHDFC'), 'Pre-approval SMS note should be populated');

  // Verify reducing balance calculation at 16%:
  // P = 24,000, r = 16% / 12 = 1.333%, n = 3 -> EMI = 24000 * 0.013333 * (1.013333)^3 / ((1.013333)^3 - 1) = 8214
  assert.strictEqual(hdfcDebit3m.monthly_installment, 8214, 'Monthly installment should match 16% reducing balance formula');
  console.log('✓ TEST 7 PASSED: Debit Card EMI generated at 16% APR with pre-approval note.');
}

console.log('--- TEST 8: Bajaj Finserv 0% APR No-Cost EMI generated on items >= ₹4,500 with ₹117 fee ---');
{
  const emis = UniversalEmiExtractor.generateStoreBankEmis('Amazon', 12000, 0, 199, null);
  const bajajPlans = emis.filter(o => o.bank_key === 'bajaj');
  assert.ok(bajajPlans.length > 0, 'Bajaj Finserv plans should exist for items >= ₹4,500');

  const bajaj3m = bajajPlans.find(o => o.option_id === 'nocost_bajaj_3m');
  assert.ok(bajaj3m, 'Bajaj 3M plan should exist');
  assert.strictEqual(bajaj3m.stated_interest_rate, 0.0, 'Bajaj EMI must be 0% APR');
  assert.strictEqual(bajaj3m.type, 'NO_COST_EMI');
  assert.strictEqual(bajaj3m.monthly_installment, 4000, '12000 / 3 = 4000');
  assert.strictEqual(bajaj3m.processing_fee, 117.0, 'Bajaj processing fee should be ₹117');
  assert.ok(bajaj3m.eligibility_note.includes('active Bajaj Finserv'), 'Bajaj eligibility note present');
  console.log('✓ TEST 8 PASSED: Bajaj Finserv 0% APR No-Cost EMI generated accurately.');
}

console.log('--- TEST 9: Amazon Pay Later generated on Amazon for items >= ₹1,500 ---');
{
  const emis = UniversalEmiExtractor.generateStoreBankEmis('Amazon', 9000, 0, 199, null);
  const aplPlans = emis.filter(o => o.bank_key === 'amazonpaylater');
  assert.ok(aplPlans.length > 0, 'Amazon Pay Later plans should exist on Amazon');

  const apl3m = aplPlans.find(o => o.option_id === 'std_amazonpaylater_3m');
  assert.ok(apl3m, 'Amazon Pay Later 3M should exist');
  assert.strictEqual(apl3m.instrument_type, 'CARDLESS_BNPL');
  assert.strictEqual(apl3m.processing_fee, 0.0, 'Amazon Pay Later has 0 processing fee');
  assert.ok(apl3m.eligibility_note.includes('credit line up to ₹60,000'), 'Amazon Pay Later note present');
  console.log('✓ TEST 9 PASSED: Amazon Pay Later plans generated on Amazon.');
}

console.log('--- TEST 10: DOM / Table Row parsing for Debit Card & BNPL rows ---');
{
  const debitRow = {
    innerText: 'HDFC Bank Debit Card EMI 6 months ₹4,213 16% p.a.'
  };
  const parsedDebit = UniversalEmiExtractor.parseRowToOption(debitRow, null, 24000, 0, 199);
  assert.ok(parsedDebit, 'Debit row should be parsed');
  assert.strictEqual(parsedDebit.instrument_type, 'DEBIT_CARD');
  assert.strictEqual(parsedDebit.tenure_months, 6);
  assert.strictEqual(parsedDebit.monthly_installment, 4213);
  assert.strictEqual(parsedDebit.stated_interest_rate, 16);
  assert.ok(parsedDebit.eligibility_note.includes('MYHDFC'));

  // Debit row rejected if price < 5000
  const cheapDebit = UniversalEmiExtractor.parseRowToOption(debitRow, null, 3000, 0, 199);
  assert.strictEqual(cheapDebit, null, 'Debit row must be rejected when price < 5000');

  // BNPL Row
  const bajajRow = {
    innerText: 'Bajaj Finserv EMI 3 months ₹8,000 0% No Cost EMI'
  };
  const parsedBajaj = UniversalEmiExtractor.parseRowToOption(bajajRow, null, 24000, 0, 199);
  assert.ok(parsedBajaj, 'Bajaj row should be parsed');
  assert.strictEqual(parsedBajaj.instrument_type, 'CARDLESS_BNPL');
  assert.strictEqual(parsedBajaj.type, 'NO_COST_EMI');
  assert.strictEqual(parsedBajaj.processing_fee, 117);
  console.log('✓ TEST 10 PASSED: DOM rows for Debit and BNPL parsed accurately.');
}

console.log('--- TEST 11: Real Flipkart ICICI Bank Modal DOM parsing matches exact screenshot ---');
{
  const mockFlipkartModal = {
    innerText: 'ICICI Bank Credit Card Installment Interest',
    querySelectorAll: (sel) => {
      if (sel.includes('header') || sel.includes('h1') || sel.includes('h2') || sel.includes('h3')) {
        return [{ innerText: 'ICICI Bank' }];
      }
      if (sel.includes('radio') || sel.includes('row') || sel.includes('item') || sel.includes('label')) {
        return [
          {
            innerText: '₹14,756 for 6 months\n15.99% p.a.\n₹5,500 discount available\nPrice (1 item) ₹90,049\nInterest amount (@16% interest) ₹3,987\nBank offer -₹5,500\nTotal Cost ₹88,536\nTotal EMI ₹88,536\nApply'
          },
          {
            innerText: '₹9,913 for 9 months\n15.99% p.a.\n₹6,500 discount available'
          },
          {
            innerText: '₹30,306 for 3 months\n15.99% p.a.\n₹1,500 discount available'
          },
          {
            innerText: '₹7,580 for 12 months\n15.99% p.a.\n₹6,500 discount available'
          }
        ];
      }
      return [];
    }
  };

  const parsed = UniversalEmiExtractor.parseTableRowsFromContainer(mockFlipkartModal, 90049, 0, 199);
  assert.strictEqual(parsed.length, 4, 'Should extract all 4 Flipkart tenure options');

  const opt6m = parsed.find(o => o.tenure_months === 6);
  assert.ok(opt6m, '6 Months option should exist');
  assert.strictEqual(opt6m.bank_key, 'icici', 'Bank should be ICICI');
  assert.strictEqual(opt6m.monthly_installment, 14756, 'Installment must match exact Flipkart rupee ₹14,756');
  assert.strictEqual(opt6m.stated_interest_rate, 15.99, 'APR must match exact 15.99%');
  assert.strictEqual(opt6m.bank_discount, 5500, 'Bank discount should be ₹5,500');
  assert.strictEqual(opt6m.total_cost, 88536, 'Total cost should be ₹88,536');

  const opt9m = parsed.find(o => o.tenure_months === 9);
  assert.strictEqual(opt9m.monthly_installment, 9913, '9M installment must be ₹9,913');
  assert.strictEqual(opt9m.bank_discount, 6500, '9M discount should be ₹6,500');

  const opt3m = parsed.find(o => o.tenure_months === 3);
  assert.strictEqual(opt3m.monthly_installment, 30306, '3M installment must be ₹30,306');
  assert.strictEqual(opt3m.bank_discount, 1500, '3M discount should be ₹1,500');

  const opt12m = parsed.find(o => o.tenure_months === 12);
  assert.strictEqual(opt12m.monthly_installment, 7580, '12M installment must be ₹7,580');
  assert.strictEqual(opt12m.bank_discount, 6500, '12M discount should be ₹6,500');

  console.log('✓ TEST 11 PASSED: Flipkart ICICI Bank modal parsed with 100% exact rupee precision.');
}

console.log('--- TEST 12: Tenure discount reducing balance math verification ---');
{
  const basePrice = 90049;
  const rate = 15.99;

  // 3M: Discount 1,500 -> Principal 88,549
  const emi3 = calculateReducingBalanceEmi(basePrice - 1500, rate, 3);
  assert.strictEqual(emi3, 30306, '3M EMI with ₹1,500 discount must be 30,306');

  // 6M: Discount 5,500 -> Principal 84,549
  const emi6 = calculateReducingBalanceEmi(basePrice - 5500, rate, 6);
  assert.strictEqual(emi6, 14756, '6M EMI with ₹5,500 discount must be 14,756');

  // 9M: Discount 6,500 -> Principal 83,549
  const emi9 = calculateReducingBalanceEmi(basePrice - 6500, rate, 9);
  assert.strictEqual(emi9, 9913, '9M EMI with ₹6,500 discount must be 9,913');

  // 12M: Discount 6,500 -> Principal 83,549
  const emi12 = calculateReducingBalanceEmi(basePrice - 6500, rate, 12);
  assert.strictEqual(emi12, 7580, '12M EMI with ₹6,500 discount must be 7,580');

  console.log('✓ TEST 12 PASSED: Mathematical reducing-balance subvention matches Flipkart to the exact rupee.');
}

console.log('--- TEST 13: Closed-modal PDP bank offer subvention matches Flipkart to the rupee ---');
{
  const mockPdpDoc = {
    body: {
      innerText: 'Flipkart Product. Available offers: Bank Offer Flat ₹5,500 off on ICICI Bank Credit Card EMI Transactions'
    },
    querySelectorAll: () => []
  };

  const emis = UniversalEmiExtractor.generateStoreBankEmis('Flipkart', 90049, 0, 199, mockPdpDoc);
  const icici6m = emis.find(o => o.option_id === 'std_icici_6m');
  assert.ok(icici6m, 'ICICI 6M option should exist');
  assert.strictEqual(icici6m.monthly_installment, 14756, '6M EMI without modal open must be ₹14,756');
  assert.strictEqual(icici6m.stated_interest_rate, 15.99, 'APR should be 15.99%');
  assert.strictEqual(icici6m.bank_discount, 5500, 'Discount should be ₹5,500');

  const icici9m = emis.find(o => o.option_id === 'std_icici_9m');
  assert.strictEqual(icici9m.monthly_installment, 9913, '9M EMI without modal open must be ₹9,913');

  const icici3m = emis.find(o => o.option_id === 'std_icici_3m');
  assert.strictEqual(icici3m.monthly_installment, 30306, '3M EMI without modal open must be ₹30,306');

  const icici12m = emis.find(o => o.option_id === 'std_icici_12m');
  assert.strictEqual(icici12m.monthly_installment, 7580, '12M EMI without modal open must be ₹7,580');

  console.log('✓ TEST 13 PASSED: Even when modal is closed, PDP ICICI Bank EMI matches Flipkart exactly.');
}

console.log('--- ALL EMI EXTRACTION UNIT TESTS PASSED ---');
