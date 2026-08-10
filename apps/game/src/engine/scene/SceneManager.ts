/**
 * Loads, swaps and ticks scenes, and acts as the renderer's SceneProvider.
 *
 * Transitions are the fiddly part and the reason this is its own class:
 *  - a transition can be superseded by another before it finishes
 *  - the outgoing scene must keep rendering until the new one is ready
 *  - a failed load must not leave the game with no scene at all
 */
import type * as THREE from 'three';
import { EventBus } from '../core/EventBus.js';
import { createServiceToken } from '../core/ServiceContainer.js';
import { SystemPriority, type EngineSystem, type SystemInitContext } from '../core/System.js';
import type { FixedUpdateContext, RenderContext } from '../core/types.js';
import { CameraRigToken } from '../camera/CameraRig.js';
import { SceneProviderToken, type SceneProvider } from '../render/RendererSystem.js';
import type { GameScene, SceneFactory } from './GameScene.js';

export interface SceneManagerEvents extends Record<string, unknown> {
  'scene:load-start': { sceneId: string };
  'scene:load-progress': { sceneId: string; fraction: number; label?: string };
  'scene:load-error': { sceneId: string; error: unknown };
  'scene:activated': { sceneId: string; previousSceneId: string | null };
}

export const SceneManagerToken = createServiceToken<SceneManager>('SceneManager');

export class SceneManager implements EngineSystem, SceneProvider {
  readonly id = 'scene-manager';
  readonly priority = SystemPriority.Simulation;
  readonly events = new EventBus<SceneManagerEvents>();

  readonly #factories = new Map<string, SceneFactory>();
  #active: GameScene | null = null;
  #pendingController: AbortController | null = null;
  #services: SystemInitContext['services'] | null = null;
  #fallbackCamera: THREE.Camera | null = null;

  register(id: string, factory: SceneFactory): this {
    if (this.#factories.has(id)) throw new Error(`Scene "${id}" is already registered.`);
    this.#factories.set(id, factory);
    return this;
  }

  init(context: SystemInitContext): void {
    this.#services = context.services;
    context.services.provide(SceneManagerToken, this);
    context.services.provide(SceneProviderToken, this);
  }

  get active(): GameScene | null {
    return this.#active;
  }

  get isLoading(): boolean {
    return this.#pendingController !== null;
  }

  /**
   * Loads a scene and swaps it in once ready. Calling this again while a load
   * is in flight cancels the earlier one - last request wins.
   */
  async goTo(sceneId: string): Promise<void> {
    const factory = this.#factories.get(sceneId);
    if (!factory)
      throw new Error(`Unknown scene "${sceneId}". Register it on the SceneManager first.`);
    if (!this.#services) throw new Error('SceneManager.init() has not run yet.');

    this.#pendingController?.abort();
    const controller = new AbortController();
    this.#pendingController = controller;

    const next = factory();
    this.events.emit('scene:load-start', { sceneId });

    try {
      await next.load({
        services: this.#services,
        signal: controller.signal,
        reportProgress: (fraction, label) => {
          if (controller.signal.aborted) return;
          this.events.emit('scene:load-progress', { sceneId, fraction, label });
        },
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        this.events.emit('scene:load-error', { sceneId, error });
        this.#pendingController = null;
      }
      next.dispose?.();
      throw error;
    }

    if (controller.signal.aborted) {
      // A newer goTo() won. Throw this one away without touching the active scene.
      next.dispose?.();
      return;
    }

    const previousId = this.#active?.id ?? null;
    this.#active?.deactivate?.();
    this.#active?.dispose?.();
    this.#active = next;
    this.#pendingController = null;
    next.activate?.();
    this.events.emit('scene:activated', { sceneId, previousSceneId: previousId });
  }

  getRenderPair(): { scene: THREE.Scene; camera: THREE.Camera } | null {
    const scene = this.#active;
    if (!scene) return null;
    const camera = scene.getCamera?.() ?? this.#resolveSharedCamera();
    if (!camera) return null;
    return { scene: scene.root, camera };
  }

  fixedUpdate(context: FixedUpdateContext): void {
    this.#active?.fixedUpdate?.(context);
  }

  update(context: RenderContext): void {
    this.#active?.update?.(context);
  }

  dispose(): void {
    this.#pendingController?.abort();
    this.#pendingController = null;
    this.#active?.deactivate?.();
    this.#active?.dispose?.();
    this.#active = null;
    this.#factories.clear();
    this.events.clear();
  }

  #resolveSharedCamera(): THREE.Camera | null {
    this.#fallbackCamera ??= this.#services?.tryResolve(CameraRigToken)?.camera ?? null;
    return this.#fallbackCamera;
  }
}
