/**
 * Textures.
 *
 * Loaded via fetch + createImageBitmap rather than THREE.TextureLoader so the
 * request participates in the same abort signal as everything else, and so
 * decoding happens off the main thread where the browser supports it.
 */
import * as THREE from 'three';
import type { KindLoader } from './loaderTypes.js';

export const loadTexture: KindLoader<THREE.Texture> = async (entry, context) => {
  const response = await fetch(context.resolveUrl(entry.url), { signal: context.signal });
  if (!response.ok)
    throw new Error(`Failed to load texture "${entry.id}": HTTP ${response.status}`);

  const blob = await response.blob();

  // `flipY: false` disables BOTH flips - the one `createImageBitmap` can apply
  // and the one three applies at upload - so the texture's v axis is the
  // image's row order, top to bottom, with nothing in between to reason about.
  // The procedural surface library relies on this: its normal maps encode a
  // green channel whose sign is only correct under one convention, and "which
  // of the two flips is active today" is not a question anyone should have to
  // answer from a screenshot. Assets that predate this option are unaffected.
  const flipY = entry.options?.['flipY'] !== false;
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: flipY ? 'flipY' : 'none',
  });
  const texture = new THREE.Texture(bitmap);
  // `true` is three's own default, so existing assets keep exactly the
  // behaviour they had.
  texture.flipY = flipY;

  // Colour textures are sRGB; data textures (normal, roughness) are not.
  // Getting this wrong is the single most common cause of washed-out output.
  texture.colorSpace =
    entry.options?.['colorSpace'] === 'linear' ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = Number(entry.options?.['anisotropy'] ?? 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  context.onProgress?.(1);
  return texture;
};
