/**
 * The end-of-run screen: one success state, one failure state.
 *
 * Both use the same layout on purpose. A failure screen that looks
 * structurally different from a success screen reads as a punishment, and the
 * design pillar is "Recoverable Disruption" - losing a run should feel like a
 * result, not a telling-off. The difference is in the words and the colour of
 * one line, not in the shape of the page.
 *
 * The statistics shown are exactly the ones the core playtest question turns
 * on, so a playtester reading a screenshot can answer it.
 */
import { formatCents, formatTicks, type RunSummary } from '@farmrise/shared';
import { button, el } from '../core/dom.js';
import { setUiIcon, uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';

export interface OutcomeCallbacks {
  readonly onPlayAgain: () => void;
  readonly onBackToMenu: () => void;
}

const COPY = {
  expanded: {
    title: 'The parcel is yours',
    headline:
      'You worked the ground, read the market and bought the field next door. That is a season well run.',
  },
  bankrupt: {
    title: 'The season got away from you',
    headline:
      'No seed money, nothing in store and nothing in the ground. It happens — most farms lose a season before they win one.',
  },
} as const;

export class OutcomeScreen implements Screen {
  readonly id = 'outcome';
  readonly root: HTMLElement;
  readonly #title: HTMLElement;
  readonly #headline: HTMLElement;
  readonly #stats: HTMLElement;
  readonly #icon: HTMLImageElement;

  constructor(callbacks: OutcomeCallbacks) {
    this.#title = el('h1', { class: 'fr-title' });
    this.#headline = el('p', { class: 'fr-outcome__headline' });
    this.#stats = el('dl', { class: 'fr-outcome__stats', testId: 'outcome-stats' });
    this.#icon = uiIcon('land', '', 'fr-outcome__icon');

    this.root = el(
      'div',
      { class: 'fr-layer', testId: 'outcome-screen' },
      el(
        'div',
        { class: 'fr-panel fr-panel--outcome' },
        this.#icon,
        el('span', { class: 'fr-ribbon', text: 'Season summary' }),
        this.#title,
        this.#headline,
        this.#stats,
        el(
          'div',
          { class: 'fr-actions' },
          button('Run another season', () => callbacks.onPlayAgain(), {
            class: 'fr-btn',
            testId: 'outcome-again',
          }),
          button('Back to menu', () => callbacks.onBackToMenu(), {
            class: 'fr-btn fr-btn--ghost',
            testId: 'outcome-menu',
          }),
        ),
      ),
    );
  }

  present(summary: RunSummary): void {
    const copy = summary.outcome === 'expanded' ? COPY.expanded : COPY.bankrupt;
    setUiIcon(this.#icon, summary.outcome === 'expanded' ? 'land' : 'warning');
    this.#title.textContent = copy.title;
    this.#headline.textContent = copy.headline;

    const rows: [string, string][] = [
      ['Production cycles', String(summary.cyclesCompleted)],
      ['Crops harvested', String(summary.cropsHarvested)],
      ['Money earned', formatCents(summary.totalEarned)],
      ['Best balance', formatCents(summary.peakBalance)],
      ['Buildings raised', String(summary.buildingsBuilt)],
      ['Setbacks weathered', `${summary.eventsSurvived} (${summary.eventsPrevented} prevented)`],
      ['Time on the farm', formatTicks(summary.elapsedTicks)],
    ];

    this.#stats.replaceChildren();
    for (const [label, value] of rows) {
      this.#stats.append(el('dt', { text: label }), el('dd', { text: value }));
    }
  }
}
