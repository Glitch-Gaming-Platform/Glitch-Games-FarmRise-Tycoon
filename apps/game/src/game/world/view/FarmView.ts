/**
 * Assembles the farm's Three.js graph: lighting, ground, plots, structures and
 * enemies. It owns no simulation state - every frame it reads the model and
 * pushes the result into the scene graph.
 */
import * as THREE from 'three';
import type { RenderContext } from '@engine/core/types.js';
import { createFarmMaterials, type FarmMaterials } from './materials.js';
import { PlotView } from './PlotView.js';
import { StructureView } from './StructureView.js';
import {
  createChickenMotionMaterial,
  createCowMotionMaterial,
  createFoxMotionMaterial,
  createWindMaterial,
  type FoxMotionMaterial,
  type TimeMaterial,
} from './animationMaterials.js';
import { createGroundGeometry, type GroundGeometryOptions } from './groundGeometry.js';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { FarmWorld } from '../FarmWorld.js';
import type { Fox } from '../../enemies/Fox.js';
import type { IncidentInstance } from '@farmrise/shared';
import { ticksToSeconds } from '@farmrise/shared';
import { chickenPose, createChickenPose } from '../../animals/chickenMotion.js';
import { cowPose, createCowPose } from '../../animals/cowMotion.js';
import type { Player } from '../../player/Player.js';
import { CarryView } from './CarryView.js';
import { GroundGoodsView } from './GroundGoodsView.js';
import { ConstructionProgressView } from './ConstructionProgressView.js';
import { ProximityStatusView } from './ProximityStatusView.js';
import { ParcelView } from './ParcelView.js';
import { WorkerView } from './WorkerView.js';
import type { ProximityMeter } from '../../systems/InteractionController.js';
import {
  createFarmGroundOptions,
  groundSampleAt,
  terrainSurfaceAt,
  type TerrainSurface,
} from './terrainProfile.js';

const FOX_MESH = 'SM_animal_fox';
const CHICKEN_MESH = 'SM_animal_chicken';
const COW_MESH = 'SM_animal_cow';
const GRASS_MESH = 'SM_prop_grass_tuft';
const GRASS_CARPET_MESH = 'SM_prop_grass_carpet';
const DIRT_CLODS_MESH = 'SM_prop_dirt_clods';
const BUSH_MESH = 'SM_prop_bush';
const WILDFLOWER_MESH = 'SM_prop_wildflowers';
const SCRUB_PATCH_MESH = 'SM_prop_scrub_patch';
const TREE_MESH = 'SM_prop_eucalyptus';
const TALL_TREE_MESH = 'SM_prop_eucalyptus_tall';
const WIDE_TREE_MESH = 'SM_prop_eucalyptus_wide';
const DEAD_TREE_MESH = 'SM_prop_dead_tree';
const ROCK_CLUSTER_MESH = 'SM_prop_rock_cluster';
const SCENIC_BARN_MESH = 'SM_building_barn';
const SCENIC_TANK_MESH = 'SM_building_irrigation';
const SCENIC_FENCE_MESH = 'SM_building_fence';
const SCENIC_FIELD_MESHES = ['SM_crop_wheat_s4', 'SM_crop_corn_s4', 'SM_crop_pumpkin_s4'] as const;

export interface FarmViewOptions {
  readonly shadowMapSize?: number;
}

export class FarmView {
  #elapsed = 0;
  readonly object = new THREE.Group();
  readonly #materials: FarmMaterials;
  readonly #plots: PlotView;
  readonly #structures: StructureView;
  readonly #parcels: ParcelView;
  readonly #workers = new WorkerView();
  readonly #carry = new CarryView();
  readonly #groundGoods = new GroundGoodsView();
  readonly #constructionProgress = new ConstructionProgressView();
  readonly #proximityStatus = new ProximityStatusView();
  readonly #foxMeshes: THREE.Mesh[] = [];
  readonly #foxMotionMaterials: (FoxMotionMaterial | null)[] = [];
  readonly #foxGeometry: THREE.BufferGeometry;
  readonly #ownsFoxGeometry: boolean;
  readonly #scatter: THREE.InstancedMesh[] = [];
  readonly #fieldWind: TimeMaterial | null;
  readonly #treeWind: TimeMaterial | null;
  readonly #deadTreeWind: TimeMaterial | null;
  readonly #chickenMotion: TimeMaterial | null;
  readonly #cowMotion: TimeMaterial | null;
  readonly #foxPrevious = new WeakMap<Fox, { x: number; z: number }>();
  readonly #foxFacing = new WeakMap<Fox, number>();
  #chickens: THREE.InstancedMesh | null = null;
  readonly #chickenGeometry: THREE.BufferGeometry;
  #cows: THREE.InstancedMesh | null = null;
  readonly #cowGeometry: THREE.BufferGeometry;
  readonly #ground: THREE.Mesh;
  readonly #groundOptions: GroundGeometryOptions;
  readonly #lights: THREE.Object3D[] = [];
  readonly #unsubscribes: (() => void)[] = [];
  #sun: THREE.DirectionalLight | null = null;
  #hemisphere: THREE.HemisphereLight | null = null;
  #weatherBlend = 0;
  #animalPulse: { kind: 'purchase' | 'produce'; startedAt: number | null } | null = null;

  constructor(
    world: FarmWorld,
    private readonly library: ModelLibrary | null = null,
    private readonly options: FarmViewOptions = {},
  ) {
    this.#materials = createFarmMaterials();
    this.#fieldWind = library
      ? createWindMaterial(library.material, {
          key: 'field',
          strength: 0.045,
          speed: 1.45,
          baseHeight: 0.04,
          fullHeight: 0.42,
          tipFlutter: 0.34,
          lateralRatio: 0.32,
        })
      : null;
    this.#treeWind = library
      ? createWindMaterial(library.material, {
          key: 'trees',
          strength: 0.13,
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
          key: 'dead-trees',
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
    this.#chickenMotion = library ? createChickenMotionMaterial(library.material) : null;
    this.#cowMotion = library ? createCowMotionMaterial(library.material) : null;

    const worldWidth = world.grid.width * world.grid.tileSize;
    this.#groundOptions = createFarmGroundOptions(world);
    // The collision grid remains exactly 32x32, but the visible land extends
    // well beyond it so the follow camera never exposes a blue square edge.
    // Fog and border scenery hide the unreachable outer ring naturally.
    //
    // The plane is subdivided and vertex-coloured rather than flat: see
    // groundGeometry.ts for why the largest surface in the frame could not stay
    // a single uniform value. The playable rectangle is still exactly flat.
    const groundGeometry = createGroundGeometry(this.#groundOptions);
    this.#ground = new THREE.Mesh(groundGeometry, this.#materials.ground);
    this.#ground.receiveShadow = true;

    this.#plots = new PlotView(world, this.#materials, library);
    this.#structures = new StructureView(world, this.#materials, library);
    this.#parcels = new ParcelView(world);
    this.#foxGeometry = library?.has(FOX_MESH)
      ? library.require(FOX_MESH)
      : new THREE.ConeGeometry(0.35, 0.9, 8);
    this.#ownsFoxGeometry = !library?.has(FOX_MESH);
    this.#chickenGeometry = library?.has(CHICKEN_MESH)
      ? library.require(CHICKEN_MESH).clone()
      : new THREE.SphereGeometry(0.22, 8, 5).translate(0, 0.22, 0);
    addAnimalInstanceAttributes(this.#chickenGeometry, 64);
    this.#cowGeometry = library?.has(COW_MESH)
      ? library.require(COW_MESH).clone()
      : new THREE.BoxGeometry(0.82, 0.72, 1.35).translate(0, 0.46, 0);
    addAnimalInstanceAttributes(this.#cowGeometry, 16);

    this.object.add(
      this.#ground,
      this.#parcels.object,
      this.#plots.object,
      this.#structures.object,
      this.#workers.object,
      this.#groundGoods.object,
      this.#carry.object,
      this.#constructionProgress.object,
      this.#proximityStatus.object,
    );
    this.#addLighting(worldWidth);
    this.#addScatter(world, this.#groundOptions);
    this.#addFarmsteadBackdrop(world);
    this.#addScenicFields(world);
    this.#addBorderScenery(world);
    if (!library) this.#addGridHelper(world);
    this.#unsubscribes.push(
      world.events.on('world:animal-purchased', () => {
        this.#animalPulse = { kind: 'purchase', startedAt: null };
      }),
      world.events.on('world:produce', () => {
        this.#animalPulse = { kind: 'produce', startedAt: null };
      }),
    );
  }

  sync(
    world: FarmWorld,
    foxes: readonly Fox[],
    incident: IncidentInstance | null,
    context: RenderContext,
    player: Player | null = null,
    proximityMeters: readonly ProximityMeter[] = [],
  ): void {
    this.#elapsed = context.elapsedSeconds;
    this.#fieldWind?.setTime(context.elapsedSeconds);
    this.#treeWind?.setTime(context.elapsedSeconds);
    this.#deadTreeWind?.setTime(context.elapsedSeconds);
    this.#chickenMotion?.setTime(context.elapsedSeconds);
    this.#cowMotion?.setTime(context.elapsedSeconds);
    if (this.#animalPulse?.startedAt === null) {
      this.#animalPulse.startedAt = context.elapsedSeconds;
    }
    this.#updateWeather(incident, context);
    this.#plots.animate(context.elapsedSeconds);
    this.#structures.animate(context.elapsedSeconds);
    this.#plots.sync(world);
    this.#structures.sync(world);
    this.#parcels.sync(world);
    this.#workers.sync(world, context.elapsedSeconds);
    this.#groundGoods.sync(world);
    this.#carry.sync(world, player, context.elapsedSeconds);
    this.#constructionProgress.sync(world);
    this.#proximityStatus.sync(world, proximityMeters);
    this.#structures.animatePreview(this.#elapsed);
    this.#syncFoxes(foxes, context);
    this.#syncChickens(world, context);
    this.#syncCows(world, context);
    const pulseStartedAt = this.#animalPulse?.startedAt;
    if (
      pulseStartedAt !== null &&
      pulseStartedAt !== undefined &&
      context.elapsedSeconds - pulseStartedAt >= 0.82
    ) {
      this.#animalPulse = null;
    }
  }

  /** Replaces placeholder crop buckets after a seasonal GLB is loaded. */
  refreshCropGeometry(cropIds: readonly string[]): void {
    this.#plots.refreshCropGeometry(cropIds);
  }

  /** Pass-through so the session binding never reaches into StructureView. */
  setPlacementPreview(
    world: FarmWorld,
    kind: Parameters<StructureView['setPlacementPreview']>[1],
    tileX?: number,
    tileZ?: number,
    valid?: boolean,
  ): void {
    this.#structures.setPlacementPreview(world, kind, tileX, tileZ, valid);
  }

  /** Surface under an actor, shared with terrain-colour and scatter logic. */
  surfaceAt(world: FarmWorld, x: number, z: number): TerrainSurface {
    return terrainSurfaceAt(world, this.#groundOptions, x, z);
  }

  dispose(): void {
    this.#plots.dispose();
    this.#structures.dispose();
    this.#parcels.dispose();
    this.#workers.dispose();
    this.#groundGoods.dispose();
    this.#carry.dispose();
    this.#constructionProgress.dispose();
    this.#proximityStatus.dispose();
    this.#ground.geometry.dispose();
    if (this.#ownsFoxGeometry) this.#foxGeometry.dispose();
    this.#chickenGeometry.dispose();
    this.#cowGeometry.dispose();
    for (const mesh of this.#scatter) mesh.dispose();
    this.#chickens?.dispose();
    this.#chickens = null;
    this.#cows?.dispose();
    this.#cows = null;
    this.#fieldWind?.dispose();
    this.#treeWind?.dispose();
    this.#deadTreeWind?.dispose();
    this.#chickenMotion?.dispose();
    this.#cowMotion?.dispose();
    for (const material of this.#foxMotionMaterials) material?.dispose();
    this.#foxMotionMaterials.length = 0;
    for (const unsubscribe of this.#unsubscribes) unsubscribe();
    this.#unsubscribes.length = 0;
    for (const light of this.#lights) light.removeFromParent();
    this.#materials.dispose();
    this.object.clear();
  }

  #addLighting(worldWidth: number): void {
    // Hemisphere light for cheap ambient bounce; a single directional light for
    // the sun and the only shadow-casting source. More shadow casters is the
    // fastest way to lose a mid-range mobile GPU.
    const hemisphere = new THREE.HemisphereLight(0xc7e4ff, 0xb06a32, 1.24);

    const sun = new THREE.DirectionalLight(0xfff0cf, 2.18);
    sun.position.set(worldWidth * 0.35, worldWidth * 0.9, worldWidth * 0.25);
    sun.castShadow = true;
    const shadowMapSize = this.options.shadowMapSize ?? 1024;
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const extent = worldWidth * 0.75;
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.camera.far = worldWidth * 2.5;
    // Without a bias, large shadow-camera extents produce acne on flat ground.
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.012;
    sun.shadow.radius = 2;

    this.#lights.push(hemisphere, sun);
    this.#hemisphere = hemisphere;
    this.#sun = sun;
    this.object.add(hemisphere, sun);
  }

  #updateWeather(incident: IncidentInstance | null, context: RenderContext): void {
    const drought = incident?.definitionId === 'incident-drought' ? incident : null;
    // Partial mitigation reads as partial weather: a player who watered half
    // the marked beds should be able to see that it worked, from the sky.
    const mitigation = drought ? Math.min(1, drought.responseProgress / 3) : 0;
    const target = drought
      ? context.elapsedSeconds >= 0 && drought.appliedMultiplier === null
        ? 0.18
        : 1 - 0.62 * mitigation
      : 0;
    const response = 1 - Math.exp(-context.deltaSeconds * 1.8);
    this.#weatherBlend += (target - this.#weatherBlend) * response;
    if (this.#sun) {
      this.#sun.color.lerpColors(NORMAL_SUN, DROUGHT_SUN, this.#weatherBlend);
      this.#sun.intensity = 2.18 + this.#weatherBlend * 0.42;
    }
    if (this.#hemisphere) {
      this.#hemisphere.color.lerpColors(NORMAL_SKY_FILL, DROUGHT_SKY_FILL, this.#weatherBlend);
      this.#hemisphere.groundColor.lerpColors(
        NORMAL_GROUND_FILL,
        DROUGHT_GROUND_FILL,
        this.#weatherBlend,
      );
    }
  }

  /**
   * Chickens milling around the shelter.
   *
   * The flock is a COUNT in the simulation, not a list of positioned
   * animals, so the view invents plausible positions around the coop. They
   * are drawn as one InstancedMesh: a player who buys twenty chickens should
   * not pay twenty draw calls for them.
   */
  #syncChickens(world: FarmWorld, context: RenderContext): void {
    const total = world.animals
      .filter((group) => group.species === 'chicken')
      .reduce((sum, group) => sum + group.count, 0);
    if (!this.#chickens) {
      if (total === 0) return;
      this.#chickens = new THREE.InstancedMesh(
        this.#chickenGeometry,
        this.#chickenMotion?.material ?? this.library?.material ?? this.#materials.animal,
        64,
      );
      this.#chickens.castShadow = true;
      // Their instance transforms move every frame. Static bounds can lag one
      // update behind and make a healthy flock seem to disappear temporarily.
      this.#chickens.frustumCulled = false;
      this.#chickens.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.object.add(this.#chickens);
    }

    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const count = Math.min(total, 64);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    // Simulation time drives position so the visual and collision paths are
    // identical. Real render time still drives the one-shot presentation pulse.
    const simulationTime = ticksToSeconds(world.tick + context.alpha);
    const presentationTime = context.elapsedSeconds;
    const pulseAge =
      this.#animalPulse?.startedAt === null || !this.#animalPulse
        ? 99
        : presentationTime - this.#animalPulse.startedAt;
    const purchaseIntro =
      this.#animalPulse?.kind === 'purchase' && pulseAge < 0.72 ? Math.min(1, pulseAge / 0.3) : 1;
    const animalHop =
      this.#animalPulse && pulseAge < 0.82
        ? Math.sin(Math.min(1, pulseAge / 0.82) * Math.PI) *
          (this.#animalPulse.kind === 'produce' ? 0.16 : 0.1)
        : 0;
    const pose = createChickenPose();
    const attributes = getAnimalInstanceAttributes(this.#chickenGeometry);
    for (let i = 0; i < count; i += 1) {
      chickenPose(shelter, i, count, simulationTime, animalHop, purchaseIntro, pose);
      matrix.compose(
        new THREE.Vector3(pose.x, pose.y, pose.z),
        quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, pose.roll)),
        new THREE.Vector3(pose.scaleX * 1.18, pose.scaleY * 1.18, pose.scaleZ * 1.18),
      );
      this.#chickens.setMatrixAt(i, matrix);
      writeAnimalInstanceAttributes(attributes, i, pose.motion, pose.action, pose.gaitPhase);
    }
    this.#chickens.count = count;
    this.#chickens.instanceMatrix.needsUpdate = true;
    markAnimalInstanceAttributesDirty(attributes);
  }

  /** Dairy cows use the same deterministic positions for visuals and collision. */
  #syncCows(world: FarmWorld, context: RenderContext): void {
    const total = world.animals
      .filter((group) => group.species === 'cow')
      .reduce((sum, group) => sum + group.count, 0);
    if (!this.#cows) {
      if (total === 0) return;
      this.#cows = new THREE.InstancedMesh(
        this.#cowGeometry,
        this.#cowMotion?.material ?? this.library?.material ?? this.#materials.animal,
        16,
      );
      this.#cows.castShadow = true;
      this.#cows.frustumCulled = false;
      this.#cows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.object.add(this.#cows);
    }

    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const count = Math.min(total, 16);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pose = createCowPose();
    const simulationTime = ticksToSeconds(world.tick + context.alpha);
    const pulseStart = this.#animalPulse?.startedAt;
    const pulseAge =
      pulseStart === null || pulseStart === undefined ? 99 : context.elapsedSeconds - pulseStart;
    const purchaseIntro =
      this.#animalPulse?.kind === 'purchase' && pulseAge < 0.72 ? Math.min(1, pulseAge / 0.3) : 1;
    const attributes = getAnimalInstanceAttributes(this.#cowGeometry);

    for (let index = 0; index < count; index += 1) {
      cowPose(shelter, index, count, simulationTime, purchaseIntro, pose);
      matrix.compose(
        new THREE.Vector3(pose.x, pose.y, pose.z),
        quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, pose.roll)),
        new THREE.Vector3(pose.scaleX, pose.scaleY, pose.scaleZ),
      );
      this.#cows.setMatrixAt(index, matrix);
      writeAnimalInstanceAttributes(attributes, index, pose.motion, pose.graze, pose.gaitPhase);
    }
    this.#cows.count = count;
    this.#cows.instanceMatrix.needsUpdate = true;
    markAnimalInstanceAttributesDirty(attributes);
  }

  /**
   * Grass tufts and bushes across the open scrub.
   *
   * Added after the first art review, where large unbroken areas of flat
   * gold read as empty rather than as land. Deterministic placement from
   * tile coordinates keeps it stable between sessions and costs no RNG.
   */
  #addScatter(world: FarmWorld, groundOptions: GroundGeometryOptions): void {
    if (!this.library?.has(GRASS_MESH)) return;
    const grid = world.grid;

    for (const [name, count, step] of [
      [SCRUB_PATCH_MESH, 22, 2] as const,
      [DIRT_CLODS_MESH, 120, 1] as const,
      [GRASS_CARPET_MESH, 150, 1] as const,
      [GRASS_MESH, 280, 1] as const,
      [WILDFLOWER_MESH, 36, 2] as const,
      [BUSH_MESH, 20, 3] as const,
    ]) {
      if (!this.library.has(name)) continue;
      const mesh = new THREE.InstancedMesh(
        this.library.require(name),
        name === SCRUB_PATCH_MESH || name === DIRT_CLODS_MESH
          ? this.library.material
          : (this.#fieldWind?.material ?? this.library.material),
        count,
      );
      mesh.castShadow =
        name !== SCRUB_PATCH_MESH && name !== GRASS_CARPET_MESH && name !== DIRT_CLODS_MESH;
      mesh.receiveShadow = true;
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const tint = new THREE.Color();
      let placed = 0;
      for (let i = 0; placed < count && i < grid.tileCount * 12; i += step) {
        // 73 is coprime with the 256-tile starter grid, so this permutation
        // visits the whole farm before repeating. The previous two-axis hash
        // repeated every 16 samples and stacked most instances into clumps.
        const candidate = (i * 73 + name.length * 19) % grid.tileCount;
        const tx = candidate % grid.width;
        const tz = Math.floor(candidate / grid.width);
        // Never dress a tile that gameplay owns: soil, roads and buildings.
        if (grid.getFlags(tx, tz) !== 0) continue;
        const at = grid.tileToWorld(tx, tz);
        const jitterX = (((i * 31) % 100) / 100 - 0.5) * grid.tileSize * 0.8;
        const jitterZ = (((i * 57) % 100) / 100 - 0.5) * grid.tileSize * 0.8;
        const variation = ((i * 43) % 100) / 100;
        const surface = groundSampleAt(groundOptions, at.x + jitterX, at.z + jitterZ);
        const density =
          name === SCRUB_PATCH_MESH
            ? 0.12 + surface.localEarth * 0.72 - surface.localPasture * 0.42 - surface.worn * 0.7
            : name === DIRT_CLODS_MESH
              ? 0.08 + surface.localEarth * 0.65 - surface.localPasture * 0.38 - surface.worn * 0.34
              : name === GRASS_CARPET_MESH
                ? 0.04 + surface.localPasture * 0.84 - surface.localEarth * 0.28
                : name === GRASS_MESH
                  ? 0.08 + surface.localPasture * 0.78 + (1 - surface.localEarth) * 0.16
                  : name === WILDFLOWER_MESH
                    ? surface.localPasture * 0.48 + (1 - surface.localEarth) * 0.09
                    : 0.08 + surface.localPasture * 0.34 + (1 - surface.localEarth) * 0.1;
        // Different arithmetic from the tile permutation prevents visible
        // diagonal bands while keeping the whole dressing deterministic.
        const acceptance = ((i * 89 + name.length * 31 + tx * 17 + tz * 47) % 101) / 100;
        if (acceptance > Math.max(0.02, Math.min(0.94, density))) continue;
        const baseScale =
          name === SCRUB_PATCH_MESH || name === GRASS_CARPET_MESH || name === DIRT_CLODS_MESH
            ? 0.62 + variation * 0.48
            : name === BUSH_MESH
              ? 0.82 + variation * 0.42
              : 0.86 + variation * 0.3;
        matrix.compose(
          new THREE.Vector3(at.x + jitterX, 0, at.z + jitterZ),
          quaternion.setFromAxisAngle(up, (((i * 17) % 100) / 100) * Math.PI * 2),
          new THREE.Vector3(baseScale, baseScale, baseScale),
        );
        mesh.setMatrixAt(placed, matrix);
        if (name === GRASS_CARPET_MESH) {
          // Multiplicative instance colour gives one authored patch several
          // meadow values without another material or another draw call.
          tint.setRGB(0.9 + variation * 0.12, 0.94 + variation * 0.1, 0.86 + variation * 0.1);
          mesh.setColorAt(placed, tint);
        } else if (name === DIRT_CLODS_MESH) {
          tint.setRGB(0.92 + variation * 0.11, 0.88 + variation * 0.12, 0.84 + variation * 0.14);
          mesh.setColorAt(placed, tint);
        }
        placed += 1;
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.#scatter.push(mesh);
      this.object.add(mesh);
    }
  }

  /**
   * A low-cost outback tree line outside the playable grid.
   *
   * These objects are deliberately beyond the physics bounds, so they enrich
   * the horizon without becoming invisible collision or occupying buildable
   * tiles. Three instanced meshes cover the whole perimeter.
   */
  #addBorderScenery(world: FarmWorld): void {
    if (!this.library) return;
    const halfWidth = (world.grid.width * world.grid.tileSize) / 2;
    const halfDepth = (world.grid.depth * world.grid.tileSize) / 2;

    for (const [name, count] of [
      [TREE_MESH, 16] as const,
      [TALL_TREE_MESH, 10] as const,
      [WIDE_TREE_MESH, 10] as const,
      [DEAD_TREE_MESH, 6] as const,
      [ROCK_CLUSTER_MESH, 12] as const,
    ]) {
      if (!this.library.has(name)) continue;
      const mesh = new THREE.InstancedMesh(
        this.library.require(name),
        name === ROCK_CLUSTER_MESH
          ? this.library.material
          : name === DEAD_TREE_MESH
            ? (this.#deadTreeWind?.material ?? this.library.material)
            : (this.#treeWind?.material ?? this.library.material),
        count,
      );
      mesh.castShadow = name !== ROCK_CLUSTER_MESH;
      mesh.receiveShadow = true;

      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const familySeed = [...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
      for (let i = 0; i < count; i += 1) {
        const side = (i + familySeed) % 4;
        const along = (((i * 37 + 11 + familySeed * 13) % 101) / 100) * 2 - 1;
        const margin = world.grid.tileSize * (1.2 + ((i * 17 + familySeed) % 4) * 0.55);
        let x = along * halfWidth * 1.32;
        let z = along * halfDepth * 1.32;
        if (side === 0) z = -halfDepth - margin;
        if (side === 1) x = halfWidth + margin;
        if (side === 2) z = halfDepth + margin;
        if (side === 3) x = -halfWidth - margin;

        const variation = ((i * 43 + name.length * 7) % 100) / 100;
        const scale =
          name === TREE_MESH || name === TALL_TREE_MESH || name === WIDE_TREE_MESH
            ? 1.05 + variation * 0.62
            : name === DEAD_TREE_MESH
              ? 0.9 + variation * 0.35
              : 0.82 + variation * 0.42;
        matrix.compose(
          new THREE.Vector3(x, 0, z),
          quaternion.setFromAxisAngle(up, variation * Math.PI * 2),
          new THREE.Vector3(scale, scale, scale),
        );
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.#scatter.push(mesh);
      this.object.add(mesh);
    }
  }

  /**
   * A distant, unreachable homestead cluster gives the opening shot a clear
   * horizon landmark without consuming buildable tiles or changing rules.
   */
  #addFarmsteadBackdrop(world: FarmWorld): void {
    if (!this.library) return;
    const halfWidth = (world.grid.width * world.grid.tileSize) / 2;
    const halfDepth = (world.grid.depth * world.grid.tileSize) / 2;

    if (this.library.has(SCENIC_BARN_MESH)) {
      const barn = new THREE.Mesh(this.library.require(SCENIC_BARN_MESH), this.library.material);
      barn.position.set(-halfWidth * 0.48, 0, -halfDepth - 1.8);
      barn.scale.setScalar(0.92);
      barn.castShadow = true;
      barn.receiveShadow = true;
      this.object.add(barn);
    }

    if (this.library.has(SCENIC_TANK_MESH)) {
      const tank = new THREE.Mesh(this.library.require(SCENIC_TANK_MESH), this.library.material);
      tank.position.set(halfWidth * 0.52, 0, -halfDepth - 1.2);
      tank.rotation.y = -0.16;
      tank.scale.setScalar(0.9);
      tank.castShadow = true;
      tank.receiveShadow = true;
      this.object.add(tank);
    }

    if (this.library.has(SCENIC_FENCE_MESH)) {
      const fence = new THREE.InstancedMesh(
        this.library.require(SCENIC_FENCE_MESH),
        this.library.material,
        5,
      );
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < 5; index += 1) {
        matrix.makeTranslation(-halfWidth * 0.12 + index * 1.9, 0, -halfDepth - 0.85);
        fence.setMatrixAt(index, matrix);
      }
      fence.castShadow = true;
      fence.receiveShadow = true;
      fence.instanceMatrix.needsUpdate = true;
      this.#scatter.push(fence);
      this.object.add(fence);
    }
  }

  /**
   * Mature neighbour fields beyond the playable boundary keep the opening
   * vista agricultural before the tutorial has asked the player to sow their
   * first interactive bed. They are deliberately outside the grid: the farm
   * simulation remains honest, while the horizon no longer reads as an empty
   * ochre test plane. Three instanced draws provide crop colour, vertical
   * rhythm and wind motion for less geometry than one close-up character.
   */
  #addScenicFields(world: FarmWorld): void {
    if (!this.library) return;
    const halfWidth = (world.grid.width * world.grid.tileSize) / 2;
    const halfDepth = (world.grid.depth * world.grid.tileSize) / 2;
    const rowDefinitions = [
      { name: SCENIC_FIELD_MESHES[0], count: 8, startX: -halfWidth * 0.05, z: -halfDepth - 2.2 },
      { name: SCENIC_FIELD_MESHES[1], count: 6, startX: -halfWidth * 0.82, z: -halfDepth - 3.9 },
      { name: SCENIC_FIELD_MESHES[2], count: 5, startX: halfWidth * 0.5, z: -halfDepth - 3.5 },
    ] as const;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    for (const row of rowDefinitions) {
      if (!this.library.has(row.name)) continue;
      const field = new THREE.InstancedMesh(
        this.library.require(row.name),
        this.#fieldWind?.material ?? this.library.material,
        row.count,
      );
      field.castShadow = true;
      field.receiveShadow = true;
      for (let index = 0; index < row.count; index += 1) {
        const column = index % 4;
        const line = Math.floor(index / 4);
        const scale = 0.78 + ((index * 17) % 5) * 0.035;
        matrix.compose(
          new THREE.Vector3(row.startX + column * 1.45, 0, row.z - line * 1.45),
          quaternion.setFromAxisAngle(up, (index % 2 === 0 ? -1 : 1) * 0.08),
          new THREE.Vector3(scale, scale, scale),
        );
        field.setMatrixAt(index, matrix);
      }
      field.instanceMatrix.needsUpdate = true;
      this.#scatter.push(field);
      this.object.add(field);
    }
  }

  #addGridHelper(world: FarmWorld): void {
    const helper = new THREE.GridHelper(
      world.grid.width * world.grid.tileSize,
      world.grid.width,
      0x2f4a2a,
      0x2f4a2a,
    );
    const material = helper.material as THREE.Material;
    material.transparent = true;
    material.opacity = 0.25;
    helper.position.y = 0.01;
    this.#lights.push(helper);
    this.object.add(helper);
  }

  #syncFoxes(foxes: readonly Fox[], context: RenderContext): void {
    while (this.#foxMeshes.length < foxes.length) {
      const motionMaterial = this.library ? createFoxMotionMaterial(this.library.material) : null;
      const mesh = new THREE.Mesh(
        this.#foxGeometry,
        motionMaterial?.material ?? this.#materials.fox,
      );
      mesh.castShadow = true;
      this.#foxMotionMaterials.push(motionMaterial);
      this.#foxMeshes.push(mesh);
      this.object.add(mesh);
    }
    this.#foxMeshes.forEach((mesh, index) => {
      const fox = foxes[index];
      mesh.visible = Boolean(fox);
      if (fox) {
        const previous = this.#foxPrevious.get(fox) ?? fox.position;
        const dx = fox.position.x - previous.x;
        const dz = fox.position.z - previous.z;
        const moving = Math.hypot(dx, dz) > 0.0001 && fox.state !== 'raiding';
        const pace = fox.state === 'fleeing' ? 13.0 : 8.5;
        const phase = context.elapsedSeconds * pace + index * 1.9;
        const stride = moving ? Math.sin(phase) : 0;
        const baseY = this.#ownsFoxGeometry ? 0.45 : 0;
        const raidPounce = fox.state === 'raiding' ? Math.max(0, Math.sin(phase * 0.62)) : 0;
        const motionMaterial = this.#foxMotionMaterials[index];
        motionMaterial?.setTime(context.elapsedSeconds);
        motionMaterial?.setMotion(
          moving ? 1 : 0,
          raidPounce,
          fox.state === 'fleeing' ? 1 : 0,
          fox.state === 'fleeing' ? 3.1 : 1.9,
          index * 0.31,
        );
        mesh.position.set(
          fox.position.x,
          baseY +
            (moving
              ? Math.abs(stride) * 0.045
              : raidPounce * 0.07 + Math.sin(phase * 0.25) * 0.012),
          fox.position.z,
        );
        if (moving) {
          const targetFacing = Math.atan2(dx, dz);
          const currentFacing = this.#foxFacing.get(fox) ?? targetFacing;
          const facing = lerpAngle(currentFacing, targetFacing, 0.24);
          mesh.rotation.y = facing;
          this.#foxFacing.set(fox, facing);
        }
        mesh.rotation.x = -0.035 - raidPounce * 0.24;
        mesh.rotation.z = moving ? stride * 0.055 : Math.sin(phase * 0.33) * 0.018;
        const stretch = moving ? Math.abs(stride) * 0.035 : 0;
        const visualScale = 1.18;
        mesh.scale.set(
          visualScale * (1 - stretch * 0.4 + raidPounce * 0.035),
          visualScale * (1 - stretch - raidPounce * 0.055),
          visualScale * (1 + stretch + raidPounce * 0.1),
        );
        this.#foxPrevious.set(fox, { x: fox.position.x, z: fox.position.z });
      }
    });
  }
}

const NORMAL_SUN = new THREE.Color(0xfff0cf);
const DROUGHT_SUN = new THREE.Color(0xe6c85d); // ground_scrub_sun
const NORMAL_SKY_FILL = new THREE.Color(0xc7e4ff);
const DROUGHT_SKY_FILL = new THREE.Color(0xa7d7e8); // sky_haze
const NORMAL_GROUND_FILL = new THREE.Color(0xb06a32);
const DROUGHT_GROUND_FILL = new THREE.Color(0xb9603a); // soil_dry

function lerpAngle(from: number, to: number, amount: number): number {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
}

interface AnimalInstanceAttributes {
  readonly motion: THREE.InstancedBufferAttribute;
  readonly action: THREE.InstancedBufferAttribute;
  readonly gaitPhase: THREE.InstancedBufferAttribute;
}

function addAnimalInstanceAttributes(geometry: THREE.BufferGeometry, capacity: number): void {
  geometry.setAttribute(
    'farmMotion',
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    'farmAction',
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    'farmGaitPhase',
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
}

function getAnimalInstanceAttributes(geometry: THREE.BufferGeometry): AnimalInstanceAttributes {
  return {
    motion: geometry.getAttribute('farmMotion') as THREE.InstancedBufferAttribute,
    action: geometry.getAttribute('farmAction') as THREE.InstancedBufferAttribute,
    gaitPhase: geometry.getAttribute('farmGaitPhase') as THREE.InstancedBufferAttribute,
  };
}

function writeAnimalInstanceAttributes(
  attributes: AnimalInstanceAttributes,
  index: number,
  motion: number,
  action: number,
  gaitPhase: number,
): void {
  attributes.motion.setX(index, motion);
  attributes.action.setX(index, action);
  attributes.gaitPhase.setX(index, gaitPhase);
}

function markAnimalInstanceAttributesDirty(attributes: AnimalInstanceAttributes): void {
  attributes.motion.needsUpdate = true;
  attributes.action.needsUpdate = true;
  attributes.gaitPhase.needsUpdate = true;
}
