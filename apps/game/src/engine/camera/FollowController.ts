/**
 * The default gameplay camera: a damped, orbiting third-person view.
 *
 * The angle is deliberately high and the field of view narrow-ish, because the
 * player's core decisions are spatial (which plot, how far to walk, what the
 * road layout does) and a near-isometric read makes the grid legible.
 */
import * as THREE from 'three';
import type { CameraController } from './CameraController.js';
import type { RenderContext } from '../core/types.js';

export interface FollowControllerOptions {
  /** Where the camera looks. Usually the player's position. */
  readonly getTarget: () => THREE.Vector3;
  readonly distance?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  /** Radians above the horizon. */
  readonly pitch?: number;
  readonly yaw?: number;
  /**
   * Seconds for the camera to cover ~63% of the remaining distance. Higher is
   * floatier. Framerate-independent, so it feels identical at 30 and 144Hz.
   */
  readonly smoothingSeconds?: number;
}

export class FollowController implements CameraController {
  readonly id = 'follow';

  #distance: number;
  #yaw: number;
  #pitch: number;
  readonly #current = new THREE.Vector3();
  readonly #desired = new THREE.Vector3();
  readonly #lookAt = new THREE.Vector3();
  #initialised = false;

  constructor(private readonly options: FollowControllerOptions) {
    this.#distance = options.distance ?? 18;
    this.#yaw = options.yaw ?? Math.PI * 0.25;
    this.#pitch = options.pitch ?? Math.PI * 0.32;
  }

  get yaw(): number {
    return this.#yaw;
  }

  orbit(deltaYaw: number, deltaPitch: number): void {
    this.#yaw += deltaYaw;
    // Clamped so the camera can never flip under the ground or straight down.
    this.#pitch = THREE.MathUtils.clamp(this.#pitch + deltaPitch, 0.15, Math.PI * 0.48);
  }

  zoom(delta: number): void {
    this.#distance = THREE.MathUtils.clamp(
      this.#distance + delta,
      this.options.minDistance ?? 8,
      this.options.maxDistance ?? 45,
    );
  }

  update(camera: THREE.PerspectiveCamera, context: RenderContext): void {
    const target = this.options.getTarget();
    const horizontal = Math.cos(this.#pitch) * this.#distance;
    this.#desired.set(
      target.x + Math.sin(this.#yaw) * horizontal,
      target.y + Math.sin(this.#pitch) * this.#distance,
      target.z + Math.cos(this.#yaw) * horizontal,
    );

    if (!this.#initialised) {
      this.#current.copy(this.#desired);
      this.#lookAt.copy(target);
      this.#initialised = true;
    } else {
      // Exponential smoothing expressed per-second, so the result does not
      // depend on how often update() happens to be called.
      const smoothing = this.options.smoothingSeconds ?? 0.12;
      const t = 1 - Math.exp(-context.deltaSeconds / Math.max(0.0001, smoothing));
      this.#current.lerp(this.#desired, t);
      this.#lookAt.lerp(target, t);
    }

    camera.position.copy(this.#current);
    camera.lookAt(this.#lookAt);
  }
}
