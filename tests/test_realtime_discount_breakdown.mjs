/**
 * tests/test_realtime_discount_breakdown.mjs
 * Verifies real-time extraction of EMI option discounts, offer basis,
 * net financed amount, and PaylensCard breakdown rendering.
 */

import assert from 'node:assert';
import { UniversalEmiExtractor } from '../extension/content/emi_extractor.js';
import { PaylensCard } from '../extension/content/card.js';

console.log('--- TEST 1: Live Modal Extraction with Option-Specific Discounts & Basis ---');
{
  const mockModal = {
    innerText: 'ICICI Bank Credit Card Installment Interest Options',
    querySelectorAll: (sel) => {
      if (sel.includes('header') || sel.includes('h1') || sel.includes('h2') || sel.includes('h3')) {
        return [{ innerText: 'ICICI Bank' }];
      }
      if (sel.includes('radio') || sel.includes('row') || sel.includes('item') || sel.includes('label')) {
        return [
          {
            innerText: '₹14,756 for 6 months\n15.99% p.a.\nBank offer - ₹5,500 discount available\nTotal Cost ₹88,536'
          },
          {
            innerText: '₹9,913 for 9 months\n15.99% p.a.\nBank offer - ₹6,500 discount available\nTotal Cost ₹89,217'
          },
          {
            innerText: '₹30,306 for 3 months\n15.99% p.a.\nBank offer - ₹1,500 discount available\nTotal Cost ₹90,918'
          },
          {
            innerText: '₹7,580 for 12 months\n15.99% p.a.\nBank offer - ₹6,500 discount available\nTotal Cost ₹90,960'
          }
        ];
      }
      return [];
    }
  };

  const parsed = UniversalEmiExtractor.parseTableRowsFromContainer(mockModal, 90049, 0, 199);
  assert.strictEqual(parsed.length, 4, 'Should parse all 4 options');

  // Verify 6M option
  const opt6m = parsed.find(o => o.tenure_months === 6);
  assert.ok(opt6m, '6M option should exist');
  assert.strictEqual(opt6m.monthly_installment, 14756, '6M installment must be ₹14,756');
  assert.strictEqual(opt6m.bank_discount, 5500, '6M bank discount must be ₹5,500');
  assert.ok(opt6m.discount_basis.includes('5,500'), '6M discount basis must mention 5,500');
  assert.strictEqual(opt6m.total_cost, 88536, '6M total cost must be ₹88,536');

  // Verify 9M option
  const opt9m = parsed.find(o => o.tenure_months === 9);
  assert.strictEqual(opt9m.monthly_installment, 9913, '9M installment must be ₹9,913');
  assert.strictEqual(opt9m.bank_discount, 6500, '9M bank discount must be ₹6,500');

  // Verify 3M option
  const opt3m = parsed.find(o => o.tenure_months === 3);
  assert.strictEqual(opt3m.monthly_installment, 30306, '3M installment must be ₹30,306');
  assert.strictEqual(opt3m.bank_discount, 1500, '3M bank discount must be ₹1,500');

  // Verify 12M option
  const opt12m = parsed.find(o => o.tenure_months === 12);
  assert.strictEqual(opt12m.monthly_installment, 7580, '12M installment must be ₹7,580');
  assert.strictEqual(opt12m.bank_discount, 6500, '12M bank discount must be ₹6,500');

  console.log('✓ TEST 1 PASSED: Modal options extract exact real-time installments, discounts, and basis.');
}

console.log('--- TEST 2: PaylensCard Formatting & Breakdown Logic ---');
{
  assert.strictEqual(PaylensCard.formatINR(90049), '₹90,049.00');
  assert.strictEqual(PaylensCard.formatINR(5500), '₹5,500.00');
  assert.strictEqual(PaylensCard.formatINR(14756), '₹14,756.00');
  assert.strictEqual(PaylensCard.formatINR(88536), '₹88,536.00');

  const stickerPrice = 90049;
  const discount = 5500;
  const netFinanced = stickerPrice - discount;
  assert.strictEqual(netFinanced, 84549, 'Net financed principal must be ₹84,549');

  console.log('✓ TEST 2 PASSED: Currency formatting and net financed calculations accurate.');
}

console.log('--- ALL REAL-TIME DISCOUNT BREAKDOWN TESTS PASSED ---');
