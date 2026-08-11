/**
 * Clickable equivalents of the gameplay menu hotkeys.
 *
 * The dock is separate from Hud because Hud is deliberately read-only. These
 * controls emit player intent, while bootstrap decides which session receives
 * it. UiRoot hides the dock whenever another screen or panel already contains
 * menu controls, so icons never duplicate the open interface.
 */
import { el } from '../core/dom.js';
import { uiIcon, type UiIconId } from '../core/icons.js';

export interface MenuShortcutCallbacks {
  readonly onMarket: () => void;
  readonly onBuild: () => void;
  readonly onCareer: () => void;
  readonly onTown: () => void;
}

export class MenuShortcutDock {
  readonly root: HTMLElement;

  constructor(callbacks: MenuShortcutCallbacks) {
    this.root = el(
      'nav',
      {
        class: 'fr-menu-shortcuts',
        testId: 'menu-shortcuts',
        attrs: { 'aria-label': 'Gameplay menus' },
      },
      shortcut('Market', 'M', 'market', callbacks.onMarket, 'menu-shortcut-market'),
      shortcut('Build', 'B', 'barn', callbacks.onBuild, 'menu-shortcut-build'),
      shortcut('Office', 'C', 'land', callbacks.onCareer, 'menu-shortcut-career'),
      shortcut('Town', 'T', 'market', callbacks.onTown, 'menu-shortcut-town'),
    );
    this.root.hidden = true;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}

function shortcut(
  label: string,
  key: string,
  icon: UiIconId,
  onClick: () => void,
  testId: string,
): HTMLButtonElement {
  return el(
    'button',
    {
      class: 'fr-menu-shortcut',
      testId,
      attrs: {
        type: 'button',
        'aria-label': `Open ${label.toLowerCase()} (${key})`,
        'aria-keyshortcuts': key,
      },
      on: { click: onClick },
    },
    uiIcon(icon, '', 'fr-menu-shortcut__icon'),
    el('span', { class: 'fr-menu-shortcut__name', text: label }),
    el('kbd', { class: 'fr-menu-shortcut__key', text: key }),
  );
}
