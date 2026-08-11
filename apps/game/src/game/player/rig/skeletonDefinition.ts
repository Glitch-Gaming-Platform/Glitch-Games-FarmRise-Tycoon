/**
 * The farmer's skeleton, and the rule for binding the authored mesh to it.
 *
 * ## Why a skeleton at all
 *
 * Every character animation in this project used to be `sin(uTime * frequency)`
 * evaluated in a vertex shader against region masks built from `position.y`.
 * That approach has three failures that no amount of tuning removes:
 *
 *   1. **It cannot hold a pose.** A sine has no keys, so there is no such thing
 *      as anticipation, a held contact frame, or follow-through. Everything
 *      oscillates symmetrically, which is why the audit read the result as
 *      "procedural oscillation rather than authored gait cycles".
 *   2. **Region masks smear instead of articulating.** `smoothstep(0.50, 0.62,
 *      position.y)` blends a rotation across a 12 cm band, so the hip does not
 *      bend - the whole pelvis stretches. That is the "body still deforms like
 *      one mesh" note.
 *   3. **Frequency was multiplied by time.** `uMotionTime * (7.4 + locomotion
 *      * 2.2)` means the moment `locomotion` changes, the *entire phase
 *      history* is re-scaled and the character snaps to a different point in
 *      the cycle. This is the wobble. It is not a tuning problem; it is a
 *      derivative problem, and it is fixed by integrating phase rather than
 *      multiplying time.
 *
 * A real skeleton fixes all three at once, and it costs nothing at runtime that
 * matters here: the player is a single object, so `THREE.SkinnedMesh` is one
 * draw call exactly as the old `THREE.Mesh` was.
 *
 * ## Why auto-skinning rather than authored weights
 *
 * The whole art pipeline is code (`tools/blender/assets.py`), and the farmer is
 * built from disconnected primitives - a cylinder per limb, a sphere per hand.
 * Disconnected primitives are the *easy* case for capsule-distance skinning,
 * because a vertex in the forearm cylinder is physically far from every other
 * bone. Painting weights in Blender would move the definition out of code for
 * no accuracy gain, and would silently rot the first time a limb moved.
 *
 * Bone positions below are in three.js space: Y up, +Z is the direction the
 * farmer faces. They are derived from the literal coordinates in assets.py,
 * remembering that the glTF exporter maps Blender (x, y, z) to (x, z, -y).
 */

export interface BoneDefinition {
  readonly name: string;
  /** Index into BONES of the parent, or -1 for the root. Parents precede children. */
  readonly parent: number;
  /** Rest position of the joint, in mesh-local space, world-absolute (not parent-relative). */
  readonly head: readonly [number, number, number];
  /**
   * The far end of the bone's influence capsule. Vertices are weighted by
   * distance to the head-tail segment.
   */
  readonly tail: readonly [number, number, number];
  /** Capsule radius for auto-skinning, in metres. */
  readonly radius: number;
  /**
   * -1 binds only vertices with x < 0, +1 only x > 0, 0 binds either side.
   * Without this the left forearm claims right-hand vertices whenever the arms
   * pass close to the body, which produces a limb that tears in half mid-stride.
   */
  readonly side: -1 | 0 | 1;
  /**
   * Multiplies this bone's computed weight before normalisation.
   *
   * `hips` needs a wide capsule so it can catch the satchel hanging off the
   * right hip - nothing else is near enough to claim it, and an unclaimed
   * vertex falls through to "nearest bone", which is the thigh, which makes the
   * bag swing with the leg. But a wide hips capsule also reaches deep into both
   * thighs and drags the pelvis around with every step. Priority separates the
   * two roles: reach far, but lose to any limb that actually contains the
   * vertex.
   */
  readonly priority: number;
}

export const BONES: readonly BoneDefinition[] = [
  // --- spine chain ---------------------------------------------------------
  { name: 'root', parent: -1, head: [0, 0, 0], tail: [0, 0.2, 0], radius: 0.0, side: 0, priority: 1 }, // prettier-ignore
  // Wide capsule, low priority - see the `priority` doc comment. The pelvis
  // volume runs 0.435..0.685 and the satchel hangs out to x = 0.37.
  { name: 'hips', parent: 0, head: [0, 0.50, 0], tail: [0, 0.70, 0], radius: 0.40, side: 0, priority: 0.30 }, // prettier-ignore
  { name: 'spine', parent: 1, head: [0, 0.70, 0], tail: [0, 0.90, 0], radius: 0.30, side: 0, priority: 0.85 }, // prettier-ignore
  { name: 'chest', parent: 2, head: [0, 0.90, 0], tail: [0, 1.13, 0], radius: 0.32, side: 0, priority: 0.85 }, // prettier-ignore
  { name: 'neck', parent: 3, head: [0, 1.15, 0], tail: [0, 1.26, 0], radius: 0.13, side: 0, priority: 1 }, // prettier-ignore
  // The head capsule is deliberately large: it must capture the whole 0.40 m
  // hat brim, which is the farmer's primary silhouette read and must stay
  // perfectly rigid relative to the skull.
  { name: 'head', parent: 4, head: [0, 1.26, 0], tail: [0, 1.62, 0], radius: 0.46, side: 0, priority: 1 }, // prettier-ignore

  // --- left arm. Shoulder 1.06, elbow 0.88, wrist 0.73, hand 0.695. --------
  { name: 'shoulder.L', parent: 3, head: [-0.12, 1.06, 0], tail: [-0.19, 1.06, 0], radius: 0.10, side: -1, priority: 1 }, // prettier-ignore
  { name: 'upperarm.L', parent: 6, head: [-0.19, 1.06, 0], tail: [-0.275, 0.88, 0.014], radius: 0.10, side: -1, priority: 1 }, // prettier-ignore
  { name: 'forearm.L', parent: 7, head: [-0.275, 0.88, 0.014], tail: [-0.295, 0.73, 0.055], radius: 0.085, side: -1, priority: 1 }, // prettier-ignore
  { name: 'hand.L', parent: 8, head: [-0.295, 0.73, 0.055], tail: [-0.30, 0.675, 0.09], radius: 0.10, side: -1, priority: 1 }, // prettier-ignore

  // --- right arm -----------------------------------------------------------
  { name: 'shoulder.R', parent: 3, head: [0.12, 1.06, 0], tail: [0.19, 1.06, 0], radius: 0.10, side: 1, priority: 1 }, // prettier-ignore
  { name: 'upperarm.R', parent: 10, head: [0.19, 1.06, 0], tail: [0.275, 0.88, 0.014], radius: 0.10, side: 1, priority: 1 }, // prettier-ignore
  { name: 'forearm.R', parent: 11, head: [0.275, 0.88, 0.014], tail: [0.295, 0.73, 0.055], radius: 0.085, side: 1, priority: 1 }, // prettier-ignore
  { name: 'hand.R', parent: 12, head: [0.295, 0.73, 0.055], tail: [0.30, 0.675, 0.09], radius: 0.10, side: 1, priority: 1 }, // prettier-ignore

  // --- left leg. Hip 0.56, knee 0.36, ankle 0.18, sole 0.025. --------------
  { name: 'thigh.L', parent: 1, head: [-0.09, 0.56, 0], tail: [-0.105, 0.36, 0.014], radius: 0.125, side: -1, priority: 1 }, // prettier-ignore
  { name: 'shin.L', parent: 14, head: [-0.105, 0.36, 0.014], tail: [-0.105, 0.18, -0.012], radius: 0.115, side: -1, priority: 1 }, // prettier-ignore
  // The foot capsule is deliberately long and fat, and the toe capsule small.
  // The boot is a flattened sphere plus a 0.25 m sole slab running from z=-0.07
  // to z=0.18. Sized evenly, the slab split down the middle between foot and
  // toe and visibly hinged apart at toe-off. The sole is one rigid piece of
  // leather, so the foot owns nearly all of it and the toe only claims the last
  // few centimetres, where a real boot actually creases.
  { name: 'foot.L', parent: 15, head: [-0.105, 0.16, -0.06], tail: [-0.105, 0.04, 0.07], radius: 0.20, side: -1, priority: 1.2 }, // prettier-ignore
  { name: 'toe.L', parent: 16, head: [-0.105, 0.04, 0.13], tail: [-0.105, 0.035, 0.19], radius: 0.07, side: -1, priority: 1.2 }, // prettier-ignore

  // --- right leg -----------------------------------------------------------
  { name: 'thigh.R', parent: 1, head: [0.09, 0.56, 0], tail: [0.105, 0.36, 0.014], radius: 0.125, side: 1, priority: 1 }, // prettier-ignore
  { name: 'shin.R', parent: 18, head: [0.105, 0.36, 0.014], tail: [0.105, 0.18, -0.012], radius: 0.115, side: 1, priority: 1 }, // prettier-ignore
  { name: 'foot.R', parent: 19, head: [0.105, 0.175, -0.01], tail: [0.105, 0.055, 0.04], radius: 0.155, side: 1, priority: 1.15 }, // prettier-ignore
  { name: 'toe.R', parent: 20, head: [0.105, 0.045, 0.09], tail: [0.105, 0.035, 0.18], radius: 0.10, side: 1, priority: 1.15 }, // prettier-ignore

  // --- secondary pieces ---------------------------------------------------
  // These disconnected islands previously belonged to the broad head/hips
  // capsules, making the ponytail and satchel perfectly rigid. Dedicated
  // bones let them lag the primary motion without adding a draw call or a
  // second exported asset.
  { name: 'ponytail', parent: 5, head: [0.205, 1.46, -0.09], tail: [0.225, 1.28, -0.14], radius: 0.105, side: 1, priority: 2.0 }, // prettier-ignore
  { name: 'satchel', parent: 1, head: [0.255, 0.73, -0.04], tail: [0.255, 0.48, -0.04], radius: 0.145, side: 1, priority: 2.0 }, // prettier-ignore
  // The diagonal strap crosses close to both arms. Without a dedicated,
  // chest-parented capsule its vertices are claimed by the upper arms and the
  // strap stretches into a large triangle during harvest and scare gestures.
  { name: 'strap', parent: 3, head: [-0.088, 1.165, 0.151], tail: [0.198, 0.615, 0.151], radius: 0.060, side: 0, priority: 3.0 }, // prettier-ignore
];

export const BONE_INDEX: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(BONES.map((bone, index) => [bone.name, index])),
);

/** Hip-to-ankle length in the rest pose. Used to size the stride and the leg IK. */
export const LEG_LENGTH =
  BONES[BONE_INDEX['thigh.L']!]!.head[1] - BONES[BONE_INDEX['foot.L']!]!.head[1];

/** Thigh and shin segment lengths, for the analytic two-bone leg solver. */
export const THIGH_LENGTH =
  BONES[BONE_INDEX['thigh.L']!]!.head[1] - BONES[BONE_INDEX['shin.L']!]!.head[1];
export const SHIN_LENGTH =
  BONES[BONE_INDEX['shin.L']!]!.head[1] - BONES[BONE_INDEX['foot.L']!]!.head[1];

/** Upper-arm and forearm lengths, for the arm solver used by tool contact. */
export const UPPERARM_LENGTH =
  BONES[BONE_INDEX['upperarm.R']!]!.head[1] - BONES[BONE_INDEX['forearm.R']!]!.head[1];
export const FOREARM_LENGTH =
  BONES[BONE_INDEX['forearm.R']!]!.head[1] - BONES[BONE_INDEX['hand.R']!]!.head[1];
