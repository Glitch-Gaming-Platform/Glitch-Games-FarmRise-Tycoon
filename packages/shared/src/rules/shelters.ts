import { FENCE_SHELTER_CAPACITY_UNITS, SHELTER_CAPACITY_UNITS } from '../domain/shelters.js';

export interface ShelterCapacityBuilding {
  /** String-compatible because save validation receives untrusted wire data. */
  readonly kind: string;
  readonly remainingBuildTicks: number;
}

export interface ShelterPlacementBuilding extends ShelterCapacityBuilding {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

export interface StarterShelterPlacement {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

/** Per-shelter capacity, with each completed fence assigned to its nearest shelter. */
export function shelterCapacitiesForBuildings(
  buildings: readonly ShelterPlacementBuilding[],
  starter: StarterShelterPlacement,
): Readonly<Record<string, number>> {
  const shelters = [
    starter,
    ...buildings
      .filter((building) => building.kind === 'animal_shelter' && building.remainingBuildTicks <= 0)
      .map((building) => ({
        id: building.id,
        tileX: building.tileX + 0.5,
        tileZ: building.tileZ + 0.5,
      })),
  ];
  const capacities: Record<string, number> = Object.fromEntries(
    shelters.map((shelter) => [shelter.id, SHELTER_CAPACITY_UNITS]),
  );

  for (const fence of buildings) {
    if (fence.kind !== 'fence' || fence.remainingBuildTicks > 0) continue;
    let nearest = shelters[0]!;
    let nearestDistance = distanceSquared(nearest, fence.tileX, fence.tileZ);
    for (const shelter of shelters.slice(1)) {
      const distance = distanceSquared(shelter, fence.tileX, fence.tileZ);
      if (distance < nearestDistance || (distance === nearestDistance && shelter.id < nearest.id)) {
        nearest = shelter;
        nearestDistance = distance;
      }
    }
    capacities[nearest.id] =
      (capacities[nearest.id] ?? SHELTER_CAPACITY_UNITS) + FENCE_SHELTER_CAPACITY_UNITS;
  }

  return capacities;
}

/** Total animal capacity on a site, including the inherited shelter. */
export function shelterCapacityForBuildings(buildings: readonly ShelterCapacityBuilding[]): number {
  let capacity = SHELTER_CAPACITY_UNITS;
  for (const building of buildings) {
    if (building.remainingBuildTicks > 0) continue;
    if (building.kind === 'animal_shelter') capacity += SHELTER_CAPACITY_UNITS;
    if (building.kind === 'fence') capacity += FENCE_SHELTER_CAPACITY_UNITS;
  }
  return capacity;
}

function distanceSquared(
  shelter: { readonly tileX: number; readonly tileZ: number },
  tileX: number,
  tileZ: number,
): number {
  return (shelter.tileX - tileX) ** 2 + (shelter.tileZ - tileZ) ** 2;
}
