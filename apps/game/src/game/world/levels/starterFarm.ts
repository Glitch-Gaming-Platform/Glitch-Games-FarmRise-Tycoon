/**
 * The Millbrook estate.
 *
 * The player begins owning the middle of it - one parcel, six beds, a shelter
 * and a scattering of rocks - and can see the fields they do not own yet in
 * every direction. Sized so the walk between the furthest bed and the shelter
 * is long enough that a road is tempting but short enough that not building one
 * is survivable; the "Meaningful Reinvestment" pillar only works if both
 * choices are live.
 *
 * Geometry that the server must also agree on (the estate grid, parcel bounds,
 * bed positions, the shelter and the scenery) comes from `@farmrise/shared`, so
 * this file cannot drift away from what a save is validated against.
 */
import {
  ESTATE_GRID,
  STARTER_BLOCKED_TILES,
  STARTER_LEVEL_ID,
  STARTER_REGION_ID,
  STARTER_SHELTER,
  STARTER_SPAWN,
} from '@farmrise/shared';
import type { LevelDefinition } from './LevelDefinition.js';

export const STARTER_FARM: LevelDefinition = {
  id: STARTER_LEVEL_ID,
  displayName: 'Millbrook Smallholding',
  regionId: STARTER_REGION_ID,
  grid: { width: ESTATE_GRID.width, depth: ESTATE_GRID.depth, tileSize: ESTATE_GRID.tileSize },
  spawn: { tileX: STARTER_SPAWN.tileX, tileZ: STARTER_SPAWN.tileZ },
  blockedTiles: STARTER_BLOCKED_TILES.map((tile) => ({ tileX: tile.tileX, tileZ: tile.tileZ })),
  startingBuildings: [],
  shelter: { tileX: STARTER_SHELTER.tileX, tileZ: STARTER_SHELTER.tileZ },
  // The lane to town leaves the homestead's south-west corner, which is what
  // makes the South Works parcel - the one that sits on that road - worth more
  // than its size suggests.
  townGate: { tileX: 9, tileZ: 23 },
};

export const LEVELS: Readonly<Record<string, LevelDefinition>> = Object.freeze({
  [STARTER_FARM.id]: STARTER_FARM,
});

export function getLevel(id: string): LevelDefinition | undefined {
  return LEVELS[id];
}
