/**
 * Win and loss conditions.
 *
 * Shared with the server, so these are the rules that decide whether a run
 * ended - not a client-side opinion about it.
 */
import { describe, expect, it } from 'vitest';
import {
  LAND_PARCEL_COST,
  MAX_LAND_PARCELS,
  cents,
  cheapestSeedCost,
  evaluateRun,
  expansionProgress,
  isBankrupt,
  validateLandPurchase,
  type RunState,
} from '../src/index.js';

const run = (overrides: Partial<RunState> = {}): RunState => ({
  balance: cents(0),
  inventory: {},
  landParcels: 1,
  growingPlots: 0,
  buildingInProgress: false,
  ...overrides,
});

describe('bankruptcy', () => {
  it('requires all four dead ends at once', () => {
    expect(isBankrupt(run())).toBe(true);
  });

  it('is not declared while a crop is still growing', () => {
    expect(isBankrupt(run({ growingPlots: 1 }))).toBe(false);
  });

  it('is not declared while goods remain to sell', () => {
    expect(isBankrupt(run({ inventory: { wheat: 1 } }))).toBe(false);
  });

  it('is not declared while a building is still going up', () => {
    expect(isBankrupt(run({ buildingInProgress: true }))).toBe(false);
  });

  it('is not declared while the cheapest seed is still affordable', () => {
    expect(isBankrupt(run({ balance: cheapestSeedCost() }))).toBe(false);
  });

  it('ignores zero and negative inventory entries', () => {
    expect(isBankrupt(run({ inventory: { wheat: 0, corn: 0 } }))).toBe(true);
  });
});

describe('evaluateRun', () => {
  it('reports expansion once the second parcel is owned', () => {
    expect(evaluateRun(run({ landParcels: MAX_LAND_PARCELS, balance: cents(1) }))).toBe('expanded');
  });

  it('prefers success over bankruptcy when both would apply', () => {
    // Spending the last penny on the parcel is a win, not a loss.
    expect(evaluateRun(run({ landParcels: MAX_LAND_PARCELS }))).toBe('expanded');
  });

  it('reports in-progress for an ordinary run', () => {
    expect(evaluateRun(run({ balance: cents(5_000) }))).toBe('in_progress');
  });
});

describe('land purchase', () => {
  it('is refused without the money', () => {
    expect(validateLandPurchase(run({ balance: cents(10) })).ok).toBe(false);
  });

  it('is refused when there is no land left', () => {
    const result = validateLandPurchase(
      run({ balance: cents(999_999), landParcels: MAX_LAND_PARCELS }),
    );
    expect(result.ok).toBe(false);
  });

  it('deducts exactly the parcel cost', () => {
    const result = validateLandPurchase(run({ balance: cents(LAND_PARCEL_COST + 500) }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.balance).toBe(500);
      expect(result.value.parcels).toBe(2);
    }
  });
});

describe('expansionProgress', () => {
  it('is clamped to 0..1', () => {
    expect(expansionProgress(cents(0))).toBe(0);
    expect(expansionProgress(cents(LAND_PARCEL_COST * 3))).toBe(1);
    expect(expansionProgress(cents(LAND_PARCEL_COST / 2))).toBeCloseTo(0.5, 5);
  });
});
