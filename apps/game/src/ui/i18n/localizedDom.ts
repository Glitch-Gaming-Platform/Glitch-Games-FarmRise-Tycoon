import type { MessageValue } from '@engine/i18n/Localization.js';
import { button, el, type ElementProps } from '../core/dom.js';
import { iconButton, type UiIconId } from '../core/icons.js';
import type { GameLocalization } from './gameI18n.js';

export function localizedText<K extends keyof HTMLElementTagNameMap>(
  i18n: GameLocalization,
  tag: K,
  key: string,
  props: ElementProps = {},
  values?: Readonly<Record<string, MessageValue>>,
): HTMLElementTagNameMap[K] {
  return i18n.bindText(el(tag, props), key, values);
}

export function localizedButton(
  i18n: GameLocalization,
  key: string,
  onClick: () => void,
  props: ElementProps = {},
  values?: Readonly<Record<string, MessageValue>>,
): HTMLButtonElement {
  const control = button('', onClick, props);
  return i18n.bindText(control, key, values);
}

export function localizedIconButton(
  i18n: GameLocalization,
  key: string,
  onClick: () => void,
  icon: UiIconId,
  props: ElementProps = {},
  values?: Readonly<Record<string, MessageValue>>,
): HTMLButtonElement {
  const control = iconButton('', onClick, icon, props);
  const label = control.querySelector<HTMLElement>('span');
  if (label) i18n.bindText(label, key, values);
  return control;
}
