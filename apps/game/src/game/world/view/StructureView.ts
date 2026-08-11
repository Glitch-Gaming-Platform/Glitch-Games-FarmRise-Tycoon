/**
 * Buildings, scenery and the animal shelter.
 *
 * Rebuilt only when the building list changes rather than every frame:
 * buildings change a handful of times per session, so a diff-and-rebuild is
 * far cheaper than syncing transforms at 60Hz.
 *
 * Under-construction buildings are drawn translucent. That is the one place
 * the game deviates from "one material for everything", and it is worth it:
 * a ghosted building is how the player knows their money is committed but
 * the benefit has not arrived yet.
 */
import * as THREE from 'three';
import { BUILDINGS, type BuildingKind } from '@farmrise/shared';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { FarmWorld, PlacedBuilding } from '../FarmWorld.js';
import {
  createWaterMaterial,
  createWindMaterial,
  type TimeMaterial,
} from './animationMaterials.js';
import type { FarmMaterials } from './materials.js';
import {
  createRoadGeometry,
  roadConnectionMask,
  roadSurfaceVariant,
  type RoadTileLike,
} from './roadGeometry.js';

/**
 * Authored mesh per building kind.
 *
 * Partial on purpose: a kind with no entry falls back to a procedural block
 * sized from its footprint, so a new building is playable the moment its rules
 * exist and does not have to wait for its art.
 */
const BUILDING_MESH: Partial<Record<BuildingKind, string>> = {
  barn: 'SM_building_barn',
  irrigation: 'SM_building_irrigation',
  road: 'SM_building_road',
  fence: 'SM_building_fence',
  loading_pad: 'SM_building_loading_pad',
  cold_store: 'SM_building_cold_store',
  worker_hut: 'SM_building_worker_hut',
  well: 'SM_building_well',
  mill: 'SM_building_mill',
  creamery: 'SM_building_creamery',
  preserve_kitchen: 'SM_building_preserve_kitchen',
};

/** Height of the procedural stand-in for a kind with no authored mesh. */
const FALLBACK_HEIGHT: Partial<Record<BuildingKind, number>> = {
  barn: 3,
  cold_store: 2.6,
  worker_hut: 2.4,
  mill: 3.4,
  creamery: 2.8,
  preserve_kitchen: 2.2,
  well: 1.4,
  fence: 1.1,
  irrigation: 1,
  loading_pad: 0.2,
  road: 0.15,
};

function fallbackHeight(kind: BuildingKind): number {
  return FALLBACK_HEIGHT[kind] ?? 1.6;
}

const COOP_MESH = 'SM_building_coop';
const ROCK_MESH = 'SM_prop_rock';
const ROCK_CLUSTER_MESH = 'SM_prop_rock_cluster';
const TREE_MESH = 'SM_prop_eucalyptus';
const TALL_TREE_MESH = 'SM_prop_eucalyptus_tall';
const WIDE_TREE_MESH = 'SM_prop_eucalyptus_wide';
const DEAD_TREE_MESH = 'SM_prop_dead_tree';
const TROUGH_MESH = 'SM_prop_water_trough';
const MILL_WHEEL_MESH = 'SM_building_mill_wheel';
const VENT_FAN_MESH = 'SM_building_vent_fan';
const WELL_CRANK_MESH = 'SM_building_well_crank';
const STEAM_PUFF_MESH = 'SM_building_steam_puff';
const DUST_PUFF_MESH = 'SM_building_dust_puff';

type BuildingMotionPart =
  | 'mill-wheel'
  | 'vent-fan'
  | 'well-crank'
  | 'steam'
  | 'water-stream'
  | 'water-splash'
  | 'completion-dust';

export interface BuildingOperationalMotion {
  readonly active: boolean;
  readonly rotorAngle: number;
  readonly shake: number;
}

/** Deterministic presentation state shared by the runtime and unit tests. */
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
    shake: broken ? Math.sin(elapsedSeconds * 22.0) * 0.009 : 0,
  };
}

export class StructureView {
  readonly object = new THREE.Group();
  #signature = '';
  #ghostMaterial: THREE.Material | null = null;
  /**
   * The building the player is currently positioning.
   *
   * A text banner alone is not enough feedback for placement: the player is
   * choosing a SPOT, and they cannot judge a spot without seeing the footprint
   * on the ground. Green means buildable, red means blocked, and the pulse
   * makes it read as provisional rather than already built.
   */
  #preview: THREE.Mesh | null = null;
  #previewValid = true;
  #previewMaterials: THREE.MeshStandardMaterial[] = [];
  readonly #owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  readonly #water = createWaterMaterial(false);
  readonly #runningWater = createWaterMaterial(true);
  readonly #treeWind: TimeMaterial | null;
  readonly #deadTreeWind: TimeMaterial | null;
  readonly #waterPlane = createWaterPlaneGeometry();
  readonly #waterStream = new THREE.CylinderGeometry(0.026, 0.018, 1, 6, 5, true);
  readonly #waterSplash = new THREE.TorusGeometry(0.11, 0.012, 5, 18);
  readonly #waterSplashes: THREE.Mesh[] = [];
  readonly #roadGeometryCache = new Map<string, THREE.BufferGeometry>();
  readonly #knownBuildingStates = new Map<string, 'wip' | 'done'>();
  #elapsedSeconds = 0;

  constructor(
    private readonly world: FarmWorld,
    private readonly materials: FarmMaterials,
    private readonly library: ModelLibrary | null = null,
  ) {
    this.#treeWind = library
      ? createWindMaterial(library.material, {
          key: 'blocked-trees',
          strength: 0.12,
          speed: 0.82,
          baseHeight: 0.72,
          fullHeight: 2.35,
          // Trees bend as cantilever beams, not as stems. See WindOptions.
          cantilever: true,
          tipFlutter: 0.7,
          torsion: 0.01,
          lateralRatio: 0.34,
        })
      : null;
    this.#deadTreeWind = library
      ? createWindMaterial(library.material, {
          key: 'blocked-dead-trees',
          strength: 0.02,
          speed: 0.52,
          baseHeight: 0.68,
          fullHeight: 1.82,
          cantilever: true,
          tipFlutter: 0.03,
          torsion: 0.002,
          lateralRatio: 0.16,
        })
      : null;
    this.#owned.push(this.#waterPlane, this.#waterStream, this.#waterSplash);
    this.#buildStatic(world);
    this.sync(world);
  }

  sync(world: FarmWorld): void {
    const signature = world.buildings
      .map((b) => `${b.kind}:${b.tileX}:${b.tileZ}:${b.remainingBuildTicks > 0 ? 'wip' : 'done'}`)
      .join('|');
    if (signature === this.#signature) return;
    const firstSync = this.#signature === '';
    const completedNow = new Set<string>();
    for (const building of world.buildings) {
      const key = buildingKey(building);
      const state = building.remainingBuildTicks > 0 ? 'wip' : 'done';
      if (!firstSync && this.#knownBuildingStates.get(key) === 'wip' && state === 'done') {
        completedNow.add(key);
      }
    }
    this.#signature = signature;

    for (const child of [...this.object.children]) {
      if (child.userData['static']) continue;
      this.#disposeNode(child);
    }
    this.#waterSplashes.length = 0;

    const roadTiles = world.buildings.filter(
      (building): building is PlacedBuilding & RoadTileLike => building.kind === 'road',
    );
    const roadBatches = new Map<
      string,
      { readonly geometry: THREE.BufferGeometry; readonly buildings: PlacedBuilding[] }
    >();
    for (const building of world.buildings) {
      // Completed road networks are bucketed by connection shape and one of
      // four surface variants. A long lane therefore costs a handful of draws
      // rather than one draw per tile, while the newest completed tile stays
      // individual for its completion pulse until the next network change.
      if (
        building.kind === 'road' &&
        building.remainingBuildTicks === 0 &&
        !completedNow.has(buildingKey(building))
      ) {
        const geometry = this.#roadGeometry(world, roadTiles, building.tileX, building.tileZ);
        const cacheKey = String(geometry.userData['roadCacheKey']);
        const batch = roadBatches.get(cacheKey);
        if (batch) batch.buildings.push(building);
        else roadBatches.set(cacheKey, { geometry, buildings: [building] });
        continue;
      }
      const visual = this.#makeBuilding(world, building);
      if (!visual) continue;
      const definition = BUILDINGS[building.kind];
      const tile = world.grid.tileSize;
      const origin = world.grid.tileToWorld(building.tileX, building.tileZ);
      // Multi-tile footprints anchor at their corner tile, so shift by the
      // extra half-tile to centre the mesh over the whole footprint.
      visual.position.set(
        origin.x + ((definition.footprint.width - 1) * tile) / 2,
        0,
        origin.z + ((definition.footprint.depth - 1) * tile) / 2,
      );
      visual.userData['building'] = building;
      visual.userData['baseY'] = visual.position.y;
      visual.rotation.y = building.rotation * (Math.PI / 2);
      if (completedNow.has(buildingKey(building))) {
        visual.userData['completionStartedAt'] = this.#elapsedSeconds;
        this.#attachCompletionDust(visual, definition.footprint.width, definition.footprint.depth);
      }
      visual.traverse((node) => {
        node.castShadow = building.kind !== 'road';
        node.receiveShadow = true;
      });
      if (building.remainingBuildTicks > 0) {
        visual.traverse((node) => {
          const mesh = node as Partial<THREE.Mesh>;
          if (
            mesh.material &&
            mesh.material !== this.#water.material &&
            mesh.material !== this.#runningWater.material
          ) {
            mesh.material = this.#ghost();
          }
        });
      }
      this.object.add(visual);
    }

    for (const batch of roadBatches.values()) this.#addRoadBatch(world, batch);

    this.#knownBuildingStates.clear();
    for (const building of world.buildings) {
      this.#knownBuildingStates.set(
        buildingKey(building),
        building.remainingBuildTicks > 0 ? 'wip' : 'done',
      );
    }
  }

  animate(elapsedSeconds: number): void {
    this.#elapsedSeconds = elapsedSeconds;
    this.#water.setTime(elapsedSeconds);
    this.#runningWater.setTime(elapsedSeconds);
    this.#treeWind?.setTime(elapsedSeconds);
    this.#deadTreeWind?.setTime(elapsedSeconds);
    for (let index = 0; index < this.#waterSplashes.length; index += 1) {
      const splash = this.#waterSplashes[index]!;
      splash.scale.setScalar(0.82 + Math.sin(elapsedSeconds * 8.5 + index) * 0.16);
    }

    let hasConstruction = false;
    for (const visual of this.object.children) {
      const building = visual.userData['building'] as PlacedBuilding | undefined;
      if (!building) continue;
      const baseY = Number(visual.userData['baseY'] ?? 0);
      if (building.remainingBuildTicks > 0) {
        hasConstruction = true;
        const total = Math.max(1, BUILDINGS[building.kind].buildTicks);
        const progress = 1 - building.remainingBuildTicks / total;
        const eased = 1 - (1 - Math.min(1, Math.max(0, progress))) ** 3;
        visual.scale.set(0.92 + eased * 0.08, 0.7 + eased * 0.3, 0.92 + eased * 0.08);
        visual.position.y = baseY + Math.sin(elapsedSeconds * 4.5 + building.tileX) * 0.018;
        visual.rotation.z = Math.sin(elapsedSeconds * 3.2 + building.tileZ) * 0.006;
        visual.traverse((node) => {
          if (node.userData['motionPart']) node.visible = eased > 0.72;
        });
        continue;
      }

      const busy = (this.world.processing.forBuilding(building.id)?.queue.length ?? 0) > 0;
      const operational = buildingOperationalMotion(
        building.kind,
        elapsedSeconds,
        busy,
        building.broken,
      );
      visual.rotation.z = operational.shake;
      visual.traverse((node) => {
        const part = node.userData['motionPart'] as BuildingMotionPart | undefined;
        if (!part) return;
        const phase = Number(node.userData['phase'] ?? 0);
        if (part === 'mill-wheel' || part === 'well-crank') {
          node.visible = true;
          node.rotation.x = operational.rotorAngle + phase;
        } else if (part === 'vent-fan') {
          node.visible = true;
          node.rotation.z = -operational.rotorAngle + phase;
        } else if (part === 'steam') {
          const steamActive = operational.active && busy;
          const cycle = (elapsedSeconds * 0.38 + phase) % 1;
          const basePosition = node.userData['basePosition'] as [number, number, number];
          node.visible = steamActive;
          node.position.set(
            basePosition[0] + Math.sin(cycle * Math.PI) * 0.08,
            basePosition[1] + cycle * 0.78,
            basePosition[2] + Math.cos(cycle * Math.PI) * 0.04,
          );
          node.scale.setScalar(0.48 + cycle * 0.78);
        } else if (part === 'water-stream' || part === 'water-splash') {
          node.visible = !building.broken;
        }
      });

      const completedAt = visual.userData['completionStartedAt'] as number | undefined;
      const age = completedAt === undefined ? 1 : elapsedSeconds - completedAt;
      if (age < 0.72) {
        const pulse = Math.sin(Math.min(1, age / 0.72) * Math.PI);
        visual.scale.set(1 + pulse * 0.075, 1 + pulse * 0.11, 1 + pulse * 0.075);
        visual.position.y = baseY + pulse * 0.035;
        visual.traverse((node) => {
          if (node.userData['motionPart'] !== 'completion-dust') return;
          const phase = Number(node.userData['phase'] ?? 0);
          const dustAge = Math.min(1, Math.max(0, age / 0.72));
          const basePosition = node.userData['basePosition'] as [number, number, number];
          const outward = 1 + dustAge * 0.34;
          node.visible = true;
          node.position.set(
            basePosition[0] * outward,
            basePosition[1] + Math.sin(dustAge * Math.PI) * (0.1 + phase * 0.05),
            basePosition[2] * outward,
          );
          node.scale.setScalar(Math.sin(dustAge * Math.PI) * (0.55 + phase * 0.28));
        });
      } else {
        visual.scale.set(1, 1, 1);
        visual.position.y = baseY;
        visual.traverse((node) => {
          if (node.userData['motionPart'] === 'completion-dust') node.visible = false;
        });
        delete visual.userData['completionStartedAt'];
      }
    }
    if (this.#ghostMaterial) {
      this.#ghostMaterial.opacity = hasConstruction
        ? 0.38 + (Math.sin(elapsedSeconds * 4.4) * 0.5 + 0.5) * 0.14
        : 0.45;
    }
  }

  /**
   * Positions the placement preview, or clears it when `kind` is null.
   * Called from the session binding as the pointer moves.
   */
  setPlacementPreview(
    world: FarmWorld,
    kind: BuildingKind | null,
    tileX = 0,
    tileZ = 0,
    valid = true,
  ): void {
    if (!kind) {
      if (this.#preview) this.#preview.visible = false;
      return;
    }

    const definition = BUILDINGS[kind];
    const geometry = this.#previewGeometry(world, kind, tileX, tileZ);
    if (!this.#preview) {
      this.#preview = new THREE.Mesh(geometry, this.#previewMaterial(true));
      this.#preview.userData['static'] = true;
      this.object.add(this.#preview);
    } else if (this.#preview.geometry !== geometry) {
      this.#preview.geometry = geometry;
    }

    if (valid !== this.#previewValid) {
      this.#previewValid = valid;
      this.#preview.material = this.#previewMaterial(valid);
    }

    const tile = world.grid.tileSize;
    const origin = world.grid.tileToWorld(tileX, tileZ);
    this.#preview.position.set(
      origin.x + ((definition.footprint.width - 1) * tile) / 2,
      0,
      origin.z + ((definition.footprint.depth - 1) * tile) / 2,
    );
    this.#preview.visible = true;
  }

  /** Gentle pulse so the preview never reads as a finished building. */
  animatePreview(elapsedSeconds: number): void {
    if (!this.#preview?.visible) return;
    const pulse = 0.62 + Math.sin(elapsedSeconds * 4.2) * 0.16;
    for (const material of this.#previewMaterials) material.opacity = pulse;
    this.#preview.position.y = Math.sin(elapsedSeconds * 4.2) * 0.03;
  }

  #previewGeometry(
    world: FarmWorld,
    kind: BuildingKind,
    tileX: number,
    tileZ: number,
  ): THREE.BufferGeometry {
    if (kind === 'road') {
      const roads = world.buildings
        .filter((building) => building.kind === 'road')
        .map((building) => ({ tileX: building.tileX, tileZ: building.tileZ }));
      if (!roads.some((road) => road.tileX === tileX && road.tileZ === tileZ)) {
        roads.push({ tileX, tileZ });
      }
      return this.#roadGeometry(world, roads, tileX, tileZ);
    }
    const meshName = BUILDING_MESH[kind];
    const cached = meshName ? this.library?.get(meshName) : undefined;
    if (cached) return cached;
    const definition = BUILDINGS[kind];
    const tile = world.grid.tileSize;
    const height = fallbackHeight(kind);
    const geometry = new THREE.BoxGeometry(
      definition.footprint.width * tile * 0.92,
      height,
      definition.footprint.depth * tile * 0.92,
    );
    geometry.translate(0, height / 2, 0);
    this.#owned.push(geometry);
    return geometry;
  }

  #previewMaterial(valid: boolean): THREE.MeshStandardMaterial {
    const index = valid ? 0 : 1;
    const existing = this.#previewMaterials[index];
    if (existing) return existing;
    const material = new THREE.MeshStandardMaterial({
      color: valid ? 0x6fd18c : 0xf0786e,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      roughness: 0.9,
    });
    this.#previewMaterials[index] = material;
    return material;
  }

  dispose(): void {
    this.#preview?.removeFromParent();
    this.#preview = null;
    for (const material of this.#previewMaterials) material.dispose();
    this.#previewMaterials = [];
    for (const child of [...this.object.children]) this.#disposeNode(child);
    this.#ghostMaterial?.dispose();
    this.#water.dispose();
    this.#runningWater.dispose();
    this.#treeWind?.dispose();
    this.#deadTreeWind?.dispose();
    for (const resource of this.#owned) resource.dispose();
    for (const geometry of this.#roadGeometryCache.values()) geometry.dispose();
    this.#roadGeometryCache.clear();
  }

  #roadGeometry(
    world: FarmWorld,
    roads: readonly RoadTileLike[],
    tileX: number,
    tileZ: number,
  ): THREE.BufferGeometry {
    const connections = roadConnectionMask(roads, tileX, tileZ);
    const variant = roadSurfaceVariant(tileX, tileZ);
    const key = `${connections}:${variant}`;
    const cached = this.#roadGeometryCache.get(key);
    if (cached) return cached;
    const geometry = createRoadGeometry({
      tileSize: world.grid.tileSize,
      connections,
      variant,
    });
    geometry.userData['roadCacheKey'] = key;
    this.#roadGeometryCache.set(key, geometry);
    return geometry;
  }

  #addRoadBatch(
    world: FarmWorld,
    batch: {
      readonly geometry: THREE.BufferGeometry;
      readonly buildings: readonly PlacedBuilding[];
    },
  ): void {
    const mesh = new THREE.InstancedMesh(
      batch.geometry,
      this.library?.material ?? this.materials.road,
      batch.buildings.length,
    );
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < batch.buildings.length; index += 1) {
      const building = batch.buildings[index]!;
      const position = world.grid.tileToWorld(building.tileX, building.tileZ);
      matrix.makeTranslation(position.x, 0, position.z);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData['roadBatch'] = true;
    this.object.add(mesh);
  }

  #makeBuilding(world: FarmWorld, building: PlacedBuilding): THREE.Object3D | null {
    const kind = building.kind;
    if (kind === 'road') {
      const roads = world.buildings.filter(
        (candidate): candidate is PlacedBuilding & RoadTileLike => candidate.kind === 'road',
      );
      return new THREE.Mesh(
        this.#roadGeometry(world, roads, building.tileX, building.tileZ),
        this.library?.material ?? this.materials.road,
      );
    }
    const name = BUILDING_MESH[kind];
    if (name && this.library?.has(name)) {
      const base = new THREE.Mesh(this.library.require(name), this.library.material);
      const group = new THREE.Group();
      group.add(base);

      if (kind === 'mill') {
        this.#addPart(group, MILL_WHEEL_MESH, [1.92, 1.04, 0], 'mill-wheel');
        this.#addSteam(group, [-1.12, 2.58, -0.35]);
      } else if (kind === 'cold_store') {
        this.#addPart(group, VENT_FAN_MESH, [1.08, 0.64, 1.95], 'vent-fan');
      } else if (kind === 'creamery') {
        this.#addPart(group, VENT_FAN_MESH, [0.78, 0.58, 1.91], 'vent-fan');
      } else if (kind === 'well') {
        this.#addPart(group, WELL_CRANK_MESH, [0.74, 1.3, 0], 'well-crank');
      } else if (kind === 'preserve_kitchen') {
        this.#addSteam(group, [1.18, 2.44, -0.16]);
      }

      if (kind !== 'irrigation') return group;

      const troughWater = new THREE.Mesh(this.#waterPlane, this.#water.material);
      troughWater.position.set(0.25, 0.235, 0.72);
      troughWater.scale.set(0.74, 1, 0.25);
      troughWater.renderOrder = 3;

      const stream = new THREE.Mesh(this.#waterStream, this.#runningWater.material);
      stream.position.set(0.3, 0.43, 0.7);
      stream.scale.set(1, 0.36, 1);
      stream.renderOrder = 4;
      stream.userData['motionPart'] = 'water-stream' satisfies BuildingMotionPart;
      const splash = new THREE.Mesh(this.#waterSplash, this.#water.material);
      splash.position.set(0.3, 0.238, 0.7);
      splash.rotation.x = Math.PI / 2;
      splash.renderOrder = 4;
      splash.userData['motionPart'] = 'water-splash' satisfies BuildingMotionPart;
      this.#waterSplashes.push(splash);
      group.add(troughWater, stream, splash);
      return group;
    }
    // Procedural fallback.
    const definition = BUILDINGS[kind];
    const tile = world.grid.tileSize;
    const height = fallbackHeight(kind);
    const geometry = new THREE.BoxGeometry(
      definition.footprint.width * tile * 0.92,
      height,
      definition.footprint.depth * tile * 0.92,
    );
    geometry.translate(0, height / 2, 0);
    this.#owned.push(geometry);
    // A kind with no dedicated material borrows the barn's, which keeps a new
    // building visible and palette-correct before its art exists.
    const material =
      (this.materials as unknown as Record<string, THREE.Material>)[kind] ?? this.materials.barn;
    return new THREE.Mesh(geometry, material);
  }

  #addPart(
    group: THREE.Group,
    meshName: string,
    position: [number, number, number],
    motionPart: BuildingMotionPart,
    phase = 0,
  ): THREE.Mesh | null {
    if (!this.library?.has(meshName)) return null;
    const mesh = new THREE.Mesh(this.library.require(meshName), this.library.material);
    mesh.position.set(...position);
    mesh.userData['motionPart'] = motionPart;
    mesh.userData['phase'] = phase;
    mesh.userData['basePosition'] = position;
    group.add(mesh);
    return mesh;
  }

  #addSteam(group: THREE.Group, position: [number, number, number]): void {
    for (let index = 0; index < 3; index += 1) {
      this.#addPart(group, STEAM_PUFF_MESH, position, 'steam', index / 3);
    }
  }

  #attachCompletionDust(visual: THREE.Object3D, width: number, depth: number): void {
    if (!this.library?.has(DUST_PUFF_MESH)) return;
    const tile = this.world.grid.tileSize;
    const x = width * tile * 0.34;
    const z = depth * tile * 0.34;
    const positions: [number, number, number][] = [
      [-x, 0.06, -z],
      [x, 0.06, -z],
      [-x, 0.06, z],
      [x, 0.06, z],
    ];
    positions.forEach((position, index) => {
      const puff = new THREE.Mesh(this.library!.require(DUST_PUFF_MESH), this.library!.material);
      puff.position.set(...position);
      puff.visible = false;
      puff.userData['motionPart'] = 'completion-dust' satisfies BuildingMotionPart;
      puff.userData['phase'] = index / positions.length;
      puff.userData['basePosition'] = position;
      visual.add(puff);
    });
  }

  #ghost(): THREE.Material {
    if (this.#ghostMaterial) return this.#ghostMaterial;
    const base = this.library?.material ?? this.materials.barn;
    const ghost = (base as THREE.Material).clone();
    ghost.transparent = true;
    ghost.opacity = 0.45;
    ghost.depthWrite = false;
    this.#ghostMaterial = ghost;
    return ghost;
  }

  #buildStatic(world: FarmWorld): void {
    const tile = world.grid.tileSize;

    const shelterPosition = world.grid.tileToWorld(
      world.level.shelter.tileX,
      world.level.shelter.tileZ,
    );
    let shelter: THREE.Mesh;
    if (this.library?.has(COOP_MESH)) {
      shelter = new THREE.Mesh(this.library.require(COOP_MESH), this.library.material);
      shelter.position.set(shelterPosition.x, 0, shelterPosition.z);
    } else {
      const geometry = new THREE.BoxGeometry(tile * 1.6, 1.8, tile * 1.6);
      this.#owned.push(geometry);
      shelter = new THREE.Mesh(geometry, this.materials.shelter);
      shelter.position.set(shelterPosition.x, 0.9, shelterPosition.z);
    }
    shelter.castShadow = true;
    shelter.receiveShadow = true;
    shelter.userData['static'] = true;
    this.object.add(shelter);

    if (this.library?.has(TROUGH_MESH)) {
      const trough = new THREE.Group();
      const base = new THREE.Mesh(this.library.require(TROUGH_MESH), this.library.material);
      const water = new THREE.Mesh(this.#waterPlane, this.#water.material);
      water.position.y = 0.325;
      water.scale.set(0.84, 1, 0.2);
      water.renderOrder = 3;
      trough.add(base, water);
      trough.position.set(shelterPosition.x - tile * 0.95, 0, shelterPosition.z - tile * 0.72);
      trough.rotation.y = -0.28;
      trough.traverse((node) => {
        node.castShadow = node !== water;
        node.receiveShadow = true;
      });
      trough.userData['static'] = true;
      this.object.add(trough);
    }

    const fallbackRock = (() => {
      const geometry = new THREE.DodecahedronGeometry(tile * 0.45);
      this.#owned.push(geometry);
      return geometry;
    })();
    const authoredScenery = [
      ROCK_MESH,
      ROCK_CLUSTER_MESH,
      TREE_MESH,
      TALL_TREE_MESH,
      WIDE_TREE_MESH,
      DEAD_TREE_MESH,
    ];

    for (const tileCoord of world.level.blockedTiles) {
      const variant =
        authoredScenery[
          Math.abs(tileCoord.tileX * 5 + tileCoord.tileZ * 11) % authoredScenery.length
        ]!;
      const hasVariant = Boolean(this.library?.has(variant));
      const rock = new THREE.Mesh(
        hasVariant ? this.library!.require(variant) : fallbackRock,
        hasVariant && variant === DEAD_TREE_MESH
          ? (this.#deadTreeWind?.material ?? this.library!.material)
          : hasVariant &&
              (variant === TREE_MESH || variant === TALL_TREE_MESH || variant === WIDE_TREE_MESH)
            ? (this.#treeWind?.material ?? this.library!.material)
            : hasVariant
              ? this.library!.material
              : this.materials.rock,
      );
      const at = world.grid.tileToWorld(tileCoord.tileX, tileCoord.tileZ);
      rock.position.set(at.x, hasVariant ? 0 : 0.4, at.z);
      // A per-rock yaw and scale from its tile coordinates: deterministic,
      // free, and enough to stop five identical boulders reading as clones.
      rock.rotation.y = ((tileCoord.tileX * 5 + tileCoord.tileZ * 11) % 9) * 0.7;
      const s = 0.84 + ((tileCoord.tileX * 3 + tileCoord.tileZ) % 5) * 0.08;
      rock.scale.setScalar(s);
      rock.castShadow = true;
      rock.userData['static'] = true;
      this.object.add(rock);
    }
  }

  #disposeNode(node: THREE.Object3D): void {
    const mesh = node as Partial<THREE.Mesh>;
    if (node instanceof THREE.InstancedMesh) node.dispose();
    // Library geometry and the shared material are owned elsewhere; only
    // dispose what this view created.
    if (!this.library) mesh.geometry?.dispose();
    node.removeFromParent();
  }
}

function buildingKey(building: Pick<PlacedBuilding, 'kind' | 'tileX' | 'tileZ'>): string {
  return `${building.kind}:${building.tileX}:${building.tileZ}`;
}

function createWaterPlaneGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, 12, 5);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
