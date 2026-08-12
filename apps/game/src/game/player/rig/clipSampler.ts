/**
 * Samples authored clips, and measures what they imply about locomotion.
 *
 * Interpolation is a time-aware monotone cubic rather than linear. Linear
 * interpolation produces a visible velocity corner at every key, while a
 * uniform Catmull-Rom assumes every key is equally spaced and overshoots when
 * a contact sequence contains tightly packed heel-placement beats. Monotone
 * Hermite tangents preserve C1 motion inside each directional run, pass exactly
 * through authored poses, and cannot invent an extra reversal between them.
 */
import { BONE_INDEX, SHIN_LENGTH, THIGH_LENGTH } from './skeletonDefinition.js';
import type { Clip, Pose } from './poseClips.js';

export type JointAngles = Float32Array;

/** Three components per bone. */
export function createJointBuffer(boneCount: number): JointAngles {
  return new Float32Array(boneCount * 3);
}

function monotoneTangent(
  previousSlope: number,
  nextSlope: number,
  previousSpan: number,
  nextSpan: number,
): number {
  if (previousSlope === 0 || nextSlope === 0 || previousSlope * nextSlope <= 0) return 0;
  const previousWeight = 2 * nextSpan + previousSpan;
  const nextWeight = nextSpan + 2 * previousSpan;
  return (previousWeight + nextWeight) / (previousWeight / previousSlope + nextWeight / nextSlope);
}

function monotoneCubic(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  time: number,
): number {
  const previousSpan = Math.max(1e-6, t1 - t0);
  const span = Math.max(1e-6, t2 - t1);
  const nextSpan = Math.max(1e-6, t3 - t2);
  const previousSlope = (p1 - p0) / previousSpan;
  const slope = (p2 - p1) / span;
  const nextSlope = (p3 - p2) / nextSpan;
  const tangent1 = monotoneTangent(previousSlope, slope, previousSpan, span);
  const tangent2 = monotoneTangent(slope, nextSlope, span, nextSpan);
  const u = Math.min(1, Math.max(0, (time - t1) / span));
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * p1 +
    (u3 - 2 * u2 + u) * span * tangent1 +
    (-2 * u3 + 3 * u2) * p2 +
    (u3 - u2) * span * tangent2
  );
}

function keyValue(pose: Pose, bone: string, axis: number, fallback: number): number {
  const entry = pose[bone];
  return entry ? entry[axis]! : fallback;
}

/**
 * Writes the clip's pose at normalised time `t` into `out`.
 *
 * Bones absent from a key inherit `restValue` (zero), which is what lets a clip
 * like WAVE specify only the arm and leave the legs to whatever locomotion clip
 * is blended underneath it.
 */
export function sampleClip(clip: Clip, t: number, out: JointAngles, weight = 1): void {
  const keys = clip.keys;
  const count = keys.length;
  if (count === 0) return;

  const time = clip.loop ? t - Math.floor(t) : Math.min(1, Math.max(0, t));

  // Locate the segment. Clips have at most a handful of keys, so a linear scan
  // is cheaper than the branch-heavy binary search it would replace.
  let i1 = 0;
  for (let i = 0; i < count; i += 1) {
    if (keys[i]!.t <= time) i1 = i;
    else break;
  }

  const wrap = (index: number): number => {
    if (clip.loop) return (index + count) % count;
    return Math.min(count - 1, Math.max(0, index));
  };

  const k1 = keys[i1]!;
  const i2 = wrap(i1 + 1);
  const k2 = keys[i2]!;
  const k0 = keys[wrap(i1 - 1)]!;
  const k3 = keys[wrap(i2 + 1)]!;

  const t1 = k1.t;
  let t2 = k2.t;
  let sampleTime = time;
  if (clip.loop && i2 <= i1) t2 += 1;
  if (clip.loop && sampleTime < t1) sampleTime += 1;
  let t0 = k0.t;
  let t3 = k3.t;
  if (clip.loop) {
    while (t0 >= t1) t0 -= 1;
    while (t3 <= t2) t3 += 1;
  } else {
    if (i1 === 0) t0 = t1 - (t2 - t1);
    if (i2 === count - 1) t3 = t2 + (t2 - t1);
  }

  for (const [bone, index] of Object.entries(BONE_INDEX)) {
    // Only bones this clip actually mentions are written, so an upper-body clip
    // layered over a walk leaves the legs alone.
    if (!(bone in k1.pose) && !(bone in k2.pose)) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      const v1 = keyValue(k1.pose, bone, axis, 0);
      const v2 = keyValue(k2.pose, bone, axis, 0);
      const v0 = keyValue(k0.pose, bone, axis, v1);
      const v3 = keyValue(k3.pose, bone, axis, v2);
      const value = monotoneCubic(v0, v1, v2, v3, t0, t1, t2, t3, sampleTime);
      const slot = index * 3 + axis;
      out[slot] = out[slot]! + value * weight;
    }
  }
}

/**
 * Samples the authored centre-of-mass track that accompanies a pose clip.
 *
 * Rotating a crouched skeleton without lowering its root makes the feet lift
 * off the floor; rotating a run without a flight arc makes the torso glide at
 * one height. Keeping translation in the same keys as the joint pose makes
 * those contacts reviewable and prevents a second procedural clock from
 * drifting away from the limbs.
 */
export function sampleRootMotion(clip: Clip, t: number, out: Float32Array, weight = 1): void {
  const keys = clip.keys;
  const count = keys.length;
  if (count === 0) return;

  const time = clip.loop ? t - Math.floor(t) : Math.min(1, Math.max(0, t));
  let i1 = 0;
  for (let i = 0; i < count; i += 1) {
    if (keys[i]!.t <= time) i1 = i;
    else break;
  }

  const wrap = (index: number): number => {
    if (clip.loop) return (index + count) % count;
    return Math.min(count - 1, Math.max(0, index));
  };
  const k1 = keys[i1]!;
  const i2 = wrap(i1 + 1);
  const k2 = keys[i2]!;
  const k0 = keys[wrap(i1 - 1)]!;
  const k3 = keys[wrap(i2 + 1)]!;

  const t1 = k1.t;
  let t2 = k2.t;
  let sampleTime = time;
  if (clip.loop && i2 <= i1) t2 += 1;
  if (clip.loop && sampleTime < t1) sampleTime += 1;
  let t0 = k0.t;
  let t3 = k3.t;
  if (clip.loop) {
    while (t0 >= t1) t0 -= 1;
    while (t3 <= t2) t3 += 1;
  } else {
    if (i1 === 0) t0 = t1 - (t2 - t1);
    if (i2 === count - 1) t3 = t2 + (t2 - t1);
  }

  for (let axis = 0; axis < 3; axis += 1) {
    const v1 = k1.root?.[axis] ?? 0;
    const v2 = k2.root?.[axis] ?? 0;
    const v0 = k0.root?.[axis] ?? v1;
    const v3 = k3.root?.[axis] ?? v2;
    out[axis] = out[axis]! + monotoneCubic(v0, v1, v2, v3, t0, t1, t2, t3, sampleTime) * weight;
  }
}

/**
 * Mirrors a gait clip onto the opposite leg and arm by sampling it a half-cycle
 * out of phase, so only one side has to be authored.
 */
const MIRROR_PAIRS: readonly (readonly [string, string])[] = [
  ['thigh.L', 'thigh.R'],
  ['shin.L', 'shin.R'],
  ['foot.L', 'foot.R'],
  ['toe.L', 'toe.R'],
  ['shoulder.L', 'shoulder.R'],
  ['upperarm.L', 'upperarm.R'],
  ['forearm.L', 'forearm.R'],
  ['hand.L', 'hand.R'],
];

/**
 * Samples a locomotion clip for both sides.
 *
 * The left side reads the clip at `phase`; the right side reads it at
 * `phase + 0.5` and has its limb angles copied across. Spine and hips are
 * averaged between the two samples so the torso does not double up.
 */
export function sampleGait(
  clip: Clip,
  phase: number,
  out: JointAngles,
  scratch: JointAngles,
  weight = 1,
): void {
  scratch.fill(0);
  sampleClip(clip, phase, scratch, 1);
  for (let i = 0; i < out.length; i += 1) out[i] = out[i]! + scratch[i]! * weight;

  scratch.fill(0);
  sampleClip(clip, phase + 0.5, scratch, 1);
  for (const [left, right] of MIRROR_PAIRS) {
    const from = BONE_INDEX[left]!;
    const to = BONE_INDEX[right]!;
    // X is a pure swing angle and mirrors directly. Y (twist) and Z (splay) are
    // handed, so they invert.
    out[to * 3] = out[to * 3]! + scratch[from * 3]! * weight;
    out[to * 3 + 1] = out[to * 3 + 1]! - scratch[from * 3 + 1]! * weight;
    out[to * 3 + 2] = out[to * 3 + 2]! - scratch[from * 3 + 2]! * weight;
  }
}

/**
 * Forward-kinematic ankle position for one leg at a phase, measured from the
 * hip, in the sagittal plane.
 *
 * `depth` is positive DOWNWARD, matching the convention `solveTwoBone` takes.
 * The first version returned it negated, which meant the foot-lock solver was
 * handed a target mirrored through the hip and quietly produced a leg pointing
 * up. The unit test caught it; naming the field `depth` rather than `height`
 * is what stops it coming back.
 *
 * Used by `measureStrideLength`, by the rig and by the tests, deliberately: a
 * test that recomputed this independently would be testing its own copy of the
 * maths rather than the code that ships.
 */
export function ankleFromHip(
  thighAngle: number,
  shinAngle: number,
): { forward: number; depth: number } {
  const kneeForward = Math.sin(thighAngle) * THIGH_LENGTH;
  const kneeDown = Math.cos(thighAngle) * THIGH_LENGTH;
  const shinWorld = thighAngle + shinAngle;
  return {
    forward: kneeForward + Math.sin(shinWorld) * SHIN_LENGTH,
    depth: kneeDown + Math.cos(shinWorld) * SHIN_LENGTH,
  };
}

/**
 * How far the body travels in one full cycle if the stance foot never slides.
 *
 * Deriving it rather than hard-coding it is the point: if someone edits the
 * walk keys to take a longer step, the stride length follows automatically and
 * the feet stay planted. A literal constant here would silently desynchronise
 * the first time the pose table changed, which is exactly the class of bug that
 * produced the original skating.
 *
 * ## The division, which is the whole correction
 *
 * The previous version returned the ankle's forward travel across the stance
 * window and called that the per-cycle stride. It is not. It is the distance
 * covered *during that window*, and one foot's stance is only part of a cycle -
 * about 62% of it walking, 36% running. Dividing by the stance fraction
 * converts "distance covered while this foot was down" into "distance covered
 * per cycle", which is what cadence needs.
 *
 * Skipping that division understated the walk by 1.5x and the run by 2.8x, and
 * the understatement went straight into `cadence = speed / stride`. The rig
 * then demanded a cadence half again too fast, hit its ceiling far earlier than
 * it needed to, and reported a stride mismatch that was mostly this arithmetic
 * rather than the character's legs. It is the reason a foot lock that is
 * correct in isolation was documented as only working below 0.7 m/s.
 *
 * Stance is detected by ground clearance, using the authored pelvis track: a
 * clip that fakes its length by lifting the whole body cannot pass, because
 * lifting the body raises the clearance and drops those samples out of the
 * stance window. Samples where the ankle is still travelling *forward* are
 * excluded too, since a foot moving with the direction of travel is swinging,
 * not planted, however close to the floor it passes.
 */
export function measureStrideLength(clip: Clip, requestedSamples = 240): number {
  const samples = Math.max(1, Math.min(requestedSamples, 512));
  const scratch = createJointBuffer(Object.keys(BONE_INDEX).length);
  const root = new Float32Array(3);
  const heights = new Float64Array(samples);
  const forwards = new Float64Array(samples);
  const thighSlot = BONE_INDEX['thigh.L']! * 3;
  const shinSlot = BONE_INDEX['shin.L']! * 3;
  const legLength = THIGH_LENGTH + SHIN_LENGTH;

  for (let i = 0; i < samples; i += 1) {
    const phase = i / samples;
    scratch.fill(0);
    root.fill(0);
    sampleClip(clip, phase, scratch, 1);
    sampleRootMotion(clip, phase, root, 1);
    const { forward, depth } = ankleFromHip(scratch[thighSlot]!, scratch[shinSlot]!);
    // Positive = above the floor. The pelvis track moves the whole skeleton, so
    // it belongs in the clearance rather than being ignored as decoration.
    heights[i] = legLength - depth + root[1]!;
    forwards[i] = forward;
  }

  let stanceMax = -Infinity;
  let stanceMin = Infinity;
  let stanceSamples = 0;
  for (let i = 0; i < samples; i += 1) {
    if (heights[i]! > STANCE_CLEARANCE) continue;
    const next = forwards[(i + 1) % samples]!;
    if (next > forwards[i]! + 1e-4) continue;
    stanceSamples += 1;
    if (forwards[i]! > stanceMax) stanceMax = forwards[i]!;
    if (forwards[i]! < stanceMin) stanceMin = forwards[i]!;
  }

  const stanceFraction = stanceSamples / samples;
  if (!Number.isFinite(stanceMax) || !Number.isFinite(stanceMin) || stanceFraction < 0.05) {
    return clip.nominalStride ?? 0.6;
  }
  return (stanceMax - stanceMin) / stanceFraction;
}

/**
 * Ground clearance under which a foot counts as planted, in metres.
 *
 * Shared with the rig's own plant threshold on purpose: a stride measured
 * against one definition of contact and enforced against another is two
 * systems that will disagree the first time a clip changes.
 */
export const STANCE_CLEARANCE = 0.035;
