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
import { webcrypto } from 'node:crypto';

// jsdom's typed arrays live in a different realm from Node's WebCrypto under
// Node 20. Use one coherent implementation in tests so digest() receives
// buffers from the same realm. Browsers continue to use their native crypto.
const testSubtle = new Proxy(webcrypto.subtle, {
  get(target, property, receiver) {
    if (property === 'digest') {
      return (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const bytes = ArrayBuffer.isView(data)
          ? Buffer.from(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
          : Buffer.from(data as ArrayBuffer);
        return target.digest(algorithm, bytes);
      };
    }
    const value = Reflect.get(target, property, receiver) as unknown;
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
const testCrypto = new Proxy(webcrypto, {
  get(target, property, receiver) {
    if (property === 'subtle') return testSubtle;
    const value = Reflect.get(target, property, receiver) as unknown;
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
Object.defineProperty(globalThis, 'crypto', {
  value: testCrypto,
  configurable: true,
});

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
