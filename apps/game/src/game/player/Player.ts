/**
 * The player's simulation state. No meshes, no input - just where they are and
 * what they are doing, so it can be ticked and asserted on in Node.
 */
import type { Vec2 } from '@engine/physics/PhysicsPort.js';

/**
 * Movement speeds, in metres per second.
 *
 * These are the gameplay side of the locomotion scale conflict that
 * docs/ANIMATION.md and docs/VISUAL_RUBRIC.md both list as the highest-value
 * open issue. The farmer is 1.60 m tall with 0.4 m legs. A leg that short can
 * put its foot down 0.185 m in front of the hip and 0.185 m behind it, which is
 * 0.60 m of ground per walk cycle and 1.10 m per run cycle, flight phase
 * included. At a believable 2.3 cycles/s walking and 3.1 running, that is a
 * baseline of about 1.4 and 3.4 m/s. The shipped walk speed adds a small 10%
 * responsiveness allowance.
 *
 * The previous numbers were 6.5 and 10.4 - a walk faster than a human sprint,
 * on legs less than half a human's. Nothing in the renderer could make that
 * plant: the rig capped its cadence, widened the swing, and the residue came
 * out as feet sliding across the ground at every speed the game could actually
 * produce. Two audits documented that and correctly declined to fix it
 * unilaterally, because the honest fix is here rather than in the rig.
 *
 * The cost is that the farm takes about 2.7x longer to cross at a sprint, so
 * sprint is now the travel speed and walking is for the last few metres. The
 * benefit is that the character's feet are attached to the world for the first
 * time. `Fox.speed` is scaled by the same factor so that intercepting a raider
 * takes the same chase it always did.
 */
const DEFAULT_WALK_SPEED = 1.54;
const DEFAULT_SPRINT_MULTIPLIER = 2.45;

export type PlayerActivity = 'idle' | 'walking' | 'working';
export type WorkAction = 'plant' | 'tend' | 'harvest' | 'transfer' | 'shoo' | 'repair';

export interface PlayerOptions {
  readonly walkSpeed?: number;
  readonly sprintMultiplier?: number;
  readonly radius?: number;
  /** Reach for planting, tending and harvesting, in world units. */
  readonly interactRange?: number;
}

export class Player {
  readonly collisionId = 'player';
  readonly position: Vec2;
  readonly radius: number;
  readonly walkSpeed: number;
  readonly sprintMultiplier: number;
  readonly interactRange: number;

  /** Facing angle in radians, used for the mesh and for interaction cones. */
  facing = 0;
  activity: PlayerActivity = 'idle';
  /** 0 idle, 1 walking, >1 sprinting. Visual-only locomotion intensity. */
  locomotionIntensity = 0;
  /** Ticks left in the current work animation; blocks movement while > 0. */
  workTicksRemaining = 0;
  /** Total duration and semantic action let the view author distinct gestures. */
  workTicksTotal = 0;
  workAction: WorkAction | null = null;

  constructor(startX: number, startZ: number, options: PlayerOptions = {}) {
    this.position = { x: startX, z: startZ };
    this.radius = options.radius ?? 0.45;
    this.walkSpeed = options.walkSpeed ?? DEFAULT_WALK_SPEED;
    this.sprintMultiplier = options.sprintMultiplier ?? DEFAULT_SPRINT_MULTIPLIER;
    this.interactRange = options.interactRange ?? 2.6;
  }

  get busy(): boolean {
    return this.workTicksRemaining > 0;
  }

  /** Locks the player in place for the duration of a work action. */
  beginWork(ticks: number, action: WorkAction | null = null): void {
    this.workTicksRemaining = Math.max(this.workTicksRemaining, ticks);
    this.workTicksTotal = Math.max(this.workTicksTotal, ticks);
    this.workAction = action;
    this.activity = 'working';
    this.locomotionIntensity = 0;
  }

  /** Normalised 0→1 progress for one-shot work animation timing. */
  get workProgress(): number {
    if (this.workTicksTotal <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - this.workTicksRemaining / this.workTicksTotal));
  }

  tickWork(dtTicks: number): void {
    if (this.workTicksRemaining <= 0) return;
    this.workTicksRemaining = Math.max(0, this.workTicksRemaining - dtTicks);
    if (this.workTicksRemaining === 0) {
      this.activity = 'idle';
      this.locomotionIntensity = 0;
      this.workTicksTotal = 0;
      this.workAction = null;
    }
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.position.x - x, this.position.z - z);
  }

  canReach(x: number, z: number): boolean {
    return this.distanceTo(x, z) <= this.interactRange;
  }
}
