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
  plantCrop,
  plotStage,
  requireCrop,
  tendPlot,
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

  it('never exceeds the crop maximum growth', () => {
    const wheat = requireCrop('wheat');
    const state = advancePlot({ ...plot(), irrigated: true }, wheat.growthTicks * 10);
    expect(state.grownTicks).toBe(wheat.growthTicks);
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
