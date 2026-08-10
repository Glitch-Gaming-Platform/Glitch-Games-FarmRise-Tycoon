/**
 * Storage, orders and money. Every function here is used by the server to
 * decide whether a player may be paid.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_STORAGE_UNITS,
  BARN_CAPACITY_UNITS,
  addItems,
  asOrderId,
  canAfford,
  cents,
  orderPayout,
  orderPremium,
  removeItems,
  spend,
  spotValue,
  storageCapacity,
  storageUsed,
  validateFulfilment,
  validateSpotSale,
  type MarketOrder,
} from '../src/index.js';

const order = (overrides: Partial<MarketOrder> = {}): MarketOrder => ({
  id: asOrderId('order-1'),
  buyerId: 'millbrook_grocers',
  itemId: 'wheat',
  quantity: 5,
  unitPrice: cents(60),
  deadlineTick: 1000,
  status: 'open',
  ...overrides,
});

describe('storage', () => {
  it('grows with completed barns', () => {
    expect(storageCapacity(0)).toBe(BASE_STORAGE_UNITS);
    expect(storageCapacity(2)).toBe(BASE_STORAGE_UNITS + BARN_CAPACITY_UNITS * 2);
  });

  it('spills the overflow rather than rejecting a harvest', () => {
    const result = addItems({}, 'wheat', 100, 60);
    expect(result.stored).toBe(60);
    expect(result.spilled).toBe(40);
    expect(storageUsed(result.inventory)).toBe(60);
  });

  it('refuses to remove more than is held', () => {
    const result = removeItems({ wheat: 3 }, 'wheat', 5);
    expect(result.ok).toBe(false);
  });
});

describe('orders', () => {
  it('pays quantity times unit price', () => {
    expect(orderPayout(order())).toBe(300);
  });

  it('reports the premium over the spot price', () => {
    expect(orderPremium(order())).toBeGreaterThan(0);
    expect(spotValue('wheat', 5)).toBeLessThan(orderPayout(order()));
  });

  it('rejects fulfilment without enough goods', () => {
    const result = validateFulfilment(order(), { wheat: 4 }, 10);
    expect(result.ok).toBe(false);
  });

  it('rejects fulfilment after the deadline', () => {
    const result = validateFulfilment(order(), { wheat: 10 }, 1001);
    expect(result.ok).toBe(false);
  });

  it('rejects fulfilment of an order that is not open', () => {
    const result = validateFulfilment(order({ status: 'fulfilled' }), { wheat: 10 }, 10);
    expect(result.ok).toBe(false);
  });

  it('deducts exactly the ordered quantity on success', () => {
    const result = validateFulfilment(order(), { wheat: 10 }, 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inventory['wheat']).toBe(5);
      expect(result.value.payout).toBe(300);
    }
  });

  it('rejects a spot sale of a fractional or negative quantity', () => {
    expect(validateSpotSale('wheat', 0, { wheat: 5 }).ok).toBe(false);
    expect(validateSpotSale('wheat', -2, { wheat: 5 }).ok).toBe(false);
    expect(validateSpotSale('wheat', 1.5, { wheat: 5 }).ok).toBe(false);
  });
});

describe('wallet', () => {
  it('refuses to spend more than the balance', () => {
    const wallet = { balance: cents(100) };
    expect(canAfford(wallet, cents(101))).toBe(false);
    expect(spend(wallet, cents(101), 'seed').ok).toBe(false);
  });

  it('rejects a negative price outright', () => {
    // Otherwise "buying" something for -500 would be a way to print money.
    expect(spend({ balance: cents(100) }, cents(-500), 'exploit').ok).toBe(false);
  });
});
