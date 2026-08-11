import { describe, expect, it } from 'vitest';
import {
  CROPS,
  GAME_DAY_TICKS,
  asPlotId,
  blendQuality,
  decayQuality,
  emptyPlot,
  gradeFor,
  gradeLabel,
  harvestQuality,
  requireCrop,
  qualityPriceMultiplier,
  seasonalGrowthMultiplier,
  type PlotState,
} from '../src/index.js';

const plot = (overrides: Partial<PlotState> = {}): PlotState => ({
  ...emptyPlot(asPlotId('plot-1')),
  cropId: 'pumpkin',
  tendCount: 3,
  water: 1,
  soil: 1,
  ...overrides,
});

describe('harvestQuality', () => {
  it('is decided by what the player did, not by a dice roll', () => {
    expect(harvestQuality(plot(), 'autumn')).toBe(harvestQuality(plot(), 'autumn'));
  });

  it('rewards tending', () => {
    expect(harvestQuality(plot({ tendCount: 3 }), 'autumn')).toBeGreaterThan(
      harvestQuality(plot({ tendCount: 0 }), 'autumn'),
    );
  });

  it('rewards water and good ground', () => {
    expect(harvestQuality(plot({ water: 1 }), 'autumn')).toBeGreaterThan(
      harvestQuality(plot({ water: 0 }), 'autumn'),
    );
    expect(harvestQuality(plot({ soil: 1 }), 'autumn')).toBeGreaterThan(
      harvestQuality(plot({ soil: 0.2 }), 'autumn'),
    );
  });

  it('rewards growing a crop in its own season', () => {
    expect(harvestQuality(plot(), 'autumn')).toBeGreaterThan(harvestQuality(plot(), 'winter'));
  });

  it('punishes disease', () => {
    expect(harvestQuality(plot({ diseased: true }), 'autumn')).toBeLessThan(
      harvestQuality(plot(), 'autumn'),
    );
  });

  it('loses its freshness premium while a ripe crop waits in the field', () => {
    const pumpkin = requireCrop('pumpkin');
    const ready = plot({ grownTicks: pumpkin.growthTicks });
    const late = plot({ grownTicks: pumpkin.growthTicks + GAME_DAY_TICKS / 2 });
    expect(harvestQuality(late, 'autumn')).toBeLessThan(harvestQuality(ready, 'autumn'));
    expect(qualityPriceMultiplier(harvestQuality(late, 'autumn'))).toBeLessThan(
      qualityPriceMultiplier(harvestQuality(ready, 'autumn')),
    );
  });

  it('always lands between zero and one', () => {
    expect(
      harvestQuality(plot({ tendCount: 0, water: 0, soil: 0, diseased: true }), 'winter'),
    ).toBeGreaterThanOrEqual(0);
    expect(harvestQuality(plot(), 'autumn')).toBeLessThanOrEqual(1);
  });
});

describe('grades', () => {
  it('names each band', () => {
    expect(gradeFor(0.1)).toBe('poor');
    expect(gradeFor(0.5)).toBe('standard');
    expect(gradeFor(0.75)).toBe('fine');
    expect(gradeFor(0.95)).toBe('premium');
    expect(gradeLabel(0.95)).toBe('Premium');
  });

  it('still pays something for poor produce', () => {
    // A bad harvest should be disappointing income, not unsellable stock.
    expect(qualityPriceMultiplier(0)).toBeGreaterThan(0.5);
    expect(qualityPriceMultiplier(1)).toBeGreaterThan(qualityPriceMultiplier(0));
  });
});

describe('decayQuality', () => {
  it('drops a perishable good faster than a durable one', () => {
    expect(decayQuality(1, 'milk', GAME_DAY_TICKS)).toBeLessThan(
      decayQuality(1, 'preserves', GAME_DAY_TICKS),
    );
  });

  it('holds everything in a cold store', () => {
    expect(decayQuality(1, 'milk', GAME_DAY_TICKS * 10, true)).toBe(1);
  });

  it('never goes below zero', () => {
    expect(decayQuality(0.1, 'milk', GAME_DAY_TICKS * 100)).toBe(0);
  });

  it('reduces the market multiplier for every seasonal crop left in ordinary storage', () => {
    for (const crop of Object.values(CROPS).filter((entry) => entry.plantingSeasons !== null)) {
      const spoiled = decayQuality(1, crop.id, GAME_DAY_TICKS);
      expect(spoiled, crop.id).toBeLessThan(1);
      expect(qualityPriceMultiplier(spoiled), crop.id).toBeLessThan(qualityPriceMultiplier(1));
    }
  });
});

describe('blendQuality', () => {
  it('drags a good pile down when poor produce is added to it', () => {
    expect(blendQuality(10, 1, 10, 0)).toBeCloseTo(0.5, 5);
  });

  it('takes the incoming grade when the pile is empty', () => {
    expect(blendQuality(0, 1, 5, 0.4)).toBeCloseTo(0.4, 5);
  });

  it('weights by quantity rather than averaging the two grades', () => {
    expect(blendQuality(90, 1, 10, 0)).toBeGreaterThan(0.8);
  });
});

describe('seasonalGrowthMultiplier', () => {
  it('grows a crop faster in the season that suits it', () => {
    expect(seasonalGrowthMultiplier('pumpkin', 'autumn')).toBeGreaterThan(
      seasonalGrowthMultiplier('pumpkin', 'winter'),
    );
  });

  it('slows but never stops an out-of-season crop', () => {
    expect(seasonalGrowthMultiplier('pumpkin', 'winter')).toBeGreaterThan(0);
  });
});
