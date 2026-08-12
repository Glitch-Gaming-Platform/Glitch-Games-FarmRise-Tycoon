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
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedText } from '../i18n/localizedDom.js';

export interface MenuShortcutCallbacks {
  readonly onMarket: () => void;
  readonly onBuild: () => void;
  readonly onCareer: () => void;
  readonly onTown: () => void;
}

export class MenuShortcutDock {
  readonly root: HTMLElement;

  constructor(
    callbacks: MenuShortcutCallbacks,
    i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.root = el(
      'nav',
      {
        class: 'fr-menu-shortcuts',
        testId: 'menu-shortcuts',
        attrs: {},
      },
      shortcut(i18n, 'dock.market', 'M', 'market', callbacks.onMarket, 'menu-shortcut-market'),
      shortcut(i18n, 'dock.build', 'B', 'barn', callbacks.onBuild, 'menu-shortcut-build'),
      shortcut(i18n, 'dock.office', 'C', 'land', callbacks.onCareer, 'menu-shortcut-career'),
      shortcut(i18n, 'dock.town', 'T', 'market', callbacks.onTown, 'menu-shortcut-town'),
    );
    i18n.bindAttribute(this.root, 'aria-label', 'dock.label');
    this.root.hidden = true;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}

function shortcut(
  i18n: GameLocalization,
  labelKey: string,
  key: string,
  icon: UiIconId,
  onClick: () => void,
  testId: string,
): HTMLButtonElement {
  const control = el(
    'button',
    {
      class: 'fr-menu-shortcut',
      testId,
      attrs: {
        type: 'button',
        'aria-keyshortcuts': key,
      },
      on: { click: onClick },
    },
    uiIcon(icon, '', 'fr-menu-shortcut__icon'),
    localizedText(i18n, 'span', labelKey, { class: 'fr-menu-shortcut__name' }),
    el('kbd', { class: 'fr-menu-shortcut__key', text: key }),
  );
  i18n.bindAttribute(control, 'aria-label', 'dock.open', {
    menu: { id: labelKey },
    key,
  });
  return control;
}
