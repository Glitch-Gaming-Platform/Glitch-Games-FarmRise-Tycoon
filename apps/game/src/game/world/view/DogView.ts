import * as THREE from 'three';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { RenderContext } from '@engine/core/types.js';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';
import { ticksToSeconds } from '@farmrise/shared';
import { createDogPose, dogPose } from '../../animals/dogMotion.js';
import { visibleAnimalCountForGroup } from '../../animals/visibleAnimalInstances.js';
import type { FarmWorld } from '../FarmWorld.js';
import { createDogMotionMaterial, type TimeMaterial } from './animationMaterials.js';
import {
  addAnimalInstanceAttributes,
  getAnimalInstanceAttributes,
  markAnimalInstanceAttributesDirty,
  writeAnimalInstanceAttributes,
} from './animalInstanceAttributes.js';

const DOG_MESH = 'SM_animal_dog';
const MAX_VISIBLE_DOGS = 24;

export interface DogPresentationPulse {
  readonly kind: 'purchase' | 'produce';
  readonly startedAt: number | null;
}

/** Shelter-local guardian presentation, separate from FarmView's core flock rendering. */
export class DogView {
  readonly object = new THREE.Group();
  readonly #geometry: THREE.BufferGeometry;
  readonly #motion: TimeMaterial | null;
  #mesh: THREE.InstancedMesh | null = null;

  constructor(
    library: ModelLibrary | null,
    private readonly fallbackMaterial: THREE.Material,
    private readonly pipeline: RenderPipeline | null,
  ) {
    this.#geometry = library?.has(DOG_MESH)
      ? library.require(DOG_MESH).clone()
      : new THREE.CapsuleGeometry(0.25, 0.55, 4, 8).rotateX(Math.PI / 2).translate(0, 0.42, 0);
    addAnimalInstanceAttributes(this.#geometry, MAX_VISIBLE_DOGS);
    this.#motion = library ? createDogMotionMaterial(library.material) : null;
    if (this.#motion && pipeline?.active) pipeline.registerMaterial(this.#motion.material, 'skin');
  }

  sync(world: FarmWorld, context: RenderContext, pulse: DogPresentationPulse | null): void {
    const groups = world.livestock.groups;
    const total = world.livestock.countOf('dog');
    if (!this.#mesh) {
      if (total === 0) return;
      this.#mesh = new THREE.InstancedMesh(
        this.#geometry,
        this.#motion?.material ?? this.fallbackMaterial,
        MAX_VISIBLE_DOGS,
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
    const simulationTime = ticksToSeconds(world.tick + context.alpha);
    const pose = createDogPose();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const attributes = getAnimalInstanceAttributes(this.#geometry);
    let instanceIndex = 0;

    for (const group of groups) {
      if (group.species !== 'dog') continue;
      const count = visibleAnimalCountForGroup(groups, 'dog', group.id, MAX_VISIBLE_DOGS);
      const shelter = world.shelters.worldPosition(group.shelterId);
      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        dogPose(shelter, localIndex, count, simulationTime, purchaseIntro, pose);
        matrix.compose(
          new THREE.Vector3(pose.x, pose.y, pose.z),
          quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, pose.roll)),
          new THREE.Vector3(pose.scale, pose.scale, pose.scale),
        );
        this.#mesh.setMatrixAt(instanceIndex, matrix);
        writeAnimalInstanceAttributes(
          attributes,
          instanceIndex,
          pose.motion,
          pose.alert,
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
    if (this.#motion && this.pipeline?.active)
      this.pipeline.unregisterMaterial(this.#motion.material);
    this.#motion?.dispose();
    this.object.clear();
  }
}
