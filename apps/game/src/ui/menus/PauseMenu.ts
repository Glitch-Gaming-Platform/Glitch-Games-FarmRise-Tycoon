/**
 * The pause screen. Sits over the frozen farm rather than replacing it, so the
 * player keeps their spatial context.
 */
import { el } from '../core/dom.js';
import { iconButton, uiIcon } from '../core/icons.js';
import type { Screen } from '../core/Screen.js';

export interface PauseMenuCallbacks {
  readonly onResume: () => void;
  readonly onSettings: () => void;
  readonly onAccount: () => void;
  readonly onQuit: () => void;
}

export class PauseMenu implements Screen {
  readonly id = 'pause';
  readonly root: HTMLElement;

  constructor(callbacks: PauseMenuCallbacks) {
    this.root = el(
      'div',
      { class: 'fr-layer', testId: 'pause-menu' },
      el(
        'div',
        { class: 'fr-panel fr-panel--compact' },
        el('div', { class: 'fr-screen-icon' }, uiIcon('farmer', '', 'fr-screen-icon__image')),
        el('span', { class: 'fr-ribbon', text: 'Farm ledger closed' }),
        el('h1', { class: 'fr-title', text: 'Paused' }),
        el('p', {
          class: 'fr-subtitle',
          text: 'Crops keep their progress while you are away from the keyboard.',
        }),
        el(
          'div',
          { class: 'fr-actions' },
          iconButton('Resume', callbacks.onResume, 'farmer', {
            class: 'fr-btn fr-btn--primary',
            testId: 'pause-resume',
          }),
          iconButton('Settings', callbacks.onSettings, 'settings', {
            class: 'fr-btn fr-btn--secondary',
          }),
          iconButton('Account', callbacks.onAccount, 'farmer', {
            class: 'fr-btn fr-btn--secondary',
            testId: 'pause-account',
          }),
          iconButton('Back to menu', callbacks.onQuit, 'land', {
            class: 'fr-btn fr-btn--quiet',
          }),
        ),
      ),
    );
  }
}
