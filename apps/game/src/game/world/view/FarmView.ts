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
  createFoxMotionMaterial,
  createWindMaterial,
  type TimeMaterial,
} from './animationMaterials.js';
import { createGroundGeometry } from './groundGeometry.js';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { FarmWorld } from '../FarmWorld.js';
import type { Fox } from '../../enemies/Fox.js';
import type { ActiveFarmEvent } from '../../events/EventDirector.js';
import { ticksToSeconds } from '@farmrise/shared';
import { chickenPose, createChickenPose } from '../../animals/chickenMotion.js';

const FOX_MESH = 'SM_animal_fox';
const CHICKEN_MESH = 'SM_animal_chicken';
const GRASS_MESH = 'SM_prop_grass_tuft';
const BUSH_MESH = 'SM_prop_bush';
const WILDFLOWER_MESH = 'SM_prop_wildflowers';
const SCRUB_PATCH_MESH = 'SM_prop_scrub_patch';
const TREE_MESH = 'SM_prop_eucalyptus';
const TALL_TREE_MESH = 'SM_prop_eucalyptus_tall';
const DEAD_TREE_MESH = 'SM_prop_dead_tree';
const ROCK_CLUSTER_MESH = 'SM_prop_rock_cluster';

export class FarmView {
  #elapsed = 0;
  readonly object = new THREE.Group();
  readonly #materials: FarmMaterials;
  readonly #plots: PlotView;
  readonly #structures: StructureView;
  readonly #foxMeshes: THREE.Mesh[] = [];
  readonly #foxGeometry: THREE.BufferGeometry;
  readonly #ownsFoxGeometry: boolean = true;
  readonly #scatter: THREE.InstancedMesh[] = [];
  readonly #fieldWind: TimeMaterial | null;
  readonly #treeWind: TimeMaterial | null;
  readonly #chickenMotion: TimeMaterial | null;
  readonly #foxMotion: TimeMaterial | null;
  readonly #foxPrevious = new WeakMap<Fox, { x: number; z: number }>();
  #chickens: THREE.InstancedMesh | null = null;
  readonly #ground: THREE.Mesh;
  readonly #lights: THREE.Object3D[] = [];
  readonly #unsubscribes: (() => void)[] = [];
  #sun: THREE.DirectionalLight | null = null;
  #hemisphere: THREE.HemisphereLight | null = null;
  #weatherBlend = 0;
  #animalPulse: { kind: 'purchase' | 'produce'; startedAt: number | null } | null = null;

  constructor(
    world: FarmWorld,
    private readonly library: ModelLibrary | null = null,
  ) {
    this.#materials = createFarmMaterials();
    this.#fieldWind = library
      ? createWindMaterial(library.material, {
          key: 'field',
          strength: 0.045,
          speed: 1.45,
          baseHeight: 0.04,
          fullHeight: 0.42,
        })
      : null;
    this.#treeWind = library
      ? createWindMaterial(library.material, {
          key: 'trees',
          strength: 0.13,
          speed: 0.82,
          baseHeight: 0.72,
          fullHeight: 2.35,
        })
      : null;
    this.#chickenMotion = library ? createChickenMotionMaterial(library.material) : null;
    this.#foxMotion = library ? createFoxMotionMaterial(library.material) : null;

    const worldWidth = world.grid.width * world.grid.tileSize;
    const worldDepth = world.grid.depth * world.grid.tileSize;
    // The collision grid remains exactly 16x16, but the visible land extends
    // well beyond it so the follow camera never exposes a blue square edge.
    // Fog and border scenery hide the unreachable outer ring naturally.
    //
    // The plane is subdivided and vertex-coloured rather than flat: see
    // groundGeometry.ts for why the largest surface in the frame could not stay
    // a single uniform value. The playable rectangle is still exactly flat.
    const groundGeometry = createGroundGeometry({
      playableWidth: worldWidth,
      playableDepth: worldDepth,
      extentScale: 3,
    });
    this.#ground = new THREE.Mesh(groundGeometry, this.#materials.ground);
    this.#ground.receiveShadow = true;

    this.#plots = new PlotView(world, this.#materials, library);
    this.#structures = new StructureView(world, this.#materials, library);
    this.#foxGeometry = library?.has(FOX_MESH)
      ? library.require(FOX_MESH)
      : new THREE.ConeGeometry(0.35, 0.9, 8);
    this.#ownsFoxGeometry = !library?.has(FOX_MESH);

    this.object.add(this.#ground, this.#plots.object, this.#structures.object);
    this.#addLighting(worldWidth);
    this.#addScatter(world);
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
    event: ActiveFarmEvent | null,
    context: RenderContext,
  ): void {
    this.#elapsed = context.elapsedSeconds;
    this.#fieldWind?.setTime(context.elapsedSeconds);
    this.#treeWind?.setTime(context.elapsedSeconds);
    this.#chickenMotion?.setTime(context.elapsedSeconds);
    this.#foxMotion?.setTime(context.elapsedSeconds);
    this.#updateWeather(event, context);
    this.#plots.animate(context.elapsedSeconds);
    this.#structures.animate(context.elapsedSeconds);
    this.#plots.sync(world);
    this.#structures.sync(world);
    this.#structures.animatePreview(this.#elapsed);
    this.#syncFoxes(foxes, context);
    this.#syncChickens(world, context);
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

  dispose(): void {
    this.#plots.dispose();
    this.#structures.dispose();
    this.#ground.geometry.dispose();
    if (this.#ownsFoxGeometry) this.#foxGeometry.dispose();
    for (const mesh of this.#scatter) mesh.dispose();
    this.#chickens?.dispose();
    this.#chickens = null;
    this.#fieldWind?.dispose();
    this.#treeWind?.dispose();
    this.#chickenMotion?.dispose();
    this.#foxMotion?.dispose();
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
    const hemisphere = new THREE.HemisphereLight(0xc7e4ff, 0xb06a32, 1.15);

    const sun = new THREE.DirectionalLight(0xfff0cf, 2.3);
    sun.position.set(worldWidth * 0.4, worldWidth * 0.6, worldWidth * 0.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const extent = worldWidth * 0.75;
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.camera.far = worldWidth * 2.5;
    // Without a bias, large shadow-camera extents produce acne on flat ground.
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.012;

    this.#lights.push(hemisphere, sun);
    this.#hemisphere = hemisphere;
    this.#sun = sun;
    this.object.add(hemisphere, sun);
  }

  #updateWeather(event: ActiveFarmEvent | null, context: RenderContext): void {
    const drought = event?.kind === 'drought' ? event : null;
    const target = drought
      ? drought.phase === 'warning'
        ? 0.18
        : drought.mitigated
          ? 0.38
          : 1
      : 0;
    const response = 1 - Math.exp(-context.deltaSeconds * 1.8);
    this.#weatherBlend += (target - this.#weatherBlend) * response;
    if (this.#sun) {
      this.#sun.color.lerpColors(NORMAL_SUN, DROUGHT_SUN, this.#weatherBlend);
      this.#sun.intensity = 2.3 + this.#weatherBlend * 0.42;
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
    const total = world.animals.reduce((sum, group) => sum + group.count, 0);
    if (!this.#chickens) {
      if (!this.library?.has(CHICKEN_MESH) || total === 0) return;
      this.#chickens = new THREE.InstancedMesh(
        this.library.require(CHICKEN_MESH),
        this.#chickenMotion?.material ?? this.library.material,
        64,
      );
      this.#chickens.castShadow = true;
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
    if (this.#animalPulse?.startedAt === null) this.#animalPulse.startedAt = presentationTime;
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
    for (let i = 0; i < count; i += 1) {
      chickenPose(shelter, i, count, simulationTime, animalHop, purchaseIntro, pose);
      matrix.compose(
        new THREE.Vector3(pose.x, pose.y, pose.z),
        quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, pose.roll)),
        new THREE.Vector3(pose.scaleX, pose.scaleY, pose.scaleZ),
      );
      this.#chickens.setMatrixAt(i, matrix);
    }
    this.#chickens.count = count;
    this.#chickens.instanceMatrix.needsUpdate = true;
    if (this.#animalPulse && pulseAge >= 0.82) this.#animalPulse = null;
  }

  /**
   * Grass tufts and bushes across the open scrub.
   *
   * Added after the first art review, where large unbroken areas of flat
   * gold read as empty rather than as land. Deterministic placement from
   * tile coordinates keeps it stable between sessions and costs no RNG.
   */
  #addScatter(world: FarmWorld): void {
    if (!this.library?.has(GRASS_MESH)) return;
    const grid = world.grid;

    for (const [name, count, step] of [
      [SCRUB_PATCH_MESH, 14, 2] as const,
      [GRASS_MESH, 150, 1] as const,
      [WILDFLOWER_MESH, 20, 2] as const,
      [BUSH_MESH, 14, 3] as const,
    ]) {
      if (!this.library.has(name)) continue;
      const mesh = new THREE.InstancedMesh(
        this.library.require(name),
        name === SCRUB_PATCH_MESH
          ? this.library.material
          : (this.#fieldWind?.material ?? this.library.material),
        count,
      );
      mesh.castShadow = name !== SCRUB_PATCH_MESH;
      mesh.receiveShadow = true;
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      let placed = 0;
      for (let i = 0; placed < count && i < grid.tileCount * 2; i += step) {
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
        const baseScale =
          name === SCRUB_PATCH_MESH
            ? 0.9 + variation * 0.65
            : name === BUSH_MESH
              ? 0.82 + variation * 0.42
              : 0.86 + variation * 0.3;
        matrix.compose(
          new THREE.Vector3(at.x + jitterX, 0, at.z + jitterZ),
          quaternion.setFromAxisAngle(up, (((i * 17) % 100) / 100) * Math.PI * 2),
          new THREE.Vector3(baseScale, baseScale, baseScale),
        );
        mesh.setMatrixAt(placed, matrix);
        placed += 1;
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
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
      [TREE_MESH, 30] as const,
      [TALL_TREE_MESH, 16] as const,
      [DEAD_TREE_MESH, 7] as const,
      [ROCK_CLUSTER_MESH, 14] as const,
    ]) {
      if (!this.library.has(name)) continue;
      const mesh = new THREE.InstancedMesh(
        this.library.require(name),
        name === ROCK_CLUSTER_MESH
          ? this.library.material
          : (this.#treeWind?.material ?? this.library.material),
        count,
      );
      mesh.castShadow = name !== ROCK_CLUSTER_MESH;
      mesh.receiveShadow = true;

      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < count; i += 1) {
        const side = i % 4;
        const along = (((i * 37 + 11) % 101) / 100) * 2 - 1;
        const margin = world.grid.tileSize * (1.2 + ((i * 17) % 4) * 0.55);
        let x = along * halfWidth * 1.32;
        let z = along * halfDepth * 1.32;
        if (side === 0) z = -halfDepth - margin;
        if (side === 1) x = halfWidth + margin;
        if (side === 2) z = halfDepth + margin;
        if (side === 3) x = -halfWidth - margin;

        const variation = ((i * 43 + name.length * 7) % 100) / 100;
        const scale =
          name === TREE_MESH || name === TALL_TREE_MESH
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
      const mesh = new THREE.Mesh(
        this.#foxGeometry,
        this.#foxMotion?.material ?? this.library?.material ?? this.#materials.fox,
      );
      mesh.castShadow = true;
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
        mesh.position.set(
          fox.position.x,
          baseY +
            (moving
              ? Math.abs(stride) * 0.045
              : raidPounce * 0.07 + Math.sin(phase * 0.25) * 0.012),
          fox.position.z,
        );
        if (moving) mesh.rotation.y = Math.atan2(dx, dz);
        mesh.rotation.x = -0.035 - raidPounce * 0.24;
        mesh.rotation.z = moving ? stride * 0.055 : Math.sin(phase * 0.33) * 0.018;
        const stretch = moving ? Math.abs(stride) * 0.035 : 0;
        mesh.scale.set(
          1 - stretch * 0.4 + raidPounce * 0.035,
          1 - stretch - raidPounce * 0.055,
          1 + stretch + raidPounce * 0.1,
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
