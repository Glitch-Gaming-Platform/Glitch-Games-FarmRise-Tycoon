/**
 * A camera controller decides where the camera should be. The rig owns the
 * actual THREE.Camera and applies whatever the controller produces.
 *
 * Splitting these two means a cutscene camera, a free-fly debug camera and the
 * gameplay follow camera are interchangeable without touching the rig.
 */
import type * as THREE from 'three';
import type { RenderContext } from '../core/types.js';

export interface CameraController {
  readonly id: string;
  /** Called once when the controller becomes active. */
  attach?(camera: THREE.PerspectiveCamera): void;
  detach?(): void;
  update(camera: THREE.PerspectiveCamera, context: RenderContext): void;
}
