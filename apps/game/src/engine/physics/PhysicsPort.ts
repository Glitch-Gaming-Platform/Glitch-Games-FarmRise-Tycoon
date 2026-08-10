/**
 * The physics port.
 *
 * The game only ever talks to this interface. The current implementation is a
 * grid + swept-circle resolver (GridPhysics), which is all FarmRise Tycoon
 * needs. If a future feature genuinely requires rigid bodies, a Rapier-backed
 * implementation drops in here without gameplay code changing - that is the
 * whole reason this interface exists rather than calling GridPhysics directly.
 */
export interface Vec2 {
  x: number;
  z: number;
}

export interface CharacterBody {
  /** World position, mutated in place by move(). */
  readonly position: Vec2;
  /** Collision radius in world units. */
  readonly radius: number;
  /** Dynamic collider id to ignore while moving this body. */
  readonly collisionId?: string;
}

export interface DynamicCircleCollider {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface MoveResult {
  readonly moved: boolean;
  /** True when the body was stopped by geometry rather than reaching its goal. */
  readonly collided: boolean;
  /** Speed multiplier from the surface, e.g. roads. */
  readonly surfaceMultiplier: number;
}

export interface PhysicsPort {
  /**
   * Moves a body by `delta`, resolving against blocked tiles. Deterministic:
   * the same inputs always produce the same output on any machine.
   */
  moveCharacter(body: CharacterBody, deltaX: number, deltaZ: number): MoveResult;
  /** Traversal cost multiplier at a world position. Lower is faster. */
  traversalCostAt(worldX: number, worldZ: number): number;
  isBlockedWorld(worldX: number, worldZ: number): boolean;
  /** Replaces the small moving-actor set used for circle collision. */
  setDynamicColliders?(colliders: readonly DynamicCircleCollider[]): void;
}
