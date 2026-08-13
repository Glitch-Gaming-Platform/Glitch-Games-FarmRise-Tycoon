/**
 * Running a processor.
 *
 * The decision a processor creates is "sell this now, or spend money and time
 * turning it into something worth more later". These functions make both sides
 * of that comparison computable, so the UI can show it honestly rather than
 * implying that processing is always correct.
 */
import { getItem } from '../domain/items.js';
import { cents, type Cents } from '../domain/ids.js';
import {
  PROCESSORS,
  RECIPES,
  getRecipe,
  type ProcessorKind,
  type RecipeDefinition,
} from '../domain/processing.js';
import { SPECIALIZATIONS, type SpecializationId } from '../domain/specializations.js';
import type { Ticks } from '../domain/time.js';
import { ok, ruleViolation, type Result } from './result.js';
import type { Inventory } from './storage.js';

export interface QueueEntry {
  readonly recipeId: string;
  readonly batches: number;
  readonly remainingTicks: Ticks;
}

export interface ProcessorAccessContract {
  readonly itemId: string;
  readonly status: string;
}

/**
 * A processed-goods promise teaches exactly the machine needed to keep it.
 *
 * Normal progression still unlocks the complete processing yard together. The
 * contract exception exists for compatibility with careers that were offered a
 * processed item before that milestone, so accepting one can never strand the
 * player without its required building.
 */
export function hasProcessorAccess(
  kind: ProcessorKind,
  unlocks: readonly string[],
  contracts: readonly ProcessorAccessContract[],
): boolean {
  if (unlocks.includes('processing')) return true;
  return RECIPES.some(
    (recipe) =>
      recipe.processor === kind &&
      contracts.some(
        (contract) => contract.status === 'open' && contract.itemId === recipe.outputItemId,
      ),
  );
}

/** Batch time after the specialization that favours this processor is applied. */
export function batchTicksFor(
  recipe: RecipeDefinition,
  specialization: SpecializationId | null,
): Ticks {
  if (!specialization) return recipe.batchTicks;
  const definition = SPECIALIZATIONS[specialization];
  const favoured = PROCESSORS[recipe.processor].favouredBy === specialization;
  return Math.max(1, Math.round(recipe.batchTicks * (favoured ? definition.processingSpeed : 1)));
}

export function processorBuildCost(
  kind: ProcessorKind,
  specialization: SpecializationId | null,
): Cents {
  const processor = PROCESSORS[kind];
  if (!specialization) return processor.buildCost;
  const definition = SPECIALIZATIONS[specialization];
  return definition.primaryProcessor === kind
    ? cents(processor.buildCost * definition.processorCostMultiplier)
    : processor.buildCost;
}

/** What a batch is worth, ignoring quality and contracts. Drives the "is it worth it?" line. */
export function batchMargin(recipe: RecipeDefinition): Cents {
  const inputValue = (getItem(recipe.inputItemId)?.spotUnitPrice ?? 0) * recipe.inputQuantity;
  const outputValue = (getItem(recipe.outputItemId)?.spotUnitPrice ?? 0) * recipe.outputQuantity;
  return cents(outputValue - inputValue - recipe.batchCost);
}

export interface QueueRequest {
  readonly recipeId: string;
  readonly batches: number;
  readonly queue: readonly QueueEntry[];
  readonly available: Inventory;
  readonly balance: Cents;
  readonly processorKind: ProcessorKind;
  readonly specialization: SpecializationId | null;
  readonly broken: boolean;
}

export interface QueueOutcome {
  readonly queue: readonly QueueEntry[];
  readonly consumed: Inventory;
  readonly cost: Cents;
}

/**
 * Validates and applies a request to queue batches.
 *
 * Inputs are taken up front, so a queued batch cannot be starved by selling the
 * grain it was going to use. That is also what makes queueing a commitment.
 */
export function queueBatches(request: QueueRequest): Result<QueueOutcome> {
  const recipe = getRecipe(request.recipeId);
  if (!recipe) return ruleViolation(`Unknown recipe: ${request.recipeId}.`);
  if (recipe.processor !== request.processorKind) {
    return ruleViolation(`${recipe.displayName} cannot be made here.`);
  }
  if (request.broken) return ruleViolation('That machine is broken.');
  if (!Number.isInteger(request.batches) || request.batches <= 0) {
    return ruleViolation('Batch count must be a positive whole number.');
  }

  const capacity = PROCESSORS[request.processorKind].queueCapacity;
  const queued = request.queue.reduce((sum, entry) => sum + entry.batches, 0);
  if (queued + request.batches > capacity) {
    return ruleViolation(`This machine holds ${capacity} batches at a time.`);
  }

  const needed = recipe.inputQuantity * request.batches;
  const held = request.available[recipe.inputItemId] ?? 0;
  if (held < needed) {
    return ruleViolation(`Needs ${needed} ${recipe.inputItemId}; ${held} is on hand.`);
  }

  const cost = cents(recipe.batchCost * request.batches);
  if (request.balance < cost) return ruleViolation('Not enough money to run that batch.');

  const isFirst = request.queue.length === 0;
  const entry: QueueEntry = {
    recipeId: recipe.id,
    batches: request.batches,
    remainingTicks: isFirst ? batchTicksFor(recipe, request.specialization) : 0,
  };

  return ok({
    queue: [...request.queue, entry],
    consumed: { ...request.available, [recipe.inputItemId]: held - needed },
    cost,
  });
}

export interface AdvanceOutcome {
  readonly queue: readonly QueueEntry[];
  /** Items finished this step, ready to be pushed into a store. */
  readonly produced: Inventory;
  readonly completedBatches: number;
}

/**
 * Advances the head of the queue.
 *
 * A processor is a machine, not a spreadsheet: exactly one batch runs at a
 * time, and a broken machine makes no progress at all - which is what gives the
 * breakdown incident teeth.
 */
export function advanceQueue(
  queue: readonly QueueEntry[],
  dtTicks: Ticks,
  specialization: SpecializationId | null,
  broken = false,
): AdvanceOutcome {
  if (broken || queue.length === 0 || dtTicks <= 0) {
    return { queue, produced: {}, completedBatches: 0 };
  }

  const next = queue.map((entry) => ({ ...entry }));
  const produced: Record<string, number> = {};
  let remaining = dtTicks;
  let completed = 0;

  while (remaining > 0 && next.length > 0) {
    const head = next[0] as QueueEntry & { remainingTicks: number; batches: number };
    const recipe = getRecipe(head.recipeId);
    if (!recipe) {
      next.shift();
      continue;
    }
    if (head.remainingTicks <= 0) {
      head.remainingTicks = batchTicksFor(recipe, specialization);
    }

    const step = Math.min(remaining, head.remainingTicks);
    head.remainingTicks -= step;
    remaining -= step;

    if (head.remainingTicks > 0) break;

    produced[recipe.outputItemId] = (produced[recipe.outputItemId] ?? 0) + recipe.outputQuantity;
    completed += 1;
    head.batches -= 1;
    if (head.batches <= 0) next.shift();
    else head.remainingTicks = batchTicksFor(recipe, specialization);
  }

  return { queue: next, produced, completedBatches: completed };
}

/** Ticks until the whole queue is empty. Shown on the processor panel. */
export function queueDuration(
  queue: readonly QueueEntry[],
  specialization: SpecializationId | null,
): Ticks {
  return queue.reduce((total, entry) => {
    const recipe = getRecipe(entry.recipeId);
    if (!recipe) return total;
    const full = batchTicksFor(recipe, specialization);
    const head = entry.remainingTicks > 0 ? entry.remainingTicks : full;
    return total + head + full * Math.max(0, entry.batches - 1);
  }, 0);
}
