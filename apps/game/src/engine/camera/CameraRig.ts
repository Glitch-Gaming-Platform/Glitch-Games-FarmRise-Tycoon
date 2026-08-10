/**
 * Owns the THREE.PerspectiveCamera, keeps its projection correct when the
 * viewport changes, and delegates positioning to the active controller.
 */
import * as THREE from 'three';
import { SystemPriority, type EngineSystem, type SystemInitContext } from '../core/System.js';
import { createServiceToken } from '../core/ServiceContainer.js';
import type { RenderContext } from '../core/types.js';
import { RendererToken } from '../render/RendererSystem.js';
import type { CameraController } from './CameraController.js';

export const CameraRigToken = createServiceToken<CameraRig>('CameraRig');

export interface CameraRigOptions {
  readonly fov?: number;
  readonly near?: number;
  readonly far?: number;
  readonly controller?: CameraController;
}

export class CameraRig implements EngineSystem {
  readonly id = 'camera-rig';
  readonly priority = SystemPriority.Camera;

  readonly camera: THREE.PerspectiveCamera;
  #controller: CameraController | null;
  #unsubscribe: (() => void) | null = null;

  constructor(options: CameraRigOptions = {}) {
    this.camera = new THREE.PerspectiveCamera(
      options.fov ?? 50,
      1,
      options.near ?? 0.1,
      options.far ?? 500,
    );
    this.#controller = options.controller ?? null;
  }

  init(context: SystemInitContext): void {
    context.services.provide(CameraRigToken, this);

    const renderer = context.services.tryResolve(RendererToken);
    if (renderer) {
      this.setAspect(renderer.viewport.aspect);
      this.#unsubscribe = renderer.viewportEvents.on('resize', (size) =>
        this.setAspect(size.aspect),
      );
    }
    this.#controller?.attach?.(this.camera);
  }

  setController(controller: CameraController | null): void {
    this.#controller?.detach?.();
    this.#controller = controller;
    this.#controller?.attach?.(this.camera);
  }

  get controller(): CameraController | null {
    return this.#controller;
  }

  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(context: RenderContext): void {
    this.#controller?.update(this.camera, context);
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#controller?.detach?.();
  }
}
