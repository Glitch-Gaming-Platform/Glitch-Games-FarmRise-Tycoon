/**
 * Grid collision resolution.
 *
 * Movement is resolved one axis at a time. That is what produces the "slide
 * along the wall" feel players expect, instead of sticking the moment a
 * diagonal input touches a corner - and it is far simpler to reason about than
 * a general contact solver.
 */
import { TileFlag, type TileGrid } from './TileGrid.js';
import type {
  CharacterBody,
  DynamicCircleCollider,
  MoveResult,
  PhysicsPort,
} from './PhysicsPort.js';

export interface GridPhysicsOptions {
  /**
   * Traversal multiplier on road tiles. Injected rather than imported from the
   * game's tuning constants, because engine/ must not know FarmRise Tycoon's
   * balance numbers.
   */
  readonly roadMultiplier?: number;
}

export class GridPhysics implements PhysicsPort {
  readonly #roadMultiplier: number;
  readonly #dynamicBuckets: DynamicCircleCollider[][];
  readonly #activeDynamicBuckets: number[] = [];

  constructor(
    private readonly grid: TileGrid,
    options: GridPhysicsOptions = {},
  ) {
    this.#roadMultiplier = options.roadMultiplier ?? 0.55;
    this.#dynamicBuckets = Array.from({ length: grid.tileCount }, () => []);
  }

  setDynamicColliders(colliders: readonly DynamicCircleCollider[]): void {
    for (const bucketIndex of this.#activeDynamicBuckets) {
      const bucket = this.#dynamicBuckets[bucketIndex];
      if (bucket) bucket.length = 0;
    }
    this.#activeDynamicBuckets.length = 0;
    for (const collider of colliders) {
      const tile = this.grid.worldToTile(collider.x, collider.z);
      if (!this.grid.inBounds(tile.x, tile.z)) continue;
      const bucketIndex = this.grid.index(tile.x, tile.z);
      const bucket = this.#dynamicBuckets[bucketIndex];
      if (!bucket) continue;
      if (bucket.length === 0) this.#activeDynamicBuckets.push(bucketIndex);
      bucket.push(collider);
    }
  }

  moveCharacter(body: CharacterBody, deltaX: number, deltaZ: number): MoveResult {
    if (deltaX === 0 && deltaZ === 0) {
      return {
        moved: false,
        collided: false,
        surfaceMultiplier: this.traversalCostAt(body.position.x, body.position.z),
      };
    }

    let collided = false;

    const targetX = body.position.x + deltaX;
    if (
      this.#canOccupy(
        targetX,
        body.position.z,
        body.radius,
        body.collisionId,
        body.position.x,
        body.position.z,
      )
    ) {
      body.position.x = targetX;
    } else if (deltaX !== 0) {
      collided = true;
    }

    const targetZ = body.position.z + deltaZ;
    if (
      this.#canOccupy(
        body.position.x,
        targetZ,
        body.radius,
        body.collisionId,
        body.position.x,
        body.position.z,
      )
    ) {
      body.position.z = targetZ;
    } else if (deltaZ !== 0) {
      collided = true;
    }

    return {
      moved: true,
      collided,
      surfaceMultiplier: this.traversalCostAt(body.position.x, body.position.z),
    };
  }

  traversalCostAt(worldX: number, worldZ: number): number {
    const tile = this.grid.worldToTile(worldX, worldZ);
    return this.grid.hasFlag(tile.x, tile.z, TileFlag.Road) ? this.#roadMultiplier : 1;
  }

  isBlockedWorld(worldX: number, worldZ: number): boolean {
    return this.grid.isBlockedWorld(worldX, worldZ);
  }

  /**
   * A circle is approximated by testing its four cardinal extremes. Exact
   * circle-AABB would be more correct, but at this tile size the difference is
   * sub-pixel and this version is branch-free and obvious.
   */
  #canOccupy(
    worldX: number,
    worldZ: number,
    radius: number,
    ignoredId?: string,
    currentX = worldX,
    currentZ = worldZ,
  ): boolean {
    const offsets: readonly [number, number][] = [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ];
    for (const [dx, dz] of offsets) {
      if (this.grid.isBlockedWorld(worldX + dx, worldZ + dz)) return false;
    }
    return !this.#overlapsDynamic(worldX, worldZ, radius, ignoredId, currentX, currentZ);
  }

  #overlapsDynamic(
    worldX: number,
    worldZ: number,
    radius: number,
    ignoredId: string | undefined,
    currentX: number,
    currentZ: number,
  ): boolean {
    const center = this.grid.worldToTile(worldX, worldZ);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tileX = center.x + dx;
        const tileZ = center.z + dz;
        if (!this.grid.inBounds(tileX, tileZ)) continue;
        const bucket = this.#dynamicBuckets[this.grid.index(tileX, tileZ)];
        if (!bucket) continue;
        for (const collider of bucket) {
          if (collider.id === ignoredId) continue;
          const combined = radius + collider.radius;
          const candidateDx = worldX - collider.x;
          const candidateDz = worldZ - collider.z;
          const candidateDistanceSq = candidateDx * candidateDx + candidateDz * candidateDz;
          if (candidateDistanceSq >= combined * combined) continue;

          // If a moving animal enters an idle player's space between ticks,
          // always allow the player to move outward instead of trapping them.
          const currentDx = currentX - collider.x;
          const currentDz = currentZ - collider.z;
          const currentDistanceSq = currentDx * currentDx + currentDz * currentDz;
          if (currentDistanceSq < combined * combined && candidateDistanceSq > currentDistanceSq) {
            continue;
          }
          return true;
        }
      }
    }
    return false;
  }
}
