/**
 * The Engine owns three things and nothing else: a list of systems, the loop
 * that drives them, and the service container they resolve each other through.
 *
 * It deliberately knows nothing about renderers, cameras, scenes or farms.
 * Those are all systems registered by the composition root in src/main.ts. If
 * you find yourself adding a game concept to this file, that is the signal to
 * write a new System instead.
 */
import { EventBus } from './EventBus.js';
import { GameLoop, type GameLoopOptions } from './GameLoop.js';
import { ServiceContainer } from './ServiceContainer.js';
import { SystemPriority, type EngineSystem } from './System.js';
import type { Disposable, FixedUpdateContext, RenderContext } from './types.js';

export interface EngineEvents extends Record<string, unknown> {
  'engine:started': { systemCount: number };
  'engine:stopped': undefined;
  /** The loop could not keep up and dropped simulation steps. */
  'engine:overrun': { droppedSteps: number };
  /** A system threw. The engine keeps running; the system is quarantined. */
  'engine:system-error': { systemId: string; phase: 'fixedUpdate' | 'update'; error: unknown };
}

export class Engine implements Disposable {
  readonly services = new ServiceContainer();
  readonly events = new EventBus<EngineEvents>();
  /** Frame-execution order: sorted by priority. */
  readonly #systems: EngineSystem[] = [];
  /**
   * Init/dispose order: the order systems were registered in.
   *
   * These are deliberately two different orders. Priority answers "when in the
   * frame does this run?"; registration order answers "what already exists when
   * this initialises?". Conflating them forces the renderer (which must render
   * last) to also initialise last, which is exactly backwards.
   */
  readonly #registrationOrder: EngineSystem[] = [];
  readonly #quarantined = new Set<string>();
  readonly #loop: GameLoop;
  #started = false;

  constructor(options: GameLoopOptions = {}) {
    this.#loop = new GameLoop(
      {
        onFixedUpdate: (context) => this.#fixedUpdate(context),
        onRender: (context) => this.#update(context),
        onOverrun: (droppedSteps) => this.events.emit('engine:overrun', { droppedSteps }),
      },
      options,
    );
  }

  get loop(): GameLoop {
    return this.#loop;
  }

  get systems(): readonly EngineSystem[] {
    return this.#systems;
  }

  /** Registration order is irrelevant; priority decides execution order. */
  register(system: EngineSystem): this {
    if (this.#started) {
      throw new Error(
        `Cannot register "${system.id}" after the engine has started. Register every system in the composition root.`,
      );
    }
    if (this.#systems.some((existing) => existing.id === system.id)) {
      throw new Error(`A system with id "${system.id}" is already registered.`);
    }
    this.#systems.push(system);
    this.#registrationOrder.push(system);
    this.#systems.sort(
      (a, b) =>
        (a.priority ?? SystemPriority.Simulation) - (b.priority ?? SystemPriority.Simulation),
    );
    return this;
  }

  /**
   * Initialises every system in priority order, then starts the loop.
   * Initialisation is sequential and awaited so a system can safely assume its
   * lower-priority dependencies already exist.
   */
  async start(): Promise<void> {
    if (this.#started) return;
    const context = { services: this.services };
    for (const system of this.#registrationOrder) {
      await system.init?.(context);
    }
    this.#started = true;
    this.#loop.start();
    this.events.emit('engine:started', { systemCount: this.#systems.length });
  }

  stop(): void {
    if (!this.#started) return;
    this.#loop.stop();
    this.#started = false;
    this.events.emit('engine:stopped', undefined);
  }

  dispose(): void {
    this.stop();
    // Reverse registration order, so a system is never torn down before the
    // systems that depend on it.
    for (const system of [...this.#registrationOrder].reverse()) {
      try {
        system.dispose?.();
      } catch (error) {
        console.error(`[Engine] "${system.id}" threw while disposing`, error);
      }
    }
    this.#systems.length = 0;
    this.#registrationOrder.length = 0;
    this.events.clear();
    this.services.clear();
  }

  #fixedUpdate(context: FixedUpdateContext): void {
    for (const system of this.#systems) {
      if (!system.fixedUpdate || this.#quarantined.has(system.id)) continue;
      try {
        system.fixedUpdate(context);
      } catch (error) {
        this.#quarantine(system.id, 'fixedUpdate', error);
      }
    }
  }

  #update(context: RenderContext): void {
    for (const system of this.#systems) {
      if (!system.update || this.#quarantined.has(system.id)) continue;
      try {
        system.update(context);
      } catch (error) {
        this.#quarantine(system.id, 'update', error);
      }
    }
  }

  /**
   * A system that throws is disabled rather than allowed to throw 60 times a
   * second. This turns "the tab froze" into "the minimap stopped updating",
   * which is a far better failure mode and much easier to diagnose.
   */
  #quarantine(systemId: string, phase: 'fixedUpdate' | 'update', error: unknown): void {
    this.#quarantined.add(systemId);
    console.error(`[Engine] "${systemId}" threw during ${phase} and was disabled`, error);
    this.events.emit('engine:system-error', { systemId, phase, error });
  }
}
