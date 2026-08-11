import { describe, expect, it } from 'vitest';
import {
  FIELD_SPOILAGE_MULTIPLIER,
  GAME_DAY_TICKS,
  STORED_SPOILAGE_MULTIPLIER,
  applySpoilage,
  carryCapacity,
  fractionKeptPerDay,
  ticksUntilNextLoss,
  freeCapacity,
  loadWeight,
  loadedSpeedMultiplier,
  totalUnits,
  transferItem,
} from '../src/index.js';

/** Runs a whole in-game day one tick at a time, carrying the remainder. */
function spoilForOneDay(items: Record<string, number>, multiplier: number): Record<string, number> {
  let current: Record<string, number> = { ...items };
  let remainder: Readonly<Record<string, number>> = {};
  for (let tick = 0; tick < GAME_DAY_TICKS; tick += 1) {
    const outcome = applySpoilage(current, multiplier, 1, remainder);
    current = { ...outcome.items };
    remainder = outcome.remainder;
  }
  return current;
}

describe('loadWeight', () => {
  it('counts processed goods as heavier than the produce they came from', () => {
    expect(loadWeight({ wheat: 4 })).toBe(4);
    expect(loadWeight({ cheese: 4 })).toBeGreaterThan(loadWeight({ wheat: 4 }));
  });

  it('ignores negative quantities rather than crediting space for them', () => {
    expect(loadWeight({ wheat: -10 })).toBe(0);
  });
});

describe('carrying', () => {
  it('gives the handcart substantially more room than a pair of arms', () => {
    expect(carryCapacity('handcart')).toBeGreaterThan(carryCapacity('arms') * 3);
  });

  it('reports free space in storage units, not item counts', () => {
    expect(freeCapacity({ carrier: 'arms', items: { cheese: 2 } })).toBe(
      carryCapacity('arms') - loadWeight({ cheese: 2 }),
    );
  });

  it('slows the player in proportion to how full the carrier is', () => {
    const empty = loadedSpeedMultiplier({ carrier: 'handcart', items: {} });
    const half = loadedSpeedMultiplier({ carrier: 'handcart', items: { wheat: 15 } });
    const full = loadedSpeedMultiplier({ carrier: 'handcart', items: { wheat: 30 } });
    expect(empty).toBe(1);
    expect(half).toBeLessThan(empty);
    expect(full).toBeLessThan(half);
  });
});

describe('transferItem', () => {
  it('moves what fits and reports what did not', () => {
    const result = transferItem({ wheat: 20 }, {}, 'wheat', 20, 12);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moved).toBe(12);
    expect(result.value.refused).toBe(8);
    expect(result.value.from['wheat']).toBe(8);
    expect(result.value.to['wheat']).toBe(12);
  });

  it('accounts for weight when deciding how many fit', () => {
    const result = transferItem({ cheese: 10 }, {}, 'cheese', 10, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(loadWeight(result.value.to)).toBeLessThanOrEqual(10);
  });

  it('refuses a non-positive quantity', () => {
    expect(transferItem({ wheat: 5 }, {}, 'wheat', 0, 50).ok).toBe(false);
    expect(transferItem({ wheat: 5 }, {}, 'wheat', -3, 50).ok).toBe(false);
  });

  it('refuses when the source holds none of it', () => {
    expect(transferItem({}, {}, 'wheat', 5, 50).ok).toBe(false);
  });

  it('refuses when there is no room at all', () => {
    const result = transferItem({ wheat: 5 }, { wheat: 50 }, 'wheat', 5, 50);
    expect(result.ok).toBe(false);
  });
});

describe('applySpoilage', () => {
  it('loses roughly the item’s own daily rate in a barn', () => {
    // Wheat decays at 3% a day, so a barn should cost a little and not a lot.
    const left = spoilForOneDay({ wheat: 60 }, STORED_SPOILAGE_MULTIPLIER)['wheat'] ?? 0;
    expect(left).toBeLessThan(60);
    expect(left).toBeGreaterThan(55);
  });

  it('punishes a pile left in the open far harder than the same goods indoors', () => {
    const indoors = spoilForOneDay({ wheat: 60 }, STORED_SPOILAGE_MULTIPLIER)['wheat'] ?? 0;
    const outside = spoilForOneDay({ wheat: 60 }, FIELD_SPOILAGE_MULTIPLIER)['wheat'] ?? 0;
    expect(outside).toBeLessThan(indoors);
    // The regression this guards: multiplying two per-day fractions together
    // made a day in the open cost nothing at all.
    expect(60 - outside).toBeGreaterThanOrEqual(5);
  });

  it('spoils a perishable good faster than a durable one in the same place', () => {
    const milk = spoilForOneDay({ milk: 60 }, STORED_SPOILAGE_MULTIPLIER)['milk'] ?? 0;
    const preserves =
      spoilForOneDay({ preserves: 60 }, STORED_SPOILAGE_MULTIPLIER)['preserves'] ?? 0;
    expect(milk).toBeLessThan(preserves);
  });

  it('carries the fraction, so many small ticks cost the same as one large one', () => {
    const perTick = spoilForOneDay({ wheat: 60 }, FIELD_SPOILAGE_MULTIPLIER)['wheat'] ?? 0;
    const oneStep =
      applySpoilage({ wheat: 60 }, FIELD_SPOILAGE_MULTIPLIER, GAME_DAY_TICKS).items['wheat'] ?? 0;
    expect(Math.abs(perTick - oneStep)).toBeLessThanOrEqual(1);
  });

  it('preserves everything in a cold store', () => {
    const outcome = applySpoilage(
      { milk: 60 },
      FIELD_SPOILAGE_MULTIPLIER,
      GAME_DAY_TICKS,
      {},
      true,
    );
    expect(outcome.items['milk']).toBe(60);
    expect(outcome.lost).toBe(0);
  });

  it('does nothing for zero elapsed time or a zero multiplier', () => {
    expect(applySpoilage({ milk: 10 }, FIELD_SPOILAGE_MULTIPLIER, 0).lost).toBe(0);
    expect(applySpoilage({ milk: 10 }, 0, GAME_DAY_TICKS).lost).toBe(0);
  });

  it('never takes more than the pile contains', () => {
    const outcome = applySpoilage({ milk: 3 }, FIELD_SPOILAGE_MULTIPLIER, GAME_DAY_TICKS * 20);
    expect(outcome.items['milk']).toBeGreaterThanOrEqual(0);
    expect(outcome.lost).toBeLessThanOrEqual(3);
  });
});

describe('totalUnits', () => {
  it('counts items rather than storage weight', () => {
    expect(totalUnits({ cheese: 2, wheat: 3 })).toBe(5);
  });
});

describe('ticksUntilNextLoss', () => {
  it('is sooner for a pile in the open than for the same pile in a barn', () => {
    const outside = ticksUntilNextLoss({ wheat: 20 }, FIELD_SPOILAGE_MULTIPLIER);
    const indoors = ticksUntilNextLoss({ wheat: 20 }, STORED_SPOILAGE_MULTIPLIER);
    expect(outside).not.toBeNull();
    expect(indoors).not.toBeNull();
    expect(outside ?? 0).toBeLessThan(indoors ?? 0);
  });

  it('is sooner for a bigger pile, because the whole pile decays', () => {
    const small = ticksUntilNextLoss({ wheat: 5 }, FIELD_SPOILAGE_MULTIPLIER) ?? 0;
    const large = ticksUntilNextLoss({ wheat: 50 }, FIELD_SPOILAGE_MULTIPLIER) ?? 0;
    expect(large).toBeLessThan(small);
  });

  it('accounts for the fraction already accrued', () => {
    const fresh = ticksUntilNextLoss({ wheat: 20 }, FIELD_SPOILAGE_MULTIPLIER) ?? 0;
    const nearlyDue =
      ticksUntilNextLoss({ wheat: 20 }, FIELD_SPOILAGE_MULTIPLIER, { wheat: 0.9 }) ?? 0;
    expect(nearlyDue).toBeLessThan(fresh);
  });

  it('agrees with what applySpoilage actually does', () => {
    const ticks = ticksUntilNextLoss({ milk: 30 }, FIELD_SPOILAGE_MULTIPLIER) ?? 0;
    const justBefore = applySpoilage({ milk: 30 }, FIELD_SPOILAGE_MULTIPLIER, ticks - 1);
    const atTheMoment = applySpoilage({ milk: 30 }, FIELD_SPOILAGE_MULTIPLIER, ticks);
    expect(justBefore.lost).toBe(0);
    expect(atTheMoment.lost).toBe(1);
  });

  it('is null for a cold store, an empty pile, or goods that never spoil', () => {
    expect(ticksUntilNextLoss({ milk: 10 }, FIELD_SPOILAGE_MULTIPLIER, {}, true)).toBeNull();
    expect(ticksUntilNextLoss({}, FIELD_SPOILAGE_MULTIPLIER)).toBeNull();
    expect(ticksUntilNextLoss({ milk: 10 }, 0)).toBeNull();
  });
});

describe('fractionKeptPerDay', () => {
  it('keeps everything of nothing', () => {
    expect(fractionKeptPerDay({}, FIELD_SPOILAGE_MULTIPLIER)).toBe(1);
  });

  it('keeps less in the open than indoors, and always between zero and one', () => {
    const outside = fractionKeptPerDay({ wheat: 60 }, FIELD_SPOILAGE_MULTIPLIER);
    const indoors = fractionKeptPerDay({ wheat: 60 }, STORED_SPOILAGE_MULTIPLIER);
    expect(outside).toBeLessThan(indoors);
    expect(outside).toBeGreaterThanOrEqual(0);
    expect(indoors).toBeLessThanOrEqual(1);
  });
});
