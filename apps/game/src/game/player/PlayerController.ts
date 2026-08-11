/**
 * Turns input into movement, and movement into interactions.
 *
 * Deliberately small: it reads the input snapshot, asks physics to move the
 * body, and reports which plot is currently in reach. It does not know how to
 * plant anything - that is FarmCommands' job, called by the scene.
 */
import { MOVE_AXIS_X, MOVE_AXIS_Z, type GameAction } from '../GameActions.js';
import { EventBus } from '@engine/core/EventBus.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { PhysicsPort } from '@engine/physics/PhysicsPort.js';
import type { FixedUpdateContext } from '@engine/core/types.js';
import type { FarmWorld } from '../world/FarmWorld.js';
import type { Player } from './Player.js';

export interface PlayerControllerEvents extends Record<string, unknown> {
  'player:stepped': { sprinting: boolean };
}

export class PlayerController {
  readonly events = new EventBus<PlayerControllerEvents>();
  #distanceSinceStep = 0;

  constructor(
    private readonly player: Player,
    private readonly world: FarmWorld,
    private readonly physics: PhysicsPort,
    private readonly input: InputSystem<GameAction>,
  ) {}

  fixedUpdate(context: FixedUpdateContext, movementEnabled = true): void {
    this.player.tickWork(1);
    if (this.player.busy) return;

    if (!movementEnabled) {
      this.player.activity = 'idle';
      this.player.locomotionIntensity = 0;
      return;
    }

    let inputX = this.input.axis(MOVE_AXIS_X);
    let inputZ = this.input.axis(MOVE_AXIS_Z);
    if (inputX === 0 && inputZ === 0) {
      this.player.activity = 'idle';
      this.player.locomotionIntensity = 0;
      return;
    }

    // Normalise so diagonal movement is not ~41% faster than cardinal.
    const rawMagnitude = Math.hypot(inputX, inputZ);
    const magnitude = Math.min(1, rawMagnitude);
    inputX /= rawMagnitude;
    inputZ /= rawMagnitude;

    const surface = this.physics.traversalCostAt(this.player.position.x, this.player.position.z);
    // A lower traversal cost means a faster surface, hence the reciprocal.
    const sprinting = this.input.isDown('sprint');
    const speed =
      (this.player.walkSpeed / surface) * (sprinting ? this.player.sprintMultiplier : 1);

    const step = speed * magnitude * context.stepSeconds;
    const beforeX = this.player.position.x;
    const beforeZ = this.player.position.z;
    this.physics.moveCharacter(this.player, inputX * step, inputZ * step);
    this.#distanceSinceStep += Math.hypot(
      this.player.position.x - beforeX,
      this.player.position.z - beforeZ,
    );
    const stride = sprinting ? 1.65 : 1.35;
    if (this.#distanceSinceStep >= stride) {
      this.#distanceSinceStep %= stride;
      this.events.emit('player:stepped', { sprinting });
    }
    this.player.facing = Math.atan2(inputX, inputZ);
    this.player.activity = 'walking';
    this.player.locomotionIntensity = magnitude * (sprinting ? this.player.sprintMultiplier : 1);
  }

  /** Nearest plot within reach, or null. Drives the interact prompt and the E key. */
  plotInReach(): string | null {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const placement of this.world.fields.placements) {
      const world = this.world.grid.tileToWorld(placement.tileX, placement.tileZ);
      const distance = this.player.distanceTo(world.x, world.z);
      if (distance <= this.player.interactRange && distance < bestDistance) {
        bestDistance = distance;
        bestId = placement.id;
      }
    }
    return bestId;
  }
}
