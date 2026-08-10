/**
 * Runs the first-session beat sequence.
 *
 * It owns no gameplay. It reads a snapshot of the world each tick, decides
 * which beat is current, and emits events. The UI renders the prompt, the
 * audio layer plays the cue, and analytics records the funnel - none of which
 * this class knows about.
 *
 * That separation is what lets onboarding be tested headlessly: the whole
 * sequence can be driven by feeding it context objects.
 */
import { EventBus } from '@engine/core/EventBus.js';
import {
  ALL_HUD_FEATURES,
  BEATS,
  type Beat,
  type HudFeature,
  type OnboardingContext,
} from './beats.js';

export interface OnboardingEvents extends Record<string, unknown> {
  'onboarding:started': { adaptive: boolean };
  'onboarding:beat': { beat: Beat; index: number };
  'onboarding:beat-complete': { beat: Beat; index: number; durationMs: number; hints: number };
  'onboarding:hint': { beat: Beat; attempt: number };
  'onboarding:skipped': { beat: Beat | null; index: number; reason: 'player' | 'mastery' };
  'onboarding:revealed': { features: readonly HudFeature[] };
  'onboarding:complete': { durationMs: number; beatsShown: number; hints: number };
}

const STORAGE_KEY = 'farmrise:onboarded';

export interface OnboardingOptions {
  /** Skips the whole sequence, e.g. a returning player. */
  readonly skip?: boolean;
  readonly beats?: readonly Beat[];
}

export class OnboardingDirector {
  readonly events = new EventBus<OnboardingEvents>();
  readonly #beats: readonly Beat[];
  readonly #revealed = new Set<HudFeature>();

  /**
   * Beats whose trigger has not fired yet.
   *
   * The setback beat teaches a response to a warning, and a warning may not
   * happen during onboarding at all. Blocking the sequence on it would leave
   * the player staring at "Something is coming" with a clear sky; dropping it
   * would mean never teaching the countermeasure. So it is deferred and shown
   * just-in-time - even after onboarding has otherwise completed.
   */
  readonly #deferred: Beat[] = [];
  #index = -1;
  #startedAt = 0;
  #beatStartedAt = 0;
  #hintsThisBeat = 0;
  #hintsTotal = 0;
  #beatsShown = 0;
  #finished = false;
  #started = false;

  constructor(options: OnboardingOptions = {}) {
    this.#beats = options.beats ?? BEATS;
    if (options.skip) this.#finished = true;
  }

  get active(): boolean {
    return this.#started && !this.#finished;
  }

  /** True while a just-in-time beat is still waiting for its trigger. */
  get hasDeferredBeats(): boolean {
    return this.#deferred.length > 0;
  }

  get finished(): boolean {
    return this.#finished;
  }

  get currentBeat(): Beat | null {
    return this.#index >= 0 && this.#index < this.#beats.length ? this.#beats[this.#index]! : null;
  }

  get revealed(): ReadonlySet<HudFeature> {
    return this.#revealed;
  }

  isRevealed(feature: HudFeature): boolean {
    return this.#finished || this.#revealed.has(feature);
  }

  start(context: OnboardingContext): void {
    if (this.#started) return;
    this.#started = true;
    this.#startedAt = context.nowMs;

    if (this.#finished) {
      // A returning player gets the full HUD immediately rather than an
      // interface that dribbles in for no reason.
      this.#revealAll();
      return;
    }
    this.events.emit('onboarding:started', { adaptive: false });
    this.#advance(context);
  }

  /** Called every fixed tick with a fresh snapshot. */
  update(context: OnboardingContext): void {
    if (!this.#started) return;

    // A deferred beat fires the moment its trigger does, whether or not the
    // main sequence has finished.
    if (!this.currentBeat) {
      const readyAt = this.#deferred.findIndex((candidate) => candidate.waitsFor?.(context));
      if (readyAt >= 0) {
        const [beat] = this.#deferred.splice(readyAt, 1);
        this.#showDeferred(beat!, context);
      }
    }

    const beat = this.currentBeat;
    if (!beat) return;

    if (beat.isDone(context)) {
      this.events.emit('onboarding:beat-complete', {
        beat,
        index: this.#index,
        durationMs: context.nowMs - this.#beatStartedAt,
        hints: this.#hintsThisBeat,
      });
      if (this.#finished) {
        // A deferred beat completing does not restart the sequence.
        this.#index = this.#beats.length;
      } else {
        this.#advance(context);
      }
      return;
    }

    const hint = beat.hint;
    if (hint && this.#hintsThisBeat === 0 && context.nowMs - this.#beatStartedAt >= hint.afterMs) {
      this.#hintsThisBeat += 1;
      this.#hintsTotal += 1;
      this.events.emit('onboarding:hint', { beat, attempt: this.#hintsThisBeat });
    }
  }

  /** Player pressed skip. Ends onboarding and reveals everything. */
  skip(context: OnboardingContext): void {
    if (this.#finished) return;
    this.events.emit('onboarding:skipped', {
      beat: this.currentBeat,
      index: this.#index,
      reason: 'player',
    });
    this.#finish(context);
  }

  #advance(context: OnboardingContext): void {
    for (let next = this.#index + 1; next < this.#beats.length; next += 1) {
      const beat = this.#beats[next]!;

      // A beat waiting on the world is set aside rather than shown early.
      if (beat.waitsFor && !beat.waitsFor(context)) {
        this.#deferred.push(beat);
        continue;
      }

      // Adaptive shortening: a player who already did the thing is not told
      // to do it. This is what keeps the sequence from patronising anyone who
      // explored before being instructed.
      // A beat that declares `alreadySatisfied` owns its own skip rule;
      // otherwise "already done" is the rule.
      const skippable = beat.alreadySatisfied
        ? beat.alreadySatisfied(context)
        : beat.isDone(context);
      if (skippable) {
        this.events.emit('onboarding:skipped', { beat, index: next, reason: 'mastery' });
        continue;
      }

      this.#index = next;
      this.#beatStartedAt = context.nowMs;
      this.#hintsThisBeat = 0;
      this.#beatsShown += 1;
      if (beat.reveals?.length) this.#reveal(beat.reveals);
      this.events.emit('onboarding:beat', { beat, index: next });
      return;
    }
    this.#finish(context);
  }

  #showDeferred(beat: Beat, context: OnboardingContext): void {
    this.#index = this.#beats.indexOf(beat);
    this.#beatStartedAt = context.nowMs;
    this.#hintsThisBeat = 0;
    this.#beatsShown += 1;
    if (beat.reveals?.length) this.#reveal(beat.reveals);
    this.events.emit('onboarding:beat', { beat, index: this.#index });
  }

  #reveal(features: readonly HudFeature[]): void {
    const added: HudFeature[] = [];
    for (const feature of features) {
      if (!this.#revealed.has(feature)) {
        this.#revealed.add(feature);
        added.push(feature);
      }
    }
    if (added.length) this.events.emit('onboarding:revealed', { features: added });
  }

  #revealAll(): void {
    this.#reveal(ALL_HUD_FEATURES);
  }

  #finish(context: OnboardingContext): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#index = this.#beats.length;
    this.#revealAll();
    this.events.emit('onboarding:complete', {
      durationMs: context.nowMs - this.#startedAt,
      beatsShown: this.#beatsShown,
      hints: this.#hintsTotal,
    });
    rememberOnboarded();
  }
}

/**
 * Whether this browser has completed onboarding before.
 *
 * Stored locally and treated as a hint, not a guarantee: a returning player
 * on a new device sees the tutorial again, which is a far better failure than
 * a first-time player being dropped in with no guidance.
 */
export function hasOnboardedBefore(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberOnboarded(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, '1');
  } catch {
    // Private browsing. The only cost is seeing the tutorial again.
  }
}

export function forgetOnboarding(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}
