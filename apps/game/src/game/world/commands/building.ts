/**
 * Putting things on the land, and buying more land to put them on.
 *
 * Land purchase is the command that changed most: it used to end the run, and
 * now it opens a gate (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.4).
 */
import {
  ANIMALS,
  BUILDINGS,
  buildingFootprint,
  cents,
  getAnimal,
  isAnimalSpecies,
  normalizeBuildingRotation,
  ok,
  processorBuildCost,
  ruleViolation,
  validateLandPurchase,
  type BuildingKind,
  type BuildingRotation,
  type ProcessorKind,
  type Result,
} from '@farmrise/shared';
import { TileFlag } from '@engine/physics/TileGrid.js';
import type { Career } from '../../career/Career.js';

const PROCESSOR_KINDS = new Set<string>(['mill', 'creamery', 'preserve_kitchen']);

export function buildCostFor(career: Career, kind: BuildingKind): number {
  return PROCESSOR_KINDS.has(kind)
    ? processorBuildCost(kind as ProcessorKind, career.specialization)
    : BUILDINGS[kind].buildCost;
}

export function build(
  career: Career,
  kind: BuildingKind,
  tileX: number,
  tileZ: number,
  rotation: number = 0,
): Result<{ id: string }> {
  const world = career.world;
  const definition = BUILDINGS[kind];
  if (!definition) return ruleViolation(`Unknown building "${kind}".`);
  if (definition.requiresUnlock && !career.unlocks.includes(definition.requiresUnlock)) {
    return ruleViolation('You do not know how to build that yet.');
  }

  const cost = buildCostFor(career, kind);
  if (career.balance < cost) {
    return ruleViolation(`Not enough money to build a ${definition.displayName.toLowerCase()}.`);
  }
  const normalizedRotation = normalizeBuildingRotation(rotation);
  const siteProblem = buildingSiteProblem(career, kind, tileX, tileZ, normalizedRotation);
  if (siteProblem) return ruleViolation(siteProblem);

  career.adjustBalance(cents(-cost), 'construction');
  const id = world.structures.nextId();
  world.structures.add({
    id,
    kind,
    tileX,
    tileZ,
    rotation: normalizedRotation,
    remainingBuildTicks: definition.buildTicks,
    broken: false,
  });
  career.bump('buildingsBuilt');
  return ok({ id });
}

/** Shared by the placement preview and the command so green always means valid. */
export function buildingSiteProblem(
  career: Career,
  kind: BuildingKind,
  tileX: number,
  tileZ: number,
  rotation: BuildingRotation = 0,
): string | null {
  const definition = BUILDINGS[kind];
  if (!definition) return `Unknown building "${kind}".`;
  const { width, depth } = buildingFootprint(kind, rotation);
  const world = career.world;
  if (
    !world.grid.inBounds(tileX, tileZ) ||
    !world.grid.inBounds(tileX + width - 1, tileZ + depth - 1)
  ) {
    return 'That would extend beyond the farm.';
  }
  if (!world.grid.canPlace(tileX, tileZ, width, depth)) return 'Something is already there.';

  for (let dz = 0; dz < depth; dz += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const x = tileX + dx;
      const z = tileZ + dz;
      if (!world.parcels.ownsTile(x, z)) return 'You do not own that land.';
      // Soil is finite and the beds on it are the whole game. Refuse to pave
      // any part of one, not only the footprint's top-left tile.
      if (world.grid.hasFlag(x, z, TileFlag.Soil)) return 'You cannot build on a crop bed.';
    }
  }
  return null;
}

export function buyAnimal(career: Career, species: string, count = 1): Result<void> {
  if (!isAnimalSpecies(species)) return ruleViolation(`Unknown animal "${species}".`);
  const definition = getAnimal(species);
  if (!definition) return ruleViolation(`Unknown animal "${species}".`);
  if (count <= 0 || !Number.isInteger(count)) {
    return ruleViolation('Count must be a positive whole number.');
  }
  if (definition.requiresUnlock && !career.unlocks.includes(definition.requiresUnlock)) {
    return ruleViolation(
      `You are not set up to keep ${definition.displayName.toLowerCase()}s yet.`,
    );
  }

  const total = cents(definition.purchaseCost * count);
  if (career.balance < total) return ruleViolation('Not enough money.');

  const world = career.world;
  const used = world.animalSlotsUsed();
  if (used + count * definition.shelterSlots > world.shelterCapacity()) {
    return ruleViolation('Not enough shelter space. Build more fencing first.');
  }

  career.adjustBalance(cents(-total), 'livestock');
  world.livestock.add(definition.id, count, world.level.shelter.tileX, world.level.shelter.tileZ);
  return ok(undefined);
}

/**
 * Buys a named parcel.
 *
 * The purchase is validated by the shared rules - the same function the server
 * runs - and then applied to the world, which opens the gate, exposes the beds
 * and makes the ground buildable.
 */
export function buyLand(career: Career, parcelId: string): Result<{ parcelId: string }> {
  const check = validateLandPurchase(
    parcelId,
    career.world.parcels.ownedIds,
    career.balance,
    career.stage,
  );
  if (!check.ok) return check;

  career.adjustBalance(cents(-check.value.parcel.purchaseCost), 'land');
  career.world.acquireParcel(check.value.parcel.id);
  return ok({ parcelId: check.value.parcel.id });
}

/** Shelter capacity, surfaced so the build panel never hardcodes it. */
export function shelterCapacity(career: Career): number {
  return career.world.shelterCapacity();
}

export function animalDefinition(species: string) {
  return ANIMALS[species as keyof typeof ANIMALS];
}
