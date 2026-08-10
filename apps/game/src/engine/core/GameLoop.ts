/**
 * The central game loop: fixed-step simulation, variable-step rendering.
 *
 * Why fixed-step at all, for a farming game?
 *  - Growth timers, upkeep and event countdowns are money. If they advanced by
 *    a variable delta, a 144Hz machine and a 30Hz machine would earn different
 *    amounts, and the server could not re-simulate a save to check it.
 *  - The server runs the same rules with the same integer step, so client and
 *    server arrive at identical numbers.
 *
 * Rendering still runs once per animation frame and interpolates with `alpha`,
 * so the visuals stay smooth on any display.
 *
 * See docs/GAME_LOOP.md for the full walkthrough.
 */
import { Clock, type TimeSource } from './Clock.js';
import { createAnimationFrameScheduler, type FrameScheduler } from './Scheduler.js';
import type { Disposable, FixedUpdateContext, RenderContext, Seconds } from './types.js';

export interface GameLoopOptions {
  /** Simulation frequency. Must match the server's TICK_HZ. */
  readonly fixedHz?: number;
  /**
   * Ceiling on catch-up steps per frame. Without it, a stall makes each frame
   * simulate more than it renders, which makes the next frame slower still -
   * the classic spiral of death.
   */
  readonly maxSubSteps?: number;
  readonly scheduler?: FrameScheduler;
  readonly timeSource?: TimeSource;
}

export interface GameLoopCallbacks {
  onFixedUpdate(context: FixedUpdateContext): void;
  onRender(context: RenderContext): void;
  /** Called when the loop had to drop simulation steps to keep up. */
  onOverrun?(droppedSteps: number): void;
}

export class GameLoop implements Disposable {
  readonly #stepSeconds: Seconds;
  readonly #maxSubSteps: number;
  readonly #scheduler: FrameScheduler;
  readonly #clock: Clock;
  readonly #callbacks: GameLoopCallbacks;

  #accumulator: Seconds = 0;
  #tick = 0;
  #handle: number | null = null;
  #running = false;

  constructor(callbacks: GameLoopCallbacks, options: GameLoopOptions = {}) {
    const fixedHz = options.fixedHz ?? 60;
    this.#stepSeconds = 1 / fixedHz;
    this.#maxSubSteps = options.maxSubSteps ?? 5;
    this.#scheduler = options.scheduler ?? createAnimationFrameScheduler();
    this.#clock = new Clock(options.timeSource ?? { now: () => this.#scheduler.now() });
    this.#callbacks = callbacks;
  }

  get running(): boolean {
    return this.#running;
  }

  get tick(): number {
    return this.#tick;
  }

  get fps(): number {
    return this.#clock.fps;
  }

  get stepSeconds(): Seconds {
    return this.#stepSeconds;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#clock.resync(this.#scheduler.now());
    this.#schedule();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    if (this.#handle !== null) this.#scheduler.cancel(this.#handle);
    this.#handle = null;
  }

  /**
   * Runs one frame by hand. Used by tests and by the manual scheduler; the
   * production path goes through start().
   */
  runFrame(nowMs: number): void {
    const deltaSeconds = this.#clock.tick(nowMs);
    this.#accumulator += deltaSeconds;

    let steps = 0;
    while (this.#accumulator >= this.#stepSeconds && steps < this.#maxSubSteps) {
      this.#accumulator -= this.#stepSeconds;
      this.#callbacks.onFixedUpdate({ stepSeconds: this.#stepSeconds, tick: this.#tick });
      this.#tick += 1;
      steps += 1;
    }

    if (this.#accumulator >= this.#stepSeconds) {
      // We are behind by more than maxSubSteps. Drop the backlog and report it
      // rather than trying to catch up forever.
      const dropped = Math.floor(this.#accumulator / this.#stepSeconds);
      this.#accumulator = 0;
      this.#callbacks.onOverrun?.(dropped);
    }

    this.#callbacks.onRender({
      deltaSeconds,
      alpha: this.#accumulator / this.#stepSeconds,
      elapsedSeconds: this.#clock.elapsedSeconds,
    });
  }

  dispose(): void {
    this.stop();
  }

  #schedule(): void {
    this.#handle = this.#scheduler.request((timeMs) => {
      if (!this.#running) return;
      this.runFrame(timeMs);
      this.#schedule();
    });
  }
}
