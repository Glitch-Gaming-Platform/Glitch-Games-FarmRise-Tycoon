/**
 * Crop definitions - first playable scope is exactly three crops.
 *
 * Each crop must justify itself with a distinct decision, not just a different
 * mesh (see docs/game-design/mechanics-and-core-loop.md, "Scope rules"):
 *   wheat   - fast, cheap, low risk, low margin. The safety net.
 *   corn    - medium everything, but thirsty: only worth it with irrigation.
 *   pumpkin - slow and expensive with the best margin and the worst disease
 *             risk, so it is the crop a drought or blight actually hurts.
 */
import { asCropId, cents, type Cents, type CropId } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

export interface CropDefinition {
  readonly id: CropId;
  readonly displayName: string;
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
}

export const CROPS: Readonly<Record<string, CropDefinition>> = Object.freeze({
  wheat: {
    id: asCropId('wheat'),
    displayName: 'Wheat',
    seedCost: cents(120),
    baseUnitPrice: cents(45),
    baseYield: 6,
    growthTicks: secondsToTicks(90),
    waterPerDay: 1,
    diseaseRisk: 0.03,
    tendActions: 1,
  },
  corn: {
    id: asCropId('corn'),
    displayName: 'Corn',
    seedCost: cents(320),
    baseUnitPrice: cents(95),
    baseYield: 8,
    growthTicks: secondsToTicks(180),
    waterPerDay: 3,
    diseaseRisk: 0.06,
    tendActions: 2,
  },
  pumpkin: {
    id: asCropId('pumpkin'),
    displayName: 'Pumpkin',
    seedCost: cents(700),
    baseUnitPrice: cents(240),
    baseYield: 9,
    growthTicks: secondsToTicks(330),
    waterPerDay: 2,
    diseaseRisk: 0.12,
    tendActions: 3,
  },
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
