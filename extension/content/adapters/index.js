/**
 * extension/content/adapters/index.js
 * Storefront DOM Adapter Registry and Resolver.
 */

import { MockShopAdapter } from './mock_shop.js';
import { AmazonAdapter } from './amazon.js';
import { FlipkartAdapter } from './flipkart.js';
import { CromaAdapter } from './croma.js';
import { RelianceDigitalAdapter } from './reliance_digital.js';
import { TataCliqAdapter } from './tata_cliq.js';
import { GenericAdapter } from './generic.js';

export const ADAPTERS = [
  MockShopAdapter,
  AmazonAdapter,
  FlipkartAdapter,
  CromaAdapter,
  RelianceDigitalAdapter,
  TataCliqAdapter,
  GenericAdapter
];

/**
 * Resolves the matching adapter for a given URL.
 * Returns null if no adapter matches.
 */
export function getAdapter(url = (typeof window !== 'undefined' ? window.location.href : '')) {
  for (const adapter of ADAPTERS) {
    if (adapter && typeof adapter.matches === 'function' && adapter.matches(url)) {
      return adapter;
    }
  }
  return null;
}

export default {
  ADAPTERS,
  getAdapter
};
