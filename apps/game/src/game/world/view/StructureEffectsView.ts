/**
 * Contact-timed completion, breakdown and repair beats for durable structures.
 * Continuous exhaust and local operation lights live in StructureOperationEffects.
 */
import * as THREE from 'three';
import { buildingFootprint, type BuildingKind } from '@farmrise/shared';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';
import type { WorkAction } from '../../player/Player.js';
import type { FarmWorld, PlacedBuilding } from '../FarmWorld.js';
import { PooledWorldEffects } from './PooledWorldEffects.js';
import {
  StructureOperationEffects,
  structureCenterX,
  structureCenterZ,
  structureEmitterHeight,
} from './StructureOperationEffects.js';

export {
  buildingOperationalMotion,
  type BuildingOperationalMotion,
} from './StructureOperationEffects.js';

export const REPAIR_EFFECT_CONTACT = 0.32;

export class StructureEffectsView {
  readonly object = new THREE.Group();
  readonly #bursts = new PooledWorldEffects(96, 18);
  readonly #operations: StructureOperationEffects;
  readonly #unsubscribes: (() => void)[] = [];
  #elapsedSeconds = 0;
  #pendingRepairId: string | null = null;
  #pendingRepairSince = 0;

  constructor(
    private readonly world: FarmWorld,
    pipeline: RenderPipeline | null,
  ) {
    this.object.name = 'StructureEffects';
    this.object.userData['static'] = true;
    this.#operations = new StructureOperationEffects(world, pipeline);
    this.object.add(this.#bursts.object, this.#operations.object);
    this.#unsubscribes.push(
      world.structures.events.on('building:completed', ({ id, kind, tileX, tileZ }) => {
        const building = world.structures.get(id);
        this.#triggerCompletion(kind, tileX, tileZ, building?.rotation ?? 0);
      }),
      world.structures.events.on('building:repaired', ({ id }) => {
        this.#pendingRepairId = id;
        this.#pendingRepairSince = this.#elapsedSeconds;
      }),
      world.structures.events.on('building:broken', ({ id }) => {
        const building = world.structures.get(id);
        if (building) this.#triggerBreakdown(building);
      }),
    );
  }

  get activeParticleCount(): number {
    return this.#bursts.activeParticleCount;
  }

  get particleCapacity(): number {
    return this.#bursts.particleCapacity;
  }

  get repairPending(): boolean {
    return this.#pendingRepairId !== null;
  }

  update(
    elapsedSeconds: number,
    deltaSeconds: number,
    workAction: WorkAction | null = null,
    workProgress = 0,
  ): void {
    this.#elapsedSeconds = elapsedSeconds;
    const repairPose = workAction === 'repair' || workAction === 'shoo';
    const authoredContact = repairPose && workProgress >= REPAIR_EFFECT_CONTACT;
    const fallbackContact =
      this.#pendingRepairId !== null && elapsedSeconds - this.#pendingRepairSince >= 1.2;
    if (this.#pendingRepairId && (authoredContact || fallbackContact)) {
      const building = this.world.structures.get(this.#pendingRepairId);
      if (building) this.#triggerRepair(building);
      this.#pendingRepairId = null;
    }
    this.#bursts.update(deltaSeconds);
    this.#operations.update(elapsedSeconds);
  }

  dispose(): void {
    for (const unsubscribe of this.#unsubscribes) unsubscribe();
    this.#unsubscribes.length = 0;
    this.#bursts.dispose();
    this.#operations.dispose();
    this.object.removeFromParent();
    this.object.clear();
  }

  #triggerCompletion(kind: BuildingKind, tileX: number, tileZ: number, rotation: number): void {
    const footprint = buildingFootprint(kind, rotation);
    const x = structureCenterX(this.world, tileX, footprint.width);
    const z = structureCenterZ(this.world, tileZ, footprint.depth);
    const radius = Math.max(footprint.width, footprint.depth) * this.world.grid.tileSize * 0.34;
    this.#bursts.emitBurst({
      x,
      y: 0.08,
      z,
      count: kind === 'road' || kind === 'fence' ? 9 : 16,
      radius,
      speed: 0.42,
      lift: 0.48,
      duration: 0.92,
      size: kind === 'road' ? 0.56 : 0.78,
      gravity: 0.68,
      drag: 1.8,
      flatten: 0.62,
      colours: [PALETTE_SAND_PATH, PALETTE_SAND_STONE, PALETTE_STRAW],
      seed: tileX * 0.47 + tileZ * 0.31,
    });
    this.#bursts.emitRing({
      x,
      y: 0.045,
      z,
      duration: 0.72,
      startRadius: radius * 0.2,
      endRadius: radius * 1.12,
      colour: PALETTE_STRAW,
    });
  }

  #triggerRepair(building: PlacedBuilding): void {
    const footprint = buildingFootprint(building.kind, building.rotation);
    const x = structureCenterX(this.world, building.tileX, footprint.width);
    const z = structureCenterZ(this.world, building.tileZ, footprint.depth);
    this.#bursts.emitBurst({
      x,
      y: structureEmitterHeight(building.kind) * 0.62,
      z,
      count: 14,
      radius: 0.22,
      speed: 0.72,
      lift: 0.78,
      duration: 0.58,
      size: 0.5,
      gravity: 1.9,
      drag: 0.9,
      flatten: 0.34,
      colours: [PALETTE_FLOWER_YELLOW, PALETTE_METAL, PALETTE_WINDOW_BLUE],
      seed: building.tileX * 0.71 + building.tileZ * 0.43,
    });
    this.#bursts.emitRing({
      x,
      y: 0.05,
      z,
      duration: 0.56,
      startRadius: 0.18,
      endRadius: 1.05,
      colour: PALETTE_WINDOW_BLUE,
    });
  }

  #triggerBreakdown(building: PlacedBuilding): void {
    const footprint = buildingFootprint(building.kind, building.rotation);
    const x = structureCenterX(this.world, building.tileX, footprint.width);
    const z = structureCenterZ(this.world, building.tileZ, footprint.depth);
    this.#bursts.emitBurst({
      x,
      y: structureEmitterHeight(building.kind) * 0.55,
      z,
      count: 12,
      radius: 0.2,
      speed: 0.36,
      lift: 0.38,
      duration: 1.05,
      size: 0.74,
      gravity: 0.12,
      drag: 2.4,
      flatten: 0.8,
      colours: [PALETTE_ROCK_SHADOW, PALETTE_ROCK, PALETTE_SOIL_DRY],
      seed: building.tileX * 0.37 + building.tileZ * 0.89,
    });
    this.#bursts.emitRing({
      x,
      y: 0.05,
      z,
      duration: 0.64,
      startRadius: 0.22,
      endRadius: 1.18,
      colour: PALETTE_SOIL_DRY,
    });
  }
}

const PALETTE_SAND_PATH = 0xc9b896; // sand_path
const PALETTE_SAND_STONE = 0xb0a083; // sand_stone
const PALETTE_STRAW = 0xe0bc6a; // straw_hat
const PALETTE_FLOWER_YELLOW = 0xf5d341; // flower_yellow
const PALETTE_METAL = 0xa9b4ba; // metal_galv
const PALETTE_WINDOW_BLUE = 0x83c4d1; // window_blue
const PALETTE_ROCK_SHADOW = 0x6b655c; // rock_shadow
const PALETTE_ROCK = 0x8a8378; // rock
const PALETTE_SOIL_DRY = 0xb9603a; // soil_dry
