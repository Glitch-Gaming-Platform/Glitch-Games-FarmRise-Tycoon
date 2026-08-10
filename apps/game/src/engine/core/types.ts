/**
 * Core engine vocabulary. Deliberately tiny - anything that needs Three.js or
 * the DOM belongs in a subsystem, not here.
 */

/** Anything holding a GPU handle, an event listener or a timer implements this. */
export interface Disposable {
  dispose(): void;
}

/** Removes a subscription. Returned by every `on`/`observe` style method. */
export type Unsubscribe = () => void;

/** Seconds. Used for all engine-facing durations to avoid ms/s confusion. */
export type Seconds = number;

export interface FixedUpdateContext {
  /** Always exactly the fixed step. Never varies, by definition. */
  readonly stepSeconds: Seconds;
  /** Monotonic simulation tick index since the loop started. */
  readonly tick: number;
}

export interface RenderContext {
  /** Real time since the previous rendered frame. Use for animation only. */
  readonly deltaSeconds: Seconds;
  /**
   * Interpolation factor in [0, 1) between the previous and current fixed
   * states. Renderers use this to draw smoothly at any refresh rate.
   */
  readonly alpha: number;
  readonly elapsedSeconds: Seconds;
}
