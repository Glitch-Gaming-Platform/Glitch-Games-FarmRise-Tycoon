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

/**
 * Ground acceleration and braking, in metres per second squared.
 *
 * Movement used to be a step function: the velocity was whatever the key state
 * implied, applied in full on the first tick and removed in full on the last.
 * Nothing in the world could react to a start or a stop because there was no
 * start or stop to react to - the character was either stationary or at top
 * speed, one frame apart.
 *
 * These ramps are short enough to keep the controls crisp (0 to walking in
 * 0.13 s, to sprinting in 0.32 s, stopped in 0.16 s) and long enough that the
 * rig's start/stop lean, the walk-to-run blend and the contact dust all have
 * something real to key off. The walk clip in particular now gets screen time:
 * every sprint passes through walking speed on the way up and on the way down.
 */
const ACCELERATION = 12;
const BRAKING = 25;

/**
 * Footstep distances, in metres, for the walk and the run.
 *
 * One step is half a gait cycle, and the cycles cover 0.60 m and 1.10 m of
 * ground (see poseClips.ts, where those numbers are solved rather than
 * chosen). Firing every 1.35 m as this used to is not a tuning choice, it is a
 * sound playing every fourth step.
 */
const WALK_STEP_DISTANCE = 0.3;
const RUN_STEP_DISTANCE = 0.55;

export class PlayerController {
  readonly events = new EventBus<PlayerControllerEvents>();
  #distanceSinceStep = 0;
  /** Current ground speed in m/s, integrated rather than assigned. */
  #speed = 0;
  /** Unit heading the current speed is carried along. */
  #headingX = 0;
  #headingZ = 1;

  constructor(
    private readonly player: Player,
    private readonly world: FarmWorld,
    private readonly physics: PhysicsPort,
    private readonly input: InputSystem<GameAction>,
  ) {}

  fixedUpdate(context: FixedUpdateContext, movementEnabled = true): void {
    this.player.tickWork(1);
    if (this.player.busy) {
      this.#speed = 0;
      return;
    }

    let inputX = this.input.axis(MOVE_AXIS_X);
    let inputZ = this.input.axis(MOVE_AXIS_Z);
    const hasInput = movementEnabled && (inputX !== 0 || inputZ !== 0);

    const surface = this.physics.traversalCostAt(this.player.position.x, this.player.position.z);
    // A lower traversal cost means a faster surface, hence the reciprocal.
    const sprinting = hasInput && this.input.isDown('sprint');
    let magnitude = 0;
    let targetSpeed = 0;

    if (hasInput) {
      // Normalise so diagonal movement is not ~41% faster than cardinal.
      const rawMagnitude = Math.hypot(inputX, inputZ);
      magnitude = Math.min(1, rawMagnitude);
      inputX /= rawMagnitude;
      inputZ /= rawMagnitude;
      this.#headingX = inputX;
      this.#headingZ = inputZ;
      targetSpeed =
        (this.player.walkSpeed / surface) *
        (sprinting ? this.player.sprintMultiplier : 1) *
        magnitude;
    }

    // Integrate toward the target rather than assigning it. Reaching the target
    // exactly - rather than asymptotically - matters: `locomotionIntensity` is
    // read as "walking or sprinting" elsewhere, and an eased value that never
    // quite arrives would leave the character permanently between the two.
    if (this.#speed < targetSpeed) {
      this.#speed = Math.min(targetSpeed, this.#speed + ACCELERATION * context.stepSeconds);
    } else if (this.#speed > targetSpeed) {
      this.#speed = Math.max(targetSpeed, this.#speed - BRAKING * context.stepSeconds);
    }

    if (this.#speed <= 0.001) {
      this.#speed = 0;
      this.player.activity = 'idle';
      this.player.locomotionIntensity = 0;
      return;
    }

    const step = this.#speed * context.stepSeconds;
    const beforeX = this.player.position.x;
    const beforeZ = this.player.position.z;
    this.physics.moveCharacter(this.player, this.#headingX * step, this.#headingZ * step);
    this.#distanceSinceStep += Math.hypot(
      this.player.position.x - beforeX,
      this.player.position.z - beforeZ,
    );
    const stride = sprinting ? RUN_STEP_DISTANCE : WALK_STEP_DISTANCE;
    if (this.#distanceSinceStep >= stride) {
      this.#distanceSinceStep %= stride;
      this.events.emit('player:stepped', { sprinting });
    }
    if (hasInput) this.player.facing = Math.atan2(this.#headingX, this.#headingZ);
    this.player.activity = 'walking';
    // Expressed in walk-speed units, so 1 is a walk and `sprintMultiplier` is a
    // sprint, exactly as before - it now passes through the values between them
    // instead of jumping.
    this.player.locomotionIntensity = hasInput
      ? magnitude * (sprinting ? this.player.sprintMultiplier : 1) * (this.#speed / targetSpeed)
      : this.#speed / this.player.walkSpeed;
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
