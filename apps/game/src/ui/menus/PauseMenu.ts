/**
 * The pause screen. Sits over the frozen farm rather than replacing it, so the
 * player keeps their spatial context.
 */
import { el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedIconButton, localizedText } from '../i18n/localizedDom.js';

export interface PauseMenuCallbacks {
  readonly onResume: () => void;
  readonly onSettings: () => void;
  readonly onAccount: () => void;
  readonly onQuit: () => void;
}

export class PauseMenu implements Screen {
  readonly id = 'pause';
  readonly root: HTMLElement;

  constructor(callbacks: PauseMenuCallbacks, i18n: GameLocalization = createEnglishLocalization()) {
    this.root = el(
      'div',
      { class: 'fr-layer', testId: 'pause-menu' },
      el(
        'div',
        { class: 'fr-panel fr-panel--compact' },
        el('div', { class: 'fr-screen-icon' }, uiIcon('farmer', '', 'fr-screen-icon__image')),
        localizedText(i18n, 'span', 'pause.ribbon', { class: 'fr-ribbon' }),
        localizedText(i18n, 'h1', 'pause.title', { class: 'fr-title' }),
        localizedText(i18n, 'p', 'pause.subtitle', { class: 'fr-subtitle' }),
        el(
          'div',
          { class: 'fr-actions' },
          localizedIconButton(i18n, 'pause.resume', callbacks.onResume, 'farmer', {
            class: 'fr-btn fr-btn--primary',
            testId: 'pause-resume',
          }),
          localizedIconButton(i18n, 'menu.settings', callbacks.onSettings, 'settings', {
            class: 'fr-btn fr-btn--secondary',
          }),
          localizedIconButton(i18n, 'menu.account', callbacks.onAccount, 'farmer', {
            class: 'fr-btn fr-btn--secondary',
            testId: 'pause-account',
          }),
          localizedIconButton(i18n, 'pause.backToMenu', callbacks.onQuit, 'land', {
            class: 'fr-btn fr-btn--quiet',
          }),
        ),
      ),
    );
  }
}
