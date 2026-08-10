import { UI_ICON_URLS, type UiIconId } from '@assets/manifests/uiIcons.manifest.js';
import { el, type ElementProps } from './dom.js';

export type { UiIconId } from '@assets/manifests/uiIcons.manifest.js';

export function uiIcon(id: UiIconId, alt = '', className = 'fr-ui-icon'): HTMLImageElement {
  return el('img', {
    class: className,
    attrs: {
      src: UI_ICON_URLS[id],
      alt,
      draggable: 'false',
      decoding: 'async',
    },
  });
}

export function setUiIcon(image: HTMLImageElement, id: UiIconId, alt = ''): void {
  image.src = UI_ICON_URLS[id];
  image.alt = alt;
}

export function iconButton(
  label: string,
  onClick: () => void,
  icon: UiIconId,
  props: ElementProps = {},
): HTMLButtonElement {
  const node = el('button', {
    ...props,
    attrs: { type: 'button', ...props.attrs },
    on: { click: onClick },
  });
  node.append(uiIcon(icon, '', 'fr-btn__icon'), el('span', { text: label }));
  return node;
}

export function itemIcon(itemId: string): UiIconId {
  if (itemId === 'corn') return 'corn';
  if (itemId === 'pumpkin') return 'pumpkin';
  if (itemId === 'eggs') return 'eggs';
  return 'wheat';
}
