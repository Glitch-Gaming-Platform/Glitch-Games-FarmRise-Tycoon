/**
 * Visualises the plots: the tilled bed and whatever is growing on it.
 *
 * Every plot bed and every crop-stage variant is drawn as an InstancedMesh,
 * so the number of draw calls is fixed by the number of distinct MESHES (13)
 * rather than by the number of plots. A farm with 6 plots and a farm with 60
 * cost the same.
 *
 * Growth is shown by SWAPPING MESHES, not by scaling one. The art direction
 * makes each stage a different plant with a different colour and silhouette
 * (see docs/ART_DIRECTION.md), and a scaled box cannot express that. The
 * previous implementation scaled a single green box vertically, which meant
 * "nearly ready" and "ready" differed only in height - the exact readability
 * failure the rubric's Growth-Stage Legibility category exists to catch.
 */
import * as THREE from 'three';
import { plotStage, requireCrop, type PlotState } from '@farmrise/shared';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { FarmWorld } from '../FarmWorld.js';
import type { FarmMaterials } from './materials.js';
import { createWindMaterial, type TimeMaterial } from './animationMaterials.js';

/** The four authored growth stages. */
export type VisualStage = 1 | 2 | 3 | 4;

/**
 * Maps continuous growth to one of four authored stages.
 *
 * The thresholds are deliberately uneven. Stage 4 is reserved strictly for
 * "harvestable" so that the gold/orange colour flip is a promise the game
 * always keeps: if it looks ready, it is ready.
 */
export function visualStage(plot: PlotState): VisualStage {
  if (!plot.cropId) return 1;
  if (plotStage(plot) === 'ready') return 4;
  const progress = plot.grownTicks / requireCrop(plot.cropId).growthTicks;
  if (progress < 0.25) return 1;
  if (progress < 0.6) return 2;
  return 3;
}

export function cropMeshName(cropId: string, stage: VisualStage): string {
  return `SM_crop_${cropId}_s${stage}`;
}

const GROUND_PLOT_MESH = 'SM_ground_plot';

interface Bucket {
  readonly mesh: THREE.InstancedMesh;
  count: number;
}

export interface StagePopScale {
  readonly horizontal: number;
  readonly vertical: number;
}

/** A quick rooted overshoot makes planting and growth-stage swaps feel alive. */
export function stagePopScale(ageSeconds: number): StagePopScale {
  const t = Math.min(1, Math.max(0, ageSeconds / 0.48));
  const overshoot = 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
  return {
    horizontal: 0.86 + overshoot * 0.14,
    vertical: 0.68 + overshoot * 0.32,
  };
}

/** Visual stress combines water shortage, disease and event yield damage. */
export function cropStress(plot: PlotState): number {
  const waterStress = Math.max(0, Math.min(1, (0.48 - plot.water) / 0.48));
  const eventStress = Math.max(0, Math.min(1, 1 - plot.eventMultiplier));
  return Math.max(waterStress, eventStress, plot.diseased ? 0.72 : 0);
}

export class PlotView {
  readonly object = new THREE.Group();
  readonly #plotIds: string[];
  readonly #buckets = new Map<string, Bucket>();
  readonly #bed: THREE.InstancedMesh | null = null;
  readonly #fallback: THREE.InstancedMesh | null = null;
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #quaternion = new THREE.Quaternion();
  readonly #euler = new THREE.Euler();
  readonly #scale = new THREE.Vector3(1, 1, 1);
  readonly #colour = new THREE.Color();
  readonly #owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  readonly #cropWind: TimeMaterial | null;
  readonly #visualKeys = new Map<string, string>();
  readonly #transitionStarts = new Map<string, number>();
  #elapsedSeconds = 0;

  constructor(world: FarmWorld, materials: FarmMaterials, library: ModelLibrary | null = null) {
    this.#plotIds = world.level.plots.map((plot) => plot.id);
    for (const plotId of this.#plotIds) this.#visualKeys.set(plotId, 'empty');
    const capacity = Math.max(1, this.#plotIds.length);

    if (library?.has(GROUND_PLOT_MESH)) {
      this.#cropWind = createWindMaterial(library.material, {
        key: 'crops',
        strength: 0.055,
        speed: 1.75,
        baseHeight: 0.08,
        fullHeight: 1.15,
      });
      this.#bed = new THREE.InstancedMesh(
        library.require(GROUND_PLOT_MESH),
        library.material,
        capacity,
      );
      this.#bed.receiveShadow = true;
      this.object.add(this.#bed);

      for (const cropId of ['wheat', 'corn', 'pumpkin']) {
        for (const stage of [1, 2, 3, 4] as const) {
          const name = cropMeshName(cropId, stage);
          if (!library.has(name)) continue;
          const mesh = new THREE.InstancedMesh(
            library.require(name),
            this.#cropWind.material,
            capacity,
          );
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.count = 0;
          // Instance matrices are rewritten whenever the world changes, which
          // is far rarer than every frame.
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.#buckets.set(name, { mesh, count: 0 });
          this.object.add(mesh);
        }
      }
    } else {
      this.#cropWind = null;
      // Procedural fallback so the game still runs with no art on disk -
      // used by the jsdom tests and by anyone who has not run the art build.
      const tile = world.grid.tileSize;
      const soil = new THREE.BoxGeometry(tile * 0.9, 0.12, tile * 0.9);
      const bed = new THREE.InstancedMesh(soil, materials.soil, capacity);
      bed.receiveShadow = true;
      this.#bed = bed;
      this.#owned.push(soil);

      const crop = new THREE.BoxGeometry(tile * 0.6, 1, tile * 0.6);
      crop.translate(0, 0.5, 0);
      const fallback = new THREE.InstancedMesh(crop, materials.cropYoung, capacity);
      fallback.castShadow = true;
      fallback.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 3),
        3,
      );
      this.#fallback = fallback;
      this.#owned.push(crop);
      this.object.add(bed, fallback);
    }

    this.#placeBeds(world);
    this.sync(world);
  }

  /** Beds never move, so their matrices are written once at construction. */
  #placeBeds(world: FarmWorld): void {
    if (!this.#bed) return;
    this.#plotIds.forEach((plotId, index) => {
      const placement = world.plotPlacement(plotId);
      if (!placement) return;
      const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
      this.#matrix.compose(
        this.#position.set(at.x, 0, at.z),
        this.#quaternion.identity(),
        this.#scale.set(1, 1, 1),
      );
      this.#bed!.setMatrixAt(index, this.#matrix);
    });
    this.#bed.count = this.#plotIds.length;
    this.#bed.instanceMatrix.needsUpdate = true;
  }

  /** Re-buckets every plot into its current crop-and-stage mesh. */
  sync(world: FarmWorld): void {
    if (this.#fallback) {
      this.#syncFallback(world);
      return;
    }

    for (const bucket of this.#buckets.values()) bucket.count = 0;

    this.#plotIds.forEach((plotId) => {
      const plot = world.getPlot(plotId);
      const placement = world.plotPlacement(plotId);
      if (!plot || !placement) return;

      const key = plot.cropId ? cropMeshName(plot.cropId, visualStage(plot)) : 'empty';
      if (this.#visualKeys.get(plotId) !== key) {
        this.#visualKeys.set(plotId, key);
        this.#transitionStarts.set(plotId, this.#elapsedSeconds);
      }
      if (!plot.cropId) return;

      const bucket = this.#buckets.get(key);
      if (!bucket) return;

      const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
      // A small deterministic yaw per plot stops six identical beds from
      // reading as a copy-paste grid.
      const yaw = ((placement.tileX * 7 + placement.tileZ * 13) % 8) * 0.19;
      const stress = cropStress(plot);
      const leanDirection = ((placement.tileX * 3 + placement.tileZ * 5) % 2) * 2 - 1;
      const transitionStart = this.#transitionStarts.get(plotId);
      const pop = stagePopScale(
        transitionStart === undefined ? 1 : this.#elapsedSeconds - transitionStart,
      );
      if (transitionStart !== undefined && this.#elapsedSeconds - transitionStart >= 0.48) {
        this.#transitionStarts.delete(plotId);
      }
      this.#matrix.compose(
        this.#position.set(at.x, 0.1, at.z),
        this.#quaternion.setFromEuler(
          this.#euler.set(stress * 0.075 * leanDirection, yaw, stress * 0.045),
        ),
        this.#scale.set(
          pop.horizontal * (1 + stress * 0.035),
          pop.vertical * (1 - stress * 0.18),
          pop.horizontal * (1 + stress * 0.065),
        ),
      );
      bucket.mesh.setMatrixAt(bucket.count, this.#matrix);
      // Instance colour multiplies the authored vertex palette. White leaves
      // healthy crops untouched; palette.diseased/soil_dry warm and darken a
      // stressed crop without another material or draw call.
      this.#colour.copy(HEALTHY_TINT).lerp(DROUGHT_TINT, stress * 0.58);
      bucket.mesh.setColorAt(bucket.count, this.#colour);
      bucket.count += 1;
    });

    for (const bucket of this.#buckets.values()) {
      bucket.mesh.count = bucket.count;
      bucket.mesh.instanceMatrix.needsUpdate = true;
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
    }
  }

  animate(elapsedSeconds: number): void {
    this.#elapsedSeconds = elapsedSeconds;
    this.#cropWind?.setTime(elapsedSeconds);
  }

  #syncFallback(world: FarmWorld): void {
    const fallback = this.#fallback;
    if (!fallback) return;
    this.#plotIds.forEach((plotId, index) => {
      const plot = world.getPlot(plotId);
      const placement = world.plotPlacement(plotId);
      if (!plot || !placement) return;
      const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
      const stage = visualStage(plot);
      const height = plot.cropId ? 0.15 + (stage / 4) * 1.25 : 0.0001;
      this.#matrix.compose(
        this.#position.set(at.x, 0.12, at.z),
        this.#quaternion.identity(),
        this.#scale.set(1, height, 1),
      );
      fallback.setMatrixAt(index, this.#matrix);
      fallback.setColorAt(index, stage === 4 ? COLOR_READY : COLOR_GROWING);
    });
    fallback.count = this.#plotIds.length;
    fallback.instanceMatrix.needsUpdate = true;
    if (fallback.instanceColor) fallback.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.#bed?.dispose();
    this.#fallback?.dispose();
    for (const bucket of this.#buckets.values()) bucket.mesh.dispose();
    this.#buckets.clear();
    // Only geometry this view created is disposed here. Library geometry is
    // shared and owned by the ModelLibrary.
    for (const resource of this.#owned) resource.dispose();
    this.#cropWind?.dispose();
    this.object.clear();
  }
}

const COLOR_READY = new THREE.Color(0xe8c34a);
const COLOR_GROWING = new THREE.Color(0x63ac3e);
const HEALTHY_TINT = new THREE.Color(0xffffff);
const DROUGHT_TINT = new THREE.Color(0x8a7b4a);
