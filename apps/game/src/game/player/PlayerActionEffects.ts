/**
 * One pooled particle draw for the three direct farm-work verbs.
 *
 * The particles are deliberately symbolic at the gameplay camera: warm seeds
 * press into soil, blue droplets pour down, and a green/gold harvest burst
 * lifts away from the crop. No particle is simulation state.
 */
import * as THREE from 'three';
import type { RenderContext } from '@engine/core/types.js';
import type { WorkAction } from './Player.js';

export type FarmWorkAction = Extract<WorkAction, 'plant' | 'tend' | 'harvest'>;

interface ActionParticle {
  active: boolean;
  kind: FarmWorkAction;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  duration: number;
  gravity: number;
  drag: number;
  phase: number;
  colour: THREE.Color;
}

export const ACTION_EFFECT_CAPACITY = 36;
const HIDDEN_SCALE = new THREE.Vector3(0.0001, 0.0001, 0.0001);

// All hues mirror named entries in tools/blender/palette.py.
const SEED_COLOURS = [new THREE.Color(0x9c6b3f), new THREE.Color(0xe0bc6a)];
const WATER_COLOURS = [new THREE.Color(0x4fb3c4), new THREE.Color(0x83c4d1)];
const HARVEST_COLOURS = [
  new THREE.Color(0x79c74d),
  new THREE.Color(0xe8c34a),
  new THREE.Color(0xff9440),
];

/**
 * Normalised contact beats for each work verb. Effects begin where the tool
 * meets the target, not when the anticipation pose starts.
 */
export const ACTION_EFFECT_CONTACT: Readonly<Record<FarmWorkAction, number>> = {
  plant: 0.38,
  tend: 0.18,
  harvest: 0.36,
};

export function hasActionEffect(action: WorkAction): action is FarmWorkAction {
  return action === 'plant' || action === 'tend' || action === 'harvest';
}

export function hasReachedActionContact(action: FarmWorkAction, progress: number): boolean {
  return progress >= ACTION_EFFECT_CONTACT[action];
}

export class PlayerActionEffects {
  readonly object: THREE.InstancedMesh;
  readonly #particles: ActionParticle[];
  readonly #matrix = new THREE.Matrix4();
  readonly #scale = new THREE.Vector3();
  readonly #rotation = new THREE.Quaternion();
  readonly #axis = new THREE.Vector3(0, 1, 0);
  #cursor = 0;
  #activeCount = 0;

  constructor() {
    const geometry = new THREE.DodecahedronGeometry(0.045, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });
    this.object = new THREE.InstancedMesh(geometry, material, ACTION_EFFECT_CAPACITY);
    // Allocate and initialise instance colour explicitly. Relying on the first
    // setColorAt call leaves a brief all-zero (black) buffer on some WebGL
    // drivers when the pool becomes visible during the same frame it is used.
    this.object.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(ACTION_EFFECT_CAPACITY * 3).fill(1),
      3,
    );
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.userData['poolCapacity'] = ACTION_EFFECT_CAPACITY;
    this.#particles = Array.from({ length: ACTION_EFFECT_CAPACITY }, () => ({
      active: false,
      kind: 'plant',
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      duration: 0.7,
      gravity: 1.35,
      drag: 0.8,
      phase: 0,
      colour: new THREE.Color(0xffffff),
    }));
  }

  get activeCount(): number {
    return this.#activeCount;
  }

  trigger(action: FarmWorkAction, facing: number): void {
    this.object.visible = true;
    // Watering stays on the original shared falling-droplet burst because this
    // pool is used by both tiers. Ultra's richer splash/contact response lives
    // in PlayerToolView; Low therefore retains the legacy presentation here.
    const count = action === 'plant' ? 9 : action === 'tend' ? 13 : 18;
    for (let i = 0; i < count; i += 1) this.#spawn(action, facing, i);
  }

  update(context: RenderContext, deltaX: number, deltaZ: number): void {
    const dt = Math.min(context.deltaSeconds, 0.05);
    this.#activeCount = 0;

    for (let index = 0; index < this.#particles.length; index += 1) {
      const particle = this.#particles[index]!;
      if (particle.active) {
        // The pool is parented to the player, so offset existing particles to
        // keep them in world space if the player moves as a burst fades.
        particle.position.x -= deltaX;
        particle.position.z -= deltaZ;
        particle.life -= dt;
        if (particle.life <= 0) particle.active = false;
        else {
          const damping = Math.exp(-particle.drag * dt);
          particle.velocity.x *= damping;
          particle.velocity.z *= damping;
          particle.position.addScaledVector(particle.velocity, dt);
          particle.velocity.y -= particle.gravity * dt;
          // The worked plot surface sits around 0.12 m above world zero. Water
          // droplets clamped to the old 0.025 m plane were almost completely
          // buried, leaving only dark silhouettes that read as stones. Keep
          // water at the visible contact plane while seeds and chaff retain
          // their original ground behaviour.
          const contactHeight = particle.kind === 'tend' ? 0.16 : 0.025;
          if (particle.position.y < contactHeight) {
            particle.position.y = contactHeight;
            particle.velocity.y = Math.abs(particle.velocity.y) * 0.18;
            particle.velocity.x *= 0.7;
            particle.velocity.z *= 0.7;
          }
        }
      }

      if (!particle.active) {
        this.#matrix.compose(particle.position, this.#rotation.identity(), HIDDEN_SCALE);
      } else {
        this.#activeCount += 1;
        const remaining = particle.life / particle.duration;
        const age = 1 - remaining;
        const size =
          particle.kind === 'tend'
            ? 0.45 + Math.sin(Math.min(1, age) * Math.PI) * 0.9
            : 0.28 + Math.sin(Math.min(1, age) * Math.PI) * 1.02;
        if (particle.kind === 'tend') {
          this.#rotation.identity();
          this.#scale.set(size * 0.48, size * 1.65, size * 0.48);
        } else if (particle.kind === 'harvest') {
          this.#rotation.setFromAxisAngle(this.#axis, particle.phase + age * 3.1);
          this.#scale.set(size * 1.42, size * 0.34, size * 0.74);
        } else {
          this.#rotation.setFromAxisAngle(this.#axis, particle.phase + age * 3.1);
          this.#scale.set(size * 0.76, size * 0.48, size * 0.76);
        }
        this.#matrix.compose(particle.position, this.#rotation, this.#scale);
      }
      this.object.setMatrixAt(index, this.#matrix);
      this.object.setColorAt(index, particle.colour);
    }
    this.object.count = ACTION_EFFECT_CAPACITY;
    this.object.instanceMatrix.needsUpdate = true;
    if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
    this.object.visible = this.#activeCount > 0;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }

  #spawn(action: FarmWorkAction, facing: number, index: number): void {
    const particle = this.#particles[this.#cursor];
    if (!particle) return;
    this.#cursor = (this.#cursor + 1) % ACTION_EFFECT_CAPACITY;

    const seed = (index + 1) * 1.618 + this.#cursor * 0.37;
    particle.kind = action;
    const forwardX = Math.sin(facing);
    const forwardZ = Math.cos(facing);
    const sideX = Math.cos(facing);
    const sideZ = -Math.sin(facing);
    const side = Math.sin(seed * 5.7) * (action === 'harvest' ? 0.34 : 0.2);
    const forward = action === 'harvest' ? 0.58 : action === 'tend' ? 0.42 : 0.46;
    const height = action === 'tend' ? 0.78 : action === 'harvest' ? 0.48 : 0.1;
    particle.position.set(
      forwardX * forward + sideX * side,
      height,
      forwardZ * forward + sideZ * side,
    );

    if (action === 'plant') {
      particle.velocity.set(sideX * side * 0.35, 0.16 + (seed % 1) * 0.14, sideZ * side * 0.35);
      particle.duration = 0.52;
      particle.gravity = 0.72;
      particle.drag = 1.4;
      particle.colour.copy(SEED_COLOURS[index % SEED_COLOURS.length]!);
    } else if (action === 'tend') {
      particle.velocity.set(
        forwardX * (0.12 + (seed % 1) * 0.16) + sideX * side * 0.15,
        -0.22 - (seed % 1) * 0.16,
        forwardZ * (0.12 + (seed % 1) * 0.16) + sideZ * side * 0.15,
      );
      particle.duration = 0.64;
      particle.gravity = 1.35;
      particle.drag = 0;
      particle.colour.copy(WATER_COLOURS[index % WATER_COLOURS.length]!);
    } else {
      const radial = 0.28 + (seed % 1) * 0.42;
      particle.velocity.set(
        sideX * side * 1.2 + forwardX * radial,
        0.52 + (seed % 1) * 0.38,
        sideZ * side * 1.2 + forwardZ * radial,
      );
      particle.duration = 0.78;
      particle.gravity = 1.18;
      particle.drag = 0.82;
      particle.colour.copy(HARVEST_COLOURS[index % HARVEST_COLOURS.length]!);
    }
    particle.life = particle.duration;
    particle.phase = seed;
    particle.active = true;
  }
}
