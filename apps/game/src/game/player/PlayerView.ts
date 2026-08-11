/**
 * The player's visual representation.
 *
 * Kept apart from Player so the simulation can run headless in tests and on the
 * server. The view only ever reads the model.
 */
import * as THREE from 'three';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { RenderContext } from '@engine/core/types.js';
import type { Player, WorkAction } from './Player.js';
import {
  hasActionEffect,
  hasReachedActionContact,
  PlayerActionEffects,
} from './PlayerActionEffects.js';
import { PlayerToolView } from './PlayerToolView.js';
import { PlayerExpressionView } from './PlayerExpressionView.js';
import { createSkeleton, createSkinnedGeometry } from './rig/autoSkin.js';
import { CharacterRig } from './rig/CharacterRig.js';
import { BONE_INDEX } from './rig/skeletonDefinition.js';
import type { TerrainSurface } from '../world/view/terrainProfile.js';
import { terrainContactProfile, type TerrainContactProfile } from './terrainContact.js';

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
  sizeMultiplier: number;
  colour: THREE.Color;
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
  #expression: PlayerExpressionView | null = null;
  #rig: CharacterRig | null = null;
  readonly #ownedGeometry: THREE.BufferGeometry[] = [];
  readonly #toolGrip = new THREE.Vector3();
  readonly #toolSupport = new THREE.Vector3();
  #outline: THREE.Mesh | null = null;
  #dustCursor = 0;
  #dustAccumulator = 0;
  #visualLocomotion = 0;
  #visualTurn = 0;
  #lastPlayerX: number;
  #lastPlayerZ: number;
  #lastFacing: number;
  #lastWorkAction: WorkAction | null = null;
  #actionEffectTriggered = false;
  #scareReactionSeconds = 0;
  /** True when running on procedural primitives rather than authored art. */
  #procedural = true;

  constructor(player: Player, library: ModelLibrary | null = null) {
    this.object = new THREE.Group();
    this.#tools = new PlayerToolView(library);
    this.#actor.add(this.#tools.object);
    this.#lastPlayerX = player.position.x;
    this.#lastPlayerZ = player.position.z;
    this.#lastFacing = player.facing;
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
      color: 0xffffff,
      vertexColors: true,
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
      sizeMultiplier: 1,
      colour: new THREE.Color(0xc9b896),
    }));
    this.object.add(this.#dust, this.#actionEffects.object);

    if (library?.has(FARMER_MESH)) {
      // The authored chibi farmer, bound to a real skeleton at load time.
      //
      // The geometry is cloned and given skin attributes rather than mutated in
      // place: ModelLibrary hands the same BufferGeometry to anything that asks
      // for the farmer, and skin weights on a shared geometry would follow it
      // into menus and icon renders that have no skeleton to match.
      const geometry = createSkinnedGeometry(library.require(FARMER_MESH));
      this.#ownedGeometry.push(geometry);
      const { bones, skeleton } = createSkeleton();
      this.#rig = new CharacterRig(bones);

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
      const outline = new THREE.SkinnedMesh(geometry, outlineMaterial);
      outline.scale.setScalar(1.04);
      outline.renderOrder = 0;
      this.#outline = outline;

      const bodyMaterial = library.material.clone();
      bodyMaterial.name = 'M_FarmRise_SkinnedFarmer';
      const mesh = new THREE.SkinnedMesh(geometry, bodyMaterial);
      mesh.castShadow = true;
      mesh.renderOrder = 1;
      this.#body = mesh;
      this.#expression = new PlayerExpressionView();
      // Parented to the head bone, so the face follows head turns instead of
      // sliding around on a skull that has moved out from under it.
      bones[BONE_INDEX['head']!]!.add(this.#expression.object);
      this.#procedural = false;

      // Bones join the graph before binding; both meshes share one skeleton, so
      // the outline shell deforms identically to the body it outlines.
      this.#actor.add(bones[0]!, outline, mesh);
      mesh.bind(skeleton);
      outline.bind(skeleton);
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

  sync(player: Player, context: RenderContext, surface: TerrainSurface = 'scrub'): void {
    this.#scareReactionSeconds = Math.max(
      0,
      this.#scareReactionSeconds - Math.min(context.deltaSeconds, 0.05),
    );
    const deltaX = player.position.x - this.#lastPlayerX;
    const deltaZ = player.position.z - this.#lastPlayerZ;
    this.#lastPlayerX = player.position.x;
    this.#lastPlayerZ = player.position.z;
    this.#updateDust(player, context, deltaX, deltaZ, surface);

    const workAction = player.activity === 'working' ? player.workAction : null;
    if (workAction !== this.#lastWorkAction) this.#actionEffectTriggered = false;
    if (
      workAction &&
      hasActionEffect(workAction) &&
      !this.#actionEffectTriggered &&
      hasReachedActionContact(workAction, player.workProgress)
    ) {
      this.#actionEffects.trigger(workAction, player.facing);
      this.#actionEffectTriggered = true;
    }
    this.#lastWorkAction = workAction;
    this.#actionEffects.update(context, deltaX, deltaZ);

    this.object.position.set(player.position.x, 0, player.position.z);
    const turnDelta = Math.atan2(
      Math.sin(player.facing - this.#lastFacing),
      Math.cos(player.facing - this.#lastFacing),
    );
    this.#lastFacing = player.facing;
    const turnTarget = THREE.MathUtils.clamp(
      turnDelta / Math.max(0.008, context.deltaSeconds),
      -1,
      1,
    );
    const turnBlend = 1 - Math.exp(-Math.min(context.deltaSeconds, 0.05) * 12);
    this.#visualTurn += (turnTarget - this.#visualTurn) * turnBlend;
    this.#actor.rotation.y = player.facing;
    // A small whole-body animation gives the static authored mesh weight and
    // personality without changing the simulation or requiring a skeletal
    // runtime. Motion stays deliberately subtle at the gameplay camera.
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
    const workProgress =
      player.activity === 'working'
        ? player.workProgress
        : this.#scareReactionSeconds > 0
          ? scareProgress
          : 0;
    this.#tools.sync(workAction, workProgress, now);
    this.#expression?.sync(now, workAction, workProgress);
    const stepPhase = now * (8.0 + locomotion * 1.7) + context.alpha;

    if (this.#rig) {
      // Speed comes from the actual position delta, not from
      // `locomotionIntensity`. The rig converts distance into gait phase, so it
      // needs the distance the body really covered this frame; an eased
      // intensity value would put the feet out of step with the ground the
      // moment the player accelerated.
      const travelled = Math.hypot(deltaX, deltaZ);
      const speed = context.deltaSeconds > 0 ? travelled / context.deltaSeconds : 0;
      this.#rig.update({
        deltaSeconds: context.deltaSeconds,
        speed,
        facing: player.facing,
        turn: this.#visualTurn,
        working: player.activity === 'working' && workAction !== null,
        workAction,
        workProgress,
        waveProgress:
          this.#scareReactionSeconds > 0
            ? 1 - this.#scareReactionSeconds / SCARE_REACTION_SECONDS
            : 0,
      });

      // Close the loop between hand and tool. The tools are posed by
      // PlayerToolView on their own authored arcs; rather than hoping the arm
      // clip happens to agree with them, the arm is solved to the grip the tool
      // is actually at. This is what makes the farmer hold the sickle instead
      // of swinging beside it.
      if (workAction) {
        const shoulderY = 1.06;
        const grip = this.#tools.gripPosition(this.#toolGrip);
        if (grip) {
          this.#rig.reachRightHandTo(grip.z, shoulderY - grip.y, 0.85);
        }
        const support = this.#tools.supportPosition(this.#toolSupport);
        if (support && workAction === 'tend') {
          this.#rig.reachLeftHandTo(support.z, shoulderY - support.y, 0.78);
        }
      }
    }

    if (this.#rig) {
      // The rig owns every deformation. The only thing left at object level is
      // a bank into turns, which is a whole-body lean rather than a pose and
      // would otherwise have to be baked into every clip.
      //
      // Deliberately no whole-mesh squash here. Squash was how the old view
      // faked weight, and against a real skeleton it fights the pose: the legs
      // say the character is at the top of a step while the scale says the body
      // is compressing, and the two together read as rubber.
      const cosFacing = Math.cos(player.facing);
      const sinFacing = Math.sin(player.facing);
      const root = this.#rig.rootOffset;
      // Root tracks are authored in character-local space. Rotate the lateral
      // and forward offsets into the actor's facing so the body, tools and
      // expression share the same centre-of-mass motion.
      this.#actor.position.set(
        root.x * cosFacing + root.z * sinFacing,
        root.y,
        -root.x * sinFacing + root.z * cosFacing,
      );
      this.#body.position.set(0, 0, 0);
      this.#body.rotation.set(0, 0, this.#visualTurn * -0.09);
      this.#body.scale.set(1, 1, 1);
      this.#syncOutline();
      const contactPulseRigged = Math.min(1, locomotion);
      this.#contactShadow.scale.set(
        1 + contactPulseRigged * 0.06,
        1.28 - contactPulseRigged * 0.05,
        1,
      );
      return;
    }

    this.#actor.position.set(0, 0, 0);

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
      } else if (workAction === 'tend' || workAction === 'repair') {
        this.#body.rotation.x = -0.04;
        this.#body.rotation.z = Math.sin(workProgress * Math.PI * 4) * 0.035;
        this.#body.scale.set(1.01, 0.99, 1.01);
      } else if (workAction === 'harvest') {
        const recoil = Math.max(0, Math.sin((workProgress - 0.52) * Math.PI * 3.2));
        this.#body.rotation.x = -0.11 * actionBeat + recoil * 0.055;
        this.#body.rotation.z = Math.sin(workProgress * Math.PI) * 0.018;
        this.#body.scale.set(1.02 + recoil * 0.025, 0.98, 1.025 - recoil * 0.015);
      } else if (workAction === 'transfer') {
        this.#body.rotation.x = -0.09 * actionBeat;
        this.#body.rotation.z = 0;
        this.#body.scale.set(1.015, 1 - actionBeat * 0.035, 1.02);
      } else {
        this.#body.rotation.x = -0.015;
        this.#body.rotation.z = Math.sin(workProgress * Math.PI * 2) * 0.045;
        this.#body.scale.set(1.01, 0.995, 1.01);
      }
    } else {
      const breath = Math.sin(now * 1.65) * 0.008;
      this.#body.rotation.x = 0;
      this.#body.rotation.z = Math.sin(now * 0.85) * 0.012;
      this.#body.scale.set(1 - breath * 0.35, 1 + breath, 1 - breath * 0.35);
    }
    this.#body.rotation.z += this.#visualTurn * (player.activity === 'walking' ? 0.055 : 0.022);

    const contactPulse = locomotion > 0.002 ? Math.abs(Math.sin(stepPhase)) : 0;
    this.#contactShadow.scale.set(1 + contactPulse * 0.09, 1.28 - contactPulse * 0.08, 1);
    this.#syncOutline();
  }

  #syncOutline(): void {
    if (!this.#outline) return;
    this.#outline.position.copy(this.#body.position);
    this.#outline.rotation.copy(this.#body.rotation);
    this.#outline.scale.set(
      this.#body.scale.x * 1.04,
      this.#body.scale.y * 1.04,
      this.#body.scale.z * 1.04,
    );
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
    for (const geometry of this.#ownedGeometry) geometry.dispose();
    this.#ownedGeometry.length = 0;
    this.#rig = null;
    this.#dust.geometry.dispose();
    (this.#dust.material as THREE.Material).dispose();
    this.#dust.removeFromParent();
    this.#actionEffects.dispose();
    this.#tools.dispose();
    this.#expression?.dispose();
    this.#expression = null;
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

  #updateDust(
    player: Player,
    context: RenderContext,
    deltaX: number,
    deltaZ: number,
    surface: TerrainSurface,
  ): void {
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
    const contactSurface = player.activity === 'working' ? 'tilled-soil' : surface;
    const profile = terrainContactProfile(contactSurface);
    const rate =
      player.activity === 'walking'
        ? 7 + player.locomotionIntensity * 5
        : player.activity === 'working'
          ? workDustRate
          : 0;
    this.#dustAccumulator += dt * rate * profile.emissionMultiplier;
    while (this.#dustAccumulator >= 1) {
      this.#dustAccumulator -= 1;
      this.#spawnDust(player, profile);
    }

    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.#dustParticles.forEach((particle, index) => {
      const fraction = particle.active ? Math.max(0, particle.life / particle.duration) : 0;
      const size = particle.active
        ? (0.35 + (1 - fraction) * 1.1) * particle.sizeMultiplier
        : 0.0001;
      matrix.compose(
        position.set(particle.x, particle.y, particle.z),
        rotation.identity(),
        scale.set(size, size * 0.62, size),
      );
      this.#dust.setMatrixAt(index, matrix);
      this.#dust.setColorAt(index, particle.colour);
    });
    this.#dust.count = this.#dustParticles.length;
    this.#dust.instanceMatrix.needsUpdate = true;
    if (this.#dust.instanceColor) this.#dust.instanceColor.needsUpdate = true;
  }

  #spawnDust(player: Player, profile: TerrainContactProfile): void {
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
    particle.duration = (player.activity === 'working' ? 0.72 : 0.52) * profile.durationMultiplier;
    particle.life = particle.duration;
    particle.sizeMultiplier = profile.sizeMultiplier;
    particle.colour.setHex(profile.colour);
  }
}

const SCARE_REACTION_SECONDS = 0.58;
