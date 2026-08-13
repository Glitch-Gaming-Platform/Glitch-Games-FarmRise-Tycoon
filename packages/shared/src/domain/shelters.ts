/** Stable shelter identity and layout rules shared by saves, client and server. */
import { normalizeBuildingRotation, type BuildingRotation } from './buildings.js';

/** The inherited coop is part of the level rather than the placed-building list. */
export const STARTER_SHELTER_ID = 'shelter-starter';

/** Animal slots provided by the inherited coop and by each completed purchased shelter. */
export const SHELTER_CAPACITY_UNITS = 4;

/** Existing fence progression remains additive across the active farm site. */
export const FENCE_SHELTER_CAPACITY_UNITS = 2;

export interface ShelterProductDropTile {
  readonly tileX: number;
  readonly tileZ: number;
}

/**
 * Reserved walkable tile immediately outside a purchased shelter's door.
 *
 * The shelter occupies a square 2x2 footprint. Rotation changes which side is
 * the front while keeping this collection tile outside the occupied footprint.
 */
export function animalShelterProductDropTile(
  tileX: number,
  tileZ: number,
  rotation: number = 0,
): ShelterProductDropTile {
  switch (normalizeBuildingRotation(rotation) as BuildingRotation) {
    case 1:
      return { tileX: tileX + 2, tileZ };
    case 2:
      return { tileX, tileZ: tileZ - 1 };
    case 3:
      return { tileX: tileX - 1, tileZ: tileZ + 1 };
    case 0:
    default:
      return { tileX: tileX + 1, tileZ: tileZ + 2 };
  }
}
