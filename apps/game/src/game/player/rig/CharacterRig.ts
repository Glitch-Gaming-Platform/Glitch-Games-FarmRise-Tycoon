/**
 * Drives the farmer's skeleton from authored clips.
 *
 * ## The wobble, and why it was a derivative problem
 *
 * The previous rig computed its cycle position as
 *
 *     phase = elapsedSeconds * (7.4 + locomotion * 2.2)
 *
 * That is not a phase, it is a phase *scaled by a value that changes*. When
 * `locomotion` moves from 1.0 to 1.6 at t = 30 s, the computed phase jumps from
 * 288 to 320 radians instantly - five whole cycles - and the character teleports
 * to an unrelated point in its stride. Every acceleration, deceleration and
 * sprint tap produced one of these jumps. That is the wobble the audit saw, and
 * no amount of easing on `locomotion` removes it, because the error is
 * proportional to elapsed time: it gets *worse* the longer the session runs.
 *
 * The fix is to integrate. Phase advances by `frequency * dt` each frame and is
 * never recomputed from absolute time, so changing frequency changes the
 * derivative and nothing else. The pose is continuous by construction.
 *
 * ## Feet, and why phase comes from distance
 *
 * Frequency itself is derived from ground speed rather than chosen: the cycle
 * advances by `distanceTravelled / strideLength`, where `strideLength` is
 * measured from the pose keys by `measureStrideLength`. A foot in stance is
 * then already very close to world-stationary, and an explicit foot lock closes
 * the remaining gap. This is the difference between a walk that moves the
 * character and a character that skates while a walk plays nearby.
 */
import * as THREE from 'three';
import { BONE_INDEX, BONES, FOREARM_LENGTH, SHIN_LENGTH, THIGH_LENGTH, UPPERARM_LENGTH } from './skeletonDefinition.js'; // prettier-ignore
import { HARVEST, IDLE, PLANT, RUN, TEND, WALK, WAVE, type Clip } from './poseClips.js';
import { ankleFromHip, createJointBuffer, measureStrideLength, sampleClip, sampleGait, sampleRootMotion, type JointAngles } from './clipSampler.js'; // prettier-ignore
import { blendAngle, solveTwoBone } from './ikSolver.js';
import type { WorkAction } from '../Player.js';

/** Speed below which the character is considered stopped, in m/s. */
const IDLE_SPEED = 0.12;

/**
 * The speed window over which the walk clip gives way to the run clip.
 *
 * These are keyed to what the *player* is doing, not to an abstract speed
 * ramp. `Player.walkSpeed` is 6.5 m/s and `sprintMultiplier` is 1.6, so held-W
 * walking is 6.5 and Shift+W sprinting is 10.4. The previous window started
 * blending at 3.4 and finished at 7.4, which put an ordinary walk at 78% of
 * the RUN clip - the farmer was running whenever they moved at all, and the
 * run's much larger hip flexion (0.56 rad against the walk's 0.24) is most of
 * what read as feet kicking out in front.
 *
 * Anchoring the window to the two speeds the game can actually produce means
 * walking plays the walk and sprinting plays the run, which is what the clips
 * were authored for.
 */
const RUN_BLEND_START = 6.9;
const RUN_SPEED = 10.4;

/** Ground clearance under which a foot counts as planted, in metres. */
const PLANT_HEIGHT = 0.035;

/**
 * Clearance at which a planted foot is released again, in metres.
 *
 * Deliberately larger than `PLANT_HEIGHT`. With one shared threshold the
 * clearance sits on the boundary for several frames around heel strike and
 * toe-off and the foot plants, releases and re-plants on consecutive frames,
 * each transition snapping the IK on or off. That flicker was a visible
 * high-frequency buzz in the legs. Hysteresis makes the two transitions happen
 * at different heights, so noise around one of them cannot cross the other.
 */
const RELEASE_HEIGHT = 0.055;

/**
 * Seconds over which the foot lock fades out when it is released.
 *
 * Dropping the lock weight to zero in a single frame is a step change in two
 * joint angles, which is a pose discontinuity no matter how correct the target
 * was. Releasing over a short ramp costs nothing and removes the tick.
 */
const LOCK_RELEASE_SECONDS = 0.09;

/**
 * Stride mismatch at which the foot lock has faded out entirely.
 *
 * The lock exists to remove the last centimetre of slip from a gait that
 * genuinely covers the ground. Once cadence saturates, the gait no longer does
 * - the rig is openly warping the stride and says so through `strideScale` -
 * and a lock is then solving for a ground contact that is not happening. Every
 * correction it applies is a pose the clip was never authored to hit, injected
 * and withdrawn as the solver drifts in and out of reach. That is the second
 * source of the leg jitter, and unlike the distance bug it cannot be fixed by
 * feeding the solver better numbers, because there is no honest answer to give
 * it.
 *
 * So authority fades with the mismatch. At `strideScale === 1` the lock is at
 * full strength and the feet are genuinely planted; by 1.9 the authored clip
 * plays untouched, which is smooth by construction.
 */
const LOCK_FADE_STRIDE_SCALE = 1.9;

/**
 * Cadence ceiling, in gait cycles per second, for walking and for running.
 *
 * There is a scale conflict in this game that no amount of animation can
 * dissolve, and it is worth stating plainly rather than hiding behind a magic
 * number. The farmer is 1.60 m tall with 0.385 m legs, and the authored walk
 * moves each foot about 0.30 m per cycle. The player's walk speed is 6.5 m/s.
 * Tying cadence strictly to distance at that speed demands about 21 gait cycles
 * per second, which is not an animation, it is a strobe.
 *
 * (The rest of the codebase already assumes an arcade stride: the footstep
 * audio in PlayerController fires every 1.35 m, four and a half times the
 * distance this character's legs can actually cover in a step.)
 *
 * So cadence is capped at a rate a human eye reads as walking or running, and
 * the leg swing is widened to cover as much of the shortfall as the leg's reach
 * allows. Beyond that the feet do slide, and this is the one place in the rig
 * where that is a deliberate trade rather than a defect. The alternative is
 * halving the player's movement speed, which is a gameplay decision and not
 * one the renderer should make on its own.
 */
const MAX_CADENCE_WALK = 2.7;
const MAX_CADENCE_RUN = 3.0;

/** Bones whose X swing may be widened modestly by visual stride warping. */
const LEG_SWING_BONES = ['thigh.L', 'thigh.R', 'shin.L', 'shin.R'] as const;
const ARM_SWING_BONES = ['upperarm.L', 'upperarm.R', 'forearm.L', 'forearm.R'] as const;

/**
 * The simulation deliberately moves much faster than the farmer's short legs
 * could cover. Scaling joint angles by the full mismatch produced a goose-step
 * at ordinary gameplay speed, with the shoes kicking nearly horizontal. Keep
 * the cadence and reported mismatch honest, but cap visual exaggeration so the
 * walk stays compact and grounded.
 */
const MAX_VISUAL_LEG_SCALE = 1.3;
const MAX_VISUAL_ARM_SCALE = 1.2;

/**
 * Swing widening is split fore and aft rather than applied as one factor.
 *
 * Scaling a leg angle uniformly widens the stride in both directions, and half
 * of that widening goes in front of the hip where it reads as a kick. Real
 * fast walking lengthens almost entirely *behind* the body: the trailing leg
 * extends further while the lead foot keeps landing under the hips. Biasing
 * the two directions apart buys the same apparent stride for a fraction of the
 * forward excursion.
 */
const MAX_FORWARD_LEG_SCALE = 1.1;

export interface RigInput {
  readonly deltaSeconds: number;
  /** Ground speed in metres per second, from actual position deltas. */
  readonly speed: number;
  readonly facing: number;
  /** Smoothed signed turn rate, -1..1, for secondary-motion lag. */
  readonly turn: number;
  readonly working: boolean;
  readonly workAction: WorkAction | null;
  /** 0..1 through the current work action. */
  readonly workProgress: number;
  /** 0..1 through a scare wave, or 0 when not waving. */
  readonly waveProgress: number;
}

interface FootState {
  /** World-space Z (along facing) where this foot planted, relative to the body. */
  plantedOffset: number;
  planted: boolean;
  /** Body travel accumulated since the plant, in metres. */
  travelSincePlant: number;
  /** Current lock strength, 0..1, ramped rather than switched. */
  lock: number;
}

export class CharacterRig {
  readonly bones: THREE.Bone[];
  /** Stride length measured from the walk clip, in metres per full cycle. */
  readonly walkStride: number;
  readonly runStride: number;
  /**
   * How far the authored swing is being widened to chase the current speed.
   * 1 means the gait covers the ground honestly; above 1 the feet are being
   * asked for more than the legs can reach. Exposed so tests and the docs can
   * state the residual rather than guess at it.
   */
  strideScale = 1;

  readonly #angles: JointAngles;
  readonly #scratch: JointAngles;
  readonly #scratchB: JointAngles;
  readonly #rootScratch = new Float32Array(3);
  /** Authored mesh-local centre-of-mass translation for the current pose. */
  readonly rootOffset = new THREE.Vector3();
  #phase = 0;
  #blendedSpeed = 0;
  readonly #feet: Record<'L' | 'R', FootState> = {
    L: { plantedOffset: 0, planted: false, travelSincePlant: 0, lock: 0 },
    R: { plantedOffset: 0, planted: false, travelSincePlant: 0, lock: 0 },
  };
  /** Leg swing widening currently in effect, so the foot lock can account for it. */
  #visualLegScale = 1;
  /** World matrix of the right hand, for tool attachment. */
  readonly handMatrix = new THREE.Matrix4();

  constructor(bones: THREE.Bone[]) {
    this.bones = bones;
    const count = BONES.length;
    this.#angles = createJointBuffer(count);
    this.#scratch = createJointBuffer(count);
    this.#scratchB = createJointBuffer(count);
    this.walkStride = measureStrideLength(WALK);
    this.runStride = measureStrideLength(RUN);
  }

  /** Current gait phase, 0..1. Exposed so tests can assert continuity. */
  get phase(): number {
    return this.#phase;
  }

  update(input: RigInput): void {
    const dt = Math.min(input.deltaSeconds, 0.05);

    // Ease the speed used for blending, but never the speed used for phase.
    // Blending is presentation and wants smoothing; phase is a measurement of
    // how far the feet have carried the body and must stay honest.
    const blendRate = 1 - Math.exp(-dt * 11);
    this.#blendedSpeed += (input.speed - this.#blendedSpeed) * blendRate;

    const moving = !input.working && input.speed > IDLE_SPEED;
    const runBlend = THREE.MathUtils.clamp(
      (this.#blendedSpeed - RUN_BLEND_START) / (RUN_SPEED - RUN_BLEND_START),
      0,
      1,
    );
    const baseStride = THREE.MathUtils.lerp(this.walkStride, this.runStride, runBlend);
    const maxCadence = THREE.MathUtils.lerp(MAX_CADENCE_WALK, MAX_CADENCE_RUN, runBlend);

    // The integration. Cadence is a rate; phase accumulates it. Nothing here
    // reads absolute time, so a speed change alters the derivative and leaves
    // the current pose exactly where it was - which is the entire fix for the
    // stutter the old `time * frequency` formulation produced.
    const naturalCadence = moving ? input.speed / Math.max(0.05, baseStride) : 0;
    const cadence = Math.min(naturalCadence, maxCadence);
    this.strideScale = naturalCadence > cadence && cadence > 0 ? naturalCadence / cadence : 1;

    // The distance the foot lock is allowed to believe the body travelled.
    //
    // This is the fix for the leg jitter, and it is worth being precise about
    // why, because the old line looked obviously correct. It used the real
    // ground distance, `speed * dt`. At 6.5 m/s that is 0.108 m in a 60 Hz
    // frame - but cadence is capped at 2.7 cycles/s, so the *pose* only
    // advances about 0.010 m of authored stride in the same frame. The lock
    // therefore dragged its IK target backwards ten times faster than the clip
    // moved the leg: one frame of violent correction, then the target left the
    // leg's reach, `solveTwoBone` clamped, and the lock released. Next frame it
    // re-planted and did it again. Sixty times a second, that is a vibration.
    //
    // Deriving the distance from the cadence instead keeps the lock consistent
    // with the pose it is correcting. Below the cadence cap this is *exactly*
    // `speed * dt`, because cadence is then `speed / stride` by definition, so
    // genuine foot planting at honest speeds is unchanged.
    const gaitDistance = moving ? cadence * dt * baseStride * this.#visualLegScale : 0;
    if (moving) {
      this.#phase += cadence * dt;
      this.#phase -= Math.floor(this.#phase);
    }

    this.#angles.fill(0);
    this.rootOffset.set(0, 0, 0);
    let locomotionWeight = 0;

    if (input.working) {
      // Work clips settle the legs and drive the upper body. The gait is not
      // layered underneath, because a character who is planting seeds is not
      // also mid-stride.
      const clip = workClip(input.workAction);
      if (clip) {
        sampleClip(clip, input.workProgress, this.#angles, 1);
        this.#sampleRoot(clip, input.workProgress, 1);
      }
      this.#resetFeet();
    } else {
      locomotionWeight = THREE.MathUtils.clamp((this.#blendedSpeed - IDLE_SPEED) / 1.1, 0, 1);
      if (locomotionWeight < 1) {
        // Idle breathes on its own slow clock. This is the one place a
        // time-driven phase is correct: breathing is not tied to distance.
        this.#idleTime += dt;
        const idlePhase = (this.#idleTime * 0.21) % 1;
        sampleClip(IDLE, idlePhase, this.#angles, 1 - locomotionWeight);
        this.#sampleRoot(IDLE, idlePhase, 1 - locomotionWeight);
      }
      if (locomotionWeight > 0) {
        if (runBlend < 1) {
          sampleGait(WALK, this.#phase, this.#angles, this.#scratch, locomotionWeight * (1 - runBlend)); // prettier-ignore
          this.#sampleRoot(WALK, this.#phase, locomotionWeight * (1 - runBlend));
        }
        if (runBlend > 0) {
          sampleGait(RUN, this.#phase, this.#angles, this.#scratch, locomotionWeight * runBlend);
          this.#sampleRoot(RUN, this.#phase, locomotionWeight * runBlend);
        }
        this.#widenSwing();
        const lockAuthority =
          1 - THREE.MathUtils.smoothstep(this.strideScale, 1, LOCK_FADE_STRIDE_SCALE);
        this.#applyFootLock(gaitDistance, locomotionWeight * lockAuthority, dt);
      } else {
        this.#resetFeet();
      }
    }

    this.#applySecondaryMotion(input, locomotionWeight, runBlend);

    if (input.waveProgress > 0) {
      // Layered, not exclusive: the wave only writes arm and spine bones, so
      // whatever the legs are doing continues underneath it.
      this.#scratchB.fill(0);
      sampleClip(WAVE, input.waveProgress, this.#scratchB, 1);
      const fade = Math.sin(Math.min(1, input.waveProgress) * Math.PI);
      this.#sampleRoot(WAVE, input.waveProgress, fade);
      for (let i = 0; i < this.#angles.length; i += 1) {
        this.#angles[i] = THREE.MathUtils.lerp(this.#angles[i]!, this.#scratchB[i]!, fade);
      }
    }

    this.#writeToBones();
  }

  #idleTime = 0;

  #sampleRoot(clip: Clip, phase: number, weight: number): void {
    if (weight <= 0) return;
    this.#rootScratch.fill(0);
    sampleRootMotion(clip, phase, this.#rootScratch, weight);
    this.rootOffset.x += this.#rootScratch[0]!;
    this.rootOffset.y += this.#rootScratch[1]!;
    this.rootOffset.z += this.#rootScratch[2]!;
  }

  /**
   * Gives the disconnected ponytail and satchel the lag that makes primary
   * motion feel weighted. These are bones, not object-level squash, so the
   * body and contact points remain rigid while only the secondary pieces trail.
   */
  #applySecondaryMotion(input: RigInput, locomotion: number, runBlend: number): void {
    const cycle = this.#phase * Math.PI * 2;
    const ponytail = BONE_INDEX['ponytail']! * 3;
    const satchel = BONE_INDEX['satchel']! * 3;
    const speedSwing = locomotion * (0.1 + runBlend * 0.1);

    this.#angles[ponytail] = this.#angles[ponytail]! - Math.sin(cycle + 0.55) * speedSwing;
    this.#angles[ponytail + 2] =
      this.#angles[ponytail + 2]! - input.turn * (0.12 + locomotion * 0.1);
    this.#angles[satchel] = this.#angles[satchel]! + Math.sin(cycle + Math.PI) * speedSwing * 0.82;
    this.#angles[satchel + 2] = this.#angles[satchel + 2]! + input.turn * (0.1 + locomotion * 0.08);

    if (input.working) {
      const effort = Math.sin(input.workProgress * Math.PI);
      if (input.workAction === 'harvest') {
        this.#angles[ponytail + 2] = this.#angles[ponytail + 2]! + effort * 0.18;
        this.#angles[satchel + 2] = this.#angles[satchel + 2]! - effort * 0.15;
      } else if (input.workAction === 'plant') {
        this.#angles[ponytail] = this.#angles[ponytail]! - effort * 0.1;
        this.#angles[satchel] = this.#angles[satchel]! + effort * 0.08;
      }
    }
  }

  /**
   * Widens the leg and arm swing when the character is moving faster than its
   * cadence cap allows.
   *
   * Only the X component is scaled. The full stride mismatch remains available
   * through `strideScale`, but the visible pose receives only a fraction of it:
   * screen-space believability matters more than pretending a 0.38 m leg can
   * physically cover an arcade-speed six metres per second.
   */
  #widenSwing(): void {
    this.#visualLegScale = 1;
    if (this.strideScale <= 1.001) return;
    const excess = this.strideScale - 1;
    const legScale = Math.min(MAX_VISUAL_LEG_SCALE, 1 + excess * 0.22);
    const forwardScale = Math.min(MAX_FORWARD_LEG_SCALE, 1 + excess * 0.07);
    const armScale = Math.min(MAX_VISUAL_ARM_SCALE, 1 + excess * 0.14);
    this.#visualLegScale = legScale;

    for (const name of LEG_SWING_BONES) {
      const slot = BONE_INDEX[name]! * 3;
      const angle = this.#angles[slot]!;
      // Thigh flexion is the only signed swing here: positive is forward of the
      // hip, and that half gets a much smaller factor so widening the stride
      // does not throw the shoe out in front. A shin angle is always negative
      // (a knee bends one way) and is not a direction, so it takes the full
      // factor - clamping it as if it were "backwards" would straighten the
      // knee and drag the toe.
      const isThigh = name === 'thigh.L' || name === 'thigh.R';
      const scale = isThigh && angle > 0 ? forwardScale : legScale;
      this.#angles[slot] = angle * scale;
    }
    for (const name of ARM_SWING_BONES) {
      const slot = BONE_INDEX[name]! * 3;
      this.#angles[slot] = this.#angles[slot]! * armScale;
    }
  }

  #resetFeet(): void {
    this.#feet.L.planted = false;
    this.#feet.R.planted = false;
    this.#feet.L.travelSincePlant = 0;
    this.#feet.R.travelSincePlant = 0;
    this.#feet.L.lock = 0;
    this.#feet.R.lock = 0;
  }

  /**
   * Pins each foot to the ground for the duration of its stance.
   *
   * The clip already produces roughly the right motion; this removes the
   * residual. Without it the character skates by a centimetre or two per step,
   * which is small enough to look like bad animation rather than like a bug,
   * and therefore never gets fixed by tuning the clip.
   */
  #applyFootLock(distance: number, weight: number, dt: number): void {
    const releaseStep = dt / LOCK_RELEASE_SECONDS;

    for (const side of ['L', 'R'] as const) {
      const thighSlot = BONE_INDEX[`thigh.${side}`]! * 3;
      const shinSlot = BONE_INDEX[`shin.${side}`]! * 3;
      const foot = this.#feet[side];

      const thigh = this.#angles[thighSlot]!;
      const shin = this.#angles[shinSlot]!;
      const { forward, depth } = ankleFromHip(thigh, shin);
      // Depth is measured down from the hip; the rest-pose ankle sits at
      // THIGH_LENGTH + SHIN_LENGTH below it, so anything shallower is lifted.
      const clearance = THIGH_LENGTH + SHIN_LENGTH - depth;

      // Two thresholds, not one. Planting at PLANT_HEIGHT but only releasing
      // once the foot is clearly airborne stops the state flipping every frame
      // while the clearance hovers on the boundary.
      const threshold = foot.planted ? RELEASE_HEIGHT : PLANT_HEIGHT;
      if (clearance > threshold) {
        foot.planted = false;
        foot.lock = Math.max(0, foot.lock - releaseStep);
        if (foot.lock <= 0) continue;
      } else {
        if (!foot.planted) {
          foot.planted = true;
          foot.plantedOffset = forward;
          foot.travelSincePlant = 0;
          foot.lock = 0;
        }
        foot.travelSincePlant += distance;
      }

      // Where the ankle must be, in hip space, for it to have stayed put in the
      // world: the position it planted at, minus how far the body has since
      // travelled over it.
      const targetForward = foot.plantedOffset - foot.travelSincePlant;
      const solution = solveTwoBone(targetForward, depth, THIGH_LENGTH, SHIN_LENGTH, 1);
      if (solution.clamped) {
        // Out of reach means the lock has overstayed - the clip has already
        // moved on to swing. Fade out rather than tear the leg straight, and
        // rather than dropping two joint angles to their clip values in one
        // frame, which is a visible tick even when it is the right answer.
        foot.planted = false;
        foot.lock = Math.max(0, foot.lock - releaseStep);
        if (foot.lock <= 0) continue;
      } else if (foot.planted) {
        // Ease the lock in over the first 4 cm of travel so heel strike does
        // not snap. `travelSincePlant` is gait distance, so this ramp spans the
        // same fraction of a step at every speed.
        const easeIn = THREE.MathUtils.smoothstep(foot.travelSincePlant, 0, 0.04);
        foot.lock = Math.min(easeIn, foot.lock + releaseStep);
      }

      const lockWeight = weight * foot.lock;
      if (lockWeight <= 0) continue;
      this.#angles[thighSlot] = blendAngle(thigh, solution.upper, lockWeight);
      this.#angles[shinSlot] = blendAngle(shin, solution.lower, lockWeight);
    }
  }

  /**
   * Points the right arm at a world-space target so a tool meets what it is
   * supposed to meet. Called after `update`, because it overrides the clip.
   */
  reachRightHandTo(localForward: number, localDown: number, weight: number): void {
    if (weight <= 0) return;
    const upperSlot = BONE_INDEX['upperarm.R']! * 3;
    const foreSlot = BONE_INDEX['forearm.R']! * 3;
    const solution = solveTwoBone(localForward, localDown, UPPERARM_LENGTH, FOREARM_LENGTH, -1);
    this.#angles[upperSlot] = blendAngle(this.#angles[upperSlot]!, solution.upper, weight);
    this.#angles[foreSlot] = blendAngle(this.#angles[foreSlot]!, solution.lower, weight);
    this.#writeToBones();
  }

  /** Steadies a two-handed tool without disturbing the right-hand grip solve. */
  reachLeftHandTo(localForward: number, localDown: number, weight: number): void {
    if (weight <= 0) return;
    const upperSlot = BONE_INDEX['upperarm.L']! * 3;
    const foreSlot = BONE_INDEX['forearm.L']! * 3;
    const solution = solveTwoBone(localForward, localDown, UPPERARM_LENGTH, FOREARM_LENGTH, -1);
    this.#angles[upperSlot] = blendAngle(this.#angles[upperSlot]!, solution.upper, weight);
    this.#angles[foreSlot] = blendAngle(this.#angles[foreSlot]!, solution.lower, weight);
    this.#writeToBones();
  }

  #writeToBones(): void {
    for (let i = 0; i < BONES.length; i += 1) {
      const bone = this.bones[i]!;
      bone.rotation.set(this.#angles[i * 3]!, this.#angles[i * 3 + 1]!, this.#angles[i * 3 + 2]!);
    }
    this.bones[0]!.updateMatrixWorld(true);
    this.handMatrix.copy(this.bones[BONE_INDEX['hand.R']!]!.matrixWorld);
  }
}

function workClip(action: WorkAction | null): Clip | null {
  if (action === 'plant') return PLANT;
  if (action === 'tend') return TEND;
  if (action === 'harvest') return HARVEST;
  if (action === 'transfer') return PLANT;
  if (action === 'shoo') return WAVE;
  if (action === 'repair') return TEND;
  return null;
}
