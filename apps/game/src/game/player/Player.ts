/**
 * The player's simulation state. No meshes, no input - just where they are and
 * what they are doing, so it can be ticked and asserted on in Node.
 */
import type { Vec2 } from '@engine/physics/PhysicsPort.js';

export type PlayerActivity = 'idle' | 'walking' | 'working';
export type WorkAction = 'plant' | 'tend' | 'harvest';

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
    this.walkSpeed = options.walkSpeed ?? 6.5;
    this.sprintMultiplier = options.sprintMultiplier ?? 1.6;
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
