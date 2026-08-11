import { TileFlag } from '@engine/physics/TileGrid.js';
import type { FarmWorld } from '../FarmWorld.js';
import {
  sampleGroundSurface,
  type GroundGeometryOptions,
  type GroundSurfaceSample,
} from './groundGeometry.js';

export type TerrainSurface = 'road' | 'tilled-soil' | 'grass' | 'scrub';

/**
 * The authored large-scale terrain masses for the active estate.
 *
 * This used to be assembled inline in FarmView. Keeping it as data lets the
 * ground mesh, scatter placement and surface-contact effects all evaluate the
 * exact same farmyard, pasture and desire lines.
 */
export function createFarmGroundOptions(world: FarmWorld): GroundGeometryOptions {
  const worldWidth = world.grid.width * world.grid.tileSize;
  const worldDepth = world.grid.depth * world.grid.tileSize;
  const spawn = world.grid.tileToWorld(world.level.spawn.tileX, world.level.spawn.tileZ);
  const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
  const beds = world.fields.placements;
  const plotCenter = beds.reduce(
    (centre, plot) => {
      const point = world.grid.tileToWorld(plot.tileX, plot.tileZ);
      centre.x += point.x / Math.max(1, beds.length);
      centre.z += point.z / Math.max(1, beds.length);
      return centre;
    },
    { x: 0, z: 0 },
  );

  return {
    playableWidth: worldWidth,
    playableDepth: worldDepth,
    extentScale: 3,
    farmyard: { x: plotCenter.x, z: plotCenter.z + 0.8, radius: 8.8 },
    pasture: { x: shelter.x, z: shelter.z, radius: 8.4 },
    wornPaths: [
      { from: spawn, to: plotCenter, width: 1.45 },
      { from: plotCenter, to: shelter, width: 1.25 },
    ],
  };
}

export function groundSampleAt(
  options: GroundGeometryOptions,
  worldX: number,
  worldZ: number,
): GroundSurfaceSample {
  return sampleGroundSurface(worldX, worldZ, options);
}

/** Surface category used by contact VFX and future footstep audio variants. */
export function terrainSurfaceAt(
  world: FarmWorld,
  options: GroundGeometryOptions,
  worldX: number,
  worldZ: number,
): TerrainSurface {
  const tile = world.grid.worldToTile(worldX, worldZ);
  if (world.grid.hasFlag(tile.x, tile.z, TileFlag.Road)) return 'road';
  if (world.grid.hasFlag(tile.x, tile.z, TileFlag.Soil)) return 'tilled-soil';
  const sample = sampleGroundSurface(worldX, worldZ, options);
  return sample.localPasture >= 0.36 && sample.localEarth < 0.58 ? 'grass' : 'scrub';
}
