/**
 * Storage, orders and money. Every function here is used by the server to
 * decide whether a player may be paid.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_STORAGE_UNITS,
  BARN_CAPACITY_UNITS,
  CROPS,
  advancePlot,
  addItems,
  applyContractCommitmentBonus,
  asOrderId,
  asPlotId,
  canAfford,
  cents,
  computeYield,
  emptyPlot,
  harvestQuality,
  orderPayout,
  orderPremium,
  plantableCrops,
  removeItems,
  seasonalCropIds,
  spend,
  spotValue,
  qualityPriceMultiplier,
  tendPlot,
  ticksUntilReady,
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

  it('adds a 15-30% commitment bonus to the price already calculated', () => {
    expect(applyContractCommitmentBonus(cents(100), 0)).toBe(115);
    expect(applyContractCommitmentBonus(cents(100), 1)).toBe(130);
    expect(applyContractCommitmentBonus(cents(100), 0.5)).toBe(123);
  });

  it('clamps invalid commitment samples to the published range', () => {
    expect(applyContractCommitmentBonus(cents(100), -10)).toBe(115);
    expect(applyContractCommitmentBonus(cents(100), 10)).toBe(130);
    expect(applyContractCommitmentBonus(cents(100), Number.NaN)).toBe(115);
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

describe('crop margins', () => {
  it('returns the crop rarity target between three and ten times seed cost', () => {
    for (const crop of Object.values(CROPS)) {
      let state = {
        ...emptyPlot(asPlotId(`plot-${crop.id}`)),
        cropId: crop.id,
        irrigated: true,
      };
      for (let action = 0; action < crop.tendActions; action += 1) state = tendPlot(state);
      const season = crop.favouredSeasons[0] ?? 'spring';
      state = advancePlot(state, ticksUntilReady(state, season), season);

      const quality = harvestQuality(state, season);
      const payout = Math.round(
        computeYield(state) * crop.baseUnitPrice * qualityPriceMultiplier(quality),
      );
      const actualReturn = payout / crop.seedCost;
      expect(actualReturn, crop.id).toBeGreaterThanOrEqual(3);
      expect(actualReturn, crop.id).toBeLessThanOrEqual(10.05);
      expect(actualReturn, crop.id).toBeCloseTo(crop.returnMultiplier, 1);
    }
  });

  it('makes corn common at 3x and avocado exotic at 10x', () => {
    expect(CROPS.corn?.rarity).toBe('common');
    expect(CROPS.corn?.returnMultiplier).toBe(3);
    expect(CROPS.avocado?.rarity).toBe('exotic');
    expect(CROPS.avocado?.returnMultiplier).toBe(10);
  });

  it('keeps four base crops year-round and exposes exactly three specials per season', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(seasonalCropIds(season)).toHaveLength(3);
      const available = new Set(plantableCrops(['soil_management'], season).map((crop) => crop.id));
      for (const cropId of ['wheat', 'corn', 'pumpkin', 'clover']) {
        expect(available.has(cropId), `${cropId} in ${season}`).toBe(true);
      }
      for (const cropId of seasonalCropIds(season)) {
        expect(available.has(cropId), `${cropId} in ${season}`).toBe(true);
      }
    }
  });

  it('does not sell a seasonal crop outside its planting window', () => {
    expect(plantableCrops([], 'spring').some((crop) => crop.id === 'strawberry')).toBe(true);
    expect(plantableCrops([], 'summer').some((crop) => crop.id === 'strawberry')).toBe(false);
    expect(plantableCrops([], 'summer').some((crop) => crop.id === 'avocado')).toBe(true);
  });

  it('makes every higher return tier take longer than the tier below it', () => {
    const byReturn = new Map<number, number[]>();
    for (const crop of Object.values(CROPS)) {
      const durations = byReturn.get(crop.returnMultiplier) ?? [];
      durations.push(crop.growthTicks);
      byReturn.set(crop.returnMultiplier, durations);
    }

    const tiers = [...byReturn.entries()].sort(([left], [right]) => left - right);
    for (let index = 1; index < tiers.length; index += 1) {
      const lower = tiers[index - 1]![1];
      const higher = tiers[index]![1];
      expect(Math.min(...higher)).toBeGreaterThan(Math.max(...lower));
    }
  });
});
