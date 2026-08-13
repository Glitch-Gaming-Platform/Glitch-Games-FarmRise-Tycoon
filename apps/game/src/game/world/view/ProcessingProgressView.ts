import * as THREE from 'three';
import {
  batchTicksFor,
  buildingFootprint,
  formatTicks,
  getRecipe,
  type QueueEntry,
  type SpecializationId,
} from '@farmrise/shared';
import type { FarmWorld } from '../FarmWorld.js';

interface ProgressEntry {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  key: string;
}

export interface ProcessingProgressState {
  readonly progress: number;
  readonly label: string;
  readonly paused: boolean;
}

export function processingProgressState(
  entry: QueueEntry,
  specialization: SpecializationId | null,
  broken: boolean,
): ProcessingProgressState | null {
  const recipe = getRecipe(entry.recipeId);
  if (!recipe) return null;
  const total = Math.max(1, batchTicksFor(recipe, specialization));
  const remaining = entry.remainingTicks > 0 ? entry.remainingTicks : total;
  const pause = broken ? 'Paused · ' : '';
  return {
    progress: Math.min(1, Math.max(0, 1 - remaining / total)),
    label: `${recipe.displayName} · ${pause}${formatTicks(remaining)} remaining`,
    paused: broken,
  };
}

/** Camera-facing processor bars that remain readable when the management panel is closed. */
export class ProcessingProgressView {
  readonly object = new THREE.Group();
  readonly #entries = new Map<string, ProgressEntry>();

  constructor() {
    this.object.name = 'ProcessingProgress';
  }

  sync(world: FarmWorld, specialization: SpecializationId | null): void {
    const active = new Set<string>();
    for (const processor of world.processing.processors) {
      const building = world.structures.get(processor.buildingId);
      const head = processor.queue[0];
      if (!building || building.remainingBuildTicks > 0 || !head) continue;
      const state = processingProgressState(head, specialization, building.broken);
      if (!state) continue;

      active.add(processor.id);
      let entry = this.#entries.get(processor.id);
      if (!entry) {
        const created = this.#createEntry();
        if (!created) continue;
        entry = created;
        this.#entries.set(processor.id, entry);
        this.object.add(entry.sprite);
      }

      const footprint = buildingFootprint(building.kind, building.rotation);
      const center = world.grid.tileToWorld(
        building.tileX + (footprint.width - 1) / 2,
        building.tileZ + (footprint.depth - 1) / 2,
      );
      entry.sprite.position.set(center.x, processingHeight(building.kind), center.z);

      const key = `${state.label}:${Math.round(state.progress * 100)}:${state.paused}`;
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
    sprite.name = 'ProcessingProgressBar';
    sprite.scale.set(3.6, 0.9, 1);
    sprite.renderOrder = 20;
    sprite.frustumCulled = false;
    return { sprite, texture, canvas, key: '' };
  }
}

function drawProgress(canvas: HTMLCanvasElement, state: ProcessingProgressState): void {
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
  context.fillStyle = state.paused ? '#c9893c' : '#4fb3c4';
  context.fillRect(38, 76, Math.max(8, 436 * state.progress), 22);
}

function processingHeight(kind: string): number {
  switch (kind) {
    case 'mill':
      return 5.2;
    case 'creamery':
      return 4.9;
    case 'preserve_kitchen':
      return 4.3;
    default:
      return 3.5;
  }
}
