/**
 * Frame scheduling, behind an interface.
 *
 * The loop takes a scheduler rather than calling requestAnimationFrame itself,
 * which is what makes the game loop testable in Node: a test can drive frames
 * one at a time and assert on exactly how many fixed steps ran.
 */
export interface FrameScheduler {
  request(callback: (timeMs: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

export function createAnimationFrameScheduler(): FrameScheduler {
  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
    now: () => performance.now(),
  };
}

/** Deterministic scheduler for tests: frames only advance when you say so. */
export function createManualScheduler(startMs = 0): FrameScheduler & {
  advance(deltaMs: number): void;
  frame(deltaMs: number): void;
} {
  let currentMs = startMs;
  let nextHandle = 1;
  const pending = new Map<number, (timeMs: number) => void>();

  return {
    now: () => currentMs,
    request(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      pending.delete(handle);
    },
    advance(deltaMs) {
      currentMs += deltaMs;
    },
    /** Advances time and runs exactly one round of scheduled callbacks. */
    frame(deltaMs) {
      currentMs += deltaMs;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(currentMs);
    },
  };
}
