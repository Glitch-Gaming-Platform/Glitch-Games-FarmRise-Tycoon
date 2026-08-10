/**
 * Cheap authored-art collision proxies.
 *
 * These dimensions come from the Blender source bounds, reduced to the solid
 * mass a player should collide with (roof overhangs and the coop ramp are not
 * walls). They rasterise once into TileGrid's 0.5 m collision mask.
 */
import type { BuildingKind } from '@farmrise/shared';
import type { TileGrid } from '@engine/physics/TileGrid.js';

interface CollisionRect {
  readonly offsetX?: number;
  readonly offsetZ?: number;
  readonly width: number;
  readonly depth: number;
  readonly rotationY?: number;
}

const BUILDING_COLLIDERS: Readonly<Partial<Record<BuildingKind, readonly CollisionRect[]>>> = {
  // Barns already block their exact 2x2 tile footprint for pathfinding too.
  irrigation: [{ offsetX: 0.11, offsetZ: 0.22, width: 1.2, depth: 1.4 }],
  fence: [{ width: 1.96, depth: 0.2 }],
};

const SHELTER_COLLIDERS: readonly CollisionRect[] = [
  // Main coop walls. The front ramp remains walkable.
  { width: 2.7, depth: 2.3 },
  // The asymmetric nesting box on the left side is also solid.
  { offsetX: -1.53, offsetZ: -0.1, width: 0.48, depth: 0.62 },
];

const TROUGH_COLLIDER: CollisionRect = { width: 1.1, depth: 0.48, rotationY: -0.28 };

export function addBuildingCollision(
  grid: TileGrid,
  kind: BuildingKind,
  tileX: number,
  tileZ: number,
): void {
  const profiles = BUILDING_COLLIDERS[kind];
  if (!profiles) return;
  const center = grid.tileToWorld(tileX, tileZ);
  for (const profile of profiles) addRect(grid, center.x, center.z, profile);
}

export function addShelterCollision(grid: TileGrid, tileX: number, tileZ: number): void {
  const center = grid.tileToWorld(tileX, tileZ);
  for (const profile of SHELTER_COLLIDERS) addRect(grid, center.x, center.z, profile);

  // Must match StructureView's authored trough placement.
  addRect(grid, center.x - grid.tileSize * 0.95, center.z - grid.tileSize * 0.72, TROUGH_COLLIDER);
}

/** Accessible point at the coop door, used by foxes instead of its blocked centre. */
export function shelterDoorPoint(
  grid: TileGrid,
  tileX: number,
  tileZ: number,
): { x: number; z: number } {
  const center = grid.tileToWorld(tileX, tileZ);
  return { x: center.x, z: center.z + 1.72 };
}

function addRect(grid: TileGrid, centerX: number, centerZ: number, profile: CollisionRect): void {
  grid.blockWorldRect(
    centerX + (profile.offsetX ?? 0),
    centerZ + (profile.offsetZ ?? 0),
    profile.width,
    profile.depth,
    profile.rotationY ?? 0,
  );
}
