/**
 * tests/test_module_loading.mjs
 * Simulates browser environment and tests importing and executing all content scripts and adapters.
 */

import fs from 'node:fs';
import path from 'node:path';

// Set up minimal browser globals
globalThis.window = {
  location: {
    href: 'https://www.amazon.in/dp/B0CHX1W1XY',
    origin: 'https://www.amazon.in',
    hostname: 'www.amazon.in',
    protocol: 'https:'
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.document = {
  title: 'Test Product Title',
  readyState: 'complete',
  location: globalThis.window.location,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null }),
  addEventListener: () => {},
  dispatchEvent: () => {}
};
globalThis.chrome = {
  runtime: {
    id: 'test_extension_id',
    getURL: (p) => p,
    sendMessage: (msg, cb) => cb && cb({ ok: true, data: null }),
    onMessage: { addListener: () => {} }
  }
};
globalThis.MutationObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
};

console.log('Testing dynamic import of content.js and all adapters...');

try {
  const contentMod = await import('../extension/content/content.js');
  console.log('✓ content.js imported successfully without SyntaxError');

  const amazonMod = await import('../extension/content/adapters/amazon.js');
  console.log('✓ amazon.js imported successfully without SyntaxError');

  const flipkartMod = await import('../extension/content/adapters/flipkart.js');
  console.log('✓ flipkart.js imported successfully without SyntaxError');

  const genericMod = await import('../extension/content/adapters/generic.js');
  console.log('✓ generic.js imported successfully without SyntaxError');

  const cardMod = await import('../extension/content/card.js');
  console.log('✓ card.js imported successfully without SyntaxError');

  const emiMod = await import('../extension/content/emi_extractor.js');
  console.log('✓ emi_extractor.js imported successfully without SyntaxError');

  console.log('\n--- ALL MODULES IMPORTED AND EXECUTED WITH ZERO ERRORS ---');
} catch (err) {
  console.error('FAIL:', err);
  process.exit(1);
}
