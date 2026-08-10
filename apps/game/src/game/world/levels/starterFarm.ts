/**
 * The starter farm: one parcel, six plots, a shelter and a scattering of rocks.
 *
 * Sized so the walk between the furthest plot and the shelter is long enough
 * that a road is tempting, but short enough that not building one is survivable
 * - the "Meaningful Reinvestment" pillar only works if both choices are live.
 */
import type { LevelDefinition } from './LevelDefinition.js';

export const STARTER_FARM: LevelDefinition = {
  id: 'starter-farm',
  displayName: 'Millbrook Smallholding',
  grid: { width: 16, depth: 16, tileSize: 2 },
  spawn: { tileX: 8, tileZ: 12 },
  plots: [
    { id: 'plot-1', tileX: 4, tileZ: 4 },
    { id: 'plot-2', tileX: 6, tileZ: 4 },
    { id: 'plot-3', tileX: 8, tileZ: 4 },
    { id: 'plot-4', tileX: 4, tileZ: 6 },
    { id: 'plot-5', tileX: 6, tileZ: 6 },
    { id: 'plot-6', tileX: 8, tileZ: 6 },
  ],
  blockedTiles: [
    { tileX: 1, tileZ: 1 },
    { tileX: 2, tileZ: 1 },
    { tileX: 14, tileZ: 2 },
    { tileX: 13, tileZ: 13 },
    { tileX: 14, tileZ: 13 },
  ],
  startingBuildings: [],
  shelter: { tileX: 12, tileZ: 8 },
};
