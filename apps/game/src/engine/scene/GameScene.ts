/**
 * A Scene is a self-contained slice of the world with its own Three.js graph
 * and lifecycle. The farm is a scene; a main menu backdrop is a scene.
 *
 * Scenes are game-agnostic from the engine's point of view: the engine only
 * knows how to load one, tick it, draw it and throw it away.
 */
import type * as THREE from 'three';
import type { ServiceContainer } from '../core/ServiceContainer.js';
import type { Disposable, FixedUpdateContext, RenderContext } from '../core/types.js';

export interface SceneLoadContext {
  readonly services: ServiceContainer;
  /** Report progress so the loading screen can show something truthful. */
  readonly reportProgress: (fraction: number, label?: string) => void;
  /** Aborts when the player navigates away mid-load. Always honour it. */
  readonly signal: AbortSignal;
}

export interface GameScene extends Partial<Disposable> {
  readonly id: string;
  /** The Three.js graph. Created in the constructor, populated during load(). */
  readonly root: THREE.Scene;
  /** Scene-owned camera. Return null to use the engine's shared CameraRig. */
  getCamera?(): THREE.Camera | null;
  /** Async asset work. Must be idempotent and must respect context.signal. */
  load(context: SceneLoadContext): Promise<void>;
  activate?(): void;
  deactivate?(): void;
  fixedUpdate?(context: FixedUpdateContext): void;
  update?(context: RenderContext): void;
}

export type SceneFactory = () => GameScene;
