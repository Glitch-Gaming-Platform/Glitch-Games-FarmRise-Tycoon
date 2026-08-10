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

const BUILDING_MESH: Record<BuildingKind, string> = {
  barn: 'SM_building_barn',
  irrigation: 'SM_building_irrigation',
  road: 'SM_building_road',
  fence: 'SM_building_fence',
};

const COOP_MESH = 'SM_building_coop';
const ROCK_MESH = 'SM_prop_rock';
const ROCK_CLUSTER_MESH = 'SM_prop_rock_cluster';
const TREE_MESH = 'SM_prop_eucalyptus';
const DEAD_TREE_MESH = 'SM_prop_dead_tree';
const TROUGH_MESH = 'SM_prop_water_trough';

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
  readonly #waterPlane = createWaterPlaneGeometry();
  readonly #waterStream = new THREE.CylinderGeometry(0.026, 0.018, 1, 6, 5, true);
  readonly #knownBuildingStates = new Map<string, 'wip' | 'done'>();
  #elapsedSeconds = 0;

  constructor(
    world: FarmWorld,
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
        })
      : null;
    this.#owned.push(this.#waterPlane, this.#waterStream);
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

    for (const building of world.buildings) {
      const visual = this.#makeBuilding(world, building.kind);
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
      if (completedNow.has(buildingKey(building))) {
        visual.userData['completionStartedAt'] = this.#elapsedSeconds;
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
        continue;
      }

      const completedAt = visual.userData['completionStartedAt'] as number | undefined;
      const age = completedAt === undefined ? 1 : elapsedSeconds - completedAt;
      if (age < 0.72) {
        const pulse = Math.sin(Math.min(1, age / 0.72) * Math.PI);
        visual.scale.set(1 + pulse * 0.075, 1 + pulse * 0.11, 1 + pulse * 0.075);
        visual.position.y = baseY + pulse * 0.035;
      } else {
        visual.scale.set(1, 1, 1);
        visual.position.y = baseY;
        visual.rotation.z = 0;
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
    const geometry = this.#previewGeometry(world, kind);
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

  #previewGeometry(world: FarmWorld, kind: BuildingKind): THREE.BufferGeometry {
    const cached = this.library?.get(BUILDING_MESH[kind]);
    if (cached) return cached;
    const definition = BUILDINGS[kind];
    const tile = world.grid.tileSize;
    const height = kind === 'barn' ? 3 : kind === 'fence' ? 1.1 : 0.15;
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
    for (const resource of this.#owned) resource.dispose();
  }

  #makeBuilding(world: FarmWorld, kind: BuildingKind): THREE.Object3D | null {
    const name = BUILDING_MESH[kind];
    if (this.library?.has(name)) {
      const base = new THREE.Mesh(this.library.require(name), this.library.material);
      if (kind !== 'irrigation') return base;
      const group = new THREE.Group();
      group.add(base);

      const troughWater = new THREE.Mesh(this.#waterPlane, this.#water.material);
      troughWater.position.set(0.25, 0.235, 0.72);
      troughWater.scale.set(0.74, 1, 0.25);
      troughWater.renderOrder = 3;

      const stream = new THREE.Mesh(this.#waterStream, this.#runningWater.material);
      stream.position.set(0.3, 0.43, 0.7);
      stream.scale.set(1, 0.36, 1);
      stream.renderOrder = 4;
      group.add(troughWater, stream);
      return group;
    }
    // Procedural fallback.
    const definition = BUILDINGS[kind];
    const tile = world.grid.tileSize;
    const height = kind === 'barn' ? 3 : kind === 'fence' ? 1.1 : 0.15;
    const geometry = new THREE.BoxGeometry(
      definition.footprint.width * tile * 0.92,
      height,
      definition.footprint.depth * tile * 0.92,
    );
    geometry.translate(0, height / 2, 0);
    this.#owned.push(geometry);
    return new THREE.Mesh(geometry, this.materials[kind]);
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
    const authoredScenery = [ROCK_MESH, ROCK_CLUSTER_MESH, TREE_MESH, DEAD_TREE_MESH];

    for (const tileCoord of world.level.blockedTiles) {
      const variant =
        authoredScenery[
          Math.abs(tileCoord.tileX * 5 + tileCoord.tileZ * 11) % authoredScenery.length
        ]!;
      const hasVariant = Boolean(this.library?.has(variant));
      const rock = new THREE.Mesh(
        hasVariant ? this.library!.require(variant) : fallbackRock,
        hasVariant && (variant === TREE_MESH || variant === DEAD_TREE_MESH)
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
