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
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
  const texture = new THREE.Texture(bitmap);

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
