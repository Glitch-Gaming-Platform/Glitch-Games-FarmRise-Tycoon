import { afterEach, describe, expect, it, vi } from 'vitest';
import { newCareer } from '@farmrise/shared';
import { AutosaveController } from '@platform/save/AutosaveController.js';
import type { SaveDirector } from '@platform/save/SaveDirector.js';

describe('AutosaveController', () => {
  it('writes one all-tier checkpoint per interval and keeps pagehide local-only', async () => {
    let now = 0;
    const save = vi.fn(async () => ['local'] as const);
    const writeLocal = vi.fn(() => true);
    const saves = { save, writeLocal } as unknown as SaveDirector;
    const state = newCareer({ careerId: 'autosave-test', seed: 1 });
    const autosave = new AutosaveController(saves, () => state, {
      intervalMs: 100,
      now: () => now,
    });

    autosave.markDirty();
    expect(await autosave.maybeSave()).toBe(false);
    now = 100;
    expect(await autosave.maybeSave()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(writeLocal).not.toHaveBeenCalled();

    autosave.flushLocal();
    expect(writeLocal).toHaveBeenCalledTimes(1);
  });

  it('checkpoints elapsed simulation even when no command event marked it dirty', async () => {
    vi.useFakeTimers();
    let now = 0;
    const save = vi.fn(async () => ['local', 'cloud'] as const);
    const state = newCareer({ careerId: 'elapsed-autosave', seed: 2 });
    const autosave = new AutosaveController(
      { save, writeLocal: vi.fn(() => true) } as unknown as SaveDirector,
      () => state,
      { intervalMs: 100, now: () => now },
    );

    autosave.start();
    now = 100;
    await vi.advanceTimersByTimeAsync(100);

    expect(save).toHaveBeenCalledWith(state);
    autosave.dispose();
  });
});

afterEach(() => vi.useRealTimers());
