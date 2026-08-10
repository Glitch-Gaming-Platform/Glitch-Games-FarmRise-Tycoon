/**
 * The game loop is the one piece of timing code the entire economy depends on.
 * These tests use the manual scheduler so frames are exact rather than
 * approximately-one-frame-ish.
 */
import { describe, expect, it, vi } from 'vitest';
import { GameLoop } from '@engine/core/GameLoop.js';
import { createManualScheduler } from '@engine/core/Scheduler.js';

function makeLoop(options: { fixedHz?: number; maxSubSteps?: number } = {}) {
  const scheduler = createManualScheduler();
  const onFixedUpdate = vi.fn();
  const onRender = vi.fn();
  const onOverrun = vi.fn();
  const loop = new GameLoop(
    { onFixedUpdate, onRender, onOverrun },
    { fixedHz: options.fixedHz ?? 60, maxSubSteps: options.maxSubSteps ?? 5, scheduler },
  );
  return { loop, scheduler, onFixedUpdate, onRender, onOverrun };
}

describe('GameLoop', () => {
  it('runs exactly one fixed step for one step-worth of time', () => {
    const { loop, onFixedUpdate } = makeLoop();
    loop.runFrame(1000 / 60);
    expect(onFixedUpdate).toHaveBeenCalledTimes(1);
  });

  it('runs several fixed steps for a long frame', () => {
    const { loop, onFixedUpdate } = makeLoop();
    loop.runFrame(50); // 50ms is about three 60Hz steps
    expect(onFixedUpdate).toHaveBeenCalledTimes(3);
  });

  it('always renders exactly once per frame', () => {
    const { loop, onRender } = makeLoop();
    loop.runFrame(50);
    loop.runFrame(60);
    expect(onRender).toHaveBeenCalledTimes(2);
  });

  it('never exceeds maxSubSteps in one frame', () => {
    // Guards the spiral of death: a stalled frame must not try to catch up
    // unboundedly, which would make the next frame slower still.
    const { loop, onFixedUpdate, onOverrun } = makeLoop({ maxSubSteps: 3 });
    loop.runFrame(1000);
    expect(onFixedUpdate).toHaveBeenCalledTimes(3);
    expect(onOverrun).toHaveBeenCalled();
  });

  it('passes a constant step size regardless of frame length', () => {
    const { loop, onFixedUpdate } = makeLoop();
    loop.runFrame(50);
    for (const call of onFixedUpdate.mock.calls) {
      expect(call[0].stepSeconds).toBeCloseTo(1 / 60, 10);
    }
  });

  it('increments the tick counter monotonically', () => {
    const { loop, onFixedUpdate } = makeLoop();
    loop.runFrame(50);
    const ticks = onFixedUpdate.mock.calls.map((call) => call[0].tick);
    expect(ticks).toEqual([0, 1, 2]);
  });

  it('reports an interpolation alpha inside [0, 1)', () => {
    const { loop, onRender } = makeLoop();
    loop.runFrame(25);
    const alpha = onRender.mock.calls.at(-1)?.[0].alpha as number;
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  });

  it('clamps a huge delta so a backgrounded tab cannot freeze on return', () => {
    const { loop, onFixedUpdate } = makeLoop({ maxSubSteps: 100 });
    loop.runFrame(60_000); // one minute of missed frames
    // The clock clamps to 250ms, i.e. 15 steps at 60Hz - not 3600.
    expect(onFixedUpdate.mock.calls.length).toBeLessThanOrEqual(16);
  });

  it('start/stop toggles the running flag and stops scheduling', () => {
    const { loop, scheduler, onRender } = makeLoop();
    loop.start();
    expect(loop.running).toBe(true);
    scheduler.frame(16);
    const renders = onRender.mock.calls.length;
    loop.stop();
    scheduler.frame(16);
    expect(loop.running).toBe(false);
    expect(onRender.mock.calls.length).toBe(renders);
  });
});
