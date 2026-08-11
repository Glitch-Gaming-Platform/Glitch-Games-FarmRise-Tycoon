/** Lightweight close-up expression layer for the authored farmer. */
import * as THREE from 'three';
import type { WorkAction } from './Player.js';

export class PlayerExpressionView {
  readonly object = new THREE.Group();
  readonly #eyelids: THREE.InstancedMesh;
  readonly #geometry: THREE.BoxGeometry;
  readonly #material: THREE.MeshBasicMaterial;
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #scale = new THREE.Vector3(1, 1, 1);
  readonly #rotation = new THREE.Quaternion();

  constructor() {
    this.#geometry = new THREE.BoxGeometry(0.067, 0.027, 0.018);
    this.#material = new THREE.MeshBasicMaterial({
      color: 0xf2c9a0,
      toneMapped: false,
    });
    this.#eyelids = new THREE.InstancedMesh(this.#geometry, this.#material, 2);
    this.#eyelids.name = 'FarmFace_Eyelids';
    this.#eyelids.frustumCulled = false;
    this.#eyelids.visible = false;
    this.object.add(this.#eyelids);
  }

  sync(elapsedSeconds: number, action: WorkAction | null, progress: number): void {
    const blinkCycle = (elapsedSeconds + 0.37) % 4.4;
    const blink = blinkCycle < 0.13;
    const workSquint = action === 'harvest' && progress > 0.28 && progress < 0.72;
    this.#eyelids.visible = blink || workSquint;
    if (!this.#eyelids.visible) return;

    const height = blink ? 1 : 0.38;
    for (let index = 0; index < 2; index += 1) {
      const side = index === 0 ? -1 : 1;
      this.#matrix.compose(
        this.#position.set(side * 0.081, 1.432 + (workSquint ? 0.012 : 0), 0.198),
        this.#rotation,
        this.#scale.set(1, height, 1),
      );
      this.#eyelids.setMatrixAt(index, this.#matrix);
    }
    this.#eyelids.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.#eyelids.removeFromParent();
    this.#geometry.dispose();
    this.#material.dispose();
    this.object.clear();
  }
}
