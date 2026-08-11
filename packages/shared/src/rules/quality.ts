/**
 * Quality and freshness.
 *
 * Quality is decided at harvest from things the player controlled - tending,
 * water, soil, whether the crop was in its season. Freshness is what happens
 * afterwards, and it is the reason a cold store is worth building and a
 * restaurant contract is worth planning for rather than stumbling into
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §9, "Quality and freshness").
 */
import { requireCrop } from '../domain/crops.js';
import { getItem } from '../domain/items.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import { seasonDefinition, type Season } from '../domain/seasons.js';
import { ticksSinceReady, type PlotState } from './growth.js';
import { soilYieldFactor } from './soil.js';

export type QualityGrade = 'poor' | 'standard' | 'fine' | 'premium';

export const QUALITY_GRADES: readonly { grade: QualityGrade; min: number; label: string }[] =
  Object.freeze([
    { grade: 'poor', min: 0, label: 'Poor' },
    { grade: 'standard', min: 0.45, label: 'Standard' },
    { grade: 'fine', min: 0.7, label: 'Fine' },
    { grade: 'premium', min: 0.88, label: 'Premium' },
  ]);

export function gradeFor(quality: number): QualityGrade {
  let grade: QualityGrade = 'poor';
  for (const entry of QUALITY_GRADES) {
    if (quality >= entry.min) grade = entry.grade;
  }
  return grade;
}

export function gradeLabel(quality: number): string {
  const grade = gradeFor(quality);
  return QUALITY_GRADES.find((entry) => entry.grade === grade)?.label ?? 'Poor';
}

/**
 * Quality of a crop at the moment it is harvested.
 *
 * Every term is something the player did or chose to skip. There is no random
 * component: two identically farmed beds must grade identically, or the player
 * cannot learn anything from the number.
 */
export function harvestQuality(plot: PlotState, season: Season): number {
  const crop = requireCrop(plot.cropId ?? 'wheat');
  const tendRatio = crop.tendActions === 0 ? 1 : Math.min(1, plot.tendCount / crop.tendActions);
  const inSeason = crop.favouredSeasons.includes(season);
  const waitingDays = ticksSinceReady(plot) / GAME_DAY_TICKS;
  // A ripe crop weathers faster standing in the field than the harvested item
  // does in a store. More perishable crops lose the premium faster.
  const harvestDelayPenalty = waitingDays * (0.35 + crop.freshnessDecayPerDay * 3);

  const quality =
    0.3 +
    0.3 * tendRatio +
    0.2 * clamp01(plot.water) +
    0.15 * clamp01((soilYieldFactor(plot.soil) - 0.5) / 0.6) +
    (inSeason ? 0.1 : 0) -
    (plot.diseased ? 0.25 : 0) -
    harvestDelayPenalty;

  return clamp01(quality);
}

/**
 * Price multiplier a grade earns, 0.55..1.5.
 *
 * Poor produce still sells. The floor is deliberate: a bad harvest should be
 * disappointing income, not unsellable stock the player has to carry to a tip.
 */
export function qualityPriceMultiplier(quality: number): number {
  return 0.55 + 0.95 * clamp01(quality);
}

/** Quality after a span of ticks in a given store. */
export function decayQuality(
  quality: number,
  itemId: string,
  dtTicks: Ticks,
  preserving = false,
): number {
  if (preserving) return quality;
  const perDay = getItem(itemId)?.freshnessDecayPerDay ?? 0;
  if (perDay <= 0) return quality;
  return clamp01(quality - (perDay * dtTicks) / GAME_DAY_TICKS);
}

/**
 * Quality of a pile after adding more of the same item.
 *
 * A weighted mean, so topping up a premium store with poor produce drags the
 * whole pile down - which is what makes a separate cold store for the good
 * stuff a real decision rather than a cosmetic one.
 */
export function blendQuality(
  existingQuantity: number,
  existingQuality: number,
  addedQuantity: number,
  addedQuality: number,
): number {
  const total = Math.max(0, existingQuantity) + Math.max(0, addedQuantity);
  if (total <= 0) return addedQuality;
  return clamp01(
    (Math.max(0, existingQuantity) * existingQuality + Math.max(0, addedQuantity) * addedQuality) /
      total,
  );
}

/** Seasonal growth multiplier for a crop. */
export function seasonalGrowthMultiplier(cropId: string, season: Season): number {
  const crop = requireCrop(cropId);
  const seasonal = seasonDefinition(season).growthModifier;
  return crop.favouredSeasons.includes(season) ? seasonal : seasonal * crop.offSeasonGrowth;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
