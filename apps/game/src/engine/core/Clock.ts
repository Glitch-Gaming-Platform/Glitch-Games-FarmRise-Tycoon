/**
 * Wall-clock bookkeeping for the loop.
 *
 * The simulation never reads this directly - it only ever sees whole fixed
 * ticks. The clock exists so the renderer and the debug overlay can talk about
 * real time without anyone reaching for Date.now() mid-frame.
 */
import type { Seconds } from './types.js';

export interface TimeSource {
  now(): number;
}

export const performanceTimeSource: TimeSource = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

export class Clock {
  #lastMs: number;
  #elapsed: Seconds = 0;
  #frames = 0;
  #fps = 0;
  #fpsAccumulator: Seconds = 0;

  constructor(private readonly time: TimeSource = performanceTimeSource) {
    this.#lastMs = time.now();
  }

  /**
   * Advances to `nowMs` and returns the delta in seconds, clamped.
   *
   * The clamp matters: a backgrounded tab can produce a multi-second delta, and
   * feeding that straight into the accumulator would make the loop try to
   * simulate thousands of ticks in one frame and lock the page.
   */
  tick(nowMs = this.time.now(), maxDeltaSeconds = 0.25): Seconds {
    const delta = Math.min(maxDeltaSeconds, Math.max(0, (nowMs - this.#lastMs) / 1000));
    this.#lastMs = nowMs;
    this.#elapsed += delta;
    this.#frames += 1;
    this.#fpsAccumulator += delta;
    if (this.#fpsAccumulator >= 0.5) {
      this.#fps = this.#frames / this.#fpsAccumulator;
      this.#frames = 0;
      this.#fpsAccumulator = 0;
    }
    return delta;
  }

  /** Call after a long pause so the next tick does not report a huge delta. */
  resync(nowMs = this.time.now()): void {
    this.#lastMs = nowMs;
  }

  get elapsedSeconds(): Seconds {
    return this.#elapsed;
  }

  get fps(): number {
    return this.#fps;
  }
}
