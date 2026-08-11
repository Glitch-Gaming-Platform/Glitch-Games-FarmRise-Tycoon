/**
 * Processing: turning what the farm grows into what a buyer pays more for.
 *
 * A processor is deliberately not a free multiplier. Each one costs money to
 * build, consumes an input the player could have sold today, occupies a worker
 * or the player's own hands to load, and takes real time - so "process or sell"
 * stays a live decision every cycle (docs/PROGRESSION_GAMEPLAY_PLAN.md §9).
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';
import type { SpecializationId } from './specializations.js';

export type ProcessorKind = 'mill' | 'creamery' | 'preserve_kitchen';

export interface RecipeDefinition {
  readonly id: string;
  readonly processor: ProcessorKind;
  readonly displayName: string;
  /** Item consumed and how many units per batch. */
  readonly inputItemId: string;
  readonly inputQuantity: number;
  readonly outputItemId: string;
  readonly outputQuantity: number;
  readonly batchTicks: Ticks;
  /** Charged when the batch starts. Covers fuel, jars, rennet and the like. */
  readonly batchCost: Cents;
}

export interface ProcessorDefinition {
  readonly id: ProcessorKind;
  readonly displayName: string;
  readonly buildCost: Cents;
  readonly buildTicks: Ticks;
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly upkeepPerDay: Cents;
  /** Batches that can be queued at once. Queue depth is the real upgrade. */
  readonly queueCapacity: number;
  /** Specialization that makes this processor cheaper and faster. */
  readonly favouredBy: SpecializationId;
  readonly description: string;
}

export const PROCESSORS: Readonly<Record<ProcessorKind, ProcessorDefinition>> = Object.freeze({
  mill: {
    id: 'mill',
    displayName: 'Stone Mill',
    buildCost: cents(12_000),
    buildTicks: secondsToTicks(150),
    footprint: { width: 2, depth: 2 },
    upkeepPerDay: cents(90),
    queueCapacity: 3,
    favouredBy: 'arable',
    description: 'Grinds wheat into flour, which keeps far better than grain and sells for more.',
  },
  creamery: {
    id: 'creamery',
    displayName: 'Creamery',
    buildCost: cents(16_000),
    buildTicks: secondsToTicks(180),
    footprint: { width: 2, depth: 2 },
    upkeepPerDay: cents(140),
    queueCapacity: 2,
    favouredBy: 'livestock',
    description: 'Turns milk into cheese. Slow, expensive, and the best margin on the farm.',
  },
  preserve_kitchen: {
    id: 'preserve_kitchen',
    displayName: 'Preserve Kitchen',
    buildCost: cents(9_000),
    buildTicks: secondsToTicks(120),
    footprint: { width: 2, depth: 1 },
    upkeepPerDay: cents(70),
    queueCapacity: 4,
    favouredBy: 'market_garden',
    description:
      'Puts pumpkin up in jars. Cheap to run and the only way a glut of produce survives winter.',
  },
});

export const RECIPES: readonly RecipeDefinition[] = Object.freeze([
  {
    id: 'recipe-flour',
    processor: 'mill',
    displayName: 'Mill flour',
    inputItemId: 'wheat',
    inputQuantity: 4,
    outputItemId: 'flour',
    outputQuantity: 2,
    batchTicks: secondsToTicks(60),
    batchCost: cents(60),
  },
  {
    id: 'recipe-cheese',
    processor: 'creamery',
    displayName: 'Press cheese',
    inputItemId: 'milk',
    inputQuantity: 5,
    outputItemId: 'cheese',
    outputQuantity: 2,
    batchTicks: secondsToTicks(150),
    batchCost: cents(180),
  },
  {
    id: 'recipe-preserves',
    processor: 'preserve_kitchen',
    displayName: 'Bottle preserves',
    inputItemId: 'pumpkin',
    inputQuantity: 3,
    outputItemId: 'preserves',
    outputQuantity: 3,
    batchTicks: secondsToTicks(90),
    batchCost: cents(120),
  },
]);

export const RECIPES_BY_ID: Readonly<Record<string, RecipeDefinition>> = Object.freeze(
  Object.fromEntries(RECIPES.map((recipe) => [recipe.id, recipe])),
);

export function getRecipe(id: string): RecipeDefinition | undefined {
  return RECIPES_BY_ID[id];
}

export function recipesFor(processor: ProcessorKind): readonly RecipeDefinition[] {
  return RECIPES.filter((recipe) => recipe.processor === processor);
}

export function getProcessor(id: string): ProcessorDefinition | undefined {
  return (PROCESSORS as Record<string, ProcessorDefinition>)[id];
}

export const PROCESSOR_KINDS = Object.keys(PROCESSORS) as readonly ProcessorKind[];
