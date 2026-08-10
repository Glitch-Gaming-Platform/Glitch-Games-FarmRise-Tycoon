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

interface ActionParticle {
  active: boolean;
  kind: WorkAction;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  duration: number;
  colour: THREE.Color;
}

const CAPACITY = 30;
const HIDDEN_SCALE = new THREE.Vector3(0.0001, 0.0001, 0.0001);
const IDENTITY = new THREE.Quaternion();

// All hues mirror named entries in tools/blender/palette.py.
const SEED_COLOURS = [new THREE.Color(0x9c6b3f), new THREE.Color(0xe0bc6a)];
const WATER_COLOURS = [new THREE.Color(0x4fb3c4), new THREE.Color(0x83c4d1)];
const HARVEST_COLOURS = [
  new THREE.Color(0x79c74d),
  new THREE.Color(0xe8c34a),
  new THREE.Color(0xff9440),
];

export class PlayerActionEffects {
  readonly object: THREE.InstancedMesh;
  readonly #particles: ActionParticle[];
  #cursor = 0;

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
    this.object = new THREE.InstancedMesh(geometry, material, CAPACITY);
    // Allocate and initialise instance colour explicitly. Relying on the first
    // setColorAt call leaves a brief all-zero (black) buffer on some WebGL
    // drivers when the pool becomes visible during the same frame it is used.
    this.object.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(CAPACITY * 3).fill(1),
      3,
    );
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.#particles = Array.from({ length: CAPACITY }, () => ({
      active: false,
      kind: 'plant',
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      duration: 0.7,
      colour: new THREE.Color(0xffffff),
    }));
  }

  trigger(action: WorkAction, facing: number): void {
    this.object.visible = true;
    const count = action === 'plant' ? 8 : action === 'tend' ? 13 : 16;
    for (let i = 0; i < count; i += 1) this.#spawn(action, facing, i);
  }

  update(context: RenderContext, deltaX: number, deltaZ: number): void {
    const dt = Math.min(context.deltaSeconds, 0.05);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    let activeCount = 0;

    this.#particles.forEach((particle, index) => {
      if (particle.active) {
        // The pool is parented to the player, so offset existing particles to
        // keep them in world space if the player moves as a burst fades.
        particle.position.x -= deltaX;
        particle.position.z -= deltaZ;
        particle.life -= dt;
        if (particle.life <= 0) particle.active = false;
        else {
          particle.position.addScaledVector(particle.velocity, dt);
          particle.velocity.y -= 1.35 * dt;
        }
      }

      if (!particle.active) {
        matrix.compose(particle.position, IDENTITY, HIDDEN_SCALE);
      } else {
        activeCount += 1;
        const remaining = particle.life / particle.duration;
        const size = 0.45 + Math.sin(remaining * Math.PI) * 0.9;
        if (particle.kind === 'tend') scale.set(size * 0.48, size * 1.65, size * 0.48);
        else if (particle.kind === 'harvest') scale.set(size * 1.35, size * 0.42, size * 0.72);
        else scale.set(size * 0.78, size * 0.55, size * 0.78);
        matrix.compose(particle.position, IDENTITY, scale);
      }
      this.object.setMatrixAt(index, matrix);
      this.object.setColorAt(index, particle.colour);
    });
    this.object.count = CAPACITY;
    this.object.instanceMatrix.needsUpdate = true;
    if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
    this.object.visible = activeCount > 0;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }

  #spawn(action: WorkAction, facing: number, index: number): void {
    const particle = this.#particles[this.#cursor];
    if (!particle) return;
    this.#cursor = (this.#cursor + 1) % CAPACITY;

    const seed = (index + 1) * 1.618 + this.#cursor * 0.37;
    particle.kind = action;
    const forwardX = Math.sin(facing);
    const forwardZ = Math.cos(facing);
    const sideX = Math.cos(facing);
    const sideZ = -Math.sin(facing);
    const side = Math.sin(seed * 5.7) * (action === 'harvest' ? 0.34 : 0.2);
    const forward = action === 'harvest' ? 0.55 : 0.42;
    const height = action === 'tend' ? 0.78 : action === 'harvest' ? 0.52 : 0.16;
    particle.position.set(
      forwardX * forward + sideX * side,
      height,
      forwardZ * forward + sideZ * side,
    );

    if (action === 'plant') {
      particle.velocity.set(sideX * side * 0.35, 0.16 + (seed % 1) * 0.14, sideZ * side * 0.35);
      particle.duration = 0.52;
      particle.colour.copy(SEED_COLOURS[index % SEED_COLOURS.length]!);
    } else if (action === 'tend') {
      particle.velocity.set(
        forwardX * (0.12 + (seed % 1) * 0.16) + sideX * side * 0.15,
        -0.22 - (seed % 1) * 0.16,
        forwardZ * (0.12 + (seed % 1) * 0.16) + sideZ * side * 0.15,
      );
      particle.duration = 0.64;
      particle.colour.copy(WATER_COLOURS[index % WATER_COLOURS.length]!);
    } else {
      const radial = 0.28 + (seed % 1) * 0.42;
      particle.velocity.set(
        sideX * side * 1.2 + forwardX * radial,
        0.52 + (seed % 1) * 0.38,
        sideZ * side * 1.2 + forwardZ * radial,
      );
      particle.duration = 0.78;
      particle.colour.copy(HARVEST_COLOURS[index % HARVEST_COLOURS.length]!);
    }
    particle.life = particle.duration;
    particle.active = true;
  }
}
