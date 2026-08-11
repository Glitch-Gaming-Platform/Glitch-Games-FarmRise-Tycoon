/**
 * Growth rules. These are the numbers the server re-checks, so a regression
 * here is a live exploit, not a cosmetic bug.
 */
import { describe, expect, it } from 'vitest';
import {
  advancePlot,
  asPlotId,
  computeYield,
  emptyPlot,
  isThirsty,
  plantCrop,
  plotStage,
  requireCrop,
  tendPlot,
  ticksUntilThirsty,
  THIRSTY_WATER,
  type PlotState,
  ticksSinceReady,
  ticksUntilReady,
} from '../src/index.js';

const plot = () => plantCrop(emptyPlot(asPlotId('plot-1')), 'wheat');

describe('plot lifecycle', () => {
  it('starts empty and becomes growing once planted', () => {
    expect(plotStage(emptyPlot(asPlotId('p')))).toBe('empty');
    expect(plotStage(plot())).toBe('growing');
  });

  it('reaches ready after exactly the crop growth time when irrigated', () => {
    const wheat = requireCrop('wheat');
    let state = { ...plot(), irrigated: true };
    state = advancePlot(state, wheat.growthTicks);
    expect(plotStage(state)).toBe('ready');
  });

  it('tracks how long a mature crop has waited to be harvested', () => {
    const wheat = requireCrop('wheat');
    const state = advancePlot({ ...plot(), irrigated: true }, wheat.growthTicks * 10);
    expect(state.grownTicks).toBeGreaterThan(wheat.growthTicks);
    expect(ticksSinceReady(state)).toBeGreaterThan(0);
    expect(ticksUntilReady(state)).toBe(0);
  });

  it('grows more slowly without irrigation as water depletes', () => {
    const wheat = requireCrop('wheat');
    const dry = advancePlot(plot(), wheat.growthTicks);
    const wet = advancePlot({ ...plot(), irrigated: true }, wheat.growthTicks);
    expect(dry.grownTicks).toBeLessThan(wet.grownTicks);
  });

  it('never stalls completely, so a neglected plot stays recoverable', () => {
    // Design pillar: setbacks must be recoverable. A plot that can never finish
    // would be a dead end.
    let state = { ...plot(), water: 0 };
    state = advancePlot(state, 600);
    expect(state.grownTicks).toBeGreaterThan(0);
    expect(ticksUntilReady(state)).toBeLessThan(Number.POSITIVE_INFINITY);
  });
});

describe('computeYield', () => {
  it('returns zero until the crop is ready', () => {
    expect(computeYield(plot())).toBe(0);
  });

  it('rewards tending', () => {
    const wheat = requireCrop('wheat');
    const base = advancePlot({ ...plot(), irrigated: true }, wheat.growthTicks);
    const tended = advancePlot({ ...tendPlot(plot()), irrigated: true }, wheat.growthTicks);
    expect(computeYield(tended)).toBeGreaterThan(computeYield(base));
  });

  it('caps at the crop base yield for a fully tended, irrigated plot', () => {
    const wheat = requireCrop('wheat');
    let state = { ...plot(), irrigated: true };
    for (let i = 0; i < wheat.tendActions; i += 1) state = tendPlot(state);
    state = advancePlot(state, wheat.growthTicks);
    expect(computeYield(state)).toBe(wheat.baseYield);
  });

  it('reduces yield when diseased', () => {
    const wheat = requireCrop('wheat');
    const healthy = advancePlot({ ...plot(), irrigated: true }, wheat.growthTicks);
    const sick = { ...healthy, diseased: true };
    expect(computeYield(sick)).toBeLessThan(computeYield(healthy));
  });

  it('never returns a negative or fractional quantity', () => {
    const wheat = requireCrop('wheat');
    const state = advancePlot(
      { ...plot(), irrigated: true, eventMultiplier: -5 },
      wheat.growthTicks,
    );
    const yielded = computeYield(state);
    expect(yielded).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(yielded)).toBe(true);
  });
});

describe('immutability', () => {
  it('advancePlot does not mutate its input', () => {
    const before = plot();
    const snapshot = { ...before };
    advancePlot(before, 100);
    expect(before).toEqual(snapshot);
  });
});

describe('water gauge', () => {
  const thirstyPlot = (water: number, overrides: Partial<PlotState> = {}): PlotState => ({
    ...emptyPlot(asPlotId('plot-1')),
    cropId: 'corn',
    water,
    ...overrides,
  });

  it('calls a bed thirsty only once it is actually struggling', () => {
    expect(isThirsty(thirstyPlot(1))).toBe(false);
    expect(isThirsty(thirstyPlot(THIRSTY_WATER - 0.01))).toBe(true);
  });

  it('never calls an irrigated or an empty bed thirsty', () => {
    expect(isThirsty(thirstyPlot(0, { irrigated: true }))).toBe(false);
    expect(isThirsty(thirstyPlot(0, { cropId: null }))).toBe(false);
  });

  it('counts down to the moment a bed needs attention', () => {
    const wet = ticksUntilThirsty(thirstyPlot(1)) ?? 0;
    const drier = ticksUntilThirsty(thirstyPlot(0.6)) ?? 0;
    expect(wet).toBeGreaterThan(drier);
    expect(ticksUntilThirsty(thirstyPlot(THIRSTY_WATER))).toBe(0);
  });

  it('agrees with what advancePlot actually does to the water', () => {
    const plot = thirstyPlot(1);
    const ticks = ticksUntilThirsty(plot) ?? 0;
    const later = advancePlot(plot, ticks);
    expect(later.water).toBeLessThanOrEqual(THIRSTY_WATER + 0.001);
    expect(advancePlot(plot, ticks - 1).water).toBeGreaterThan(THIRSTY_WATER);
  });

  it('dries out faster in summer than in spring', () => {
    const summer = ticksUntilThirsty(thirstyPlot(1), 'summer') ?? 0;
    const spring = ticksUntilThirsty(thirstyPlot(1), 'spring') ?? 0;
    expect(summer).toBeLessThan(spring);
  });

  it('has no countdown for a bed that will never get there', () => {
    expect(ticksUntilThirsty(thirstyPlot(1, { irrigated: true }))).toBeNull();
    expect(ticksUntilThirsty(thirstyPlot(1, { cropId: null }))).toBeNull();
  });
});
