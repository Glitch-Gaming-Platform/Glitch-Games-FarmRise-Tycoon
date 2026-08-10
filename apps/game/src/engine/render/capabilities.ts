/**
 * Feature detection.
 *
 * The target is "all browsers and devices", which in practice means: detect
 * what is missing and show an honest message, rather than letting Three.js
 * throw an opaque context error on a machine with WebGL disabled.
 */
export interface RenderCapabilities {
  readonly webgl2: boolean;
  readonly webgl1: boolean;
  readonly maxTextureSize: number;
  readonly devicePixelRatio: number;
  readonly touch: boolean;
  readonly reducedMotion: boolean;
}

export function detectCapabilities(doc: Document = document): RenderCapabilities {
  const canvas = doc.createElement('canvas');
  let webgl2 = false;
  let webgl1 = false;
  let maxTextureSize = 0;

  try {
    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      webgl2 = true;
      maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE) as number;
    } else {
      const gl1 = canvas.getContext('webgl');
      if (gl1) {
        webgl1 = true;
        maxTextureSize = gl1.getParameter(gl1.MAX_TEXTURE_SIZE) as number;
      }
    }
  } catch {
    // Context creation can throw on locked-down or headless environments.
  }

  return {
    webgl2,
    webgl1,
    maxTextureSize,
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    touch: typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0,
    reducedMotion:
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

export class WebGLUnavailableError extends Error {
  constructor() {
    super('This device or browser does not support WebGL, which FarmRise Tycoon requires.');
    this.name = 'WebGLUnavailableError';
  }
}
