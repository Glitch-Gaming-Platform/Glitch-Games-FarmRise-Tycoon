/**
 * Crop growth rules. Pure, deterministic, tick-based.
 *
 * The client runs these every fixed step to draw the plot. The server runs the
 * identical functions when a save is submitted, to decide whether the harvest
 * the client claims is physically possible. Neither side may fork this file.
 */
import { requireCrop, type CropDefinition } from '../domain/crops.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import type { PlotId } from '../domain/ids.js';

export type PlotStage = 'empty' | 'growing' | 'ready' | 'dead';

export interface PlotState {
  readonly id: PlotId;
  readonly cropId: string | null;
  /** Accumulated growth ticks. Reaches the crop's growthTicks when ready. */
  readonly grownTicks: Ticks;
  /** How many tending actions the player has performed this cycle. */
  readonly tendCount: number;
  /** Rolling water satisfaction, 0..1. Irrigation pins this near 1. */
  readonly water: number;
  /** True when an irrigation building serves this plot. */
  readonly irrigated: boolean;
  readonly diseased: boolean;
  /** Yield multiplier accumulated from farm events. 1 = untouched. */
  readonly eventMultiplier: number;
}

export function emptyPlot(id: PlotId): PlotState {
  return {
    id,
    cropId: null,
    grownTicks: 0,
    tendCount: 0,
    water: 1,
    irrigated: false,
    diseased: false,
    eventMultiplier: 1,
  };
}

export function plotStage(plot: PlotState): PlotStage {
  if (!plot.cropId) return 'empty';
  if (plot.eventMultiplier <= 0) return 'dead';
  const crop = requireCrop(plot.cropId);
  return plot.grownTicks >= crop.growthTicks ? 'ready' : 'growing';
}

/**
 * Growth speed as a fraction of nominal.
 *
 * Water is the only thing that slows growth; tending affects yield instead.
 * The floor of 0.35 is deliberate - a neglected plot should still finish
 * eventually, because a permanently stalled plot is a dead-end the player
 * cannot recover from.
 */
export function growthRate(plot: PlotState): number {
  if (plot.irrigated) return 1;
  return Math.max(0.35, 0.35 + 0.65 * clamp01(plot.water));
}

/** Advances one plot by `dtTicks`. Returns a new object; never mutates. */
export function advancePlot(plot: PlotState, dtTicks: Ticks): PlotState {
  if (!plot.cropId || plotStage(plot) === 'dead') return plot;
  const crop = requireCrop(plot.cropId);

  const water = plot.irrigated
    ? 1
    : clamp01(plot.water - (crop.waterPerDay * dtTicks) / (GAME_DAY_TICKS * 4));

  const nextGrown = Math.min(
    crop.growthTicks,
    plot.grownTicks + dtTicks * growthRate({ ...plot, water }),
  );

  return { ...plot, water, grownTicks: nextGrown };
}

/** Applies one tending action. Extra tending beyond the crop's need is wasted. */
export function tendPlot(plot: PlotState): PlotState {
  if (!plot.cropId) return plot;
  const crop = requireCrop(plot.cropId);
  return {
    ...plot,
    tendCount: Math.min(crop.tendActions, plot.tendCount + 1),
    water: Math.min(1, plot.water + 0.4),
    // Tending is also how you treat disease, which is why a diseased plot is a
    // call to action rather than a write-off.
    diseased: false,
  };
}

/** 0..1 factor from tending. A completely untended plot still returns half yield. */
export function tendFactor(plot: PlotState, crop: CropDefinition): number {
  if (crop.tendActions === 0) return 1;
  return 0.5 + 0.5 * clamp01(plot.tendCount / crop.tendActions);
}

/**
 * Final harvest quantity in whole units.
 *
 * This is the single most security-sensitive function in the shared package:
 * it is the upper bound the server uses to reject an inflated harvest claim.
 */
export function computeYield(plot: PlotState): number {
  if (!plot.cropId || plotStage(plot) !== 'ready') return 0;
  const crop = requireCrop(plot.cropId);
  const diseaseFactor = plot.diseased ? 0.4 : 1;
  const raw =
    crop.baseYield *
    tendFactor(plot, crop) *
    diseaseFactor *
    Math.max(0, plot.eventMultiplier) *
    (plot.irrigated ? 1 : 0.7 + 0.3 * clamp01(plot.water));
  return Math.max(0, Math.floor(raw));
}

/** Ticks remaining until harvestable, given the plot's current growth rate. */
export function ticksUntilReady(plot: PlotState): Ticks {
  if (!plot.cropId) return 0;
  const crop = requireCrop(plot.cropId);
  const remaining = crop.growthTicks - plot.grownTicks;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / growthRate(plot));
}

export function plantCrop(plot: PlotState, cropId: string): PlotState {
  requireCrop(cropId);
  return {
    ...plot,
    cropId,
    grownTicks: 0,
    tendCount: 0,
    water: 1,
    diseased: false,
    eventMultiplier: 1,
  };
}

export function clearPlot(plot: PlotState): PlotState {
  return emptyPlot(plot.id);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
