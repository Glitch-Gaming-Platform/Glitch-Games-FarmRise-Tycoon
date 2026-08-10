/**
 * Watches the canvas container and reports size changes in both CSS pixels and
 * physical device pixels.
 *
 * ResizeObserver is used rather than window.onresize because the container can
 * change size without the window doing so (sidebars, split screen, mobile URL
 * bar collapse), and because it fires once per layout instead of once per pixel
 * of a drag.
 */
import { EventBus } from '../core/EventBus.js';
import type { Disposable } from '../core/types.js';

export interface ViewportSize {
  readonly widthCss: number;
  readonly heightCss: number;
  readonly pixelRatio: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly aspect: number;
}

export interface ViewportEvents extends Record<string, unknown> {
  resize: ViewportSize;
}

export class ViewportSizer implements Disposable {
  readonly events = new EventBus<ViewportEvents>();
  #observer: ResizeObserver | null = null;
  #current: ViewportSize;
  #mediaQuery: MediaQueryList | null = null;

  /**
   * @param maxPixelRatio Caps the render resolution. Uncapped DPR on a modern
   * phone means rendering 3x more pixels than the panel can show, which is the
   * fastest way to turn a simple scene into a thermal-throttled slideshow.
   */
  constructor(
    private readonly container: HTMLElement,
    private readonly maxPixelRatio = 2,
  ) {
    this.#current = this.#measure();
  }

  get size(): ViewportSize {
    return this.#current;
  }

  start(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(() => this.refresh());
      this.#observer.observe(this.container);
    } else {
      globalThis.addEventListener?.('resize', this.refresh);
    }
    this.#watchPixelRatio();
    this.refresh();
  }

  refresh = (): void => {
    const next = this.#measure();
    if (
      next.widthPx === this.#current.widthPx &&
      next.heightPx === this.#current.heightPx &&
      next.pixelRatio === this.#current.pixelRatio
    ) {
      return;
    }
    this.#current = next;
    this.events.emit('resize', next);
  };

  dispose(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    globalThis.removeEventListener?.('resize', this.refresh);
    this.#mediaQuery?.removeEventListener('change', this.refresh);
    this.#mediaQuery = null;
    this.events.clear();
  }

  #measure(): ViewportSize {
    const rect = this.container.getBoundingClientRect();
    // Fall back to 1x1 rather than 0: a zero-sized framebuffer is a WebGL error,
    // and containers legitimately measure zero before first layout.
    const widthCss = Math.max(1, Math.round(rect.width));
    const heightCss = Math.max(1, Math.round(rect.height));
    const pixelRatio = Math.min(this.maxPixelRatio, globalThis.devicePixelRatio ?? 1);
    return {
      widthCss,
      heightCss,
      pixelRatio,
      widthPx: Math.round(widthCss * pixelRatio),
      heightPx: Math.round(heightCss * pixelRatio),
      aspect: widthCss / heightCss,
    };
  }

  /** devicePixelRatio changes when a window moves between monitors or the user zooms. */
  #watchPixelRatio(): void {
    if (typeof matchMedia !== 'function') return;
    const ratio = globalThis.devicePixelRatio ?? 1;
    this.#mediaQuery = matchMedia(`(resolution: ${ratio}dppx)`);
    this.#mediaQuery.addEventListener('change', this.refresh);
  }
}
