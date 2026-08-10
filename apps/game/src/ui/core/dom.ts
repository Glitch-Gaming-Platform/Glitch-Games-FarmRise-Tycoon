/**
 * A 40-line DOM helper instead of a UI framework.
 *
 * The UI here is a handful of overlays over a WebGL canvas. Pulling in React
 * would add a runtime, a build step and a reconciliation pass competing with
 * the render loop for main-thread time, to save very little. If the UI grows
 * into something with real state and routing, that is the point to reconsider -
 * and this module is the seam where it would be swapped.
 */
export type Child = Node | string | null | undefined | false;

export interface ElementProps {
  readonly class?: string;
  readonly text?: string;
  readonly html?: string;
  readonly attrs?: Record<string, string>;
  readonly style?: Partial<CSSStyleDeclaration>;
  readonly on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
  readonly testId?: string;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.testId) node.dataset['testid'] = props.testId;
  for (const [key, value] of Object.entries(props.attrs ?? {})) node.setAttribute(key, value);
  if (props.style) Object.assign(node.style, props.style);
  for (const [type, handler] of Object.entries(props.on ?? {})) {
    if (handler) node.addEventListener(type, handler);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Buttons get an explicit type so they never submit a surrounding form. */
export function button(
  label: string,
  onClick: () => void,
  props: ElementProps = {},
): HTMLButtonElement {
  return el('button', {
    ...props,
    attrs: { type: 'button', ...props.attrs },
    text: label,
    on: { click: onClick },
  });
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.firstChild.remove();
}
