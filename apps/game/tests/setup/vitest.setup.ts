/**
 * jsdom lacks several browser APIs the engine relies on. Rather than guarding
 * every call site with `typeof x !== 'undefined'`, the missing pieces are
 * polyfilled here with minimal, honest stand-ins.
 *
 * Note what is NOT stubbed: WebGL. Tests never construct a real renderer, and a
 * fake WebGL context would let a broken renderer pass. Actual rendering is
 * verified by the Playwright tests against real browsers.
 */
import { vi } from 'vitest';

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= MockResizeObserver;

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as unknown as typeof globalThis.matchMedia;

globalThis.createImageBitmap ??= (async () => ({ close() {}, width: 1, height: 1 })) as never;

// jsdom does not implement pointer capture.
if (typeof Element !== 'undefined') {
  Element.prototype.setPointerCapture ??= function setPointerCapture() {};
  Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
}
