/**
 * glTF models.
 *
 * GLTFLoader is instantiated once and reused: each instance carries its own
 * parser state, and creating one per model is a measurable cost.
 *
 * No DRACOLoader, deliberately. See docs/decisions/0010-no-mesh-compression.md
 * for the measurements, and note the second-order cost that made this a code
 * change rather than just a config one: merely IMPORTING DRACOLoader caused
 * Vite to emit 836 KB of decoder chunks into dist/ for a feature no shipped
 * asset uses. They were lazy chunks, so they never reached a player - but they
 * bloated every deploy and every CDN sync.
 *
 * To enable Draco later (only above ~3.3 MB of raw model payload, per the ADR):
 *   1. import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
 *   2. copy node_modules/three/examples/jsm/libs/draco/ into public/draco/
 *   3. loader.setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'))
 *   4. turn on export_draco_mesh_compression_enable in build_assets.py
 * Step 2 is the one people forget, and skipping it produces a silent 404 at
 * runtime rather than a build error.
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KindLoader } from './loaderTypes.js';

let sharedLoader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  sharedLoader ??= new GLTFLoader();
  return sharedLoader;
}

export const loadModel: KindLoader<GLTF> = (entry, context) =>
  new Promise<GLTF>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (context.signal.aborted) return onAbort();
    context.signal.addEventListener('abort', onAbort, { once: true });

    getLoader().load(
      context.resolveUrl(entry.url),
      (gltf) => {
        context.signal.removeEventListener('abort', onAbort);
        resolve(gltf);
      },
      (event) => {
        if (event.lengthComputable) context.onProgress?.(event.loaded / event.total);
      },
      (error) => {
        context.signal.removeEventListener('abort', onAbort);
        reject(new Error(`Failed to load model "${entry.id}": ${String(error)}`));
      },
    );
  });

/** Drops the shared loader. Call on teardown. */
export function disposeModelLoader(): void {
  sharedLoader = null;
}
