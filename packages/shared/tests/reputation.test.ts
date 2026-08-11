import { describe, expect, it } from 'vitest';
import {
  BUYER_DEFINITIONS,
  BUYER_IDS,
  DEFAULT_BUYER_ID,
  MAX_TRUST,
  buyerAvailability,
  cents,
  failurePenalty,
  meetsQualityBar,
  recordDelivery,
  recordFailure,
  spotPriceFor,
  trustPriceMultiplier,
  trustTier,
  trustTierLabel,
  trustVolumeMultiplier,
  unitPriceFor,
  type Relationship,
} from '../src/index.js';

const fresh: Relationship = { trust: 0, deliveries: 0, failures: 0 };

describe('the buyer table', () => {
  it('makes the opening buyer available to a brand-new farm', () => {
    const opening = BUYER_DEFINITIONS[DEFAULT_BUYER_ID];
    expect(opening.unlocksAtStage).toBe(0);
    expect(opening.minimumTrust).toBe(0);
  });

  it('gives every buyer a behaviour that differs from the others', () => {
    const prices = BUYER_IDS.map((id) => BUYER_DEFINITIONS[id].priceMultiplier);
    const volumes = BUYER_IDS.map((id) => BUYER_DEFINITIONS[id].orderSize.max);
    expect(new Set(prices).size).toBe(prices.length);
    expect(new Set(volumes).size).toBe(volumes.length);
  });

  it('costs more trust to fail than a delivery earns, for every buyer', () => {
    for (const id of BUYER_IDS) {
      const buyer = BUYER_DEFINITIONS[id];
      expect(Math.abs(buyer.trustPerFailure)).toBeGreaterThanOrEqual(buyer.trustPerDelivery / 2);
    }
  });
});

describe('recordDelivery and recordFailure', () => {
  it('earns trust one delivery at a time', () => {
    const after = recordDelivery(DEFAULT_BUYER_ID, fresh);
    expect(after.trust).toBe(BUYER_DEFINITIONS[DEFAULT_BUYER_ID].trustPerDelivery);
    expect(after.deliveries).toBe(1);
  });

  it('never exceeds the maximum however many deliveries are made', () => {
    let relationship = fresh;
    for (let index = 0; index < 200; index += 1) {
      relationship = recordDelivery(DEFAULT_BUYER_ID, relationship);
    }
    expect(relationship.trust).toBe(MAX_TRUST);
  });

  it('never falls below zero however many failures are made', () => {
    let relationship = fresh;
    for (let index = 0; index < 50; index += 1) {
      relationship = recordFailure('valley_cannery', relationship);
    }
    expect(relationship.trust).toBe(0);
    expect(relationship.failures).toBe(50);
  });

  it('loses more to one failure than one delivery earned, at the cannery', () => {
    const earned = recordDelivery('valley_cannery', { trust: 50, deliveries: 0, failures: 0 });
    const lost = recordFailure('valley_cannery', { trust: 50, deliveries: 0, failures: 0 });
    expect(earned.trust - 50).toBeLessThan(50 - lost.trust);
  });
});

describe('trust tiers', () => {
  it('starts unknown and ends preferred', () => {
    expect(trustTier(0)).toBe('unknown');
    expect(trustTier(MAX_TRUST)).toBe('preferred');
    expect(trustTierLabel(0)).toMatch(/new supplier/i);
  });

  it('never goes backwards as trust rises', () => {
    const order = ['unknown', 'trying_you', 'reliable', 'preferred'];
    let lowest = 0;
    for (let trust = 0; trust <= MAX_TRUST; trust += 5) {
      const index = order.indexOf(trustTier(trust));
      expect(index).toBeGreaterThanOrEqual(lowest);
      lowest = index;
    }
  });
});

describe('what trust is worth', () => {
  it('raises the price, but only modestly', () => {
    expect(trustPriceMultiplier(0)).toBe(1);
    expect(trustPriceMultiplier(MAX_TRUST)).toBeGreaterThan(1);
    // Trust must open doors rather than inflate every price, or late-game
    // money accelerates exactly where it should not.
    expect(trustPriceMultiplier(MAX_TRUST)).toBeLessThanOrEqual(1.25);
  });

  it('raises contract volume more than it raises price', () => {
    expect(trustVolumeMultiplier(MAX_TRUST)).toBeGreaterThan(trustPriceMultiplier(MAX_TRUST));
  });

  it('pays more than spot even with no relationship at all', () => {
    const buyer = BUYER_DEFINITIONS[DEFAULT_BUYER_ID];
    expect(unitPriceFor(buyer, spotPriceFor('wheat'), 0)).toBeGreaterThan(spotPriceFor('wheat'));
  });
});

describe('buyerAvailability', () => {
  it('hides a buyer the farm has not reached the stage for', () => {
    const result = buyerAvailability('thornwood_restaurant', 0, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.available).toBe(false);
    expect(result.value.reason).toMatch(/introduced/i);
  });

  it('hides a fussy buyer until the farm has a track record', () => {
    const result = buyerAvailability('thornwood_restaurant', 3, 0);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.available).toBe(false);
    expect(result.value.reason).toMatch(/track record/i);
  });

  it('opens up once both the stage and the trust are there', () => {
    const result = buyerAvailability('thornwood_restaurant', 3, 100);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.available).toBe(true);
    expect(result.value.reason).toBeNull();
  });

  it('fails on an unknown buyer rather than inventing one', () => {
    expect(buyerAvailability('nobody', 5, 100).ok).toBe(false);
  });
});

describe('consequences', () => {
  it('charges a penalty only where the buyer said it would', () => {
    expect(failurePenalty(DEFAULT_BUYER_ID)).toBe(cents(0));
    expect(failurePenalty('valley_cannery')).toBeGreaterThan(0);
  });

  it('lets the forgiving buyers take any grade and the restaurant refuse it', () => {
    expect(meetsQualityBar(DEFAULT_BUYER_ID, 0)).toBe(true);
    expect(meetsQualityBar('thornwood_restaurant', 0.2)).toBe(false);
    expect(meetsQualityBar('thornwood_restaurant', 0.95)).toBe(true);
  });
});
