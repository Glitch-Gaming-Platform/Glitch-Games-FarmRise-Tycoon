/**
 * A pause between stretches of a persistent career.
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
import { ticksToSeconds, type RunSummary } from '@farmrise/shared';
import { el } from '../core/dom.js';
import { setUiIcon, uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';

export interface OutcomeCallbacks {
  readonly onPlayAgain: () => void;
  readonly onBackToMenu: () => void;
}

export class OutcomeScreen implements Screen {
  readonly id = 'outcome';
  readonly root: HTMLElement;
  readonly #title: HTMLElement;
  readonly #headline: HTMLElement;
  readonly #stats: HTMLElement;
  readonly #icon: HTMLImageElement;
  readonly #i18n: GameLocalization;
  #summary: RunSummary | null = null;

  constructor(callbacks: OutcomeCallbacks, i18n: GameLocalization = createEnglishLocalization()) {
    this.#i18n = i18n;
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
        localizedText(i18n, 'span', 'outcome.ribbon', { class: 'fr-ribbon' }),
        this.#title,
        this.#headline,
        this.#stats,
        el(
          'div',
          { class: 'fr-actions' },
          localizedButton(i18n, 'outcome.continue', () => callbacks.onPlayAgain(), {
            class: 'fr-btn',
            testId: 'outcome-again',
          }),
          localizedButton(i18n, 'outcome.backToMenu', () => callbacks.onBackToMenu(), {
            class: 'fr-btn fr-btn--ghost',
            testId: 'outcome-menu',
          }),
        ),
      ),
    );
    i18n.onChange(() => {
      if (this.#summary) this.present(this.#summary);
    });
  }

  present(summary: RunSummary): void {
    this.#summary = summary;
    setUiIcon(this.#icon, summary.outcome === 'restructured' ? 'warning' : 'land');
    this.#title.textContent = this.#i18n.t(`outcome.${summary.outcome}.title`);
    this.#headline.textContent = this.#i18n.t(`outcome.${summary.outcome}.headline`);

    const rows: [string, string][] = [
      [this.#i18n.t('outcome.productionCycles'), this.#i18n.formatNumber(summary.cyclesCompleted)],
      [this.#i18n.t('outcome.cropsHarvested'), this.#i18n.formatNumber(summary.cropsHarvested)],
      [this.#i18n.t('outcome.moneyEarned'), this.#i18n.formatCents(summary.totalEarned)],
      [this.#i18n.t('outcome.bestBalance'), this.#i18n.formatCents(summary.peakBalance)],
      [this.#i18n.t('outcome.buildingsRaised'), this.#i18n.formatNumber(summary.buildingsBuilt)],
      [this.#i18n.t('outcome.goodsHauled'), this.#i18n.formatNumber(summary.goodsHauled)],
      [this.#i18n.t('outcome.goodsProcessed'), this.#i18n.formatNumber(summary.goodsProcessed)],
      [
        this.#i18n.t('outcome.contractsCompleted'),
        this.#i18n.formatNumber(summary.contractsCompleted),
      ],
      [
        this.#i18n.t('outcome.setbacksWeathered'),
        this.#i18n.t('outcome.setbacksValue', {
          survived: this.#i18n.formatNumber(summary.incidentsSurvived),
          answered: this.#i18n.formatNumber(summary.incidentsMitigated),
        }),
      ],
      [
        this.#i18n.t('outcome.timeOnFarm'),
        this.#i18n.formatDurationSeconds(ticksToSeconds(summary.elapsedTicks)),
      ],
    ];

    this.#stats.replaceChildren();
    for (const [label, value] of rows) {
      this.#stats.append(el('dt', { text: label }), el('dd', { text: value }));
    }
  }
}
