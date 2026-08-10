/**
 * The main menu. Intentionally the only screen that can start a session, so
 * "how does the game begin?" has exactly one answer.
 */
import { el } from '../core/dom.js';
import { iconButton, uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';

export interface MainMenuCallbacks {
  readonly onPlay: () => void;
  readonly onSettings: () => void;
  readonly onAccount: () => void;
}

export class MainMenu implements Screen {
  readonly id = 'menu';
  readonly root: HTMLElement;

  constructor(callbacks: MainMenuCallbacks) {
    this.root = el(
      'div',
      { class: 'fr-layer', testId: 'main-menu' },
      el(
        'div',
        { class: 'fr-panel fr-panel--menu' },
        el(
          'div',
          { class: 'fr-menu__copy' },
          el('span', { class: 'fr-ribbon', text: 'A new season begins' }),
          el('h1', { class: 'fr-title fr-title--hero', text: 'FarmRise Tycoon' }),
          el('p', {
            class: 'fr-subtitle',
            text: 'Work the soil, read the market and turn one smallholding into a farm worth keeping.',
          }),
          el(
            'div',
            { class: 'fr-actions fr-actions--menu' },
            iconButton('Work the farm', callbacks.onPlay, 'tools', {
              class: 'fr-btn fr-btn--primary fr-btn--large',
              testId: 'menu-play',
            }),
            iconButton('Settings', callbacks.onSettings, 'settings', {
              class: 'fr-btn fr-btn--secondary',
              testId: 'menu-settings',
            }),
            iconButton('Account', callbacks.onAccount, 'farmer', {
              class: 'fr-btn fr-btn--secondary',
              testId: 'menu-account',
            }),
          ),
        ),
        el(
          'div',
          { class: 'fr-menu__hero' },
          uiIcon('heroFarm', 'Farmer beside a barn and ripe crops', 'fr-menu__hero-image'),
          el('span', { class: 'fr-menu__hero-label', text: 'Millbrook Smallholding' }),
        ),
      ),
    );
  }
}
