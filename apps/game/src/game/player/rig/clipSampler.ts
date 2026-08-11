/**
 * Samples authored clips, and measures what they imply about locomotion.
 *
 * Interpolation is Catmull-Rom rather than linear. Linear interpolation between
 * pose keys produces a visible corner at every key - the angular velocity jumps
 * discontinuously - and on a walk cycle that reads as a mechanical tick twice
 * per step. Catmull-Rom is C1 continuous, so velocity is smooth through keys
 * while the curve still passes exactly through every authored pose, which is
 * the property that makes a key an actual key rather than a suggestion.
 */
import { BONE_INDEX, SHIN_LENGTH, THIGH_LENGTH } from './skeletonDefinition.js';
import type { Clip, Pose } from './poseClips.js';

export type JointAngles = Float32Array;

/** Three components per bone. */
export function createJointBuffer(boneCount: number): JointAngles {
  return new Float32Array(boneCount * 3);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
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

  // Segment length, accounting for the wrap back to zero on a looping clip.
  let span = k2.t - k1.t;
  if (span <= 0) span = clip.loop ? 1 - k1.t + k2.t : 1;
  let local = span > 0 ? (time - k1.t) / span : 0;
  if (local < 0) local += 1 / span;
  local = Math.min(1, Math.max(0, local));

  for (const [bone, index] of Object.entries(BONE_INDEX)) {
    // Only bones this clip actually mentions are written, so an upper-body clip
    // layered over a walk leaves the legs alone.
    if (!(bone in k1.pose) && !(bone in k2.pose)) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      const v1 = keyValue(k1.pose, bone, axis, 0);
      const v2 = keyValue(k2.pose, bone, axis, 0);
      const v0 = keyValue(k0.pose, bone, axis, v1);
      const v3 = keyValue(k3.pose, bone, axis, v2);
      const value = catmullRom(v0, v1, v2, v3, local);
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

  let span = k2.t - k1.t;
  if (span <= 0) span = clip.loop ? 1 - k1.t + k2.t : 1;
  let local = span > 0 ? (time - k1.t) / span : 0;
  if (local < 0) local += 1 / span;
  local = Math.min(1, Math.max(0, local));

  for (let axis = 0; axis < 3; axis += 1) {
    const v1 = k1.root?.[axis] ?? 0;
    const v2 = k2.root?.[axis] ?? 0;
    const v0 = k0.root?.[axis] ?? v1;
    const v3 = k3.root?.[axis] ?? v2;
    out[axis] = out[axis]! + catmullRom(v0, v1, v2, v3, local) * weight;
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
 * How far the body must travel per cycle for the stance foot to stay put.
 *
 * This is the number that stops feet sliding, and deriving it rather than
 * hard-coding it is the point: if someone edits the walk keys to take a longer
 * step, the stride length follows automatically and the feet stay planted. A
 * literal constant here would silently desynchronise the first time the pose
 * table changed, which is exactly the class of bug that produced the original
 * skating.
 *
 * It is measured as the total forward travel of the ankle across the stance
 * window, since during stance the foot is fixed to the world and the body moves
 * over it by precisely that amount.
 */
export function measureStrideLength(clip: Clip, requestedSamples = 240): number {
  const samples = Math.min(requestedSamples, heights.length);
  const scratch = createJointBuffer(Object.keys(BONE_INDEX).length);
  const thighSlot = BONE_INDEX['thigh.L']! * 3;
  const shinSlot = BONE_INDEX['shin.L']! * 3;

  for (let i = 0; i < samples; i += 1) {
    const phase = i / samples;
    scratch.fill(0);
    sampleClip(clip, phase, scratch, 1);
    // Stance is where the foot is lowest, which with a positive-down depth
    // means where depth is LARGEST. Sampling only the deepest 30% of the range
    // isolates it without needing a separate authored flag.
    const { forward, depth } = ankleFromHip(scratch[thighSlot]!, scratch[shinSlot]!);
    heights[i] = depth;
    forwards[i] = forward;
  }

  let deepest = -Infinity;
  let shallowest = Infinity;
  for (let i = 0; i < samples; i += 1) {
    if (heights[i]! > deepest) deepest = heights[i]!;
    if (heights[i]! < shallowest) shallowest = heights[i]!;
  }
  const stanceCutoff = deepest - (deepest - shallowest) * 0.3;

  let stanceMax = -Infinity;
  let stanceMin = Infinity;
  for (let i = 0; i < samples; i += 1) {
    if (heights[i]! < stanceCutoff) continue;
    if (forwards[i]! > stanceMax) stanceMax = forwards[i]!;
    if (forwards[i]! < stanceMin) stanceMin = forwards[i]!;
  }

  if (!Number.isFinite(stanceMax) || !Number.isFinite(stanceMin)) {
    return clip.nominalStride ?? 0.6;
  }
  return stanceMax - stanceMin;
}

// Module-level scratch so measureStrideLength allocates nothing per call. It
// runs once at startup, but it also runs in tests, and a helper that quietly
// allocates three arrays per invocation is a bad habit to leave lying around.
const heights = new Float64Array(512);
const forwards = new Float64Array(512);
