import * as THREE from 'three';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { RenderContext } from '@engine/core/types.js';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';
import { ticksToSeconds } from '@farmrise/shared';
import { createSheepPose, sheepPose } from '../../animals/sheepMotion.js';
import { visibleAnimalCountForGroup } from '../../animals/visibleAnimalInstances.js';
import type { FarmWorld } from '../FarmWorld.js';
import { createSheepMotionMaterial, type TimeMaterial } from './animationMaterials.js';
import {
  addAnimalInstanceAttributes,
  getAnimalInstanceAttributes,
  markAnimalInstanceAttributesDirty,
  writeAnimalInstanceAttributes,
} from './animalInstanceAttributes.js';

const SHEEP_MESH = 'SM_animal_sheep';
const MAX_VISIBLE_SHEEP = 24;

export interface SheepPresentationPulse {
  readonly kind: 'purchase' | 'produce';
  readonly startedAt: number | null;
}

/** Instanced sheep presentation, kept separate so FarmView does not absorb another species rig. */
export class SheepView {
  readonly object = new THREE.Group();
  readonly #geometry: THREE.BufferGeometry;
  readonly #motion: TimeMaterial | null;
  #mesh: THREE.InstancedMesh | null = null;

  constructor(
    library: ModelLibrary | null,
    private readonly fallbackMaterial: THREE.Material,
    private readonly pipeline: RenderPipeline | null,
  ) {
    this.#geometry = library?.has(SHEEP_MESH)
      ? library.require(SHEEP_MESH).clone()
      : new THREE.SphereGeometry(0.46, 8, 5).scale(1, 0.88, 1.32).translate(0, 0.48, 0);
    addAnimalInstanceAttributes(this.#geometry, MAX_VISIBLE_SHEEP);
    this.#motion = library ? createSheepMotionMaterial(library.material) : null;
    if (this.#motion && pipeline?.active) pipeline.registerMaterial(this.#motion.material, 'skin');
  }

  sync(world: FarmWorld, context: RenderContext, pulse: SheepPresentationPulse | null): void {
    const groups = world.livestock.groups;
    const total = world.livestock.countOf('sheep');
    if (!this.#mesh) {
      if (total === 0) return;
      this.#mesh = new THREE.InstancedMesh(
        this.#geometry,
        this.#motion?.material ?? this.fallbackMaterial,
        MAX_VISIBLE_SHEEP,
      );
      this.#mesh.castShadow = true;
      this.#mesh.frustumCulled = false;
      this.#mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.object.add(this.#mesh);
    }

    this.#motion?.setTime(context.elapsedSeconds);
    const pulseAge =
      pulse?.startedAt === null || !pulse ? 99 : context.elapsedSeconds - pulse.startedAt;
    const purchaseIntro =
      pulse?.kind === 'purchase' && pulseAge < 0.72 ? Math.min(1, pulseAge / 0.3) : 1;
    const woolBounce =
      pulse?.kind === 'produce' && pulseAge < 0.82
        ? Math.sin(Math.min(1, pulseAge / 0.82) * Math.PI) * 0.045
        : 0;
    const simulationTime = ticksToSeconds(world.tick + context.alpha);
    const pose = createSheepPose();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const attributes = getAnimalInstanceAttributes(this.#geometry);
    let instanceIndex = 0;

    for (const group of groups) {
      if (group.species !== 'sheep') continue;
      const count = visibleAnimalCountForGroup(groups, 'sheep', group.id, MAX_VISIBLE_SHEEP);
      const shelter = world.shelters.worldPosition(group.shelterId);
      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        sheepPose(shelter, localIndex, count, simulationTime, purchaseIntro, pose);
        matrix.compose(
          new THREE.Vector3(pose.x, pose.y, pose.z),
          quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, pose.roll)),
          new THREE.Vector3(
            pose.scaleX * (1 + woolBounce),
            pose.scaleY * (1 + woolBounce * 0.6),
            pose.scaleZ * (1 + woolBounce),
          ),
        );
        this.#mesh.setMatrixAt(instanceIndex, matrix);
        writeAnimalInstanceAttributes(
          attributes,
          instanceIndex,
          pose.motion,
          pose.graze,
          pose.gaitPhase,
        );
        instanceIndex += 1;
      }
    }
    this.#mesh.count = instanceIndex;
    this.#mesh.instanceMatrix.needsUpdate = true;
    markAnimalInstanceAttributesDirty(attributes);
  }

  dispose(): void {
    this.#mesh?.dispose();
    this.#mesh = null;
    this.#geometry.dispose();
    if (this.#motion && this.pipeline?.active) {
      this.pipeline.unregisterMaterial(this.#motion.material);
    }
    this.#motion?.dispose();
    this.object.clear();
  }
}
