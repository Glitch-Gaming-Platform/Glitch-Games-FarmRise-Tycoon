/**
 * The onboarding sequence.
 *
 * Driven entirely by synthetic context objects, which is the payoff for
 * keeping OnboardingDirector free of DOM, audio and analytics: a whole first
 * session runs in under a millisecond and every branch is reachable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BEATS, type OnboardingContext } from '@game/onboarding/beats.js';
import { OnboardingDirector, forgetOnboarding } from '@game/onboarding/OnboardingDirector.js';

const base: OnboardingContext = {
  nowMs: 0,
  hasMoved: false,
  plotInReach: null,
  plantedPlots: 0,
  tendCount: 0,
  cropsHarvested: 0,
  salesMade: 0,
  reinvestments: 0,
  warningActive: false,
  eventsResolved: 0,
  marketOpen: false,
  buildOpen: false,
};

const ctx = (overrides: Partial<OnboardingContext> = {}): OnboardingContext => ({
  ...base,
  ...overrides,
});

beforeEach(() => {
  forgetOnboarding();
});

describe('beat copy', () => {
  it('stays within the prompt length budget', () => {
    // Two short lines is the rule in docs/ONBOARDING.md. A prompt that grows
    // past this stops being glanceable and starts being read - or skipped.
    for (const beat of BEATS) {
      expect(beat.title.length, `${beat.id} title`).toBeLessThanOrEqual(34);
      expect(beat.body.length, `${beat.id} body`).toBeLessThanOrEqual(110);
    }
  });

  it('gives every beat a unique id', () => {
    expect(new Set(BEATS.map((b) => b.id)).size).toBe(BEATS.length);
  });

  it('never teaches a control before the beat that needs it', () => {
    // The move beat must come before plant, plant before harvest, harvest
    // before sell. Teaching out of order is the classic tutorial failure.
    const order = BEATS.map((b) => b.id);
    expect(order.indexOf('move')).toBeLessThan(order.indexOf('plant'));
    expect(order.indexOf('plant')).toBeLessThan(order.indexOf('harvest'));
    expect(order.indexOf('harvest')).toBeLessThan(order.indexOf('sell'));
    expect(order.indexOf('sell')).toBeLessThan(order.indexOf('reinvest'));
  });

  it('states the next concrete action on every sequential beat', () => {
    const copy = Object.fromEntries(BEATS.map((beat) => [beat.id, beat.body]));
    expect(copy['move']).toMatch(/W, A, S and D.*brown plots/i);
    expect(copy['plant']).toMatch(/Plant Wheat.*press E/i);
    expect(copy['tend']).toMatch(/press E.*water/i);
    expect(copy['harvest']).toMatch(/gold or orange.*press E/i);
    expect(copy['sell']).toMatch(/Press M.*Sell all/i);
    expect(copy['reinvest']).toMatch(/Press B.*place/i);
    expect(copy['goal']).toMatch(/\$150.*press B/i);
  });
});

describe('a first-time player', () => {
  it('starts on the movement beat', () => {
    const director = new OnboardingDirector();
    director.start(ctx());
    expect(director.currentBeat?.id).toBe('move');
    expect(director.active).toBe(true);
  });

  it('walks the whole sequence in order', () => {
    const director = new OnboardingDirector();
    const seen: string[] = [];
    director.events.on('onboarding:beat', ({ beat }) => seen.push(beat.id));

    director.start(ctx());
    director.update(ctx({ hasMoved: true, plotInReach: 'plot-1' }));
    director.update(ctx({ plantedPlots: 1 }));
    director.update(ctx({ plantedPlots: 1, tendCount: 1 }));
    director.update(ctx({ cropsHarvested: 1 }));
    director.update(ctx({ cropsHarvested: 1, salesMade: 1 }));
    director.update(ctx({ salesMade: 1, reinvestments: 1 }));
    // The goal beat is a hand-off: it is shown, then completes on the next
    // tick, which is what carries the player into the free-running loop.
    director.update(ctx({ salesMade: 1, reinvestments: 1 }));

    // 'setback' is absent because no warning ever fired - it is deferred,
    // not shown on a schedule.
    expect(seen).toEqual(['move', 'plant', 'tend', 'harvest', 'sell', 'reinvest', 'goal']);
    expect(director.finished).toBe(true);
    expect(director.hasDeferredBeats).toBe(true);
  });

  it('reveals HUD features progressively rather than all at once', () => {
    const director = new OnboardingDirector();
    director.start(ctx());
    // Nothing is revealed on the movement beat: a player who has not yet
    // planted has no use for a money readout.
    expect(director.isRevealed('money')).toBe(false);
    expect(director.isRevealed('storage')).toBe(false);

    director.update(ctx({ hasMoved: true, plotInReach: 'plot-1' }));
    expect(director.isRevealed('money')).toBe(true);
    expect(director.isRevealed('storage')).toBe(false);

    director.update(ctx({ plantedPlots: 1 }));
    director.update(ctx({ plantedPlots: 1, tendCount: 1 }));
    expect(director.isRevealed('storage')).toBe(true);
  });

  it('reveals everything once onboarding finishes', () => {
    const director = new OnboardingDirector();
    director.start(ctx());
    director.skip(ctx());
    for (const feature of ['money', 'seed', 'ready', 'storage', 'objective', 'warning'] as const) {
      expect(director.isRevealed(feature)).toBe(true);
    }
  });
});

describe('hints', () => {
  it('escalates once when a beat stalls, and only once', () => {
    const director = new OnboardingDirector();
    const hints = vi.fn();
    director.events.on('onboarding:hint', hints);

    director.start(ctx());
    director.update(ctx({ nowMs: 5_000 }));
    expect(hints).not.toHaveBeenCalled();

    director.update(ctx({ nowMs: 13_000 }));
    expect(hints).toHaveBeenCalledTimes(1);

    director.update(ctx({ nowMs: 30_000 }));
    expect(hints).toHaveBeenCalledTimes(1);
  });
});

describe('an experienced player', () => {
  it('skips beats for things they already did', () => {
    const director = new OnboardingDirector();
    const skipped: string[] = [];
    director.events.on('onboarding:skipped', ({ beat }) => skipped.push(beat?.id ?? 'none'));

    // Arrives having already planted and harvested - as happens when someone
    // experiments before reading anything.
    director.start(ctx({ hasMoved: true, plotInReach: 'p1', plantedPlots: 2, cropsHarvested: 1 }));

    expect(skipped).toContain('move');
    expect(skipped).toContain('plant');
    expect(director.currentBeat?.id).toBe('sell');
  });

  it('can skip the whole tutorial at any point', () => {
    const director = new OnboardingDirector();
    const complete = vi.fn();
    director.events.on('onboarding:complete', complete);

    director.start(ctx());
    director.skip(ctx({ nowMs: 4_000 }));

    expect(director.finished).toBe(true);
    expect(director.active).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('is not taught at all when constructed with skip', () => {
    const director = new OnboardingDirector({ skip: true });
    const started = vi.fn();
    director.events.on('onboarding:started', started);
    director.start(ctx());
    expect(started).not.toHaveBeenCalled();
    expect(director.isRevealed('objective')).toBe(true);
  });
});

describe('the setback beat', () => {
  it('waits for a real warning instead of appearing on a schedule', () => {
    const director = new OnboardingDirector();
    director.start(ctx());
    // Advance to the setback beat.
    director.update(ctx({ hasMoved: true, plotInReach: 'p' }));
    director.update(ctx({ plantedPlots: 1 }));
    director.update(ctx({ tendCount: 1 }));
    director.update(ctx({ cropsHarvested: 1 }));
    director.update(ctx({ salesMade: 1 }));
    director.update(ctx({ reinvestments: 1 }));
    director.update(ctx({ reinvestments: 1 }));

    // With no warning the sequence ends without ever teaching prevention -
    // which is correct: you cannot teach a response to something that has
    // not happened. The beat is held for later instead.
    expect(director.finished).toBe(true);
    expect(director.hasDeferredBeats).toBe(true);
  });

  it('fires just-in-time when a warning finally appears, even after onboarding ends', () => {
    const director = new OnboardingDirector();
    const seen: string[] = [];
    director.events.on('onboarding:beat', ({ beat }) => seen.push(beat.id));

    // Complete the whole sequence with clear skies.
    director.start(ctx());
    director.update(ctx({ hasMoved: true, plotInReach: 'p' }));
    director.update(ctx({ plantedPlots: 1 }));
    director.update(ctx({ tendCount: 1 }));
    director.update(ctx({ cropsHarvested: 1 }));
    director.update(ctx({ salesMade: 1 }));
    director.update(ctx({ reinvestments: 1 }));
    director.update(ctx({ reinvestments: 1 }));
    expect(seen).not.toContain('setback');
    expect(director.finished).toBe(true);

    // Much later, the first drought warning arrives.
    director.update(ctx({ nowMs: 300_000, warningActive: true }));
    expect(seen).toContain('setback');
    expect(director.currentBeat?.id).toBe('setback');

    // Resolving it does not reopen the tutorial.
    director.update(ctx({ nowMs: 320_000, warningActive: false, eventsResolved: 1 }));
    expect(director.currentBeat).toBeNull();
    expect(director.finished).toBe(true);
  });
});
