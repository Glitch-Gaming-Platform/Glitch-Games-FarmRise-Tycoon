/**
 * The anti-cheat plausibility checks.
 *
 * Each test here corresponds to an edit someone would actually make to a save
 * file or to memory. If one of these starts passing invalid input, that is a
 * live exploit rather than a failing unit test.
 */
import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, requireCrop, type SaveState } from '@farmrise/shared';
import { validateSaveTransition } from '@/services/saveValidation';

const base: SaveState = {
  schemaVersion: SAVE_SCHEMA_VERSION,
  tick: 1000,
  balance: 5000 as SaveState['balance'],
  plots: [],
  buildings: [],
  animals: [],
  inventory: {},
  landParcels: 1,
  rngState: 1,
};

const later = (overrides: Partial<SaveState>, elapsed = 600): SaveState => ({
  ...base,
  tick: base.tick + elapsed,
  ...overrides,
});

const NOW_TICK = 100_000;

describe('validateSaveTransition', () => {
  it('accepts an ordinary continuation', () => {
    expect(validateSaveTransition(base, later({}), NOW_TICK).ok).toBe(true);
  });

  it('rejects time running backwards', () => {
    expect(validateSaveTransition(base, { ...base, tick: 900 }, NOW_TICK).ok).toBe(false);
  });

  it('rejects a tick far ahead of the server clock', () => {
    // Fast-forwarding the clock is how you would try to instantly grow crops.
    const outcome = validateSaveTransition(
      base,
      { ...base, tick: NOW_TICK + 10_000_000 },
      NOW_TICK,
    );
    expect(outcome.ok).toBe(false);
  });

  it('rejects an impossible balance jump', () => {
    const outcome = validateSaveTransition(
      base,
      later({ balance: 99_999_999 as SaveState['balance'] }),
      NOW_TICK,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/Balance/);
  });

  it('allows the balance to fall freely, because spending is always legal', () => {
    expect(
      validateSaveTransition(base, later({ balance: 0 as SaveState['balance'] }), NOW_TICK).ok,
    ).toBe(true);
  });

  it('rejects inventory appearing from nowhere', () => {
    const outcome = validateSaveTransition(base, later({ inventory: { wheat: 5000 } }), NOW_TICK);
    expect(outcome.ok).toBe(false);
  });

  it('rejects an inventory beyond storage capacity', () => {
    const outcome = validateSaveTransition(
      { ...base, inventory: { wheat: 59 } },
      later({ inventory: { wheat: 200 } }, 100_000),
      NOW_TICK,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/storage/i);
  });

  it('rejects claiming several land parcels at once', () => {
    expect(validateSaveTransition(base, later({ landParcels: 5 }), NOW_TICK).ok).toBe(false);
    expect(validateSaveTransition(base, later({ landParcels: 2 }), NOW_TICK).ok).toBe(true);
  });

  it('rejects land parcels disappearing', () => {
    const previous = { ...base, landParcels: 3 };
    expect(validateSaveTransition(previous, later({ landParcels: 1 }), NOW_TICK).ok).toBe(false);
  });

  it('rejects a crop grown past its own maximum', () => {
    const plot = {
      id: 'p1' as never,
      cropId: 'wheat',
      grownTicks: requireCrop('wheat').growthTicks * 10,
      tendCount: 0,
      water: 1,
      irrigated: false,
      diseased: false,
      eventMultiplier: 1,
    };
    expect(validateSaveTransition(base, later({ plots: [plot] }), NOW_TICK).ok).toBe(false);
  });

  it('rejects a crop growing faster than time passed', () => {
    const previous: SaveState = {
      ...base,
      plots: [
        {
          id: 'p1' as never,
          cropId: 'pumpkin',
          grownTicks: 0,
          tendCount: 0,
          water: 1,
          irrigated: false,
          diseased: false,
          eventMultiplier: 1,
        },
      ],
    };
    const next = later(
      {
        plots: [{ ...previous.plots[0]!, grownTicks: requireCrop('pumpkin').growthTicks }],
      },
      10,
    );
    expect(validateSaveTransition(previous, next, NOW_TICK).ok).toBe(false);
  });

  it('allows replanting, which legitimately resets growth to zero', () => {
    const previous: SaveState = {
      ...base,
      plots: [
        {
          id: 'p1' as never,
          cropId: 'wheat',
          grownTicks: 500,
          tendCount: 0,
          water: 1,
          irrigated: false,
          diseased: false,
          eventMultiplier: 1,
        },
      ],
    };
    const next = later({ plots: [{ ...previous.plots[0]!, cropId: 'corn', grownTicks: 0 }] });
    expect(validateSaveTransition(previous, next, NOW_TICK).ok).toBe(true);
  });
});
