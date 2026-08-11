import * as THREE from 'three';
import type { Player } from '../../player/Player.js';
import type { FarmWorld } from '../FarmWorld.js';

/** Carried crates and the current/parked cart, with procedural fallback art. */
export class CarryView {
  readonly object = new THREE.Group();
  readonly #crateMaterial = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.92 });
  readonly #wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
  readonly #crate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.48), this.#crateMaterial);
  readonly #cart = new THREE.Group();

  constructor() {
    this.#crate.castShadow = true;
    this.#crate.visible = false;
    this.#cart.visible = false;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.32, 0.78), this.#crateMaterial);
    bed.position.y = 0.62;
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12);
    const left = new THREE.Mesh(wheelGeometry, this.#wheelMaterial);
    const right = new THREE.Mesh(wheelGeometry.clone(), this.#wheelMaterial);
    left.rotation.z = Math.PI / 2;
    right.rotation.z = Math.PI / 2;
    left.position.set(-0.5, 0.34, 0);
    right.position.set(0.5, 0.34, 0);
    const handleGeometry = new THREE.BoxGeometry(0.1, 0.1, 1.2);
    const handleLeft = new THREE.Mesh(handleGeometry, this.#crateMaterial);
    const handleRight = new THREE.Mesh(handleGeometry.clone(), this.#crateMaterial);
    handleLeft.position.set(-0.34, 0.72, 0.85);
    handleRight.position.set(0.34, 0.72, 0.85);
    this.#cart.add(bed, left, right, handleLeft, handleRight);
    this.#cart.traverse((node) => {
      node.castShadow = true;
      node.receiveShadow = true;
    });
    this.object.add(this.#crate, this.#cart);
  }

  sync(world: FarmWorld, player: Player | null, elapsedSeconds: number): void {
    const carry = world.carry;
    const loaded = !carry.isEmpty;
    this.#crate.visible = loaded && carry.carrier === 'arms' && player !== null;
    if (this.#crate.visible && player) {
      const fullness = Math.min(1, carry.used / Math.max(1, carry.capacity));
      this.#crate.position.set(
        player.position.x + Math.sin(player.facing) * -0.34,
        0.78 + Math.sin(elapsedSeconds * 7) * 0.015,
        player.position.z + Math.cos(player.facing) * -0.34,
      );
      this.#crate.rotation.y = player.facing;
      this.#crate.scale.setScalar(0.75 + fullness * 0.35);
    }

    const usesCart = carry.carrier !== 'arms';
    const parked = carry.cartTile;
    this.#cart.visible = usesCart || parked !== null;
    if (this.#cart.visible) {
      if (usesCart && player) {
        this.#cart.position.set(
          player.position.x + Math.sin(player.facing) * -1.05,
          0,
          player.position.z + Math.cos(player.facing) * -1.05,
        );
        this.#cart.rotation.y = player.facing;
      } else if (parked) {
        const at = world.grid.tileToWorld(parked.tileX, parked.tileZ);
        this.#cart.position.set(at.x, 0, at.z);
      }
      this.#cart.scale.setScalar(carry.carrier === 'wagon' ? 1.4 : 1);
    }
  }

  dispose(): void {
    this.object.traverse((node) => {
      const mesh = node as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
    });
    this.#crateMaterial.dispose();
    this.#wheelMaterial.dispose();
    this.object.clear();
  }
}
