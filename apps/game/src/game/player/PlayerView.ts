/**
 * The player's visual representation.
 *
 * Kept apart from Player so the simulation can run headless in tests and on the
 * server. The view only ever reads the model.
 */
import * as THREE from 'three';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { RenderContext } from '@engine/core/types.js';
import {
  applyCharacterMotion,
  type CharacterMotionMaterial,
} from '../world/view/animationMaterials.js';
import type { Player, WorkAction } from './Player.js';
import { PlayerActionEffects } from './PlayerActionEffects.js';
import { PlayerToolView } from './PlayerToolView.js';

const FARMER_MESH = 'SM_char_farmer';

interface DustParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  duration: number;
}

export class PlayerView {
  readonly object: THREE.Group;
  readonly #actor = new THREE.Group();
  readonly #body: THREE.Mesh;
  readonly #contactShadow: THREE.Mesh;
  readonly #dust: THREE.InstancedMesh;
  readonly #dustParticles: DustParticle[];
  readonly #actionEffects = new PlayerActionEffects();
  readonly #tools: PlayerToolView;
  readonly #motions: CharacterMotionMaterial[] = [];
  #outline: THREE.Mesh | null = null;
  #dustCursor = 0;
  #dustAccumulator = 0;
  #visualLocomotion = 0;
  #lastPlayerX: number;
  #lastPlayerZ: number;
  #lastWorkAction: WorkAction | null = null;
  #scareReactionSeconds = 0;
  /** True when running on procedural primitives rather than authored art. */
  #procedural = true;

  constructor(player: Player, library: ModelLibrary | null = null) {
    this.object = new THREE.Group();
    this.#tools = new PlayerToolView(library);
    this.#actor.add(this.#tools.object);
    this.#lastPlayerX = player.position.x;
    this.#lastPlayerZ = player.position.z;
    const shadowGeometry = new THREE.CircleGeometry(0.42, 20);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      // palette.py: eye_dark. A soft local contact mark is the documented
      // player-only exception used to preserve findability on every surface.
      color: 0x2a2420,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
    });
    this.#contactShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    this.#contactShadow.rotation.x = -Math.PI / 2;
    this.#contactShadow.scale.set(1, 1.28, 1);
    this.#contactShadow.position.y = 0.012;
    this.object.add(this.#contactShadow, this.#actor);

    const dustGeometry = new THREE.DodecahedronGeometry(0.045, 0);
    const dustMaterial = new THREE.MeshBasicMaterial({
      color: 0xc9b896,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      toneMapped: false,
    });
    this.#dust = new THREE.InstancedMesh(dustGeometry, dustMaterial, 22);
    this.#dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#dust.frustumCulled = false;
    this.#dustParticles = Array.from({ length: 22 }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      duration: 0.55,
    }));
    this.object.add(this.#dust, this.#actionEffects.object);

    if (library?.has(FARMER_MESH)) {
      // The authored chibi farmer. Its straw hat is the primary silhouette
      // read at gameplay distance - see docs/ART_DIRECTION.md.
      const geometry = library.require(FARMER_MESH);
      const outlineMaterial = new THREE.MeshBasicMaterial({
        // palette.py: roof_grey_light. Back faces of the expanded shell create a
        // narrow rim without a post-processing or whole-world outline pass.
        color: 0xaebac1,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        toneMapped: false,
      });
      const outline = new THREE.Mesh(geometry, outlineMaterial);
      outline.scale.setScalar(1.04);
      outline.renderOrder = 0;
      this.#outline = outline;
      this.#motions.push(applyCharacterMotion(outlineMaterial, 'outline'));

      const bodyMaterial = library.material.clone();
      bodyMaterial.name = 'M_FarmRise_AnimatedFarmer';
      const mesh = new THREE.Mesh(geometry, bodyMaterial);
      mesh.castShadow = true;
      mesh.renderOrder = 1;
      this.#motions.push(applyCharacterMotion(bodyMaterial, 'body'));
      this.#body = mesh;
      this.#procedural = false;
      this.#actor.add(outline, mesh);
      return;
    }

    // CylinderGeometry rather than CapsuleGeometry: capsules are a newer
    // addition and this reads the same at gameplay camera distance.
    const bodyGeometry = new THREE.CylinderGeometry(player.radius, player.radius * 0.9, 1.5, 12);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.7 });
    this.#body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.#body.position.y = 0.75;
    this.#body.castShadow = true;

    const hatGeometry = new THREE.ConeGeometry(player.radius * 1.5, 0.45, 12);
    const hatMaterial = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.6 });
    const hat = new THREE.Mesh(hatGeometry, hatMaterial);
    hat.position.y = 1.65;
    hat.castShadow = true;

    // A nose-like marker: without it the facing direction is invisible on a
    // rotationally symmetric body, and the interaction cone feels arbitrary.
    const noseGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.35);
    const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
    nose.position.set(0, 1.1, player.radius + 0.15);

    this.#actor.add(this.#body, hat, nose);
  }

  sync(player: Player, context: RenderContext): void {
    this.#scareReactionSeconds = Math.max(
      0,
      this.#scareReactionSeconds - Math.min(context.deltaSeconds, 0.05),
    );
    const deltaX = player.position.x - this.#lastPlayerX;
    const deltaZ = player.position.z - this.#lastPlayerZ;
    this.#lastPlayerX = player.position.x;
    this.#lastPlayerZ = player.position.z;
    this.#updateDust(player, context, deltaX, deltaZ);

    const workAction = player.activity === 'working' ? player.workAction : null;
    if (workAction && this.#lastWorkAction === null) {
      this.#actionEffects.trigger(workAction, player.facing);
    }
    this.#lastWorkAction = workAction;
    this.#actionEffects.update(context, deltaX, deltaZ);

    this.object.position.set(player.position.x, 0, player.position.z);
    this.#actor.rotation.y = player.facing;
    // A small whole-body animation gives the static authored mesh weight and
    // personality without changing the simulation or requiring a skeletal
    // runtime. Motion stays deliberately subtle at the 20 m camera.
    const bobAmplitude = this.#procedural ? 0.05 : 0.028;
    const now = context.elapsedSeconds;
    const locomotionTarget = player.activity === 'walking' ? player.locomotionIntensity : 0;
    const locomotionResponse = locomotionTarget > this.#visualLocomotion ? 13 : 9;
    const locomotionBlend =
      1 - Math.exp(-Math.min(context.deltaSeconds, 0.05) * locomotionResponse);
    this.#visualLocomotion += (locomotionTarget - this.#visualLocomotion) * locomotionBlend;
    if (this.#visualLocomotion < 0.002) this.#visualLocomotion = 0;
    const locomotion = this.#visualLocomotion;
    const scareProgress = 1 - this.#scareReactionSeconds / SCARE_REACTION_SECONDS;
    const workCode = workActionCode(workAction) || (this.#scareReactionSeconds > 0 ? 2 : 0);
    const workProgress =
      player.activity === 'working'
        ? player.workProgress
        : this.#scareReactionSeconds > 0
          ? scareProgress
          : 0;
    this.#tools.sync(workAction, workProgress, now);
    const stepPhase = now * (8.0 + locomotion * 1.7) + context.alpha;
    for (const motion of this.#motions) {
      motion.setMotion(now, locomotion, workCode, workProgress);
    }
    const bob =
      locomotion > 0.002 && player.activity !== 'working'
        ? Math.abs(Math.sin(stepPhase)) * bobAmplitude * Math.min(1.45, locomotion)
        : player.activity === 'working'
          ? Math.sin(now * 8.2) * 0.018
          : 0;
    // Authored meshes have their origin snapped to the lowest vertex. The
    // previous unconditional 0.75 m fallback offset made the real farmer
    // float above the ground on every frame.
    this.#body.position.y = (this.#procedural ? 0.75 : 0) + bob;

    if (locomotion > 0.002 && player.activity !== 'working') {
      this.#body.rotation.x = 0.025 + Math.min(0.045, locomotion * 0.018);
      this.#body.rotation.z = Math.sin(stepPhase) * 0.025;
      const squash = Math.abs(Math.sin(stepPhase)) * 0.012;
      this.#body.scale.set(1 + squash, 1 - squash, 1 + squash * 0.35);
    } else if (player.activity === 'working') {
      const actionBeat = Math.sin(workProgress * Math.PI);
      if (workAction === 'plant') {
        this.#body.rotation.x = -0.13 * actionBeat;
        this.#body.rotation.z = 0;
        this.#body.scale.set(1.025, 1 - actionBeat * 0.06, 1.035);
      } else if (workAction === 'tend') {
        this.#body.rotation.x = -0.04;
        this.#body.rotation.z = Math.sin(workProgress * Math.PI * 4) * 0.035;
        this.#body.scale.set(1.01, 0.99, 1.01);
      } else {
        const recoil = Math.max(0, Math.sin((workProgress - 0.52) * Math.PI * 3.2));
        this.#body.rotation.x = -0.11 * actionBeat + recoil * 0.055;
        this.#body.rotation.z = Math.sin(workProgress * Math.PI) * 0.018;
        this.#body.scale.set(1.02 + recoil * 0.025, 0.98, 1.025 - recoil * 0.015);
      }
    } else {
      const breath = Math.sin(now * 1.65) * 0.008;
      this.#body.rotation.x = 0;
      this.#body.rotation.z = Math.sin(now * 0.85) * 0.012;
      this.#body.scale.set(1 - breath * 0.35, 1 + breath, 1 - breath * 0.35);
    }

    const contactPulse = locomotion > 0.002 ? Math.abs(Math.sin(stepPhase)) : 0;
    this.#contactShadow.scale.set(1 + contactPulse * 0.09, 1.28 - contactPulse * 0.08, 1);

    if (this.#outline) {
      this.#outline.position.copy(this.#body.position);
      this.#outline.rotation.copy(this.#body.rotation);
      this.#outline.scale.set(
        this.#body.scale.x * 1.04,
        this.#body.scale.y * 1.04,
        this.#body.scale.z * 1.04,
      );
    }
  }

  /** A visual-only wave when proximity successfully scares a fox away. */
  triggerScareReaction(): void {
    this.#scareReactionSeconds = SCARE_REACTION_SECONDS;
  }

  dispose(): void {
    this.#contactShadow.geometry.dispose();
    (this.#contactShadow.material as THREE.Material).dispose();
    this.#contactShadow.removeFromParent();
    if (this.#outline) {
      this.#outline.removeFromParent();
      this.#outline = null;
    }
    for (const motion of this.#motions) motion.dispose();
    this.#motions.length = 0;
    this.#dust.geometry.dispose();
    (this.#dust.material as THREE.Material).dispose();
    this.#dust.removeFromParent();
    this.#actionEffects.dispose();
    this.#tools.dispose();
    // Library geometry and material are shared and owned by the ModelLibrary.
    if (!this.#procedural) {
      this.object.clear();
      return;
    }
    this.object.traverse((child) => {
      const mesh = child as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
  }

  #updateDust(player: Player, context: RenderContext, deltaX: number, deltaZ: number): void {
    const dt = Math.min(context.deltaSeconds, 0.05);
    for (const particle of this.#dustParticles) {
      if (!particle.active) continue;
      // Keep already-spawned puffs in world space while this effect group
      // follows the player.
      particle.x -= deltaX;
      particle.z -= deltaZ;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy += 0.22 * dt;
    }

    const workDustRate =
      player.workAction === 'plant' ? 5 : player.workAction === 'harvest' ? 8 : 1.5;
    const rate =
      player.activity === 'walking'
        ? 7 + player.locomotionIntensity * 5
        : player.activity === 'working'
          ? workDustRate
          : 0;
    this.#dustAccumulator += dt * rate;
    while (this.#dustAccumulator >= 1) {
      this.#dustAccumulator -= 1;
      this.#spawnDust(player);
    }

    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.#dustParticles.forEach((particle, index) => {
      const fraction = particle.active ? Math.max(0, particle.life / particle.duration) : 0;
      const size = particle.active ? 0.35 + (1 - fraction) * 1.1 : 0.0001;
      matrix.compose(
        position.set(particle.x, particle.y, particle.z),
        rotation.identity(),
        scale.set(size, size * 0.62, size),
      );
      this.#dust.setMatrixAt(index, matrix);
    });
    this.#dust.count = this.#dustParticles.length;
    this.#dust.instanceMatrix.needsUpdate = true;
  }

  #spawnDust(player: Player): void {
    const particle = this.#dustParticles[this.#dustCursor];
    if (!particle) return;
    this.#dustCursor = (this.#dustCursor + 1) % this.#dustParticles.length;
    const seed = this.#dustCursor * 1.618;
    const side = Math.sin(seed * 7.1) * 0.18;
    const forward = player.activity === 'working' ? 0.28 : -0.18;
    particle.active = true;
    particle.x = Math.cos(player.facing) * side + Math.sin(player.facing) * forward;
    particle.y = 0.045;
    particle.z = -Math.sin(player.facing) * side + Math.cos(player.facing) * forward;
    particle.vx = Math.sin(seed * 3.7) * 0.12;
    particle.vy = 0.08 + (seed % 1) * 0.08;
    particle.vz = Math.cos(seed * 4.1) * 0.12;
    particle.duration = player.activity === 'working' ? 0.72 : 0.52;
    particle.life = particle.duration;
  }
}

function workActionCode(action: WorkAction | null): number {
  if (action === 'plant') return 1;
  if (action === 'tend') return 2;
  if (action === 'harvest') return 3;
  return 0;
}

const SCARE_REACTION_SECONDS = 0.58;
