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
  readonly #i18n: GameLocalization;

  constructor(i18n: GameLocalization = createEnglishLocalization()) {
    this.#i18n = i18n;
    this.#fill = el('div', { class: 'fr-progress__fill' });
    this.#label = localizedText(i18n, 'p', 'loading.preparing', { class: 'fr-subtitle' });
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
      ),
    );
  }

  setProgress(fraction: number, label?: string): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    this.#fill.style.width = `${Math.round(clamped * 100)}%`;
    if (label) this.#label.textContent = label;
  }

  show(): void {
    this.setProgress(0, this.#i18n.t('loading.preparing'));
  }
}
