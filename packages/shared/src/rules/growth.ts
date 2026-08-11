/**
 * Crop growth rules. Pure, deterministic, tick-based.
 *
 * The client runs these every fixed step to draw the plot. The server runs the
 * identical functions when a save is submitted, to decide whether the harvest
 * the client claims is physically possible. Neither side may fork this file.
 *
 * Progression adds two inputs that the player controls over a longer horizon
 * than one cycle: the season the crop is growing in, and the state of the soil
 * it is growing in. Both scale an existing term rather than adding a new gate,
 * so a player who understands the original loop is never blocked by them.
 */
import { requireCrop, type CropDefinition } from '../domain/crops.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import { seasonDefinition, type Season } from '../domain/seasons.js';
import type { PlotId } from '../domain/ids.js';
import { rotationFactor, soilYieldFactor } from './soil.js';

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
  /** Nutrient left in this bed, 0..1. */
  readonly soil: number;
  /** Grade of the crop currently growing, 0..1. Settled at harvest. */
  readonly quality: number;
  /** What grew here last cycle, so rotation can be rewarded. */
  readonly previousCropId: string | null;
}

export function emptyPlot(id: PlotId, soil = 1, previousCropId: string | null = null): PlotState {
  return {
    id,
    cropId: null,
    grownTicks: 0,
    tendCount: 0,
    water: 1,
    irrigated: false,
    diseased: false,
    eventMultiplier: 1,
    soil,
    quality: 1,
    previousCropId,
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
 * cannot recover from. Season scales the whole result, and winter is slow
 * rather than impossible for the same reason.
 */
export function growthRate(plot: PlotState, season?: Season): number {
  const water = plot.irrigated ? 1 : Math.max(0.35, 0.35 + 0.65 * clamp01(plot.water));
  if (!season || !plot.cropId) return water;
  const crop = requireCrop(plot.cropId);
  const seasonal = seasonDefinition(season).growthModifier;
  const suits = crop.favouredSeasons.includes(season);
  return water * seasonal * (suits ? 1 : crop.offSeasonGrowth);
}

/** Advances one plot by `dtTicks`. Returns a new object; never mutates. */
export function advancePlot(plot: PlotState, dtTicks: Ticks, season?: Season): PlotState {
  if (!plot.cropId || plotStage(plot) === 'dead') return plot;
  const crop = requireCrop(plot.cropId);

  const drain = season ? seasonDefinition(season).waterDrainModifier : 1;
  const water = plot.irrigated
    ? 1
    : clamp01(plot.water - (crop.waterPerDay * drain * dtTicks) / (GAME_DAY_TICKS * 4));

  const rate = growthRate({ ...plot, water }, season);
  const remaining = crop.growthTicks - plot.grownTicks;
  let nextGrown: number;
  if (remaining <= 0) {
    // Once ready, grownTicks becomes the crop's harvest clock. Tracking time
    // above the maturity threshold lets quality fall while it waits in the
    // field, giving the player a real reason to harvest promptly.
    nextGrown = plot.grownTicks + dtTicks;
  } else {
    const growthThisStep = dtTicks * rate;
    if (growthThisStep <= remaining) nextGrown = plot.grownTicks + growthThisStep;
    else {
      const ticksToMaturity = remaining / Math.max(0.01, rate);
      nextGrown = crop.growthTicks + Math.max(0, dtTicks - ticksToMaturity);
    }
  }

  return { ...plot, water, grownTicks: nextGrown };
}

/**
 * Water level at which a bed is visibly struggling.
 *
 * Below this the growth rate is close to its floor, so this is the point at
 * which walking over with a can is worth the trip rather than merely tidy.
 */
export const THIRSTY_WATER = 0.45;

export function isThirsty(plot: PlotState): boolean {
  return !plot.irrigated && plot.cropId !== null && plot.water < THIRSTY_WATER;
}

/**
 * Ticks until this bed drops below the thirsty mark, or null if it never will.
 *
 * An irrigated bed never gets there, and neither does one with nothing in it -
 * both return null so the interface can say "fine" rather than draw a countdown
 * to an event that will not happen.
 */
export function ticksUntilThirsty(plot: PlotState, season?: Season): Ticks | null {
  if (!plot.cropId || plot.irrigated) return null;
  if (plot.water <= THIRSTY_WATER) return 0;

  const crop = requireCrop(plot.cropId);
  const drain = season ? seasonDefinition(season).waterDrainModifier : 1;
  const perTick = (crop.waterPerDay * drain) / (GAME_DAY_TICKS * 4);
  if (perTick <= 0) return null;
  return Math.ceil((plot.water - THIRSTY_WATER) / perTick);
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
 * `specializationYield` is passed in rather than looked up so that this stays a
 * pure function of its arguments on both sides of the wire.
 */
export function computeYield(plot: PlotState, specializationYield = 1): number {
  if (!plot.cropId || plotStage(plot) !== 'ready') return 0;
  const crop = requireCrop(plot.cropId);
  const diseaseFactor = plot.diseased ? 0.4 : 1;
  const raw =
    crop.baseYield *
    tendFactor(plot, crop) *
    diseaseFactor *
    Math.max(0, plot.eventMultiplier) *
    soilYieldFactor(plot.soil) *
    rotationFactor(plot.previousCropId, plot.cropId) *
    Math.max(0, specializationYield) *
    (plot.irrigated ? 1 : 0.7 + 0.3 * clamp01(plot.water));
  return Math.max(0, Math.floor(raw));
}

/** Ticks remaining until harvestable, given the plot's current growth rate. */
export function ticksUntilReady(plot: PlotState, season?: Season): Ticks {
  if (!plot.cropId) return 0;
  const crop = requireCrop(plot.cropId);
  const remaining = crop.growthTicks - plot.grownTicks;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / Math.max(0.01, growthRate(plot, season)));
}

/** Wall-clock simulation ticks a mature crop has waited in the field. */
export function ticksSinceReady(plot: PlotState): Ticks {
  if (!plot.cropId) return 0;
  return Math.max(0, plot.grownTicks - requireCrop(plot.cropId).growthTicks);
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
    quality: 1,
  };
}

/** Clears a bed, remembering what grew there so the next crop can rotate off it. */
export function clearPlot(plot: PlotState): PlotState {
  return emptyPlot(plot.id, plot.soil, plot.cropId ?? plot.previousCropId);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
