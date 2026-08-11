/**
 * A fixed-size tile grid: the spatial substrate for the whole farm.
 *
 * Why a grid instead of a rigid-body engine (see docs/decisions/0003):
 * everything the game asks of "physics" is tile-shaped - is this plot free,
 * can the player walk here, how long does hauling from A to B take. A grid
 * answers all three in constant or near-constant time, is deterministic across
 * machines, and runs identically in Node so the server can re-check it.
 *
 * The flag byte answers the questions movement asks. Everything else a tile
 * needs to know lives in a named layer (see GridLayers), because a byte with
 * six unrelated meanings in it is a byte no system can change safely.
 */
import { GridLayers } from './GridLayers.js';

export interface TileCoord {
  readonly x: number;
  readonly z: number;
}

export const enum TileFlag {
  None = 0,
  /** Nothing may walk through this tile. */
  Blocked = 1 << 0,
  /** A building occupies it; plots and buildings may not overlap. */
  Occupied = 1 << 1,
  /** Road: cheaper to traverse. */
  Road = 1 << 2,
  /** Farmable soil. */
  Soil = 1 << 3,
  /** Inside a fence. */
  Enclosed = 1 << 4,
  /** Passable, but not yours: walk-through gaps in a boundary you do not own. */
  Gate = 1 << 5,
}

/**
 * Layers the game asks for by name.
 *
 * The engine does not know what these mean - it only knows how to store a byte
 * per tile. The constants live here so both the game and its tests spell them
 * the same way.
 */
export const GRID_LAYER = Object.freeze({
  /** Index into the game's parcel table, 0 = unowned. */
  Ownership: 'ownership',
  /** Terrain kind, for ground dressing and buildability. */
  Terrain: 'terrain',
  /** Utility coverage, e.g. reached by a well. */
  Utility: 'utility',
  /** Temporary incident state, cleared when the incident ends. */
  Hazard: 'hazard',
  /** Field membership, so a bed knows which field group it belongs to. */
  Field: 'field',
});

export class TileGrid {
  readonly #flags: Uint8Array;
  /** Additional per-tile data that does not belong in the flag byte. */
  readonly layers: GridLayers;
  /**
   * Four collision samples per tile give solid props a 0.5 m raster without
   * turning movement into mesh collision. On the 16x16 farm this is 4 KiB.
   */
  readonly #collisionSubdivisions = 4;
  readonly #fineBlocked: Uint8Array;
  readonly #fineWidth: number;
  readonly #fineDepth: number;

  constructor(
    readonly width: number,
    readonly depth: number,
    /** World units per tile. */
    readonly tileSize = 2,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(depth) || width <= 0 || depth <= 0) {
      throw new Error('TileGrid dimensions must be positive integers.');
    }
    this.#flags = new Uint8Array(width * depth);
    this.layers = new GridLayers(width, depth);
    this.#fineWidth = width * this.#collisionSubdivisions;
    this.#fineDepth = depth * this.#collisionSubdivisions;
    this.#fineBlocked = new Uint8Array(this.#fineWidth * this.#fineDepth);
  }

  get tileCount(): number {
    return this.width * this.depth;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.depth;
  }

  index(x: number, z: number): number {
    return z * this.width + x;
  }

  coordFromIndex(index: number): TileCoord {
    return { x: index % this.width, z: Math.floor(index / this.width) };
  }

  getFlags(x: number, z: number): number {
    if (!this.inBounds(x, z)) return TileFlag.Blocked;
    return this.#flags[this.index(x, z)] ?? TileFlag.Blocked;
  }

  hasFlag(x: number, z: number, flag: TileFlag): boolean {
    return (this.getFlags(x, z) & flag) !== 0;
  }

  setFlag(x: number, z: number, flag: TileFlag, enabled = true): void {
    if (!this.inBounds(x, z)) return;
    const i = this.index(x, z);
    const current = this.#flags[i] ?? 0;
    this.#flags[i] = enabled ? current | flag : current & ~flag;
  }

  fillRect(
    x: number,
    z: number,
    width: number,
    depth: number,
    flag: TileFlag,
    enabled = true,
  ): void {
    for (let dz = 0; dz < depth; dz += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        this.setFlag(x + dx, z + dz, flag, enabled);
      }
    }
  }

  /** True when every tile of the footprint is in bounds and unoccupied. */
  canPlace(x: number, z: number, width: number, depth: number): boolean {
    for (let dz = 0; dz < depth; dz += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        if (!this.inBounds(x + dx, z + dz)) return false;
        if (this.hasFlag(x + dx, z + dz, TileFlag.Occupied)) return false;
      }
    }
    return true;
  }

  /** Grid origin is centred on the world origin, which keeps camera framing simple. */
  tileToWorld(x: number, z: number): { x: number; z: number } {
    return {
      x: (x - this.width / 2 + 0.5) * this.tileSize,
      z: (z - this.depth / 2 + 0.5) * this.tileSize,
    };
  }

  worldToTile(worldX: number, worldZ: number): TileCoord {
    return {
      x: Math.floor(worldX / this.tileSize + this.width / 2),
      z: Math.floor(worldZ / this.tileSize + this.depth / 2),
    };
  }

  /**
   * Adds a static oriented rectangle to the fine collision raster.
   *
   * Rasterisation happens once when a level/building is loaded. Runtime
   * collision remains five O(1) byte lookups per movement attempt.
   */
  blockWorldRect(
    centerX: number,
    centerZ: number,
    width: number,
    depth: number,
    rotationY = 0,
  ): void {
    if (width <= 0 || depth <= 0) return;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const halfCell = this.tileSize / this.#collisionSubdivisions / 2;
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const aabbHalfX = Math.abs(cos) * halfWidth + Math.abs(sin) * halfDepth + halfCell;
    const aabbHalfZ = Math.abs(sin) * halfWidth + Math.abs(cos) * halfDepth + halfCell;
    const min = this.#worldToFine(centerX - aabbHalfX, centerZ - aabbHalfZ);
    const max = this.#worldToFine(centerX + aabbHalfX, centerZ + aabbHalfZ);

    for (let z = Math.max(0, min.z); z <= Math.min(this.#fineDepth - 1, max.z); z += 1) {
      for (let x = Math.max(0, min.x); x <= Math.min(this.#fineWidth - 1, max.x); x += 1) {
        const sample = this.#fineToWorld(x, z);
        const dx = sample.x - centerX;
        const dz = sample.z - centerZ;
        const localX = dx * cos + dz * sin;
        const localZ = -dx * sin + dz * cos;
        // Conservative cell overlap rather than centre-only sampling ensures
        // thin fences/troughs still occupy at least one collision cell.
        if (Math.abs(localX) <= halfWidth + halfCell && Math.abs(localZ) <= halfDepth + halfCell) {
          this.#fineBlocked[z * this.#fineWidth + x] = 1;
        }
      }
    }
  }

  /** Coarse blocked tiles plus the sub-tile static-collider raster. */
  isBlockedWorld(worldX: number, worldZ: number): boolean {
    const tile = this.worldToTile(worldX, worldZ);
    if (!this.inBounds(tile.x, tile.z)) return true;
    if (this.hasFlag(tile.x, tile.z, TileFlag.Blocked)) return true;
    const fine = this.#worldToFine(worldX, worldZ);
    if (fine.x < 0 || fine.z < 0 || fine.x >= this.#fineWidth || fine.z >= this.#fineDepth) {
      return true;
    }
    return this.#fineBlocked[fine.z * this.#fineWidth + fine.x] === 1;
  }

  clear(): void {
    this.#flags.fill(TileFlag.None);
    this.#fineBlocked.fill(0);
    this.layers.clearAll();
  }

  /** Clears the sub-tile raster only, so static colliders can be rebuilt in place. */
  clearFineCollision(): void {
    this.#fineBlocked.fill(0);
  }

  /** Snapshot for tests and save serialisation. */
  toBytes(): Uint8Array {
    return this.#flags.slice();
  }

  #worldToFine(worldX: number, worldZ: number): TileCoord {
    const cellSize = this.tileSize / this.#collisionSubdivisions;
    return {
      x: Math.floor((worldX + (this.width * this.tileSize) / 2) / cellSize),
      z: Math.floor((worldZ + (this.depth * this.tileSize) / 2) / cellSize),
    };
  }

  #fineToWorld(x: number, z: number): { x: number; z: number } {
    const cellSize = this.tileSize / this.#collisionSubdivisions;
    return {
      x: -(this.width * this.tileSize) / 2 + (x + 0.5) * cellSize,
      z: -(this.depth * this.tileSize) / 2 + (z + 0.5) * cellSize,
    };
  }
}
