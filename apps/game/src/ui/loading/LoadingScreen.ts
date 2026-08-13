/**
 * The loading screen.
 *
 * It shows a real fraction driven by the scene's progress callbacks rather than
 * an indeterminate spinner, because an honest bar is the only way a player can
 * tell "still working" from "hung".
 */
import { el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedText } from '../i18n/localizedDom.js';

export class LoadingScreen implements Screen {
  readonly id = 'loading';
  readonly root: HTMLElement;
  readonly #fill: HTMLElement;
  readonly #label: HTMLElement;
  readonly #status: HTMLElement;
  readonly #i18n: GameLocalization;
  #startedAtMs = 0;

  constructor(
    i18n: GameLocalization = createEnglishLocalization(),
    private readonly now: () => number = () => performance.now(),
  ) {
    this.#i18n = i18n;
    this.#fill = el('div', { class: 'fr-progress__fill' });
    this.#label = localizedText(i18n, 'p', 'loading.preparing', { class: 'fr-subtitle' });
    this.#status = el('p', { class: 'fr-progress__status', testId: 'loading-timer' });
    this.root = el(
      'div',
      {
        class: 'fr-layer',
        testId: 'loading-screen',
        attrs: { role: 'status', 'aria-live': 'polite' },
      },
      el(
        'div',
        { class: 'fr-panel fr-panel--compact' },
        uiIcon('heroFarm', '', 'fr-loading__art'),
        localizedText(i18n, 'span', 'loading.ribbon', { class: 'fr-ribbon' }),
        localizedText(i18n, 'h1', 'app.title', { class: 'fr-title' }),
        this.#label,
        el('div', { class: 'fr-progress' }, this.#fill),
        this.#status,
      ),
    );
  }

  setProgress(fraction: number, label?: string): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    const percent = Math.round(clamped * 100);
    this.#fill.style.width = `${percent}%`;
    if (label) this.#label.textContent = label;
    const elapsedSeconds = Math.max(0, (this.now() - this.#startedAtMs) / 1_000);
    const estimate = estimatedRemainingSeconds(clamped, elapsedSeconds);
    this.#status.textContent =
      clamped >= 1
        ? `${this.#i18n.formatNumber(percent)}% · ${this.#i18n.t('loading.ready')}`
        : estimate === null
          ? `${this.#i18n.formatNumber(percent)}%`
          : `${this.#i18n.formatNumber(percent)}% · ~${this.#i18n.t('time.remaining', {
              time: this.#i18n.formatDurationSeconds(estimate),
            })}`;
  }

  show(): void {
    this.#startedAtMs = this.now();
    this.setProgress(0, this.#i18n.t('loading.preparing'));
  }
}

/** Throughput-based ETA for the loading bar; null until enough progress exists to estimate. */
export function estimatedRemainingSeconds(fraction: number, elapsedSeconds: number): number | null {
  if (fraction <= 0 || fraction >= 1 || elapsedSeconds < 0.25) return null;
  return Math.max(1, Math.ceil((elapsedSeconds * (1 - fraction)) / fraction));
}
