/**
 * Shared materials for the bootstrap farm.
 *
 * Materials are created once and reused across every mesh that needs them.
 * A fresh MeshStandardMaterial per plot would mean a separate shader program
 * and a separate draw call per plot, which is the usual reason a simple Three.js
 * scene ends up with hundreds of draw calls.
 *
 * These are placeholder colours. When real art lands they are replaced by
 * materials built from the asset manifest (see docs/ASSET_PIPELINE.md).
 */
import * as THREE from 'three';

export interface FarmMaterials {
  readonly ground: THREE.Material;
  readonly soil: THREE.Material;
  readonly cropYoung: THREE.Material;
  readonly cropReady: THREE.Material;
  readonly cropDiseased: THREE.Material;
  readonly barn: THREE.Material;
  readonly irrigation: THREE.Material;
  readonly road: THREE.Material;
  readonly fence: THREE.Material;
  readonly shelter: THREE.Material;
  readonly rock: THREE.Material;
  readonly animal: THREE.Material;
  readonly fox: THREE.Material;
  dispose(): void;
}

/**
 * The ground's base colour, `ground_scrub` from the palette.
 *
 * Exported because the Ultra terrain material is a different material object
 * with the same base colour, and two hex literals that must agree is exactly
 * the situation `docs/ART_DIRECTION.md` forbids.
 */
export const GROUND_BASE_COLOUR = 0xc9a227;

export function createFarmMaterials(): FarmMaterials {
  const make = (color: number, roughness = 0.85, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  // Fallbacks mirror the named entries in tools/blender/palette.py. They are
  // only shown when authored GLBs are unavailable, but keeping the same warm
  // ground / cool structure split prevents a jarring style change.
  const materials = {
    // The ground alone reads its geometry's COLOR attribute. createGroundGeometry
    // writes per-vertex multipliers into it, and three.js multiplies them by
    // this base colour - so the palette hue still lives in exactly one place
    // and the geometry only decides light-and-shade.
    ground: new THREE.MeshStandardMaterial({
      color: GROUND_BASE_COLOUR,
      roughness: 0.92,
      metalness: 0,
      vertexColors: true,
    }),
    soil: make(0xa34a2b),
    cropYoung: make(0x63ac3e),
    cropReady: make(0xe8c34a),
    cropDiseased: make(0x8a7b4a),
    barn: make(0x3f7a82),
    irrigation: make(0xa9b4ba),
    // Runtime roads generate palette-correct COLOR data for adjacency-aware
    // shoulders, wear and stones. White preserves those authored values rather
    // than multiplying them by the old flat fallback tint.
    road: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0,
      vertexColors: true,
    }),
    fence: make(0x9c6b3f),
    shelter: make(0x2e5c63),
    rock: make(0x8a8378),
    animal: make(0xb88450),
    fox: make(0xd0602a),
  };

  return {
    ...materials,
    dispose(): void {
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
