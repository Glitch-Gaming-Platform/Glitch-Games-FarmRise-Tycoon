import * as THREE from 'three';
import { BUILDINGS } from '@farmrise/shared';
import type { ProximityMeter } from '../../systems/InteractionController.js';
import type { FarmWorld } from '../FarmWorld.js';

interface MeterEntry {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  key: string;
}

export interface ProximityMeterAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Resolves the object-space anchor so the gauge describes the thing beneath it. */
export function proximityMeterAnchor(
  world: FarmWorld,
  meter: ProximityMeter,
): ProximityMeterAnchor | null {
  if (meter.target.kind === 'plot') {
    const placement = world.plotPlacement(meter.target.id);
    if (!placement) return null;
    const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    return { x: at.x, y: 1.75, z: at.z };
  }

  const store = world.stores.get(meter.target.id);
  if (!store) return null;
  if (store.buildingId) {
    const building = world.structures.get(store.buildingId);
    if (building) {
      const definition = BUILDINGS[building.kind];
      const at = world.grid.tileToWorld(
        building.tileX + (definition.footprint.width - 1) / 2,
        building.tileZ + (definition.footprint.depth - 1) / 2,
      );
      return { x: at.x, y: buildingMeterHeight(building.kind), z: at.z };
    }
  }
  const at = world.grid.tileToWorld(store.tileX, store.tileZ);
  return { x: at.x, y: store.id.startsWith('stack-') ? 1.15 : 1.45, z: at.z };
}

/** Small camera-facing gauges shown only above the current nearby object. */
export class ProximityStatusView {
  readonly object = new THREE.Group();
  readonly #entries = new Map<string, MeterEntry>();

  constructor() {
    this.object.name = 'ProximityStatus';
  }

  sync(world: FarmWorld, meters: readonly ProximityMeter[]): void {
    const active = new Set<string>();
    const stackSlots = new Map<string, number>();
    for (const meter of meters) {
      const id = `${meter.kind}:${meter.target.kind}:${meter.target.id}`;
      const anchor = proximityMeterAnchor(world, meter);
      if (!anchor) continue;
      const targetId = `${meter.target.kind}:${meter.target.id}`;
      const stackSlot = stackSlots.get(targetId) ?? 0;
      stackSlots.set(targetId, stackSlot + 1);
      active.add(id);

      let entry = this.#entries.get(id);
      if (!entry) {
        const created = this.#createEntry();
        if (!created) continue;
        entry = created;
        this.#entries.set(id, entry);
        this.object.add(entry.sprite);
      }
      entry.sprite.position.set(anchor.x, anchor.y + stackSlot * 0.66, anchor.z);

      const key = `${meter.label}:${meter.detail}:${Math.round(meter.value * 100)}:${meter.urgent}`;
      if (entry.key !== key) {
        entry.key = key;
        drawMeter(entry.canvas, meter);
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

  #createEntry(): MeterEntry | null {
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
    sprite.name = 'ProximityStatusBar';
    sprite.scale.set(2.9, 0.72, 1);
    sprite.renderOrder = 21;
    sprite.frustumCulled = false;
    return { sprite, texture, canvas, key: '' };
  }
}

function drawMeter(canvas: HTMLCanvasElement, meter: ProximityMeter): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const progress = Math.min(1, Math.max(0, meter.value));
  context.clearRect(0, 0, canvas.width, canvas.height);

  roundedRect(context, 8, 8, 496, 112, 22);
  context.fillStyle = 'rgba(42, 36, 32, 0.9)';
  context.fill();
  roundedRect(context, 14, 14, 484, 100, 18);
  context.fillStyle = '#f5f1e5';
  context.fill();

  context.fillStyle = '#2a2420';
  context.font = '700 27px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(meter.label, 34, 42, 112);
  context.font = '600 23px system-ui, sans-serif';
  context.fillText(meter.detail, 150, 42, 326);

  roundedRect(context, 34, 74, 444, 22, 11);
  context.fillStyle = '#c8aa72';
  context.fill();
  roundedRect(context, 34, 74, Math.max(8, 444 * progress), 22, 11);
  context.fillStyle = meter.urgent
    ? '#e5ad2f'
    : meter.kind === 'water'
      ? '#4fb3c4'
      : meter.kind === 'growth'
        ? '#d6ad3d'
        : '#73a85d';
  context.fill();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

function buildingMeterHeight(kind: keyof typeof BUILDINGS): number {
  switch (kind) {
    case 'barn':
    case 'cold_store':
    case 'mill':
    case 'creamery':
    case 'preserve_kitchen':
      return 4.8;
    case 'worker_hut':
      return 4.2;
    default:
      return 2.8;
  }
}
