/**
 * Putting things on the land, and buying more land to put them on.
 *
 * Land purchase is the command that changed most: it used to end the run, and
 * now it opens a gate (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.4).
 */
import {
  ANIMALS,
  BUILDINGS,
  cents,
  getAnimal,
  isAnimalSpecies,
  ok,
  processorBuildCost,
  ruleViolation,
  validateLandPurchase,
  type BuildingKind,
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
  if (!world.grid.canPlace(tileX, tileZ, definition.footprint.width, definition.footprint.depth)) {
    return ruleViolation('Something is already there.');
  }
  if (!world.parcels.ownsTile(tileX, tileZ)) {
    return ruleViolation('You do not own that land.');
  }
  // Soil is finite and the beds on it are the whole game. Refuse to pave them.
  if (world.grid.hasFlag(tileX, tileZ, TileFlag.Soil)) {
    return ruleViolation('You cannot build on a crop bed.');
  }

  career.adjustBalance(cents(-cost), 'construction');
  const id = world.structures.nextId();
  world.structures.add({
    id,
    kind,
    tileX,
    tileZ,
    rotation: 0,
    remainingBuildTicks: definition.buildTicks,
    broken: false,
  });
  career.bump('buildingsBuilt');
  return ok({ id });
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
