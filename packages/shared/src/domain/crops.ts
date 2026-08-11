/**
 * Crop definitions.
 *
 * Seed prices are derived, not chosen. Rarity is the crop-specific economic
 * variable: a fresh, fully tended common crop returns 3x its seed cost, while
 * uncommon, rare and exotic crops target 5x, 7x and 10x respectively. Missed
 * care, spoilage and waiting too long after ripening can push the realized
 * return below that healthy target. The relationship is pinned by a test in
 * packages/shared/tests/economy.test.ts.
 *
 * The original four crops remain plantable year-round (subject to progression
 * unlocks). Seasonal crops have a one-season seed window but keep growing if
 * the calendar turns after planting. Each crop must justify itself with a
 * distinct decision, not just a different mesh (see
 * docs/game-design/mechanics-and-core-loop.md, "Scope rules"):
 *   wheat   - fast, cheap, low risk, low margin. The safety net.
 *   corn    - medium everything, but thirsty: only worth it with irrigation.
 *   pumpkin - slow and expensive with a strong margin and high disease risk,
 *             so it is the year-round crop a drought or blight actually hurts.
 *   clover  - earns almost nothing and *restores* the soil, so it is the crop
 *             you plant when you have been greedy. Rotation, made concrete.
 *
 * Progression adds two further axes to every crop: what it takes out of the
 * ground, and which season suits it (docs/PROGRESSION_GAMEPLAY_PLAN.md §9, §11).
 */
import { asCropId, cents, type Cents, type CropId } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';
import type { Season } from './seasons.js';

export type CropRarity = 'common' | 'uncommon' | 'rare' | 'exotic';

export const CROP_RETURN_MULTIPLIERS: Readonly<Record<CropRarity, number>> = Object.freeze({
  common: 3,
  uncommon: 5,
  rare: 7,
  exotic: 10,
});

export interface CropDefinition {
  readonly id: CropId;
  readonly displayName: string;
  /** Economic tier. This is what selects the crop's healthy return multiple. */
  readonly rarity: CropRarity;
  /** Healthy premium gross return divided by seed cost. Derived from rarity. */
  readonly returnMultiplier: number;
  /** Cost to plant one plot. */
  readonly seedCost: Cents;
  /** Spot price paid per unit harvested, before any order bonus. */
  readonly baseUnitPrice: Cents;
  /** Units produced by a fully tended, healthy plot. */
  readonly baseYield: number;
  /** Ticks from planting to harvestable, at nominal water. */
  readonly growthTicks: Ticks;
  /** Water consumed per in-game day. Higher means irrigation matters more. */
  readonly waterPerDay: number;
  /** Baseline chance per growth cycle of a disease outbreak, 0..1. */
  readonly diseaseRisk: number;
  /**
   * How many tending actions (weeding, watering) a full cycle expects. Missing
   * them does not kill the crop, it scales the yield down - the pillar is
   * "recoverable disruption", not punishment.
   */
  readonly tendActions: number;
  /**
   * Soil nutrient consumed by one full cycle, 0..1. Negative restores it, which
   * is what makes clover a rotation crop rather than a bad wheat.
   */
  readonly soilDraw: number;
  /** Seasons in which this crop grows at full speed. */
  readonly favouredSeasons: readonly Season[];
  /** Growth multiplier outside a favoured season. */
  readonly offSeasonGrowth: number;
  /** Quality lost per in-game day once harvested and held. */
  readonly freshnessDecayPerDay: number;
  /** Career unlock required before the seed can be bought, if any. */
  readonly requiresUnlock: string | null;
  /** Null means seed is sold year-round; otherwise planting is seasonal. */
  readonly plantingSeasons: readonly Season[] | null;
}

type CropTuning = Omit<CropDefinition, 'id' | 'returnMultiplier' | 'seedCost'> & {
  readonly id: string;
};

/**
 * A fresh premium harvest starts on rich soil, whose 1.1 yield factor is
 * floored to whole produce units, and premium quality pays 1.5x spot. Keeping
 * the derivation here makes rarity an actual tuning input instead of a label
 * that can silently drift away from seed price.
 */
function defineCrop(tuning: CropTuning): CropDefinition {
  const returnMultiplier = CROP_RETURN_MULTIPLIERS[tuning.rarity];
  const freshPremiumYield = Math.floor(tuning.baseYield * 1.1);
  // Floor rather than round so integer cents never pull a crop just below its
  // advertised return tier (for example 2.997x on a nominal 3x common crop).
  const seedCost = cents(
    Math.floor((freshPremiumYield * tuning.baseUnitPrice * 1.5) / returnMultiplier),
  );
  return Object.freeze({
    ...tuning,
    id: asCropId(tuning.id),
    returnMultiplier,
    seedCost,
  });
}

export const CROPS: Readonly<Record<string, CropDefinition>> = Object.freeze({
  wheat: defineCrop({
    id: 'wheat',
    displayName: 'Wheat',
    rarity: 'common',
    baseUnitPrice: cents(45),
    baseYield: 6,
    growthTicks: secondsToTicks(90),
    waterPerDay: 1,
    diseaseRisk: 0.03,
    tendActions: 1,
    soilDraw: 0.06,
    favouredSeasons: ['spring', 'autumn'],
    offSeasonGrowth: 0.85,
    freshnessDecayPerDay: 0.03,
    requiresUnlock: null,
    plantingSeasons: null,
  }),
  corn: defineCrop({
    id: 'corn',
    displayName: 'Corn',
    rarity: 'common',
    baseUnitPrice: cents(95),
    baseYield: 8,
    growthTicks: secondsToTicks(180),
    waterPerDay: 3,
    diseaseRisk: 0.06,
    tendActions: 2,
    soilDraw: 0.1,
    favouredSeasons: ['summer'],
    offSeasonGrowth: 0.7,
    freshnessDecayPerDay: 0.04,
    requiresUnlock: null,
    plantingSeasons: null,
  }),
  pumpkin: defineCrop({
    id: 'pumpkin',
    displayName: 'Pumpkin',
    rarity: 'uncommon',
    baseUnitPrice: cents(210),
    baseYield: 9,
    growthTicks: secondsToTicks(330),
    waterPerDay: 2,
    diseaseRisk: 0.12,
    tendActions: 3,
    soilDraw: 0.14,
    favouredSeasons: ['summer', 'autumn'],
    offSeasonGrowth: 0.6,
    freshnessDecayPerDay: 0.05,
    requiresUnlock: null,
    plantingSeasons: null,
  }),
  clover: defineCrop({
    id: 'clover',
    displayName: 'Clover',
    rarity: 'common',
    baseUnitPrice: cents(20),
    baseYield: 5,
    growthTicks: secondsToTicks(120),
    waterPerDay: 1,
    diseaseRisk: 0.01,
    tendActions: 1,
    soilDraw: -0.22,
    favouredSeasons: ['spring', 'summer', 'autumn'],
    offSeasonGrowth: 0.8,
    freshnessDecayPerDay: 0.02,
    requiresUnlock: 'soil_management',
    plantingSeasons: null,
  }),

  // Spring: quick turnover, restorative rotation and a labour-heavy premium crop.
  radish: defineCrop({
    id: 'radish',
    displayName: 'Radish',
    rarity: 'common',
    baseUnitPrice: cents(38),
    baseYield: 10,
    growthTicks: secondsToTicks(55),
    waterPerDay: 1,
    diseaseRisk: 0.02,
    tendActions: 1,
    soilDraw: 0.07,
    favouredSeasons: ['spring'],
    offSeasonGrowth: 0.65,
    freshnessDecayPerDay: 0.07,
    requiresUnlock: null,
    plantingSeasons: ['spring'],
  }),
  pea: defineCrop({
    id: 'pea',
    displayName: 'Pea',
    rarity: 'uncommon',
    baseUnitPrice: cents(70),
    baseYield: 8,
    growthTicks: secondsToTicks(210),
    waterPerDay: 2,
    diseaseRisk: 0.04,
    tendActions: 2,
    soilDraw: -0.08,
    favouredSeasons: ['spring'],
    offSeasonGrowth: 0.6,
    freshnessDecayPerDay: 0.06,
    requiresUnlock: null,
    plantingSeasons: ['spring'],
  }),
  strawberry: defineCrop({
    id: 'strawberry',
    displayName: 'Strawberry',
    rarity: 'rare',
    baseUnitPrice: cents(180),
    baseYield: 8,
    growthTicks: secondsToTicks(360),
    waterPerDay: 3,
    diseaseRisk: 0.09,
    tendActions: 3,
    soilDraw: 0.1,
    favouredSeasons: ['spring'],
    offSeasonGrowth: 0.55,
    freshnessDecayPerDay: 0.11,
    requiresUnlock: null,
    plantingSeasons: ['spring'],
  }),

  // Summer: drought tolerance, intensive market gardening and the exotic jackpot.
  sunflower: defineCrop({
    id: 'sunflower',
    displayName: 'Sunflower',
    rarity: 'common',
    baseUnitPrice: cents(85),
    baseYield: 7,
    growthTicks: secondsToTicks(150),
    waterPerDay: 1,
    diseaseRisk: 0.03,
    tendActions: 1,
    soilDraw: 0.08,
    favouredSeasons: ['summer'],
    offSeasonGrowth: 0.65,
    freshnessDecayPerDay: 0.02,
    requiresUnlock: null,
    plantingSeasons: ['summer'],
  }),
  tomato: defineCrop({
    id: 'tomato',
    displayName: 'Tomato',
    rarity: 'uncommon',
    baseUnitPrice: cents(165),
    baseYield: 9,
    growthTicks: secondsToTicks(270),
    waterPerDay: 4,
    diseaseRisk: 0.1,
    tendActions: 3,
    soilDraw: 0.12,
    favouredSeasons: ['summer'],
    offSeasonGrowth: 0.55,
    freshnessDecayPerDay: 0.12,
    requiresUnlock: null,
    plantingSeasons: ['summer'],
  }),
  avocado: defineCrop({
    id: 'avocado',
    displayName: 'Avocado',
    rarity: 'exotic',
    baseUnitPrice: cents(900),
    baseYield: 5,
    growthTicks: secondsToTicks(600),
    waterPerDay: 3,
    diseaseRisk: 0.14,
    tendActions: 4,
    soilDraw: 0.16,
    favouredSeasons: ['summer'],
    offSeasonGrowth: 0.5,
    freshnessDecayPerDay: 0.08,
    requiresUnlock: null,
    plantingSeasons: ['summer'],
  }),

  // Autumn: dependable roots beside two higher-risk fruit harvests.
  beetroot: defineCrop({
    id: 'beetroot',
    displayName: 'Beetroot',
    rarity: 'common',
    baseUnitPrice: cents(58),
    baseYield: 10,
    growthTicks: secondsToTicks(100),
    waterPerDay: 1,
    diseaseRisk: 0.02,
    tendActions: 1,
    soilDraw: 0.07,
    favouredSeasons: ['autumn'],
    offSeasonGrowth: 0.7,
    freshnessDecayPerDay: 0.05,
    requiresUnlock: null,
    plantingSeasons: ['autumn'],
  }),
  cranberry: defineCrop({
    id: 'cranberry',
    displayName: 'Cranberry',
    rarity: 'rare',
    baseUnitPrice: cents(210),
    baseYield: 8,
    growthTicks: secondsToTicks(390),
    waterPerDay: 4,
    diseaseRisk: 0.08,
    tendActions: 3,
    soilDraw: 0.09,
    favouredSeasons: ['autumn'],
    offSeasonGrowth: 0.55,
    freshnessDecayPerDay: 0.08,
    requiresUnlock: null,
    plantingSeasons: ['autumn'],
  }),
  grape: defineCrop({
    id: 'grape',
    displayName: 'Grape',
    rarity: 'rare',
    baseUnitPrice: cents(280),
    baseYield: 7,
    growthTicks: secondsToTicks(450),
    waterPerDay: 2,
    diseaseRisk: 0.11,
    tendActions: 3,
    soilDraw: 0.12,
    favouredSeasons: ['autumn'],
    offSeasonGrowth: 0.5,
    freshnessDecayPerDay: 0.09,
    requiresUnlock: null,
    plantingSeasons: ['autumn'],
  }),

  // Winter: reliable roots, a storage crop and a compact high-value bulb.
  carrot: defineCrop({
    id: 'carrot',
    displayName: 'Carrot',
    rarity: 'common',
    baseUnitPrice: cents(52),
    baseYield: 10,
    growthTicks: secondsToTicks(110),
    waterPerDay: 1,
    diseaseRisk: 0.02,
    tendActions: 1,
    soilDraw: 0.06,
    favouredSeasons: ['winter'],
    offSeasonGrowth: 0.75,
    freshnessDecayPerDay: 0.04,
    requiresUnlock: null,
    plantingSeasons: ['winter'],
  }),
  cabbage: defineCrop({
    id: 'cabbage',
    displayName: 'Cabbage',
    rarity: 'uncommon',
    baseUnitPrice: cents(135),
    baseYield: 8,
    growthTicks: secondsToTicks(240),
    waterPerDay: 2,
    diseaseRisk: 0.06,
    tendActions: 2,
    soilDraw: 0.09,
    favouredSeasons: ['winter'],
    offSeasonGrowth: 0.7,
    freshnessDecayPerDay: 0.03,
    requiresUnlock: null,
    plantingSeasons: ['winter'],
  }),
  garlic: defineCrop({
    id: 'garlic',
    displayName: 'Garlic',
    rarity: 'rare',
    baseUnitPrice: cents(330),
    baseYield: 6,
    growthTicks: secondsToTicks(420),
    waterPerDay: 1,
    diseaseRisk: 0.03,
    tendActions: 2,
    soilDraw: 0.05,
    favouredSeasons: ['winter'],
    offSeasonGrowth: 0.65,
    freshnessDecayPerDay: 0.02,
    requiresUnlock: null,
    plantingSeasons: ['winter'],
  }),
});

export const CROP_IDS = Object.keys(CROPS) as readonly string[];

export function getCrop(id: string): CropDefinition | undefined {
  return CROPS[id];
}

/** Throwing variant for code paths that have already validated the id. */
export function requireCrop(id: string): CropDefinition {
  const crop = CROPS[id];
  if (!crop) throw new Error(`Unknown crop id: ${id}`);
  return crop;
}

export function isCropPlantableInSeason(crop: CropDefinition, season: Season): boolean {
  return crop.plantingSeasons === null || crop.plantingSeasons.includes(season);
}

/** Seasonal crops whose authored pack is relevant to the active calendar. */
export function seasonalCropIds(season: Season): readonly string[] {
  return CROP_IDS.filter((id) => {
    const crop = CROPS[id];
    return crop?.plantingSeasons?.includes(season) ?? false;
  });
}

/** Crops the player may plant given their unlocks and the current season. */
export function plantableCrops(
  unlocks: readonly string[],
  season: Season,
): readonly CropDefinition[] {
  const granted = new Set(unlocks);
  return Object.values(CROPS).filter(
    (crop) =>
      (crop.requiresUnlock === null || granted.has(crop.requiresUnlock)) &&
      isCropPlantableInSeason(crop, season),
  );
}
