import { describe, expect, it } from 'vitest';
import {
  HOMESTEAD_PARCEL_ID,
  PARCELS_BY_ID,
  careerHealth,
  cents,
  cheapestSeedCost,
  landProgress,
  stageName,
  validateLandPurchase,
  type CareerHealthState,
} from '../src/index.js';

const health = (overrides: Partial<CareerHealthState> = {}): CareerHealthState => ({
  balance: cents(0),
  storedUnits: 0,
  growingPlots: 0,
  buildingInProgress: false,
  debt: cents(0),
  dailyCosts: cents(0),
  ...overrides,
});

describe('career health', () => {
  it('is insolvent only when every route back into production is gone', () => {
    expect(careerHealth(health())).toBe('insolvent');
    expect(careerHealth(health({ growingPlots: 1 }))).not.toBe('insolvent');
    expect(careerHealth(health({ storedUnits: 1 }))).not.toBe('insolvent');
    expect(careerHealth(health({ buildingInProgress: true }))).not.toBe('insolvent');
    expect(careerHealth(health({ balance: cheapestSeedCost() }))).not.toBe('insolvent');
  });

  it('warns when fixed costs or debt put the farm under strain', () => {
    expect(careerHealth(health({ balance: cents(1_000), dailyCosts: cents(600) }))).toBe(
      'strained',
    );
    expect(careerHealth(health({ balance: cents(1_000), debt: cents(4_000) }))).toBe('strained');
    expect(careerHealth(health({ balance: cents(10_000), dailyCosts: cents(100) }))).toBe(
      'healthy',
    );
  });
});

describe('named land purchase', () => {
  const north = PARCELS_BY_ID['parcel-north-field']!;

  it('deducts exactly the selected parcel cost and exposes its beds', () => {
    const result = validateLandPurchase(
      north.id,
      [HOMESTEAD_PARCEL_ID],
      cents(north.purchaseCost + 500),
      0,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.balance).toBe(500);
      expect(result.value.ownedParcelIds).toContain(north.id);
      expect(result.value.newBedIds).toEqual(north.beds.map((bed) => bed.id));
    }
  });

  it('rejects insufficient funds, duplicates and stage-gated land', () => {
    expect(validateLandPurchase(north.id, [HOMESTEAD_PARCEL_ID], cents(10), 0).ok).toBe(false);
    expect(
      validateLandPurchase(north.id, [HOMESTEAD_PARCEL_ID, north.id], cents(999_999), 0).ok,
    ).toBe(false);
    expect(
      validateLandPurchase('parcel-east-pasture', [HOMESTEAD_PARCEL_ID], cents(999_999), 0).ok,
    ).toBe(false);
  });
});

describe('career presentation helpers', () => {
  it('clamps progress toward the next legal parcel', () => {
    const north = PARCELS_BY_ID['parcel-north-field']!;
    expect(landProgress(cents(0), [HOMESTEAD_PARCEL_ID], 0)).toBe(0);
    expect(landProgress(cents(north.purchaseCost * 3), [HOMESTEAD_PARCEL_ID], 0)).toBe(1);
    expect(landProgress(cents(north.purchaseCost / 2), [HOMESTEAD_PARCEL_ID], 0)).toBeCloseTo(
      0.5,
      5,
    );
  });

  it('names every career stage', () => {
    expect(stageName(0)).toBeTruthy();
    expect(stageName(5)).toBeTruthy();
  });
});
