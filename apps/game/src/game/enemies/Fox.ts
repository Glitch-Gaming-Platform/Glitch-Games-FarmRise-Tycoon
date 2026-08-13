/**
 * A fox: the game's only enemy in the first playable.
 *
 * It is a threat with a position rather than a combat unit. It walks toward the
 * shelter, and the player's counterplay is to physically get in the way - which
 * is what makes the fox raid an "active response" rather than a dice roll.
 */
import type { PhysicsPort, Vec2 } from '@engine/physics/PhysicsPort.js';

export type FoxState = 'approaching' | 'raiding' | 'fleeing' | 'gone';

export class Fox {
  readonly position: Vec2;
  readonly radius = 0.42;
  state: FoxState = 'approaching';
  /** Ticks spent at the shelter; produces a loss once it reaches raidTicks. */
  raidProgress = 0;

  constructor(
    startX: number,
    startZ: number,
    private readonly target: Vec2,
    private readonly speed = 1.3,
    readonly raidTicks = 180,
    readonly collisionId = 'fox',
    readonly targetGroupId: string | null = null,
    readonly raidId = 'fox-raid',
    readonly targetShelterId: string | null = null,
  ) {
    this.position = { x: startX, z: startZ };
  }

  fixedUpdate(physics: PhysicsPort, stepSeconds: number, scarerPosition: Vec2 | null): void {
    if (this.state === 'gone') return;

    // Being approached is enough to break off the raid: the player never has to
    // fight, only show up.
    if (scarerPosition && distance(this.position, scarerPosition) < 3) {
      this.state = 'fleeing';
    }

    const goal = this.state === 'fleeing' ? this.#fleeTarget(scarerPosition) : this.target;
    const dx = goal.x - this.position.x;
    const dz = goal.z - this.position.z;
    const length = Math.hypot(dx, dz);

    if (this.state !== 'fleeing' && length < 1) {
      this.state = 'raiding';
      this.raidProgress += 1;
      return;
    }

    if (length > 0.001) {
      const step = (this.speed * stepSeconds) / Math.max(0.001, length);
      physics.moveCharacter(this, dx * step, dz * step);
    }

    if (this.state === 'fleeing' && length > 24) this.state = 'gone';
  }

  get succeeded(): boolean {
    return this.raidProgress >= this.raidTicks;
  }

  #fleeTarget(scarer: Vec2 | null): Vec2 {
    if (!scarer) return { x: this.position.x, z: this.position.z - 30 };
    return {
      x: this.position.x + (this.position.x - scarer.x) * 10,
      z: this.position.z + (this.position.z - scarer.z) * 10,
    };
  }
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
