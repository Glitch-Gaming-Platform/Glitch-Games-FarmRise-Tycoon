/**
 * Authored tool silhouettes and contact accents for the three farm-work verbs.
 *
 * The farmer mesh is deliberately one inexpensive asset, so tools live as
 * separate palette-bound meshes and are posed at runtime. This makes watering
 * and harvesting readable at the gameplay camera without adding a skeleton or
 * duplicating the character for every action.
 */
import * as THREE from 'three';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { WorkAction } from './Player.js';

const WATERING_CAN = 'SM_tool_watering_can';
const SICKLE = 'SM_tool_sickle';
const TROWEL = 'SM_tool_trowel';

export class PlayerToolView {
  readonly object = new THREE.Group();
  readonly #wateringCan: THREE.Mesh;
  readonly #sickle: THREE.Mesh;
  readonly #trowel: THREE.Mesh;
  readonly #waterStream: THREE.Mesh;
  readonly #harvestArc: THREE.Mesh;
  readonly #owned: Array<THREE.BufferGeometry | THREE.Material> = [];
  readonly #usesLibrary: boolean;

  constructor(library: ModelLibrary | null) {
    this.#usesLibrary = Boolean(
      library?.has(WATERING_CAN) && library.has(SICKLE) && library.has(TROWEL),
    );

    if (this.#usesLibrary && library) {
      this.#wateringCan = new THREE.Mesh(library.require(WATERING_CAN), library.material);
      this.#sickle = new THREE.Mesh(library.require(SICKLE), library.material);
      this.#trowel = new THREE.Mesh(library.require(TROWEL), library.material);
    } else {
      const teal = new THREE.MeshStandardMaterial({ color: 0x3f7a82, roughness: 0.85 });
      const metal = new THREE.MeshStandardMaterial({ color: 0xa9b4ba, roughness: 0.82 });
      const timber = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.88 });
      const can = new THREE.CylinderGeometry(0.17, 0.15, 0.25, 8);
      const sickle = new THREE.BoxGeometry(0.08, 0.48, 0.055);
      const trowel = new THREE.ConeGeometry(0.1, 0.46, 5);
      this.#owned.push(teal, metal, timber, can, sickle, trowel);
      this.#wateringCan = new THREE.Mesh(can, teal);
      this.#sickle = new THREE.Mesh(sickle, metal);
      this.#trowel = new THREE.Mesh(trowel, timber);
    }

    for (const tool of [this.#wateringCan, this.#sickle, this.#trowel]) {
      tool.castShadow = true;
      tool.visible = false;
      tool.renderOrder = 2;
    }
    this.#wateringCan.name = 'FarmTool_WateringCan';
    this.#sickle.name = 'FarmTool_Sickle';
    this.#trowel.name = 'FarmTool_Trowel';

    const streamGeometry = new THREE.CylinderGeometry(0.018, 0.032, 1, 7, 1, true);
    const streamMaterial = new THREE.MeshBasicMaterial({
      color: 0x83c4d1,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      toneMapped: false,
    });
    this.#waterStream = new THREE.Mesh(streamGeometry, streamMaterial);
    this.#waterStream.name = 'FarmTool_WaterStream';
    this.#waterStream.visible = false;
    this.#waterStream.renderOrder = 3;

    const arcGeometry = new THREE.TorusGeometry(0.42, 0.027, 6, 24, Math.PI * 1.12);
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: 0xf5d341,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.#harvestArc = new THREE.Mesh(arcGeometry, arcMaterial);
    this.#harvestArc.name = 'FarmTool_HarvestArc';
    this.#harvestArc.visible = false;
    this.#harvestArc.renderOrder = 3;
    this.#owned.push(streamGeometry, streamMaterial, arcGeometry, arcMaterial);

    this.object.add(
      this.#wateringCan,
      this.#sickle,
      this.#trowel,
      this.#waterStream,
      this.#harvestArc,
    );
  }

  sync(action: WorkAction | null, progress: number, elapsedSeconds: number): void {
    this.#wateringCan.visible = false;
    this.#sickle.visible = false;
    this.#trowel.visible = false;
    this.#waterStream.visible = false;
    this.#harvestArc.visible = false;
    if (!action) return;

    const p = Math.min(1, Math.max(0, progress));
    const beat = Math.sin(p * Math.PI);

    if (action === 'plant') {
      this.#trowel.visible = true;
      this.#trowel.position.set(0.24, 0.73 - beat * 0.18, 0.31 + beat * 0.1);
      this.#trowel.rotation.set(-0.34 - p * 0.95, 0.18, -0.22 + beat * 0.18);
      this.#trowel.scale.setScalar(1.08);
      return;
    }

    if (action === 'tend') {
      const pour = smoothPulse(p, 0.14, 0.86);
      this.#wateringCan.visible = true;
      this.#wateringCan.position.set(0.27, 0.8 - pour * 0.08, 0.32);
      this.#wateringCan.rotation.set(-0.18 - pour * 0.92, 0.1, -0.2 - pour * 0.18);
      this.#wateringCan.scale.setScalar(1.1);

      if (pour > 0.08) {
        this.#waterStream.visible = true;
        const ripple = Math.sin(elapsedSeconds * 24) * 0.018;
        this.#waterStream.position.set(0.48, 0.37 + ripple, 0.57);
        this.#waterStream.rotation.set(0.1, 0, -0.16);
        this.#waterStream.scale.set(0.8 + pour * 0.25, 0.48 + pour * 0.18, 0.8 + pour * 0.25);
        (this.#waterStream.material as THREE.MeshBasicMaterial).opacity = 0.52 + pour * 0.34;
      }
      return;
    }

    const swing = easeInOutCubic(Math.min(1, p / 0.76));
    this.#sickle.visible = true;
    this.#sickle.position.set(0.27 - swing * 0.12, 0.81 + beat * 0.06, 0.31);
    this.#sickle.rotation.set(-0.34, 0.16, -1.05 + swing * 2.18);
    this.#sickle.scale.setScalar(1.18);

    if (p > 0.1 && p < 0.82) {
      this.#harvestArc.visible = true;
      this.#harvestArc.position.set(0.0, 0.76, 0.38);
      this.#harvestArc.rotation.set(0, 0, -1.24 + swing * 1.02);
      this.#harvestArc.scale.setScalar(0.76 + beat * 0.28);
      (this.#harvestArc.material as THREE.MeshBasicMaterial).opacity = beat * 0.7;
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const resource of this.#owned) resource.dispose();
    if (!this.#usesLibrary) {
      this.#wateringCan.removeFromParent();
      this.#sickle.removeFromParent();
      this.#trowel.removeFromParent();
    }
    this.object.clear();
  }
}

function smoothPulse(value: number, start: number, end: number): number {
  const rise = smoothstep(start, start + 0.18, value);
  const fall = 1 - smoothstep(end - 0.16, end, value);
  return rise * fall;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}
