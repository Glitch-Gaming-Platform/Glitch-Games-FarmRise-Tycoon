import * as THREE from 'three';
import { BUILDINGS, formatTicks, type BuildingKind } from '@farmrise/shared';
import type { FarmWorld } from '../FarmWorld.js';

interface ProgressEntry {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  key: string;
}

export interface ConstructionProgressState {
  readonly progress: number;
  readonly label: string;
}

export function constructionProgressState(
  kind: BuildingKind,
  remainingBuildTicks: number,
): ConstructionProgressState {
  const definition = BUILDINGS[kind];
  const total = Math.max(1, definition.buildTicks);
  return {
    progress: Math.min(1, Math.max(0, 1 - remainingBuildTicks / total)),
    label: `${definition.displayName} · ${formatTicks(remainingBuildTicks as never)}`,
  };
}

/** Camera-facing construction bars with an explicit remaining-time label. */
export class ConstructionProgressView {
  readonly object = new THREE.Group();
  readonly #entries = new Map<string, ProgressEntry>();

  constructor() {
    this.object.name = 'ConstructionProgress';
  }

  sync(world: FarmWorld): void {
    const active = new Set<string>();
    for (const building of world.buildings) {
      if (building.remainingBuildTicks <= 0) continue;
      active.add(building.id);
      let entry = this.#entries.get(building.id);
      if (!entry) {
        const created = this.#createEntry();
        if (!created) continue;
        entry = created;
        this.#entries.set(building.id, entry);
        this.object.add(entry.sprite);
      }

      const definition = BUILDINGS[building.kind];
      const center = world.grid.tileToWorld(
        building.tileX + (definition.footprint.width - 1) / 2,
        building.tileZ + (definition.footprint.depth - 1) / 2,
      );
      entry.sprite.position.set(center.x, progressHeight(building.kind), center.z);

      const state = constructionProgressState(building.kind, building.remainingBuildTicks);
      const key = `${state.label}:${Math.round(state.progress * 100)}`;
      if (entry.key !== key) {
        entry.key = key;
        drawProgress(entry.canvas, state);
        entry.texture.needsUpdate = true;
      }
    }

    for (const [id, entry] of this.#entries) {
      if (active.has(id)) continue;
      entry.sprite.removeFromParent();
      entry.texture.dispose();
      entry.sprite.material.dispose();
      this.#entries.delete(id);
    }
  }

  dispose(): void {
    for (const entry of this.#entries.values()) {
      entry.texture.dispose();
      entry.sprite.material.dispose();
    }
    this.#entries.clear();
    this.object.clear();
  }

  #createEntry(): ProgressEntry | null {
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
    sprite.name = 'ConstructionProgressBar';
    sprite.scale.set(3.6, 0.9, 1);
    sprite.renderOrder = 20;
    sprite.frustumCulled = false;
    return { sprite, texture, canvas, key: '' };
  }
}

function drawProgress(canvas: HTMLCanvasElement, state: ConstructionProgressState): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(42, 36, 32, 0.88)';
  context.fillRect(8, 8, 496, 112);
  context.fillStyle = '#f4e7c5';
  context.fillRect(14, 14, 484, 100);
  context.fillStyle = '#2a2420';
  context.font = '600 30px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(state.label, 256, 42, 452);
  context.fillStyle = '#c8aa72';
  context.fillRect(38, 76, 436, 22);
  context.fillStyle = '#4fb3c4';
  context.fillRect(38, 76, Math.max(8, 436 * state.progress), 22);
}

function progressHeight(kind: BuildingKind): number {
  switch (kind) {
    case 'barn':
    case 'cold_store':
    case 'mill':
    case 'creamery':
    case 'preserve_kitchen':
      return 4.7;
    case 'worker_hut':
      return 4.1;
    case 'irrigation':
    case 'well':
      return 3.2;
    default:
      return 2.25;
  }
}
