/**
 * A* over the tile grid.
 *
 * Used for hauling routes and for enemy (fox) approach paths. Roads lower the
 * traversal cost, which is what turns "build a road" from decoration into a
 * measurable economic decision - the pathfinder will genuinely prefer them.
 *
 * The open set is a plain array with a linear scan for the minimum. On a
 * 64x64 grid that is faster in practice than a binary heap because of cache
 * behaviour and the tiny constant factor; revisit if the grid grows past ~10k
 * tiles.
 */
import { TileFlag, type TileCoord, type TileGrid } from './TileGrid.js';

export interface PathOptions {
  /** Allow 8-way movement. Diagonals cost sqrt(2). */
  readonly allowDiagonal?: boolean;
  /** Hard cap on explored nodes, so a hopeless search cannot stall a frame. */
  readonly maxNodes?: number;
  /** Traversal multiplier on road tiles. Injected; see GridPhysicsOptions. */
  readonly roadMultiplier?: number;
}

const NEIGHBOURS_4: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NEIGHBOURS_8: readonly [number, number][] = [
  ...NEIGHBOURS_4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function findPath(
  grid: TileGrid,
  start: TileCoord,
  goal: TileCoord,
  options: PathOptions = {},
): TileCoord[] | null {
  const allowDiagonal = options.allowDiagonal ?? true;
  const maxNodes = options.maxNodes ?? 4096;
  const neighbours = allowDiagonal ? NEIGHBOURS_8 : NEIGHBOURS_4;
  const roadMultiplier = options.roadMultiplier ?? 0.55;

  if (!grid.inBounds(start.x, start.z) || !grid.inBounds(goal.x, goal.z)) return null;
  if (grid.hasFlag(goal.x, goal.z, TileFlag.Blocked)) return null;

  const startIndex = grid.index(start.x, start.z);
  const goalIndex = grid.index(goal.x, goal.z);
  if (startIndex === goalIndex) return [start];

  const cameFrom = new Int32Array(grid.tileCount).fill(-1);
  const gScore = new Float32Array(grid.tileCount).fill(Number.POSITIVE_INFINITY);
  const closed = new Uint8Array(grid.tileCount);
  gScore[startIndex] = 0;

  const open: { index: number; f: number }[] = [{ index: startIndex, f: heuristic(start, goal) }];
  let explored = 0;

  while (open.length > 0 && explored < maxNodes) {
    let bestAt = 0;
    for (let i = 1; i < open.length; i += 1) {
      if ((open[i]?.f ?? Infinity) < (open[bestAt]?.f ?? Infinity)) bestAt = i;
    }
    const current = open.splice(bestAt, 1)[0];
    if (!current) break;
    if (current.index === goalIndex) return reconstruct(grid, cameFrom, goalIndex);
    if (closed[current.index]) continue;
    closed[current.index] = 1;
    explored += 1;

    const here = grid.coordFromIndex(current.index);
    for (const [dx, dz] of neighbours) {
      const nx = here.x + dx;
      const nz = here.z + dz;
      if (!grid.inBounds(nx, nz) || grid.hasFlag(nx, nz, TileFlag.Blocked)) continue;
      // Do not cut corners diagonally through two blocked tiles.
      if (dx !== 0 && dz !== 0) {
        if (grid.hasFlag(here.x + dx, here.z, TileFlag.Blocked)) continue;
        if (grid.hasFlag(here.x, here.z + dz, TileFlag.Blocked)) continue;
      }

      const neighbourIndex = grid.index(nx, nz);
      if (closed[neighbourIndex]) continue;

      const stepCost =
        (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) * tileCost(grid, nx, nz, roadMultiplier);
      const tentative = (gScore[current.index] ?? Infinity) + stepCost;
      if (tentative >= (gScore[neighbourIndex] ?? Infinity)) continue;

      cameFrom[neighbourIndex] = current.index;
      gScore[neighbourIndex] = tentative;
      open.push({ index: neighbourIndex, f: tentative + heuristic({ x: nx, z: nz }, goal) });
    }
  }

  return null;
}

/** Total traversal cost of a path, i.e. how long the haul actually takes. */
export function pathCost(
  grid: TileGrid,
  path: readonly TileCoord[],
  roadMultiplier = 0.55,
): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const previous = path[i - 1];
    const current = path[i];
    if (!previous || !current) continue;
    const diagonal = previous.x !== current.x && previous.z !== current.z;
    total += (diagonal ? Math.SQRT2 : 1) * tileCost(grid, current.x, current.z, roadMultiplier);
  }
  return total;
}

function tileCost(grid: TileGrid, x: number, z: number, roadMultiplier: number): number {
  return grid.hasFlag(x, z, TileFlag.Road) ? roadMultiplier : 1;
}

/** Octile distance: admissible for 8-way movement, so A* stays optimal. */
function heuristic(a: TileCoord, b: TileCoord): number {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

function reconstruct(grid: TileGrid, cameFrom: Int32Array, goalIndex: number): TileCoord[] {
  const path: TileCoord[] = [];
  let cursor = goalIndex;
  while (cursor !== -1) {
    path.push(grid.coordFromIndex(cursor));
    cursor = cameFrom[cursor] ?? -1;
  }
  return path.reverse();
}
