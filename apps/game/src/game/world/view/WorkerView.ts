import * as THREE from 'three';
import type { WorkerRole } from '@farmrise/shared';
import type { FarmWorld } from '../FarmWorld.js';

/** Small procedural worker figures; authored variants can replace them later. */
export class WorkerView {
  readonly object = new THREE.Group();
  readonly #figures = new Map<string, THREE.Group>();
  readonly #bodyGeometry = new THREE.BoxGeometry(0.42, 0.72, 0.3);
  readonly #headGeometry = new THREE.SphereGeometry(0.2, 10, 8);
  readonly #legGeometry = new THREE.BoxGeometry(0.13, 0.5, 0.15);
  readonly #skin = new THREE.MeshStandardMaterial({ color: 0xd9a87e, roughness: 0.9 });
  readonly #roles = {
    field_hand: new THREE.MeshStandardMaterial({ color: 0x3e8a2e, roughness: 0.9 }),
    hauler: new THREE.MeshStandardMaterial({ color: 0x3f7a82, roughness: 0.9 }),
    processor_hand: new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.9 }),
  } as const;

  sync(world: FarmWorld, elapsedSeconds: number): void {
    const active = new Set(world.workforce.workers.map((worker) => worker.id));
    for (const [id, figure] of this.#figures) {
      if (active.has(id)) continue;
      figure.removeFromParent();
      this.#figures.delete(id);
    }

    for (const [index, worker] of world.workforce.workers.entries()) {
      let figure = this.#figures.get(worker.id);
      if (!figure) {
        figure = this.#create(worker.role);
        figure.userData['workerId'] = worker.id;
        this.#figures.set(worker.id, figure);
        this.object.add(figure);
      }
      const at = world.grid.tileToWorld(worker.tileX, worker.tileZ);
      const working = worker.currentTask !== null;
      figure.position.set(
        at.x + ((index % 3) - 1) * 0.52,
        working ? Math.abs(Math.sin(elapsedSeconds * 5 + index)) * 0.06 : 0,
        at.z + (Math.floor(index / 3) % 2) * 0.5,
      );
      figure.rotation.y = working ? Math.sin(elapsedSeconds * 2 + index) * 0.35 : index * 1.7;
    }
  }

  dispose(): void {
    this.#bodyGeometry.dispose();
    this.#headGeometry.dispose();
    this.#legGeometry.dispose();
    this.#skin.dispose();
    for (const material of Object.values(this.#roles)) material.dispose();
    this.#figures.clear();
    this.object.clear();
  }

  #create(role: WorkerRole): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.#bodyGeometry, this.#roles[role]);
    const head = new THREE.Mesh(this.#headGeometry, this.#skin);
    const left = new THREE.Mesh(this.#legGeometry, this.#roles[role]);
    const right = new THREE.Mesh(this.#legGeometry, this.#roles[role]);
    body.position.y = 0.86;
    head.position.y = 1.42;
    left.position.set(-0.12, 0.25, 0);
    right.position.set(0.12, 0.25, 0);
    group.add(body, head, left, right);
    group.traverse((node) => {
      node.castShadow = true;
      node.receiveShadow = true;
    });
    return group;
  }
}
