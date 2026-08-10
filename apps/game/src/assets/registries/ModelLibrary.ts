/**
 * Turns loaded glTF families into geometries the views can draw.
 *
 * The art pipeline exports one GLB per family, each containing many named
 * meshes (SM_crop_wheat_s4, SM_building_barn, ...). This class flattens those
 * into a flat lookup and, critically, hands out GEOMETRY rather than whole
 * objects - because almost everything in this game is drawn as an
 * InstancedMesh, and instancing needs a geometry plus one shared material.
 *
 * There is exactly one material for the entire game. Every asset carries its
 * colour in a COLOR_0 vertex attribute, so a single MeshStandardMaterial with
 * `vertexColors` covers crops, buildings, characters and animals alike. That
 * is what keeps the draw call count proportional to the number of distinct
 * MESHES rather than the number of distinct colours.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Disposable } from '@engine/core/types.js';

export const MODEL_FAMILIES = [
  'model:crops',
  'model:ground',
  'model:buildings',
  'model:characters',
  'model:animals',
  'model:props',
] as const;

export type ModelFamilyId = (typeof MODEL_FAMILIES)[number];

export class ModelLibrary implements Disposable {
  readonly #geometries = new Map<string, THREE.BufferGeometry>();
  readonly #material: THREE.MeshStandardMaterial;

  constructor() {
    this.#material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
      // Foliage is single-sided geometry - a leaf is one quad strip, not a
      // solid - which halves the triangle count on every crop. That only
      // works if both faces render.
      side: THREE.DoubleSide,
    });
    this.#material.name = 'M_FarmRise_VertexColour';
  }

  get material(): THREE.MeshStandardMaterial {
    return this.#material;
  }

  get size(): number {
    return this.#geometries.size;
  }

  /** Harvests every named mesh out of a loaded glTF. */
  ingest(gltf: GLTF): void {
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      // Blender exports the object name on the node and the mesh name on the
      // geometry; the node name is the stable one the build script controls.
      const name = mesh.name || mesh.geometry.name;
      if (!name) return;
      const geometry = mesh.geometry.clone();
      // Bake the node transform in: the views place instances themselves and
      // must not inherit an authoring offset.
      mesh.updateWorldMatrix(true, false);
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingSphere();
      this.#geometries.set(name, geometry);
    });
  }

  has(name: string): boolean {
    return this.#geometries.has(name);
  }

  /** Geometry by exported node name, or undefined. Never throws. */
  get(name: string): THREE.BufferGeometry | undefined {
    return this.#geometries.get(name);
  }

  /**
   * Throwing variant for call sites that have already checked `ready`.
   * The error names the asset, because a missing mesh is almost always a
   * build-script rename that needs to be traced back to tools/blender.
   */
  require(name: string): THREE.BufferGeometry {
    const geometry = this.#geometries.get(name);
    if (!geometry) {
      throw new Error(
        `Model "${name}" is not in the library. Check tools/blender/assets.py BUILD_ORDER ` +
          `and re-run "npm run art:build".`,
      );
    }
    return geometry;
  }

  dispose(): void {
    for (const geometry of this.#geometries.values()) geometry.dispose();
    this.#geometries.clear();
    this.#material.dispose();
  }
}
