/**
 * Recursively frees the GPU resources under an Object3D.
 *
 * Three.js does not garbage-collect geometries, materials or textures for you:
 * dropping the last JS reference leaves the GPU buffer allocated. Every scene
 * teardown must go through here, or a few scene changes will exhaust VRAM on
 * lower-end devices.
 */
import * as THREE from 'three';

export function disposeObject3D(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const mesh = object as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();

    const material = mesh.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      for (const value of Object.values(entry)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
      entry.dispose();
    }
  });

  for (const texture of textures) texture.dispose();
  root.removeFromParent();
}
