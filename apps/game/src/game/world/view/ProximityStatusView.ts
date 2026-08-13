import * as THREE from 'three';
import { buildingFootprint, type BuildingKind } from '@farmrise/shared';
import type { ProximityMeter } from '../../systems/InteractionController.js';
import type { FarmWorld } from '../FarmWorld.js';

interface MeterEntry {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  key: string;
}

interface MeterGroup {
  anchor: ProximityMeterAnchor;
  readonly meters: ProximityMeter[];
}

export interface ProximityMeterAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ProximityMeterStackLayout {
  readonly canvasHeight: number;
  readonly spriteHeight: number;
  readonly anchorOffsetY: number;
}

const PANEL_CANVAS_HEIGHT = 128;
const PANEL_CANVAS_WIDTH = 512;
/** Shader-space width with size attenuation disabled; about 260px at 1184×768. */
const PANEL_SCREEN_WIDTH = 0.26;

/**
 * One billboard owns every gauge for an object.
 *
 * Stacking separate sprites in world Y made their screen-space gap shrink with
 * the camera pitch, which let the harvest and water cards overlap. Keeping the
 * stack inside one camera-facing canvas makes its spacing independent of zoom
 * and viewing angle while leaving the bottom card anchored to the object.
 */
export function proximityMeterStackLayout(
  count: number,
  contentRows = 0,
): ProximityMeterStackLayout {
  const safeCount = Math.max(1, Math.floor(count));
  const canvasHeight = PANEL_CANVAS_HEIGHT * safeCount + Math.max(0, contentRows) * 24;
  const spriteHeight = PANEL_SCREEN_WIDTH * (canvasHeight / PANEL_CANVAS_WIDTH);
  return {
    canvasHeight,
    spriteHeight,
    // The sprite's centre is moved to its bottom edge, so it grows upward in
    // screen space and no distance-sensitive world offset is required.
    anchorOffsetY: 0,
  };
}

/** Plot and dropped-goods meters on the same tile share one visual stack. */
export function proximityMeterGroupId(meter: ProximityMeter, anchor: ProximityMeterAnchor): string {
  if (meter.target.kind === 'animal') return `animal:${meter.target.id}`;
  if (meter.target.kind === 'shelter') return `shelter:${meter.target.id}`;
  return `ground:${anchor.x.toFixed(3)}:${anchor.z.toFixed(3)}`;
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

  if (meter.target.kind === 'animal') {
    return { x: meter.target.x, y: meter.target.y, z: meter.target.z };
  }

  if (meter.target.kind === 'shelter') {
    const shelter = world.shelters.get(meter.target.id);
    if (!shelter) return null;
    const at = world.shelters.worldPosition(shelter.id);
    return { x: at.x, y: shelter.buildingId === null ? 2.55 : 2.85, z: at.z };
  }

  const store = world.stores.get(meter.target.id);
  if (!store) return null;
  if (store.buildingId) {
    const building = world.structures.get(store.buildingId);
    if (building) {
      const footprint = buildingFootprint(building.kind, building.rotation);
      const at = world.grid.tileToWorld(
        building.tileX + (footprint.width - 1) / 2,
        building.tileZ + (footprint.depth - 1) / 2,
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
    const groups = new Map<string, MeterGroup>();
    for (const meter of meters) {
      const anchor = proximityMeterAnchor(world, meter);
      if (!anchor) continue;
      const id = proximityMeterGroupId(meter, anchor);
      const group = groups.get(id);
      if (group) {
        group.meters.push(meter);
        if (anchor.y > group.anchor.y) group.anchor = anchor;
      } else groups.set(id, { anchor, meters: [meter] });
    }

    for (const [id, group] of groups) {
      active.add(id);

      let entry = this.#entries.get(id);
      if (!entry) {
        const created = this.#createEntry();
        if (!created) continue;
        entry = created;
        this.#entries.set(id, entry);
        this.object.add(entry.sprite);
      }
      const orderedMeters = [...group.meters].sort(
        (left, right) => meterOrder(left.kind) - meterOrder(right.kind),
      );
      const contentRows = orderedMeters.reduce(
        (total, meter) => total + Math.ceil((meter.contents?.length ?? 0) / 2),
        0,
      );
      const layout = proximityMeterStackLayout(orderedMeters.length, contentRows);
      if (entry.canvas.height !== layout.canvasHeight) {
        entry.canvas.height = layout.canvasHeight;
        entry.key = '';
      }
      entry.sprite.position.set(group.anchor.x, group.anchor.y, group.anchor.z);
      entry.sprite.scale.set(PANEL_SCREEN_WIDTH, layout.spriteHeight, 1);

      const key = orderedMeters
        .map(
          (meter) =>
            `${meter.kind}:${meter.label}:${meter.detail}:${meter.contents?.join(',') ?? ''}:${Math.round(meter.value * 100)}:${meter.urgent}`,
        )
        .join('|');
      if (entry.key !== key) {
        entry.key = key;
        drawMeters(entry.canvas, orderedMeters);
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
      // A world-sized sprite becomes enormous when the camera gets close.
      // Disabling attenuation keeps its projected size constant at every
      // allowed player/camera distance.
      sizeAttenuation: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = 'ProximityStatusBar';
    sprite.center.set(0.5, 0);
    sprite.scale.set(
      PANEL_SCREEN_WIDTH,
      PANEL_SCREEN_WIDTH * (PANEL_CANVAS_HEIGHT / PANEL_CANVAS_WIDTH),
      1,
    );
    sprite.renderOrder = 21;
    sprite.frustumCulled = false;
    return { sprite, texture, canvas, key: '' };
  }
}

function drawMeters(canvas: HTMLCanvasElement, meters: readonly ProximityMeter[]): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);

  let offsetY = 0;
  for (const meter of meters) {
    const panelHeight = PANEL_CANVAS_HEIGHT + Math.ceil((meter.contents?.length ?? 0) / 2) * 24;
    drawMeter(context, meter, offsetY, panelHeight);
    offsetY += panelHeight;
  }
}

function meterOrder(kind: ProximityMeter['kind']): number {
  switch (kind) {
    case 'growth':
      return 0;
    case 'water':
      return 1;
    case 'storage':
      return 0;
    case 'shelter':
      return 0;
    case 'freshness':
      return 1;
    case 'animal':
      return 2;
  }
}

function drawMeter(
  context: CanvasRenderingContext2D,
  meter: ProximityMeter,
  offsetY: number,
  panelHeight: number,
): void {
  const progress = Math.min(1, Math.max(0, meter.value));

  roundedRect(context, 8, offsetY + 8, 496, panelHeight - 16, 22);
  context.fillStyle = 'rgba(42, 36, 32, 0.9)';
  context.fill();
  roundedRect(context, 14, offsetY + 14, 484, panelHeight - 28, 18);
  context.fillStyle = '#f5f1e5';
  context.fill();

  context.fillStyle = '#2a2420';
  context.font = '700 25px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(meter.label, 34, offsetY + 34, 444);
  context.font = '600 20px system-ui, sans-serif';
  context.fillText(meter.detail, 34, offsetY + 62, 444);

  const contents = meter.contents ?? [];
  if (contents.length > 0) {
    context.font = '600 18px system-ui, sans-serif';
    for (let index = 0; index < contents.length; index += 1) {
      const column = index % 2;
      const row = Math.floor(index / 2);
      context.fillText(contents[index]!, 34 + column * 225, offsetY + 88 + row * 24, 205);
    }
  }

  const barY = offsetY + panelHeight - 43;
  roundedRect(context, 34, barY, 444, 18, 9);
  context.fillStyle = '#c8aa72';
  context.fill();
  roundedRect(context, 34, barY, Math.max(8, 444 * progress), 18, 9);
  context.fillStyle = meter.urgent
    ? '#e5ad2f'
    : meter.kind === 'water'
      ? '#4fb3c4'
      : meter.kind === 'growth'
        ? '#d6ad3d'
        : meter.kind === 'storage'
          ? '#8a6f47'
          : meter.kind === 'animal' || meter.kind === 'shelter'
            ? '#3f7a82'
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

function buildingMeterHeight(kind: BuildingKind): number {
  switch (kind) {
    case 'barn':
      return 3.45;
    case 'cold_store':
      return 3.05;
    case 'mill':
      return 3.85;
    case 'creamery':
      return 3.25;
    case 'preserve_kitchen':
      return 2.65;
    case 'worker_hut':
      return 2.85;
    case 'loading_pad':
      return 0.9;
    default:
      return 2.1;
  }
}
