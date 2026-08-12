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
import { ankleFromHip, createJointBuffer, measureStrideLength, sampleClip, sampleGait, sampleRootMotion, STANCE_CLEARANCE, type JointAngles } from './clipSampler.js'; // prettier-ignore
import { blendAngle, solveTwoBone } from './ikSolver.js';
import type { WorkAction } from '../Player.js';

/** Speed below which the character is considered stopped, in m/s. */
const IDLE_SPEED = 0.12;

/**
 * The speed window over which the walk clip gives way to the run clip.
 *
 * These are keyed to what the *player* is doing, not to an abstract speed
 * ramp. `Player.walkSpeed` is 1.4 m/s and `sprintMultiplier` is 2.45, so held-W
 * walking is 1.4 and Shift+W sprinting is 3.43. Both numbers are what the
 * clips can cover honestly - see the note on `MAX_CADENCE_WALK` - so the walk
 * clip plays at walking speed, the run clip plays at sprinting speed, and the
 * window in between is crossed only while accelerating.
 */
const RUN_BLEND_START = 1.8;
const RUN_SPEED = 3.43;

/** Ground clearance under which a foot counts as planted, in metres. */
const PLANT_HEIGHT = STANCE_CLEARANCE;

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
 * Seconds over which the foot lock fades in when a foot plants.
 *
 * Shorter than the release, but not instantaneous. A release is the foot
 * leaving, which is gradual; a plant is the foot arriving, which is firm. The
 * 30 ms attack removed slide but pulled the thigh into one extra direction
 * change at heel strike. Fifty milliseconds still reaches full authority in
 * roughly three frames while keeping that correction below the pop threshold.
 */
const LOCK_ATTACK_SECONDS = 0.05;

/** Knee extension beyond which a trailing lock yields to toe-off. */
const LOCK_RELEASE_KNEE_ANGLE = -0.7;

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
 * ## What this used to be, and why it is now only a safety net
 *
 * This game had a scale conflict that two animation passes documented and
 * neither could dissolve: a 1.60 m farmer with 0.4 m legs moving at 6.5 m/s.
 * Cadence saturated at these caps, the rig widened the swing to cover part of
 * the shortfall, and the rest came out as sliding feet. The docs called the
 * remainder a gameplay decision, which it was.
 *
 * That decision has now been taken. Three numbers moved together, and none of
 * them works without the other two:
 *
 *   1. `measureStrideLength` was understating the stride by the stance
 *      fraction, so every cadence demand was ~1.5x too high to begin with.
 *   2. The walk and run clips were re-solved against the leg's actual reach:
 *      0.60 m of ground per walk cycle and 1.10 m per run cycle, against 0.37
 *      and 0.38 before.
 *   3. `Player.walkSpeed` came down from 6.5 m/s to 1.4, and the sprint
 *      multiplier up from 1.6 to 2.45, giving 1.4 and 3.43 m/s.
 *
 * The result is that ordinary walking asks for 2.3 cycles/s and sprinting for
 * 3.1, both under these ceilings, so `strideScale` stays at 1, the swing is
 * never widened, and the foot lock runs at full authority. The caps remain as a
 * guard: if someone raises the movement speed again, the character strides
 * faster up to here and then starts sliding rather than strobing, and
 * `strideScale` says so out loud.
 */
const MAX_CADENCE_WALK = 2.9;
const MAX_CADENCE_RUN = 3.5;

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
const WALK_TERMINAL_ROOT_LIFT = 0.04;

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
  /**
   * The clip's own ankle position last frame, before any lock was applied.
   *
   * Used to tell a landing foot from a swinging one. A long stride passes low
   * over the ground during terminal swing, so height alone plants the foot
   * several frames early - and the lock then insists that a foot which is
   * still travelling forward hold still, which is a hard correction every
   * frame until it releases. A foot that is not advancing is a foot that has
   * arrived.
   */
  clipForward: number;
  hasClipForward: boolean;
  /** Last corrective offset from the clip, held through the release ramp. */
  thighOffset: number;
  shinOffset: number;
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
  #transitionLoad = 0;
  #transitionVelocity = 0;
  readonly #feet: Record<'L' | 'R', FootState> = {
    L: { plantedOffset: 0, planted: false, travelSincePlant: 0, lock: 0, clipForward: 0, hasClipForward: false, thighOffset: 0, shinOffset: 0 }, // prettier-ignore
    R: { plantedOffset: 0, planted: false, travelSincePlant: 0, lock: 0, clipForward: 0, hasClipForward: false, thighOffset: 0, shinOffset: 0 }, // prettier-ignore
  };
  /** Leg swing widening currently in effect, so the foot lock can account for it. */
  #visualLegScale = 1;
  /** World matrix of the right hand, for tool attachment. */
  readonly handMatrix = new THREE.Matrix4();
  /** Value/velocity pairs for ponytail pitch/roll and satchel pitch/roll. */
  readonly #secondarySprings = new Float32Array(8);
  readonly #ikTarget = new THREE.Vector3();
  readonly #ikLocal = new THREE.Vector3();
  readonly #ikInverse = new THREE.Matrix4();

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

  /** Signed start/stop load: positive accelerates, negative decelerates. */
  get transitionLoad(): number {
    return this.#transitionLoad;
  }

  /**
   * How strongly one foot is currently locked to the ground, 0..1.
   *
   * Exposed so that "the planted foot does not slide" can be tested against
   * the frames the rig actually claims are planted. Measuring slip over every
   * frame where the ankle happens to pass near the floor instead measures the
   * swing leg skimming the ground, which is not slip and cannot be fixed.
   */
  footLock(side: 'L' | 'R'): number {
    return THREE.MathUtils.smoothstep(this.#feet[side].lock, 0, 1);
  }

  update(input: RigInput): void {
    const dt = Math.min(input.deltaSeconds, 0.05);

    // Ease the speed used for blending, but never the speed used for phase.
    // Blending is presentation and wants smoothing; phase is a measurement of
    // how far the feet have carried the body and must stay honest.
    const blendRate = 1 - Math.exp(-dt * 11);
    this.#blendedSpeed += (input.speed - this.#blendedSpeed) * blendRate;
    const transitionTarget = input.working
      ? 0
      : THREE.MathUtils.clamp((input.speed - this.#blendedSpeed) / RUN_BLEND_START, -1, 1);
    this.#stepTransitionLoad(transitionTarget, dt);

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
    if (moving) {
      this.#phase -= cadence * dt;
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
      // Contact correction advances by actual ground distance, so the gait must
      // be fully visible before the speeds at which feet are expected to lock.
      // Blending half a gait over idle while advancing a full-speed lock makes
      // the target outrun the rendered leg and repeatedly replant.
      locomotionWeight = THREE.MathUtils.clamp((this.#blendedSpeed - IDLE_SPEED) / 0.45, 0, 1);
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
        // The mirrored leg reaches terminal swing half a cycle from the
        // authored root keys. A short pelvis vault keeps either heel clear
        // until its final descent instead of letting the low root turn two
        // adjacent samples into a near-ground teleport.
        this.rootOffset.y +=
          terminalSwingLift(this.#phase) *
          locomotionWeight *
          (1 - runBlend) *
          WALK_TERMINAL_ROOT_LIFT;
        this.#widenSwing();
        const gaitDistance = moving ? cadence * dt * baseStride * this.#visualLegScale : 0;
        const lockAuthority =
          1 - THREE.MathUtils.smoothstep(this.strideScale, 1, LOCK_FADE_STRIDE_SCALE);
        // Once locomotion is visible, contact correction needs full authority.
        // Multiplying by the pose blend made a foot report a full lock at slow
        // walking speeds while only applying half of the correction, leaving a
        // visible residual skate precisely when the camera can read it best.
        this.#applyFootLock(gaitDistance, lockAuthority, dt);
        this.#turnRecoveryBehind('L', this.#phase, locomotionWeight, runBlend);
        this.#turnRecoveryBehind('R', (this.#phase + 0.5) % 1, locomotionWeight, runBlend);
      } else {
        this.#resetFeet();
      }
    }

    if (!input.working) this.#applyLocomotionDynamics(input, locomotionWeight, runBlend);
    this.#applySecondaryMotion(input, locomotionWeight, runBlend, dt);

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

  #stepTransitionLoad(target: number, dt: number): void {
    const omega = 3.8 * Math.PI * 2;
    const displacement = this.#transitionLoad - target;
    const decay = Math.exp(-omega * dt);
    const timeTerm = (this.#transitionVelocity + omega * displacement) * dt;
    this.#transitionLoad = target + (displacement + timeTerm) * decay;
    this.#transitionVelocity = (this.#transitionVelocity - omega * timeTerm) * decay;
  }

  /**
   * Layers inertial starts/stops and directional commitment over the gait.
   * These offsets are intentionally small: the authored feet remain the
   * authority, while the pelvis/ribs explain why the body is accelerating or
   * turning instead of rotating like a signpost above them.
   */
  #applyLocomotionDynamics(input: RigInput, locomotion: number, runBlend: number): void {
    const load = this.#transitionLoad;
    const brace = Math.abs(load);
    const turn = input.turn * locomotion;
    const walkWeight = locomotion * (1 - runBlend);
    const cycle = this.#phase * Math.PI * 2;
    const strideOpposition = Math.cos(cycle);
    const lateralTransfer = Math.sin(cycle);
    const leftPhase = this.#phase;
    const rightPhase = (this.#phase + 0.5) % 1;
    const loadingResponse = Math.max(loadingPulse(leftPhase), loadingPulse(rightPhase));
    const hips = BONE_INDEX['hips']! * 3;
    const spine = BONE_INDEX['spine']! * 3;
    const chest = BONE_INDEX['chest']! * 3;
    const neck = BONE_INDEX['neck']! * 3;
    const head = BONE_INDEX['head']! * 3;
    const leftShoulder = BONE_INDEX['shoulder.L']! * 3;
    const rightShoulder = BONE_INDEX['shoulder.R']! * 3;
    const leftUpperArm = BONE_INDEX['upperarm.L']! * 3;
    const rightUpperArm = BONE_INDEX['upperarm.R']! * 3;
    const leftForearm = BONE_INDEX['forearm.L']! * 3;
    const rightForearm = BONE_INDEX['forearm.R']! * 3;
    const leftShin = BONE_INDEX['shin.L']! * 3;
    const rightShin = BONE_INDEX['shin.R']! * 3;

    // A start pitches the ribs forward over flexed knees while the root stays
    // a fraction behind; a stop reverses that relationship and then settles.
    this.rootOffset.y -= brace * 0.018;
    this.rootOffset.z -= load * 0.012;
    this.#angles[hips] = this.#angles[hips]! + load * 0.055;
    this.#angles[spine] = this.#angles[spine]! + load * 0.11;
    this.#angles[chest] = this.#angles[chest]! + load * 0.075;
    this.#angles[neck] = this.#angles[neck]! - load * 0.035;
    this.#angles[leftShin] = this.#angles[leftShin]! - brace * 0.08;
    this.#angles[rightShin] = this.#angles[rightShin]! - brace * 0.08;

    // The authored clip owns the ankle path; this layer supplies the mass that
    // travels over it. Loading lands low, the pelvis commits over the support
    // side, and the ribs/shoulders rotate against the hips. The small vertical
    // drop is re-solved against any locked ankle so it bends the support knee
    // without moving the planted boot.
    const supportDrop = -loadingResponse * walkWeight * 0.012;
    this.rootOffset.y += supportDrop;
    this.#preserveLockedFootHeight(supportDrop);
    this.rootOffset.x -= lateralTransfer * walkWeight * 0.012;
    this.#angles[hips + 1] = this.#angles[hips + 1]! - strideOpposition * walkWeight * 0.038;
    this.#angles[hips + 2] = this.#angles[hips + 2]! + lateralTransfer * walkWeight * 0.028;
    this.#angles[spine + 1] = this.#angles[spine + 1]! + strideOpposition * walkWeight * 0.025;
    this.#angles[chest + 1] = this.#angles[chest + 1]! + strideOpposition * walkWeight * 0.048;
    this.#angles[chest + 2] = this.#angles[chest + 2]! - lateralTransfer * walkWeight * 0.02;

    // Arms balance the stride rather than hanging beside it. A modest elbow
    // fold at the back of each swing keeps the hand clear of the thigh, while
    // the delayed neck/head counter-motion prevents the hat reading as welded
    // to the torso.
    const armDrive = strideOpposition * walkWeight;
    this.#angles[rightShoulder] = this.#angles[rightShoulder]! + armDrive * 0.024;
    this.#angles[leftShoulder] = this.#angles[leftShoulder]! - armDrive * 0.024;
    this.#angles[rightUpperArm] = this.#angles[rightUpperArm]! + armDrive * 0.095;
    this.#angles[leftUpperArm] = this.#angles[leftUpperArm]! - armDrive * 0.095;
    this.#angles[rightForearm] = this.#angles[rightForearm]! - Math.max(0, -armDrive) * 0.085;
    this.#angles[leftForearm] = this.#angles[leftForearm]! - Math.max(0, armDrive) * 0.085;
    const delayedHead = Math.cos(cycle - 0.28) * walkWeight;
    this.#angles[neck + 1] = this.#angles[neck + 1]! - delayedHead * 0.018;
    this.#angles[head + 1] = this.#angles[head + 1]! - delayedHead * 0.028;
    this.#angles[neck + 2] = this.#angles[neck + 2]! - Math.sin(cycle - 0.18) * walkWeight * 0.012;
    this.#angles[head + 2] = this.#angles[head + 2]! - Math.sin(cycle - 0.3) * walkWeight * 0.018;

    this.#applyWalkLegFinish('L', leftPhase, walkWeight);
    this.#applyWalkLegFinish('R', rightPhase, walkWeight);

    // Steering begins in the eyes and shoulders, then crosses the ribs into a
    // modest pelvis bank. The actor yaw is smoothed separately in PlayerView;
    // this layer gives that turn an internal lead/counter-rotation.
    this.rootOffset.x -= turn * 0.012;
    this.#angles[hips + 1] = this.#angles[hips + 1]! - turn * 0.05;
    this.#angles[hips + 2] = this.#angles[hips + 2]! - turn * (0.026 + runBlend * 0.012);
    this.#angles[spine + 1] = this.#angles[spine + 1]! + turn * 0.065;
    this.#angles[chest + 1] = this.#angles[chest + 1]! + turn * 0.11;
    this.#angles[leftShoulder + 1] = this.#angles[leftShoulder + 1]! + turn * 0.035;
    this.#angles[rightShoulder + 1] = this.#angles[rightShoulder + 1]! + turn * 0.035;
    this.#angles[neck + 1] = this.#angles[neck + 1]! + turn * 0.06;
    this.#angles[head + 1] = this.#angles[head + 1]! + turn * 0.115;
  }

  /**
   * Keeps a locked ankle at the same world height while the pelvis compresses.
   * Moving the root alone would push a planted boot through the floor; bending
   * the support chain by the same amount creates visible loading response with
   * no change to the foot-lock target or forward position.
   */
  #preserveLockedFootHeight(rootShift: number): void {
    if (rootShift === 0) return;
    for (const side of ['L', 'R'] as const) {
      const lock = this.footLock(side);
      if (lock <= 0.01) continue;
      const thighSlot = BONE_INDEX[`thigh.${side}`]! * 3;
      const shinSlot = BONE_INDEX[`shin.${side}`]! * 3;
      const thigh = this.#angles[thighSlot]!;
      const shin = this.#angles[shinSlot]!;
      const ankle = ankleFromHip(thigh, shin);
      const solution = solveTwoBone(
        ankle.forward,
        ankle.depth + rootShift,
        THIGH_LENGTH,
        SHIN_LENGTH,
        1,
      );
      if (solution.clamped) continue;
      const weight = THREE.MathUtils.smoothstep(lock, 0, 1);
      this.#angles[thighSlot] = THREE.MathUtils.lerp(thigh, solution.upper, weight);
      this.#angles[shinSlot] = THREE.MathUtils.lerp(shin, solution.lower, weight);
    }
  }

  /** Adds swing separation and a readable heel-to-toe boot roll. */
  #applyWalkLegFinish(side: 'L' | 'R', phase: number, weight: number): void {
    if (weight <= 0) return;
    const thigh = BONE_INDEX[`thigh.${side}`]! * 3;
    const shin = BONE_INDEX[`shin.${side}`]! * 3;
    const foot = BONE_INDEX[`foot.${side}`]! * 3;
    const toe = BONE_INDEX[`toe.${side}`]! * 3;
    const swingAuthority = 1 - THREE.MathUtils.smoothstep(this.footLock(side), 0, 0.45);
    // Finish before terminal swing so the extra knee fold cannot pull a low
    // descending heel forward across the soil-contact band.
    const passing = phasePulse(phase, 0.8, 0.105) * swingAuthority * weight;
    const heelStrike = phasePulse(phase, 0.015, 0.11) * weight;
    const toeOff = phasePulse(phase, 0.54, 0.2) * weight;

    this.#angles[shin] = this.#angles[shin]! - passing * 0.11;
    this.#angles[thigh + 2] = this.#angles[thigh + 2]! + passing * (side === 'L' ? -0.032 : 0.032);
    this.#angles[foot] = this.#angles[foot]! + heelStrike * 0.075 - toeOff * 0.1 + passing * 0.045;
    this.#angles[toe] = this.#angles[toe]! - heelStrike * 0.025 + toeOff * 0.13;
  }

  /**
   * Turns the airborne recovery silhouette behind the body for both walk and run.
   *
   * The contact solver remains authoritative once the boot plants. Before that,
   * terminal swing keeps the knee in front while the shin folds back, so the
   * shoe cannot become the leading point of a straight-leg kick.
   */
  #turnRecoveryBehind(side: 'L' | 'R', phase: number, locomotion: number, runBlend: number): void {
    const lock = this.footLock(side);
    const airborneAuthority = 1 - THREE.MathUtils.smoothstep(lock, 0, 0.8);
    const thigh = BONE_INDEX[`thigh.${side}`]! * 3;
    const shin = BONE_INDEX[`shin.${side}`]! * 3;
    const foot = BONE_INDEX[`foot.${side}`]! * 3;
    const toe = BONE_INDEX[`toe.${side}`]! * 3;
    const ankle = ankleFromHip(this.#angles[thigh]!, this.#angles[shin]!);
    const clearance = THIGH_LENGTH + SHIN_LENGTH - ankle.depth + this.rootOffset.y;
    const airborne = THREE.MathUtils.smoothstep(clearance, 0.045, 0.085);
    const terminalSwing = phasePulse(phase, 0.9, 0.13) * airborneAuthority * airborne * locomotion;
    if (terminalSwing <= 0) return;

    const targetShin = THREE.MathUtils.lerp(-1.02, -1.12, runBlend);
    this.#angles[shin] = THREE.MathUtils.lerp(
      this.#angles[shin]!,
      Math.min(this.#angles[shin]!, targetShin),
      terminalSwing,
    );
    const targetFoot = THREE.MathUtils.lerp(0.48, 0.56, runBlend);
    this.#angles[foot] = THREE.MathUtils.lerp(
      this.#angles[foot]!,
      Math.max(this.#angles[foot]!, targetFoot),
      terminalSwing,
    );
    this.#angles[toe] = THREE.MathUtils.lerp(
      this.#angles[toe]!,
      Math.max(this.#angles[toe]!, 0.08),
      terminalSwing,
    );
  }

  /**
   * Gives the disconnected ponytail and satchel the lag that makes primary
   * motion feel weighted. These are bones, not object-level squash, so the
   * body and contact points remain rigid while only the secondary pieces trail.
   */
  #applySecondaryMotion(input: RigInput, locomotion: number, runBlend: number, dt: number): void {
    const cycle = this.#phase * Math.PI * 2;
    const ponytail = BONE_INDEX['ponytail']! * 3;
    const satchel = BONE_INDEX['satchel']! * 3;
    const speedSwing = locomotion * (0.072 + runBlend * 0.075);
    const idleTail = locomotion < 0.01 ? Math.sin(this.#idleTime * 1.15) * 0.016 : 0;
    const idleBag = locomotion < 0.01 ? Math.sin(this.#idleTime * 0.92 + 1.3) * 0.01 : 0;
    let ponytailPitchTarget =
      -Math.sin(cycle + 0.55) * speedSwing - this.#transitionLoad * 0.032 + idleTail;
    let ponytailRollTarget = -input.turn * (0.1 + locomotion * 0.08);
    let satchelPitchTarget =
      Math.sin(cycle + Math.PI) * speedSwing * 0.78 + this.#transitionLoad * 0.045 + idleBag;
    let satchelRollTarget = input.turn * (0.09 + locomotion * 0.065);

    if (input.working) {
      const effort = Math.sin(input.workProgress * Math.PI);
      if (input.workAction === 'harvest') {
        ponytailRollTarget += effort * 0.18;
        satchelRollTarget -= effort * 0.15;
      } else if (input.workAction === 'plant') {
        ponytailPitchTarget -= effort * 0.075;
        satchelPitchTarget += effort * 0.06;
      }
    }

    // Exact critically-damped springs carry momentum through starts, turns and
    // stops without becoming frame-rate dependent. Directly writing a sine to
    // the bones made the hair and bag reverse on the same frame as the torso;
    // they now arrive later and settle at different rates because they have
    // visibly different mass.
    this.#angles[ponytail] =
      this.#angles[ponytail]! + this.#springSecondary(0, ponytailPitchTarget, 5.8, dt);
    this.#angles[ponytail + 2] =
      this.#angles[ponytail + 2]! + this.#springSecondary(2, ponytailRollTarget, 5.1, dt);
    this.#angles[satchel] =
      this.#angles[satchel]! + this.#springSecondary(4, satchelPitchTarget, 4.2, dt);
    this.#angles[satchel + 2] =
      this.#angles[satchel + 2]! + this.#springSecondary(6, satchelRollTarget, 3.7, dt);
  }

  #springSecondary(slot: number, target: number, frequency: number, dt: number): number {
    const value = this.#secondarySprings[slot]!;
    const velocity = this.#secondarySprings[slot + 1]!;
    const omega = frequency * Math.PI * 2;
    const displacement = value - target;
    const decay = Math.exp(-omega * dt);
    const timeTerm = (velocity + omega * displacement) * dt;
    const next = target + (displacement + timeTerm) * decay;
    const nextVelocity = (velocity - omega * timeTerm) * decay;
    this.#secondarySprings[slot] = next;
    this.#secondarySprings[slot + 1] = nextVelocity;
    return next;
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
    for (const side of ['L', 'R'] as const) {
      const foot = this.#feet[side];
      foot.planted = false;
      foot.travelSincePlant = 0;
      foot.lock = 0;
      foot.hasClipForward = false;
      foot.thighOffset = 0;
      foot.shinOffset = 0;
    }
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
    const attackStep = dt / LOCK_ATTACK_SECONDS;

    for (const side of ['L', 'R'] as const) {
      const thighSlot = BONE_INDEX[`thigh.${side}`]! * 3;
      const shinSlot = BONE_INDEX[`shin.${side}`]! * 3;
      const foot = this.#feet[side];

      const thigh = this.#angles[thighSlot]!;
      const shin = this.#angles[shinSlot]!;
      const { forward, depth } = ankleFromHip(thigh, shin);
      // Depth is measured down from the hip; the rest-pose ankle sits at
      // THIGH_LENGTH + SHIN_LENGTH below it, so anything shallower is lifted.
      // The authored pelvis track raises and lowers the whole skeleton, so it
      // is part of how far the foot is off the floor, not a separate effect.
      const clearance = THIGH_LENGTH + SHIN_LENGTH - depth + this.rootOffset.y;
      const advancing = foot.hasClipForward && forward > foot.clipForward + 1e-4;
      foot.clipForward = forward;
      foot.hasClipForward = true;

      // Two thresholds, not one. Planting at PLANT_HEIGHT but only releasing
      // once the foot is clearly airborne stops the state flipping every frame
      // while the clearance hovers on the boundary. The extra `advancing` term
      // is what stops a long stride's terminal swing - which passes low over
      // the ground with the foot still travelling forward - being mistaken for
      // a landing several frames early.
      const threshold = foot.planted ? RELEASE_HEIGHT : PLANT_HEIGHT;
      let releasing = clearance > threshold || (!foot.planted && advancing);

      if (!releasing) {
        if (!foot.planted) {
          foot.planted = true;
          foot.plantedOffset = forward;
          foot.travelSincePlant = 0;
          foot.lock = 0;
        }
        foot.travelSincePlant += distance;

        // Where the ankle must be, in hip space, for it to have stayed put in
        // the world: the position it planted at, minus how far the body has
        // since travelled over it.
        const targetForward = foot.plantedOffset - foot.travelSincePlant;
        const solution = solveTwoBone(targetForward, depth, THIGH_LENGTH, SHIN_LENGTH, 1);
        const targetDistance = Math.hypot(targetForward, depth);
        const mildReachClamp =
          solution.clamped && targetDistance <= THIGH_LENGTH + SHIN_LENGTH + 0.012;
        const overextendedToeOff = targetForward < 0 && solution.lower > LOCK_RELEASE_KNEE_ANGLE;
        if ((solution.clamped && !mildReachClamp) || overextendedToeOff) {
          // Out of reach means the lock has overstayed - the clip has already
          // moved on to swing. Yield before the trailing knee reaches the
          // straight-leg singularity for the same reason: another locked frame
          // would turn ordinary ground travel into a large hip-angle jump.
          releasing = true;
        } else {
          // Ease in over the first 2 cm of travel so heel strike does not snap.
          // `travelSincePlant` is gait distance, so the ramp spans the same
          // fraction of a step at every speed.
          const easeIn = THREE.MathUtils.smoothstep(foot.travelSincePlant, 0, 0.02);
          foot.lock = Math.min(easeIn, foot.lock + attackStep);
          // Remember the correction as an offset from the clip, not as an
          // absolute pose. That is what makes the release harmless: see below.
          foot.thighOffset = solution.upper - thigh;
          foot.shinOffset = solution.lower - shin;
        }
      }

      if (releasing) {
        foot.planted = false;
        foot.lock = Math.max(0, foot.lock - releaseStep);
        if (foot.lock <= 0) continue;
      }

      // The lock is applied as a *decaying offset* from the clip rather than as
      // a target the solver keeps chasing.
      //
      // Chasing was the second source of leg snap, and it only showed up once
      // the strides were long enough to matter. A release takes a fixed 0.09 s;
      // at a run's cadence that is a quarter of the whole cycle, during which
      // the clip folds the knee up hard for the swing while the lock is still
      // solving for a foot on the floor. The two disagree by more every frame,
      // and when the lock finally reaches zero the leg jumps to the clip - 0.31
      // rad in one frame, which is exactly the "single snapped IK correction"
      // the jitter test was written to catch.
      //
      // Holding the offset instead means the released leg follows the clip's
      // shape immediately and only the residual correction fades out, so there
      // is nothing left to snap back from.
      // Smooth the authority envelope, not the authored pose. The raw progress
      // remains linear in seconds, while zero slope at both ends prevents the
      // contact correction from adding a direction change as it enters or
      // leaves the gait.
      const lockWeight = weight * THREE.MathUtils.smoothstep(foot.lock, 0, 1);
      if (lockWeight <= 0) continue;
      this.#angles[thighSlot] = thigh + foot.thighOffset * lockWeight;
      this.#angles[shinSlot] = shin + foot.shinOffset * lockWeight;
    }
  }

  /**
   * Points the right arm at a world-space target so a tool meets what it is
   * supposed to meet. Called after `update`, because it overrides the clip.
   */
  reachRightHandTo(localForward: number, localDown: number, weight: number): void {
    this.#reachHandSagittal('R', localForward, localDown, weight);
  }

  /** Steadies a two-handed tool without disturbing the right-hand grip solve. */
  reachLeftHandTo(localForward: number, localDown: number, weight: number): void {
    this.#reachHandSagittal('L', localForward, localDown, weight);
  }

  /** Plant-only solve that accounts for the already-animated torso and shoulder. */
  reachRightHandToPoint(localX: number, localY: number, localZ: number, weight: number): void {
    this.#reachHandToPoint('R', localX, localY, localZ, weight);
  }

  #reachHandSagittal(
    side: 'L' | 'R',
    localForward: number,
    localDown: number,
    weight: number,
  ): void {
    if (weight <= 0) return;
    const upperSlot = BONE_INDEX[`upperarm.${side}`]! * 3;
    const foreSlot = BONE_INDEX[`forearm.${side}`]! * 3;
    const solution = solveTwoBone(localForward, localDown, UPPERARM_LENGTH, FOREARM_LENGTH, 1);
    // Links are authored down -Y: positive solver-forward maps to negative
    // Three.js X rotation. Feeding the leg-space signs through unchanged made
    // both watering arms reach behind the torso while the can remained ahead.
    this.#angles[upperSlot] = blendAngle(this.#angles[upperSlot]!, -solution.upper, weight);
    this.#angles[foreSlot] = blendAngle(this.#angles[foreSlot]!, -solution.lower, weight);
    this.#writeToBones();
  }

  #reachHandToPoint(
    side: 'L' | 'R',
    localX: number,
    localY: number,
    localZ: number,
    weight: number,
  ): void {
    if (weight <= 0) return;
    const upperBone = this.bones[BONE_INDEX[`upperarm.${side}`]!]!;
    const parent = upperBone.parent;
    if (!parent) return;

    // The body clip has already pitched and twisted the shoulder. Solve in
    // that animated parent's space rather than from a hard-coded rest-height
    // shoulder, otherwise the arm reaches past a tool the torso already moved
    // toward. The actor transform is applied to both points and cancels out,
    // keeping the solve valid whether the rig is unit-tested alone or parented
    // under PlayerView.
    const actor = this.bones[0]!.parent;
    const locateTarget = (): void => {
      actor?.updateMatrixWorld(true);
      parent.updateMatrixWorld(true);
      this.#ikTarget.set(localX, localY, localZ);
      if (actor) this.#ikTarget.applyMatrix4(actor.matrixWorld);
      this.#ikInverse.copy(parent.matrixWorld).invert();
      this.#ikLocal.copy(this.#ikTarget).applyMatrix4(this.#ikInverse).sub(upperBone.position);
    };
    locateTarget();

    // The plant tool sits below and beyond the relaxed arm's reach. Solving a
    // clamped elbow alone leaves the hand visibly detached, while authoring the
    // entire reach into every clip key folds the farmer under the hat. Let the
    // body contribute only the shortfall: a small hip/rib hinge moves the
    // shoulder behind the trowel, then the arm solve supplies the remaining
    // reach. This keeps the force line continuous without changing the tool's
    // authored path or the action timing.
    const armReach = UPPERARM_LENGTH + FOREARM_LENGTH;
    const planarDistance = Math.hypot(this.#ikLocal.z, this.#ikLocal.y);
    const reachShortfall = Math.max(0, planarDistance - (armReach - 0.012));
    if (reachShortfall > 0) {
      const hinge = THREE.MathUtils.clamp(reachShortfall * 1.9, 0, 0.22) * weight;
      this.#angles[BONE_INDEX['hips']! * 3] = this.#angles[BONE_INDEX['hips']! * 3]! + hinge * 0.32;
      this.#angles[BONE_INDEX['spine']! * 3] =
        this.#angles[BONE_INDEX['spine']! * 3]! + hinge * 0.43;
      this.#angles[BONE_INDEX['chest']! * 3] =
        this.#angles[BONE_INDEX['chest']! * 3]! + hinge * 0.25;
      this.#writeToBones();
      locateTarget();
    }

    const upperSlot = BONE_INDEX[`upperarm.${side}`]! * 3;
    const foreSlot = BONE_INDEX[`forearm.${side}`]! * 3;
    const solution = solveTwoBone(
      this.#ikLocal.z,
      -this.#ikLocal.y,
      UPPERARM_LENGTH,
      FOREARM_LENGTH,
      1,
    );
    // The analytic solver treats positive pitch as +Z-forward. Three.js bone
    // rotations act on links authored down -Y, where positive X carries the
    // link toward -Z, so the solved angles enter the skeleton with both signs
    // inverted.
    this.#angles[upperSlot] = blendAngle(this.#angles[upperSlot]!, -solution.upper, weight);
    this.#angles[foreSlot] = blendAngle(this.#angles[foreSlot]!, -solution.lower, weight);
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

function terminalSwingLift(phase: number): number {
  const sidePhase = phase - Math.floor(phase);
  const mirroredPhase = (sidePhase + 0.5) % 1;
  const pulse = (value: number): number => {
    if (value < 0.86) return 0;
    return Math.sin(((value - 0.86) / 0.14) * Math.PI);
  };
  return Math.max(pulse(sidePhase), pulse(mirroredPhase));
}

/** Smooth cyclic pulse centred on `centre`, with `width` measured in phase. */
function phasePulse(phase: number, centre: number, width: number): number {
  const wrapped = Math.abs(((phase - centre + 0.5) % 1) - 0.5);
  if (wrapped >= width) return 0;
  return 0.5 + 0.5 * Math.cos((wrapped / width) * Math.PI);
}

/** Loading begins at heel contact; it must not wrap into terminal swing. */
function loadingPulse(phase: number): number {
  if (phase < 0 || phase > 0.22) return 0;
  return Math.sin((phase / 0.22) * Math.PI);
}
