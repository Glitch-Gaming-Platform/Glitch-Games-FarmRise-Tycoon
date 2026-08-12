/** Fixed-budget processor exhaust and localized, non-shadowing operation lights. */
import * as THREE from 'three';
import { buildingFootprint, type BuildingKind } from '@farmrise/shared';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';
import type { FarmWorld, PlacedBuilding } from '../FarmWorld.js';

export interface BuildingOperationalMotion {
  readonly active: boolean;
  readonly rotorAngle: number;
  readonly shake: number;
}

export function buildingOperationalMotion(
  kind: BuildingKind,
  elapsedSeconds: number,
  busy: boolean,
  broken: boolean,
): BuildingOperationalMotion {
  const active = !broken && (busy || kind === 'cold_store' || kind === 'well');
  const speed =
    kind === 'mill' ? 1.9 : kind === 'creamery' ? 4.4 : kind === 'cold_store' ? 3.2 : 0.78;
  return {
    active,
    rotorAngle: active ? elapsedSeconds * speed : 0,
    shake: broken ? Math.sin(elapsedSeconds * 22) * 0.009 : 0,
  };
}

const OPERATION_CAPACITY = 30;
const LOCAL_LIGHT_CAPACITY = 3;

export class StructureOperationEffects {
  readonly object = new THREE.Group();
  readonly #puffs: THREE.InstancedMesh;
  readonly #lights: THREE.PointLight[] = [];
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #scale = new THREE.Vector3();
  readonly #rotation = new THREE.Quaternion();
  readonly #colour = new THREE.Color();

  constructor(
    private readonly world: FarmWorld,
    pipeline: RenderPipeline | null,
  ) {
    this.object.name = 'StructureOperationEffects';
    const geometry = new THREE.DodecahedronGeometry(0.1, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      toneMapped: false,
    });
    this.#puffs = new THREE.InstancedMesh(geometry, material, OPERATION_CAPACITY);
    this.#puffs.name = 'StructureOperationPuffs';
    this.#puffs.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(OPERATION_CAPACITY * 3).fill(1),
      3,
    );
    this.#puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#puffs.frustumCulled = false;
    this.#puffs.visible = false;
    this.object.add(this.#puffs);

    if (pipeline?.active) {
      for (let index = 0; index < LOCAL_LIGHT_CAPACITY; index += 1) {
        const light = new THREE.PointLight(PALETTE_STRAW, 0, 3.4, 2);
        light.name = `StructureResponseLight_${index}`;
        light.castShadow = false;
        this.#lights.push(light);
        this.object.add(light);
      }
    }
  }

  update(elapsedSeconds: number): void {
    this.#syncPuffs(elapsedSeconds);
    this.#syncLights(elapsedSeconds);
  }

  dispose(): void {
    this.#puffs.geometry.dispose();
    (this.#puffs.material as THREE.Material).dispose();
    for (const light of this.#lights) light.removeFromParent();
    this.#lights.length = 0;
    this.object.removeFromParent();
    this.object.clear();
  }

  #syncPuffs(elapsedSeconds: number): void {
    let instance = 0;
    for (const building of this.world.buildings) {
      if (instance >= OPERATION_CAPACITY) break;
      if (building.remainingBuildTicks > 0) continue;
      const queue = this.world.processing.forBuilding(building.id)?.queue.length ?? 0;
      const motion = buildingOperationalMotion(
        building.kind,
        elapsedSeconds,
        queue > 0,
        building.broken,
      );
      if (!motion.active && !building.broken) continue;
      const footprint = buildingFootprint(building.kind, building.rotation);
      const x = structureCenterX(this.world, building.tileX, footprint.width);
      const z = structureCenterZ(this.world, building.tileZ, footprint.depth);
      const count = building.broken ? 2 : queue > 0 ? 3 : 1;
      for (
        let phaseIndex = 0;
        phaseIndex < count && instance < OPERATION_CAPACITY;
        phaseIndex += 1
      ) {
        const phase = phaseIndex / count;
        const cycle =
          (elapsedSeconds * (building.broken ? 0.28 : 0.38) +
            phase +
            building.tileX * 0.13 +
            building.tileZ * 0.07) %
          1;
        const drift = building.broken ? 0.16 : 0.09;
        const size = (0.42 + cycle * 0.76) * (building.broken ? 1.1 : 0.82);
        this.#matrix.compose(
          this.#position.set(
            x + Math.sin(cycle * Math.PI * 2 + phaseIndex) * drift,
            structureEmitterHeight(building.kind) + cycle * (building.broken ? 0.62 : 0.82),
            z + Math.cos(cycle * Math.PI * 1.6 + phaseIndex) * drift * 0.65,
          ),
          this.#rotation.identity(),
          this.#scale.setScalar(size),
        );
        this.#puffs.setMatrixAt(instance, this.#matrix);
        this.#colour.setHex(
          building.broken
            ? phaseIndex % 2 === 0
              ? PALETTE_ROCK_SHADOW
              : PALETTE_ROCK
            : building.kind === 'cold_store'
              ? PALETTE_SKY_HAZE
              : PALETTE_TRIM_WHITE,
        );
        this.#puffs.setColorAt(instance, this.#colour);
        instance += 1;
      }
    }
    this.#puffs.count = instance;
    this.#puffs.instanceMatrix.needsUpdate = instance > 0;
    if (this.#puffs.instanceColor) this.#puffs.instanceColor.needsUpdate = instance > 0;
    this.#puffs.visible = instance > 0;
  }

  #syncLights(elapsedSeconds: number): void {
    if (this.#lights.length === 0) return;
    let next = 0;
    for (const building of this.world.buildings) {
      if (next >= this.#lights.length) break;
      if (building.remainingBuildTicks > 0 || !building.broken) continue;
      this.#writeLight(this.#lights[next]!, building, elapsedSeconds, true);
      next += 1;
    }
    for (const building of this.world.buildings) {
      if (next >= this.#lights.length) break;
      if (building.remainingBuildTicks > 0 || building.broken) continue;
      const busy = (this.world.processing.forBuilding(building.id)?.queue.length ?? 0) > 0;
      if (!buildingOperationalMotion(building.kind, elapsedSeconds, busy, false).active) continue;
      this.#writeLight(this.#lights[next]!, building, elapsedSeconds, false);
      next += 1;
    }
    for (; next < this.#lights.length; next += 1) this.#lights[next]!.intensity = 0;
  }

  #writeLight(
    light: THREE.PointLight,
    building: PlacedBuilding,
    elapsedSeconds: number,
    broken: boolean,
  ): void {
    const footprint = buildingFootprint(building.kind, building.rotation);
    light.position.set(
      structureCenterX(this.world, building.tileX, footprint.width),
      structureEmitterHeight(building.kind) * 0.72,
      structureCenterZ(this.world, building.tileZ, footprint.depth),
    );
    if (broken) {
      light.color.setHex(PALETTE_WARNING_ORANGE);
      light.intensity = 0.16 + (Math.sin(elapsedSeconds * 8.5 + building.tileX) * 0.5 + 0.5) * 0.07;
      light.distance = 3.1;
      return;
    }
    light.color.setHex(building.kind === 'cold_store' ? PALETTE_WINDOW_BLUE : PALETTE_STRAW);
    light.intensity = 0.09 + (Math.sin(elapsedSeconds * 1.8 + building.tileZ) * 0.5 + 0.5) * 0.035;
    light.distance = 2.8;
  }
}

export function structureCenterX(world: FarmWorld, tileX: number, width: number): number {
  return (tileX - world.grid.width / 2 + width / 2) * world.grid.tileSize;
}

export function structureCenterZ(world: FarmWorld, tileZ: number, depth: number): number {
  return (tileZ - world.grid.depth / 2 + depth / 2) * world.grid.tileSize;
}

export function structureEmitterHeight(kind: BuildingKind): number {
  switch (kind) {
    case 'mill':
      return 2.6;
    case 'preserve_kitchen':
      return 2.35;
    case 'creamery':
    case 'cold_store':
      return 1.75;
    case 'well':
      return 1.3;
    default:
      return 1.15;
  }
}

const PALETTE_STRAW = 0xe0bc6a; // straw_hat
const PALETTE_ROCK_SHADOW = 0x6b655c; // rock_shadow
const PALETTE_ROCK = 0x8a8378; // rock
const PALETTE_SKY_HAZE = 0xa7d7e8; // sky_haze
const PALETTE_TRIM_WHITE = 0xede7da; // trim_white
const PALETTE_WINDOW_BLUE = 0x83c4d1; // window_blue
const PALETTE_WARNING_ORANGE = 0xf28a38; // carrot_body
