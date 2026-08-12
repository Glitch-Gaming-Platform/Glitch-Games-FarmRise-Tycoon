/**
 * The main menu. Intentionally the only screen that can start a session, so
 * "how does the game begin?" has exactly one answer.
 */
import { el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { languageSelect } from '../i18n/LanguageSelect.js';
import { localizedIconButton, localizedText } from '../i18n/localizedDom.js';

export interface MainMenuCallbacks {
  readonly onPlay: () => void;
  readonly onSettings: () => void;
  readonly onAccount: () => void;
}

export class MainMenu implements Screen {
  readonly id = 'menu';
  readonly root: HTMLElement;

  constructor(callbacks: MainMenuCallbacks, i18n: GameLocalization = createEnglishLocalization()) {
    const hero = uiIcon('heroFarm', '', 'fr-menu__hero-image');
    i18n.bindAttribute(hero, 'alt', 'menu.heroAlt');
    this.root = el(
      'div',
      { class: 'fr-layer', testId: 'main-menu' },
      el(
        'div',
        { class: 'fr-panel fr-panel--menu' },
        el(
          'div',
          { class: 'fr-menu__copy' },
          localizedText(i18n, 'span', 'menu.ribbon', { class: 'fr-ribbon' }),
          localizedText(i18n, 'h1', 'app.title', { class: 'fr-title fr-title--hero' }),
          localizedText(i18n, 'p', 'menu.subtitle', { class: 'fr-subtitle' }),
          languageSelect(i18n, {
            className: 'fr-field fr-field--language fr-field--language-menu',
            testId: 'menu-language-select',
          }),
          el(
            'div',
            { class: 'fr-actions fr-actions--menu' },
            localizedIconButton(i18n, 'menu.play', callbacks.onPlay, 'tools', {
              class: 'fr-btn fr-btn--primary fr-btn--large',
              testId: 'menu-play',
            }),
            localizedIconButton(i18n, 'menu.settings', callbacks.onSettings, 'settings', {
              class: 'fr-btn fr-btn--secondary',
              testId: 'menu-settings',
            }),
            localizedIconButton(i18n, 'menu.account', callbacks.onAccount, 'farmer', {
              class: 'fr-btn fr-btn--secondary',
              testId: 'menu-account',
            }),
          ),
        ),
        el(
          'div',
          { class: 'fr-menu__hero' },
          hero,
          localizedText(i18n, 'span', 'menu.heroLabel', { class: 'fr-menu__hero-label' }),
        ),
      ),
    );
  }
}
