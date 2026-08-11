/**
 * Soil health and rotation.
 *
 * Soil exists to punish the one strategy that would otherwise dominate: plant
 * the highest-margin crop in every bed, forever. It does that without a hard
 * stop - tired ground still grows things, just less of them - because a bed
 * the player cannot use is a dead end, and the pillar is recoverable disruption
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §9, "Soil health and crop rotation").
 */
import { requireCrop, type CropDefinition } from '../domain/crops.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';

/** Nutrient recovered per in-game day when a bed is left empty. */
export const FALLOW_RECOVERY_PER_DAY = 0.05;
/** Floor on soil. Even ruined ground grows something. */
export const MIN_SOIL = 0.2;
/** Yield multiplier at MIN_SOIL. */
export const MIN_SOIL_YIELD = 0.5;

/**
 * Yield factor from soil, 0.5..1.1.
 *
 * Slightly above 1 at full fertility so that resting a bed is a genuine
 * investment rather than merely the absence of a penalty.
 */
export function soilYieldFactor(soil: number): number {
  const clamped = clamp(soil, MIN_SOIL, 1);
  const normalised = (clamped - MIN_SOIL) / (1 - MIN_SOIL);
  return MIN_SOIL_YIELD + normalised * (1.1 - MIN_SOIL_YIELD);
}

/**
 * Rotation bonus.
 *
 * Following a crop with a different one is rewarded; following it with itself
 * is not. This is the entire mechanism - no rotation table, no chart to
 * memorise, just "don't plant the same thing twice".
 */
export function rotationFactor(previousCropId: string | null, nextCropId: string): number {
  if (!previousCropId) return 1;
  return previousCropId === nextCropId ? 0.9 : 1.08;
}

/** Nutrient consumed by growing one cycle of a crop, scaled by specialization strain. */
export function soilDrawFor(crop: CropDefinition, strain = 1): number {
  return crop.soilDraw * strain;
}

/** Soil after harvesting a crop from this bed. */
export function soilAfterHarvest(soil: number, cropId: string, strain = 1): number {
  const crop = requireCrop(cropId);
  return clamp(soil - soilDrawFor(crop, strain), 0, 1);
}

/** Soil after a span of ticks lying fallow. */
export function soilAfterFallow(soil: number, dtTicks: Ticks): number {
  if (soil >= 1) return 1;
  return clamp(soil + (FALLOW_RECOVERY_PER_DAY * dtTicks) / GAME_DAY_TICKS, 0, 1);
}

export type SoilBand = 'exhausted' | 'tired' | 'good' | 'rich';

/** Bands, so the UI can colour a bed without the player learning a decimal. */
export function soilBand(soil: number): SoilBand {
  if (soil < 0.35) return 'exhausted';
  if (soil < 0.6) return 'tired';
  if (soil < 0.85) return 'good';
  return 'rich';
}

export const SOIL_BAND_LABELS: Readonly<Record<SoilBand, string>> = Object.freeze({
  exhausted: 'Exhausted',
  tired: 'Tired',
  good: 'Good',
  rich: 'Rich',
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
