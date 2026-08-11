import { describe, expect, it } from 'vitest';
import {
  PROCESSORS,
  RECIPES,
  advanceQueue,
  batchMargin,
  batchTicksFor,
  cents,
  getRecipe,
  processorBuildCost,
  queueBatches,
  queueDuration,
  type QueueEntry,
} from '../src/index.js';

const FLOUR = 'recipe-flour';

const request = (overrides: Partial<Parameters<typeof queueBatches>[0]> = {}) =>
  queueBatches({
    recipeId: FLOUR,
    batches: 1,
    queue: [],
    available: { wheat: 100 },
    balance: cents(50_000),
    processorKind: 'mill',
    specialization: null,
    broken: false,
    ...overrides,
  });

describe('the recipe table', () => {
  it('only ever produces something worth more than its inputs', () => {
    for (const recipe of RECIPES) {
      expect(batchMargin(recipe)).toBeGreaterThan(0);
    }
  });

  it('belongs to a processor that exists', () => {
    for (const recipe of RECIPES) {
      expect(PROCESSORS[recipe.processor]).toBeDefined();
    }
  });
});

describe('queueBatches', () => {
  it('takes the input up front, so a queued batch cannot be starved', () => {
    const result = request({ batches: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const recipe = getRecipe(FLOUR);
    expect(result.value.consumed['wheat']).toBe(100 - (recipe?.inputQuantity ?? 0) * 2);
    expect(result.value.cost).toBe((recipe?.batchCost ?? 0) * 2);
  });

  it('refuses a recipe the machine cannot make', () => {
    expect(request({ processorKind: 'creamery' }).ok).toBe(false);
  });

  it('refuses an unknown recipe', () => {
    expect(request({ recipeId: 'recipe-imaginary' }).ok).toBe(false);
  });

  it('refuses a broken machine', () => {
    expect(request({ broken: true }).ok).toBe(false);
  });

  it('refuses without the input on hand', () => {
    expect(request({ available: { wheat: 1 } }).ok).toBe(false);
  });

  it('refuses without the money for the batch', () => {
    expect(request({ balance: cents(0) }).ok).toBe(false);
  });

  it('refuses a non-positive batch count', () => {
    expect(request({ batches: 0 }).ok).toBe(false);
    expect(request({ batches: 1.5 }).ok).toBe(false);
  });

  it('respects the machine’s queue depth', () => {
    const capacity = PROCESSORS.mill.queueCapacity;
    expect(request({ batches: capacity }).ok).toBe(true);
    expect(request({ batches: capacity + 1 }).ok).toBe(false);
  });
});

describe('advanceQueue', () => {
  const entry = (): QueueEntry[] => [
    { recipeId: FLOUR, batches: 2, remainingTicks: batchTicksFor(getRecipe(FLOUR)!, null) },
  ];

  it('produces nothing before the batch time has elapsed', () => {
    const outcome = advanceQueue(entry(), 5, null);
    expect(outcome.completedBatches).toBe(0);
    expect(Object.keys(outcome.produced)).toHaveLength(0);
  });

  it('produces the recipe’s output when a batch finishes', () => {
    const recipe = getRecipe(FLOUR);
    if (!recipe) throw new Error('Missing recipe.');
    const outcome = advanceQueue(entry(), recipe.batchTicks, null);
    expect(outcome.completedBatches).toBe(1);
    expect(outcome.produced[recipe.outputItemId]).toBe(recipe.outputQuantity);
    expect(outcome.queue[0]?.batches).toBe(1);
  });

  it('empties the queue once every batch is done', () => {
    const recipe = getRecipe(FLOUR);
    if (!recipe) throw new Error('Missing recipe.');
    const outcome = advanceQueue(entry(), recipe.batchTicks * 2, null);
    expect(outcome.completedBatches).toBe(2);
    expect(outcome.queue).toHaveLength(0);
  });

  it('makes no progress at all while the machine is broken', () => {
    const recipe = getRecipe(FLOUR);
    if (!recipe) throw new Error('Missing recipe.');
    const outcome = advanceQueue(entry(), recipe.batchTicks * 5, null, true);
    expect(outcome.completedBatches).toBe(0);
    expect(outcome.queue[0]?.remainingTicks).toBe(entry()[0]?.remainingTicks);
  });

  it('does nothing with an empty queue', () => {
    expect(advanceQueue([], 1_000, null).completedBatches).toBe(0);
  });
});

describe('specialization', () => {
  it('runs the favoured processor faster and cheaper', () => {
    const recipe = getRecipe(FLOUR);
    if (!recipe) throw new Error('Missing recipe.');
    expect(batchTicksFor(recipe, 'arable')).toBeLessThan(batchTicksFor(recipe, null));
    expect(processorBuildCost('mill', 'arable')).toBeLessThan(processorBuildCost('mill', null));
  });

  it('gives no advantage at somebody else’s machine', () => {
    const recipe = getRecipe(FLOUR);
    if (!recipe) throw new Error('Missing recipe.');
    expect(batchTicksFor(recipe, 'livestock')).toBe(batchTicksFor(recipe, null));
    expect(processorBuildCost('mill', 'livestock')).toBe(processorBuildCost('mill', null));
  });
});

describe('queueDuration', () => {
  it('is zero when idle and grows with each queued batch', () => {
    const recipe = getRecipe(FLOUR);
    if (!recipe) throw new Error('Missing recipe.');
    expect(queueDuration([], null)).toBe(0);
    const one = queueDuration([{ recipeId: FLOUR, batches: 1, remainingTicks: 0 }], null);
    const two = queueDuration([{ recipeId: FLOUR, batches: 2, remainingTicks: 0 }], null);
    expect(two).toBeGreaterThan(one);
  });
});
