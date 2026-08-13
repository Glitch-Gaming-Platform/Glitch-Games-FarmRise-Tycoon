/**
 * Putting things on the land, and buying more land to put them on.
 *
 * Land purchase is the command that changed most: it used to end the run, and
 * now it opens a gate (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.4).
 */
import {
  ANIMALS,
  BUILDINGS,
  animalShelterProductDropTile,
  buildingFootprint,
  cents,
  getAnimal,
  hasBuildingAccess,
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
  if (!hasBuildingAccess(kind, career.unlocks, career.contracts)) {
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
  if (kind === 'animal_shelter') {
    const drop = animalShelterProductDropTile(tileX, tileZ, rotation);
    if (!world.grid.inBounds(drop.tileX, drop.tileZ)) {
      return 'The shelter needs a collection space inside the farm boundary.';
    }
    if (!world.parcels.ownsTile(drop.tileX, drop.tileZ)) {
      return 'The shelter door must open onto land you own.';
    }
    if (
      world.grid.hasFlag(drop.tileX, drop.tileZ, TileFlag.Soil) ||
      !world.grid.canPlace(drop.tileX, drop.tileZ, 1, 1)
    ) {
      return 'The shelter needs a clear collection space outside its door.';
    }
  }
  return null;
}

export function buyAnimal(
  career: Career,
  species: string,
  count = 1,
  nearTile?: {
    readonly tileX: number;
    readonly tileZ: number;
    readonly shelterId?: string;
  },
): Result<void> {
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
  const requiredSlots = count * definition.shelterSlots;
  const selectedShelter = nearTile?.shelterId ? world.shelters.get(nearTile.shelterId) : undefined;
  if (nearTile?.shelterId && !selectedShelter) {
    return ruleViolation('That animal shelter is not completed.');
  }
  if (
    selectedShelter &&
    world.shelters.capacityFor(selectedShelter.id) - world.shelterSlotsUsedAt(selectedShelter.id) <
      requiredSlots
  ) {
    return ruleViolation('That shelter does not have enough room.');
  }

  const shelter =
    selectedShelter ??
    world.shelters.nearestWithSpace(
      nearTile?.tileX ?? world.level.shelter.tileX,
      nearTile?.tileZ ?? world.level.shelter.tileZ,
      requiredSlots,
      (shelterId) => world.shelterSlotsUsedAt(shelterId),
    );
  if (!shelter) {
    return ruleViolation(
      'No single shelter has enough room. Build another shelter or add nearby fencing first.',
    );
  }

  career.adjustBalance(cents(-total), 'livestock');
  world.livestock.add(definition.id, count, shelter);
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
