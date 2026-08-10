/**
 * A System is the only unit of work the engine knows how to run.
 *
 * Everything that needs a slice of the frame - rendering, input polling, audio,
 * the farm simulation, the debug overlay - is a System. This is what keeps the
 * engine from growing an ever-larger `update()` method full of special cases.
 *
 * Every hook is optional: a system that only needs fixed steps implements only
 * fixedUpdate, and a purely visual system implements only update.
 */
import type { Disposable, FixedUpdateContext, RenderContext } from './types.js';
import type { ServiceContainer } from './ServiceContainer.js';

export interface SystemInitContext {
  readonly services: ServiceContainer;
}

export interface EngineSystem extends Partial<Disposable> {
  /** Unique, stable, kebab-case. Used in logs, the debug overlay and errors. */
  readonly id: string;
  /**
   * Lower runs first. Input must be sampled before simulation, and rendering
   * must happen after everything else has moved.
   */
  readonly priority?: number;
  init?(context: SystemInitContext): void | Promise<void>;
  fixedUpdate?(context: FixedUpdateContext): void;
  update?(context: RenderContext): void;
}

/** Conventional priority bands. Keep systems inside these rather than inventing numbers. */
export const SystemPriority = {
  Input: 0,
  Simulation: 100,
  Camera: 200,
  Audio: 300,
  Render: 400,
  Debug: 500,
} as const;
