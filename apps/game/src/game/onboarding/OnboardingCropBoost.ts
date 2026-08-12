/**
 * Gives the first crop watered during onboarding a short, visible growth arc.
 *
 * Regular crop timing is one of the game's economic decisions and remains
 * untouched. This helper only watches for the tending action while the tend
 * beat is current, then advances that one plot through the real shared growth
 * rule over a few seconds so the player can immediately practise harvesting.
 */
import {
  advancePlot,
  plotStage,
  secondsToTicks,
  ticksUntilReady,
  type PlotState,
} from '@farmrise/shared';
import type { Career } from '../career/Career.js';

// Keep this shorter than the coach hint even on a low-frame-rate software
// renderer. Fixed-step catch-up is capped, so six simulation seconds could
// become a much longer real-world wait on a struggling first-load device.
const FAST_GROWTH_TICKS = secondsToTicks(1);

export class OnboardingCropBoost {
  readonly #lastTendCounts = new Map<string, number>();
  #plotId: string | null = null;
  #ticksLeft = 0;

  constructor(private readonly career: Career) {
    this.#rememberTendCounts();
  }

  /** Called once per fixed tick, after plot interaction and before world.advance(). */
  update(tendBeatActive: boolean): void {
    if (!this.#plotId && tendBeatActive) {
      this.#plotId = this.#newlyTendedPlot();
      if (this.#plotId) this.#ticksLeft = FAST_GROWTH_TICKS;
    }

    this.#rememberTendCounts();
    this.#advanceBoostedPlot();
  }

  #newlyTendedPlot(): string | null {
    for (const [plotId, plot] of this.career.world.plots) {
      const previous = this.#lastTendCounts.get(plotId) ?? 0;
      if (plot.tendCount > previous && plot.cropId && plotStage(plot) === 'growing') return plotId;
    }
    return null;
  }

  #advanceBoostedPlot(): void {
    if (!this.#plotId) return;
    const plot = this.career.world.getPlot(this.#plotId);
    if (!plot?.cropId || plotStage(plot) !== 'growing' || this.#ticksLeft <= 0) {
      this.#clear();
      return;
    }

    const acceleratedTicks = Math.max(1, Math.ceil(ticksUntilReady(plot) / this.#ticksLeft));
    this.career.world.setPlot(
      this.#plotId,
      advancePlot(plot, acceleratedTicks, this.career.season),
    );
    this.#ticksLeft -= 1;

    const next = this.career.world.getPlot(this.#plotId) as PlotState | undefined;
    if (!next || plotStage(next) !== 'growing') this.#clear();
  }

  #rememberTendCounts(): void {
    for (const [plotId, plot] of this.career.world.plots) {
      this.#lastTendCounts.set(plotId, plot.tendCount);
    }
  }

  #clear(): void {
    this.#plotId = null;
    this.#ticksLeft = 0;
  }
}
