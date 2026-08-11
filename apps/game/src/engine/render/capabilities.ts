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

export interface TouchCapabilityEnvironment {
  readonly maxTouchPoints?: number;
  readonly coarsePointer?: boolean;
  readonly viewportWidth?: number;
  readonly touchEvents?: boolean;
}

/**
 * Capability gate for the phone/tablet path. No user-agent sniffing: a device
 * must expose touch and either a coarse primary pointer or a compact viewport.
 */
export function isTouchPrimaryDevice(environment: TouchCapabilityEnvironment = {}): boolean {
  const maxTouchPoints =
    environment.maxTouchPoints ??
    (typeof navigator === 'undefined' ? 0 : (navigator.maxTouchPoints ?? 0));
  const coarsePointer =
    environment.coarsePointer ??
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const touchEvents =
    environment.touchEvents ?? (typeof globalThis !== 'undefined' && 'ontouchstart' in globalThis);
  const viewportWidth =
    environment.viewportWidth ?? globalThis.innerWidth ?? Number.POSITIVE_INFINITY;
  return (maxTouchPoints > 0 || touchEvents) && (coarsePointer || viewportWidth <= 1024);
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
