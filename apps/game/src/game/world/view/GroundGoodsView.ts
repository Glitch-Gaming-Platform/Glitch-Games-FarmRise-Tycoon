import * as THREE from 'three';
import { getItem } from '@farmrise/shared';
import type { FarmWorld } from '../FarmWorld.js';

const MAX_STACKS = 32;
const ITEMS_PER_STACK = 4;

interface ProductActionEntry {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  label: string;
}

export function groundGoodsActionLabel(itemId: string, quantity: number): string {
  const item = getItem(itemId);
  const name = item?.displayName ?? itemId;
  const singular = quantity === 1 && name.endsWith('s') ? name.slice(0, -1) : name;
  return `Pick up ${quantity} ${singular} · E / Work`;
}

/** Visible crates and produce baskets for goods waiting to be picked up. */
export class GroundGoodsView {
  readonly object = new THREE.Group();
  readonly #crateGeometry = new THREE.BoxGeometry(0.72, 0.28, 0.58);
  readonly #goodsGeometry = new THREE.SphereGeometry(0.13, 8, 6);
  readonly #crateMaterial = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.94 });
  readonly #goodsMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  readonly #crates = new THREE.InstancedMesh(this.#crateGeometry, this.#crateMaterial, MAX_STACKS);
  readonly #goods = new THREE.InstancedMesh(
    this.#goodsGeometry,
    this.#goodsMaterial,
    MAX_STACKS * ITEMS_PER_STACK,
  );
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #rotation = new THREE.Quaternion();
  readonly #scale = new THREE.Vector3();
  readonly #colour = new THREE.Color();
  readonly #productActions = new Map<string, ProductActionEntry>();

  constructor() {
    this.object.name = 'GroundGoods';
    this.#crates.name = 'GroundGoods_Crates';
    this.#goods.name = 'GroundGoods_Produce';
    this.#crates.castShadow = true;
    this.#crates.receiveShadow = true;
    this.#goods.castShadow = true;
    this.#crates.count = 0;
    this.#goods.count = 0;
    // These instance sets change as stacks are created and emptied. Disabling
    // culling avoids cached bounds briefly hiding newly written instances.
    this.#crates.frustumCulled = false;
    this.#goods.frustumCulled = false;
    this.object.add(this.#crates, this.#goods);
  }

  sync(world: FarmWorld): void {
    const stacks = world.stores.stores
      .filter(
        (store) =>
          store.id.startsWith('stack-') &&
          Object.values(store.items).some((quantity) => quantity > 0),
      )
      .slice(0, MAX_STACKS);

    let goodsIndex = 0;
    const activeProductActions = new Set<string>();
    stacks.forEach((store, stackIndex) => {
      const item = Object.entries(store.items).find(([, quantity]) => quantity > 0);
      const itemId = item?.[0] ?? '';
      const quantity = item?.[1] ?? 1;
      const at = world.grid.tileToWorld(store.tileX, store.tileZ);
      const fullness = Math.min(1, quantity / 8);

      if (getItem(itemId)?.category === 'animal_product') {
        activeProductActions.add(store.id);
        this.#syncProductAction(store.id, at.x, at.z, itemId, quantity);
      }

      this.#matrix.compose(
        this.#position.set(at.x, 0.14, at.z),
        this.#rotation.identity(),
        this.#scale.setScalar(0.88 + fullness * 0.18),
      );
      this.#crates.setMatrixAt(stackIndex, this.#matrix);

      const tint = itemColour(itemId, this.#colour);
      for (let itemIndex = 0; itemIndex < ITEMS_PER_STACK; itemIndex += 1) {
        const x = (itemIndex % 2 === 0 ? -1 : 1) * 0.17;
        const z = (itemIndex < 2 ? -1 : 1) * 0.12;
        this.#matrix.compose(
          this.#position.set(at.x + x, 0.38 + (itemIndex % 2) * 0.035, at.z + z),
          this.#rotation.identity(),
          this.#scale.set(0.9, itemId === 'eggs' ? 1.2 : 0.92, 0.9),
        );
        this.#goods.setMatrixAt(goodsIndex, this.#matrix);
        this.#goods.setColorAt(goodsIndex, tint);
        goodsIndex += 1;
      }
    });

    this.#crates.count = stacks.length;
    this.#goods.count = goodsIndex;
    this.#crates.instanceMatrix.needsUpdate = true;
    this.#goods.instanceMatrix.needsUpdate = true;
    if (this.#goods.instanceColor) this.#goods.instanceColor.needsUpdate = true;

    for (const [storeId, entry] of this.#productActions) {
      if (activeProductActions.has(storeId)) continue;
      entry.sprite.removeFromParent();
      entry.texture.dispose();
      entry.sprite.material.dispose();
      this.#productActions.delete(storeId);
    }
  }

  dispose(): void {
    this.#crates.dispose();
    this.#goods.dispose();
    this.#crateGeometry.dispose();
    this.#goodsGeometry.dispose();
    this.#crateMaterial.dispose();
    this.#goodsMaterial.dispose();
    for (const entry of this.#productActions.values()) {
      entry.texture.dispose();
      entry.sprite.material.dispose();
    }
    this.#productActions.clear();
    this.object.clear();
  }

  #syncProductAction(
    storeId: string,
    x: number,
    z: number,
    itemId: string,
    quantity: number,
  ): void {
    let entry = this.#productActions.get(storeId);
    if (!entry) {
      const created = createProductActionEntry();
      if (!created) return;
      entry = created;
      this.#productActions.set(storeId, entry);
      this.object.add(entry.sprite);
    }

    entry.sprite.position.set(x, 1.62, z);
    const label = groundGoodsActionLabel(itemId, quantity);
    if (entry.label === label) return;
    entry.label = label;
    drawProductAction(entry.canvas, label);
    entry.texture.needsUpdate = true;
  }
}

function createProductActionEntry(): ProductActionEntry | null {
  if (typeof document === 'undefined' || typeof CanvasRenderingContext2D === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'GroundGoods_ProductAction';
  sprite.scale.set(3.15, 0.78, 1);
  sprite.renderOrder = 22;
  sprite.frustumCulled = false;
  return { sprite, texture, canvas, label: '' };
}

function drawProductAction(canvas: HTMLCanvasElement, label: string): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  roundedRect(context, 8, 8, 496, 112, 28);
  context.fillStyle = 'rgba(42, 36, 32, 0.92)';
  context.fill();
  roundedRect(context, 16, 16, 480, 96, 22);
  context.fillStyle = '#f5f1e5';
  context.fill();
  context.strokeStyle = '#4f9aaa';
  context.lineWidth = 8;
  context.stroke();
  context.fillStyle = '#2a2420';
  context.font = '700 30px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 256, 64, 440);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

function itemColour(itemId: string, target: THREE.Color): THREE.Color {
  switch (itemId) {
    case 'eggs':
      return target.setHex(0xf4e7c5);
    case 'wheat':
      return target.setHex(0xe8c34a);
    case 'corn':
      return target.setHex(0xf5d341);
    case 'pumpkin':
      return target.setHex(0xff9440);
    case 'milk':
      return target.setHex(0xdbe8e6);
    default:
      return target.setHex(0x79c74d);
  }
}
