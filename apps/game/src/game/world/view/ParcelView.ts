import * as THREE from 'three';
import { ESTATE_PARCELS } from '@farmrise/shared';
import type { FarmWorld } from '../FarmWorld.js';

const GATE_OPEN_SECONDS = 0.78;

/** Visible ownership edges and physical gates that open when land is bought. */
export class ParcelView {
  readonly object = new THREE.Group();
  readonly #ownedBoundary = new THREE.MeshStandardMaterial({
    color: 0xb0a083, // sand_stone
    transparent: true,
    opacity: 0.16,
    roughness: 0.94,
    depthWrite: false,
  });
  readonly #unownedBoundary = new THREE.MeshStandardMaterial({
    color: 0x9c6b3f, // timber_warm
    transparent: true,
    opacity: 0.44,
    roughness: 0.92,
    depthWrite: false,
  });
  readonly #markerOwned = new THREE.MeshStandardMaterial({
    color: 0xb0a083, // sand_stone
    transparent: true,
    opacity: 0.42,
    roughness: 0.94,
  });
  readonly #markerUnowned = new THREE.MeshStandardMaterial({
    color: 0x6e4a2a, // timber_dark
    roughness: 0.92,
  });
  readonly #gateMaterial = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.9 });
  readonly #gateHighlight = new THREE.MeshStandardMaterial({ color: 0xb88450, roughness: 0.88 });
  readonly #markerGeometry = new THREE.CylinderGeometry(0.085, 0.12, 0.055, 6);
  readonly #postGeometry = new THREE.BoxGeometry(0.16, 1.35, 0.16);
  readonly #railGeometry = new THREE.BoxGeometry(0.58, 0.1, 0.1);
  readonly #gateOpenedAt = new Map<string, number>();
  readonly #previousOwned = new Set<string>();
  #signature = '';
  #elapsedSeconds = 0;
  #initialized = false;

  constructor(world: FarmWorld) {
    this.sync(world);
  }

  sync(world: FarmWorld): void {
    const signature = [...world.parcels.ownedIds].sort().join('|');
    if (signature === this.#signature) return;
    const ownedNow = new Set(world.parcels.ownedIds);
    if (this.#initialized) {
      for (const parcelId of ownedNow) {
        if (!this.#previousOwned.has(parcelId)) {
          this.#gateOpenedAt.set(parcelId, this.#elapsedSeconds);
        }
      }
    }
    this.#signature = signature;
    this.#clearChildren();

    for (const parcel of ESTATE_PARCELS) {
      const owned = world.parcels.owns(parcel.id);
      const tile = world.grid.tileSize;
      const first = world.grid.tileToWorld(parcel.bounds.tileX, parcel.bounds.tileZ);
      const last = world.grid.tileToWorld(
        parcel.bounds.tileX + parcel.bounds.width - 1,
        parcel.bounds.tileZ + parcel.bounds.depth - 1,
      );
      const minX = first.x - tile / 2;
      const minZ = first.z - tile / 2;
      const maxX = last.x + tile / 2;
      const maxZ = last.z + tile / 2;
      const boundary = new THREE.Group();
      boundary.userData['parcelId'] = parcel.id;
      this.#addBoundaryStrips(boundary, minX, minZ, maxX, maxZ, owned);
      this.#addBoundaryMarkers(boundary, minX, minZ, maxX, maxZ, owned);
      this.object.add(boundary);

      const gateAt = world.grid.tileToWorld(parcel.gate.tileX, parcel.gate.tileZ);
      const gate = this.#createGate(parcel.id, owned);
      const gateOnVerticalEdge =
        parcel.gate.tileX === parcel.bounds.tileX ||
        parcel.gate.tileX === parcel.bounds.tileX + parcel.bounds.width;
      gate.position.set(gateAt.x, 0, gateAt.z);
      gate.rotation.y = gateOnVerticalEdge ? Math.PI / 2 : 0;
      this.object.add(gate);
    }

    this.#previousOwned.clear();
    for (const parcelId of ownedNow) this.#previousOwned.add(parcelId);
    this.#initialized = true;
    this.animate(this.#elapsedSeconds);
  }

  animate(elapsedSeconds: number): void {
    this.#elapsedSeconds = elapsedSeconds;
    for (const gate of this.object.children) {
      if (!gate.userData['parcelGate']) continue;
      const parcelId = String(gate.userData['parcelGate']);
      const open = Boolean(gate.userData['open']);
      const startedAt = this.#gateOpenedAt.get(parcelId);
      const raw = open
        ? startedAt === undefined
          ? 1
          : Math.min(1, Math.max(0, (elapsedSeconds - startedAt) / GATE_OPEN_SECONDS))
        : 0;
      const eased = 1 - (1 - raw) ** 3;
      const settle = raw < 1 ? Math.sin(raw * Math.PI) * 0.08 : 0;
      const swing = eased * (Math.PI * 0.48) + settle;
      const left = gate.getObjectByName('parcel-gate-left');
      const right = gate.getObjectByName('parcel-gate-right');
      if (left) left.rotation.y = -swing;
      if (right) right.rotation.y = swing;
      if (raw >= 1 && startedAt !== undefined) this.#gateOpenedAt.delete(parcelId);
    }
  }

  dispose(): void {
    this.#clearChildren();
    this.#ownedBoundary.dispose();
    this.#unownedBoundary.dispose();
    this.#markerOwned.dispose();
    this.#markerUnowned.dispose();
    this.#gateMaterial.dispose();
    this.#gateHighlight.dispose();
    this.#markerGeometry.dispose();
    this.#postGeometry.dispose();
    this.#railGeometry.dispose();
    this.object.clear();
  }

  #addBoundaryStrips(
    group: THREE.Group,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    owned: boolean,
  ): void {
    const material = owned ? this.#ownedBoundary : this.#unownedBoundary;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const make = (sizeX: number, sizeZ: number, x: number, z: number): void => {
      const geometry = new THREE.BoxGeometry(sizeX, 0.014, sizeZ);
      const strip = new THREE.Mesh(geometry, material);
      strip.position.set(x, 0.006, z);
      strip.userData['ownedGeometry'] = true;
      strip.receiveShadow = true;
      group.add(strip);
    };
    make(width, 0.075, (minX + maxX) / 2, minZ);
    make(width, 0.075, (minX + maxX) / 2, maxZ);
    make(0.075, depth, minX, (minZ + maxZ) / 2);
    make(0.075, depth, maxX, (minZ + maxZ) / 2);
  }

  #addBoundaryMarkers(
    group: THREE.Group,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    owned: boolean,
  ): void {
    const points: THREE.Vector3[] = [];
    const spacing = 4;
    for (let x = minX; x <= maxX + 0.01; x += spacing) {
      points.push(new THREE.Vector3(x, 0.028, minZ), new THREE.Vector3(x, 0.028, maxZ));
    }
    for (let z = minZ + spacing; z < maxZ - 0.01; z += spacing) {
      points.push(new THREE.Vector3(minX, 0.028, z), new THREE.Vector3(maxX, 0.028, z));
    }
    const markers = new THREE.InstancedMesh(
      this.#markerGeometry,
      owned ? this.#markerOwned : this.#markerUnowned,
      points.length,
    );
    const matrix = new THREE.Matrix4();
    points.forEach((point, index) => {
      matrix.makeTranslation(point.x, point.y, point.z);
      markers.setMatrixAt(index, matrix);
    });
    markers.instanceMatrix.needsUpdate = true;
    markers.receiveShadow = true;
    group.add(markers);
  }

  #createGate(parcelId: string, open: boolean): THREE.Group {
    const gate = new THREE.Group();
    gate.userData['parcelGate'] = parcelId;
    gate.userData['open'] = open;

    for (const x of [-0.68, 0.68]) {
      const post = new THREE.Mesh(this.#postGeometry, this.#gateMaterial);
      post.position.set(x, 0.675, 0);
      post.castShadow = true;
      gate.add(post);
    }

    const makeLeaf = (side: -1 | 1): THREE.Group => {
      const leaf = new THREE.Group();
      leaf.name = side < 0 ? 'parcel-gate-left' : 'parcel-gate-right';
      leaf.position.x = side * 0.62;
      for (const height of [0.48, 0.84]) {
        const rail = new THREE.Mesh(this.#railGeometry, this.#gateMaterial);
        rail.position.set(side * -0.29, height, 0);
        rail.castShadow = true;
        leaf.add(rail);
      }
      const brace = new THREE.Mesh(this.#railGeometry, this.#gateHighlight);
      brace.position.set(side * -0.29, 0.66, 0);
      brace.rotation.z = side * 0.52;
      brace.castShadow = true;
      leaf.add(brace);
      return leaf;
    };
    gate.add(makeLeaf(-1), makeLeaf(1));
    return gate;
  }

  #clearChildren(): void {
    for (const child of [...this.object.children]) {
      child.traverse((node) => {
        if (node instanceof THREE.InstancedMesh) node.dispose();
        if (node.userData['ownedGeometry']) (node as THREE.Mesh).geometry.dispose();
      });
      child.removeFromParent();
    }
  }
}
