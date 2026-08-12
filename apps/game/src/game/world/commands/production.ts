/**
 * Processing, hiring and choosing what kind of farm this is.
 *
 * Each of these is a commitment rather than a purchase: a queued batch spends
 * goods you could have sold, a hire adds a wage that is charged whether or not
 * there was work, and a specialization makes you better at one chain by making
 * you worse at the others.
 */
import {
  SPECIALIZATIONS,
  cents,
  getRecipe,
  isSpecializationId,
  ok,
  queueBatches,
  ruleViolation,
  validateHire,
  validateProjectStart,
  type Result,
  type SpecializationId,
  type WorkerRole,
} from '@farmrise/shared';
import type { Career } from '../../career/Career.js';

/** Queues batches at a processor the player is standing at. */
export function queueProcessing(
  career: Career,
  buildingId: string,
  recipeId: string,
  batches: number,
): Result<void> {
  const world = career.world;
  const building = world.structures.get(buildingId);
  if (!building) return ruleViolation('There is no machine there.');
  if (building.remainingBuildTicks > 0) return ruleViolation('That is still being built.');

  const processor = world.processing.forBuilding(buildingId);
  if (!processor) return ruleViolation('That building does not process anything.');

  const recipe = getRecipe(recipeId);
  if (!recipe) return ruleViolation('Unknown recipe.');

  const result = queueBatches({
    recipeId,
    batches,
    queue: processor.queue,
    available: world.stores.combined(),
    balance: career.balance,
    processorKind: building.kind as never,
    specialization: career.specialization,
    broken: building.broken,
  });
  if (!result.ok) return result;

  const taken = world.stores.withdrawAnywhere(recipe.inputItemId, recipe.inputQuantity * batches);
  if (!taken.ok) return taken;

  career.adjustBalance(cents(-result.value.cost), 'processing');
  world.processing.enqueue(processor.id, result.value.queue, recipeId, batches);
  return ok(undefined);
}

/** Pulls a queued batch's input back out of a machine. */
export function unloadProcessor(career: Career, buildingId: string): Result<{ recovered: number }> {
  const processor = career.world.processing.forBuilding(buildingId);
  if (!processor) return ruleViolation('There is no machine there.');

  const recovered = career.world.processing.unload(processor.id);
  const building = career.world.structures.get(buildingId);
  let total = 0;
  for (const [itemId, quantity] of Object.entries(recovered)) {
    total += quantity;
    if (building) {
      career.world.depositNear(building.tileX, building.tileZ, itemId, quantity, 1);
    }
  }
  if (total === 0) return ruleViolation('There is nothing in it.');
  return ok({ recovered: total });
}

export function hireWorker(career: Career, role: string): Result<{ id: string }> {
  const world = career.world;
  const occupied = new Set(
    world.workforce.workers.map((worker) => worker.hutBuildingId).filter(Boolean),
  );
  const freeHuts = world.structures.completed('worker_hut').filter((hut) => !occupied.has(hut.id));

  const check = validateHire(role, {
    workers: world.workforce.workers,
    balance: career.balance,
    freeHuts: freeHuts.length,
    unlocks: career.unlocks,
  });
  if (!check.ok) return check;

  const hut = freeHuts[0];
  career.adjustBalance(cents(-check.value.cost), 'hiring');
  const worker = world.workforce.hire(
    role as WorkerRole,
    workerName(world.workforce.count),
    hut?.id ?? null,
    hut?.tileX ?? world.level.shelter.tileX,
    hut?.tileZ ?? world.level.shelter.tileZ,
  );
  return ok({ id: worker.id });
}

export function setWorkerPriorities(
  career: Career,
  workerId: string,
  priorities: readonly string[],
): Result<void> {
  if (!career.world.workforce.get(workerId))
    return ruleViolation('Nobody by that name works here.');
  career.world.workforce.setPriorities(workerId, priorities);
  return ok(undefined);
}

/**
 * Chooses, or changes, the farm's identity.
 *
 * Changing costs real money, so an early guess is recoverable without making
 * the original choice meaningless.
 */
export function chooseSpecialization(career: Career, id: string): Result<void> {
  if (!isSpecializationId(id)) return ruleViolation('There is no such way to farm.');
  if (!career.unlocks.includes('specialization')) {
    return ruleViolation('Your farm is not established enough to specialise yet.');
  }
  const current = career.specialization;
  if (current === id) return ruleViolation('That is already how you farm.');

  if (current) {
    const cost = SPECIALIZATIONS[current as SpecializationId].switchCost;
    if (career.balance < cost) {
      return ruleViolation('Changing how the farm works costs more than you have.');
    }
    career.adjustBalance(cents(-cost), 'specialisation change');
  }
  career.chooseSpecialization(id);
  return ok(undefined);
}

/** Proposes and funds a community project. */
export function startTownProject(career: Career, projectId: string): Result<void> {
  const check = validateProjectStart({
    projectId,
    prosperity: career.town.prosperity,
    completedProjectIds: career.town.completedProjectIds,
    hasActiveProject: career.town.activeProject !== null,
    balance: career.balance,
    available: career.world.stores.combined(),
    unlocks: career.unlocks,
    ownedParcelIds: career.world.parcels.ownedIds,
  });
  if (!check.ok) return check;

  for (const [itemId, quantity] of Object.entries(check.value.project.materials)) {
    const taken = career.world.stores.withdrawAnywhere(itemId, quantity);
    if (!taken.ok) return taken;
  }

  career.adjustBalance(cents(-check.value.project.cost), 'town project');
  career.setTown({
    ...career.town,
    activeProject: {
      id: check.value.project.id,
      remainingTicks: check.value.remainingTicks,
      contributedItems: { ...check.value.project.materials },
    },
  });
  return ok(undefined);
}

function workerName(index: number): string {
  const names = ['Aoife', 'Bram', 'Cass', 'Dilla', 'Enno', 'Fen'];
  return names[index % names.length] ?? `Hand ${index + 1}`;
}
