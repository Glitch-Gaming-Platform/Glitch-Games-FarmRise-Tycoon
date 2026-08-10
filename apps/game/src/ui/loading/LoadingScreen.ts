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

export class LoadingScreen implements Screen {
  readonly id = 'loading';
  readonly root: HTMLElement;
  readonly #fill: HTMLElement;
  readonly #label: HTMLElement;

  constructor() {
    this.#fill = el('div', { class: 'fr-progress__fill' });
    this.#label = el('p', { class: 'fr-subtitle', text: 'Preparing the farm…' });
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
        el('span', { class: 'fr-ribbon', text: 'Opening the farm gate' }),
        el('h1', { class: 'fr-title', text: 'FarmRise Tycoon' }),
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
    this.setProgress(0, 'Preparing the farm…');
  }
}
