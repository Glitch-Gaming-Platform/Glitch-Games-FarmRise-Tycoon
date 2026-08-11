/**
 * Authored pose clips for the farmer.
 *
 * These are keyframes, not oscillators. That distinction is the whole point of
 * the rewrite: a sine wave is symmetric in time, and every interesting thing in
 * character animation is asymmetric. A walk spends about 60% of each leg's
 * cycle in stance and 40% in swing. A harvest swing takes 0.18 s to wind up and
 * 0.06 s to strike. None of that is expressible as `sin(t)`, which is why the
 * previous version read as oscillation no matter how the amplitudes were tuned.
 *
 * ## Sign convention
 *
 * All angles are radians of local X rotation unless the key says otherwise.
 * Positive X rotation swings a bone's tail toward +Z, which is the direction
 * the farmer faces. So:
 *   - `thigh` positive = knee forward, negative = leg trailing behind.
 *   - `shin` is always <= 0, because a knee only bends one way.
 *   - `foot` positive = toes up (dorsiflexion), negative = pointed (plantarflexion).
 *
 * ## Where the numbers came from
 *
 * The leg timings follow a standard human walk cycle - heel strike, loading
 * response, midstance, terminal stance, toe-off, then a swing whose knee bends
 * far harder than anything in stance so the foot clears the ground. Amplitudes
 * are then scaled down for a four-heads-tall chibi, whose legs are 0.39 m long
 * and would look frantic at adult angles.
 */

/** One joint's angles at one instant. Absent joints hold their rest pose. */
export type Pose = Readonly<Record<string, readonly [number, number, number]>>;

export interface Keyframe {
  /** Normalised time within the clip, 0..1. Must ascend. */
  readonly t: number;
  /** Mesh-local centre-of-mass translation in metres: lateral, vertical, forward. */
  readonly root?: readonly [number, number, number];
  readonly pose: Pose;
}

export interface Clip {
  readonly name: string;
  /** Cyclic clips wrap from the last key back to the first. */
  readonly loop: boolean;
  readonly keys: readonly Keyframe[];
  /**
   * How far the body travels in one full cycle, in metres, if this is a
   * locomotion clip. `measureStrideLength` recomputes this from the keys at
   * startup so it can never drift out of sync with the poses; the literal here
   * is only a fallback for tests that construct clips directly.
   */
  readonly nominalStride?: number;
}

// ===========================================================================
// Walk
// ===========================================================================

/**
 * Left leg leads. Phase 0 is left heel strike; phase 0.5 is right heel strike.
 * The right leg reads the same table offset by half a cycle, which is what
 * `sampleGait` does, so only one leg is authored.
 *
 * ## Why the excursion is biased behind the hip
 *
 * The first version of this table reached +0.31 rad in front of the hip and
 * only -0.26 rad behind it. That asymmetry is the single reason the walk read
 * as kicking its feet out in front: a leg thrown forward of the body is the
 * silhouette of a goose-step, and the runtime's stride warp then multiplied
 * exactly that pose.
 *
 * A real walk is the other way round. Hip flexion at heel strike is modest -
 * the foot lands close to under the body - and the long part of the cycle is
 * *extension*, the trailing leg pushing out behind while the body travels over
 * it. So the excursion here is deliberately rear-heavy (+0.26 front, -0.44
 * back). That buys two things at once: the front kick disappears, and the
 * measured stride goes up, because stride is the distance the ankle covers
 * during stance and stance is the trailing half of the cycle.
 */
export const WALK: Clip = {
  name: 'walk',
  loop: true,
  nominalStride: 0.62,
  keys: [
    {
      // Heel strike. The lead foot lands close to under the body, not out in
      // front of it. Reaching further here would not lengthen the step - it
      // would only brake, which is what the old +0.31 pose looked like.
      t: 0.0,
      root: [-0.012, -0.018, 0],
      pose: {
        'thigh.L': [0.3, 0, 0],
        'shin.L': [-0.04, 0, 0],
        'foot.L': [0.06, 0, 0],
        'toe.L': [0, 0, 0],
        'shoulder.R': [0.05, 0, 0],
        'upperarm.R': [0.28, 0, 0],
        'forearm.R': [-0.3, 0, 0],
        'upperarm.L': [-0.24, 0, 0],
        'forearm.L': [-0.16, 0, 0],
        hips: [0, -0.07, 0],
        spine: [0.02, 0.06, 0.0],
        chest: [0, 0.09, 0],
        neck: [0, -0.05, 0],
        head: [0, -0.04, 0],
      },
    },
    {
      // Loading response. The knee absorbs the landing - this is the beat that
      // reads as weight, and the one a sine wave can never produce because it
      // is a fast dip immediately after an extreme.
      t: 0.12,
      root: [-0.018, -0.036, 0.006],
      pose: {
        'thigh.L': [0.19, 0, 0],
        'shin.L': [-0.26, 0, 0],
        'foot.L': [0.02, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.26, 0, 0],
        'forearm.R': [-0.26, 0, 0],
        'upperarm.L': [-0.22, 0, 0],
        'forearm.L': [-0.14, 0, 0],
        hips: [0, -0.05, 0],
        spine: [0.03, 0.04, 0],
        chest: [0, 0.06, 0],
      },
    },
    {
      // Midstance. Support leg straight under the hips, body at its highest.
      t: 0.3,
      root: [-0.016, 0.008, 0],
      pose: {
        'thigh.L': [-0.04, 0, 0],
        'shin.L': [-0.04, 0, 0],
        'foot.L': [0.0, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.06, 0, 0],
        'forearm.R': [-0.2, 0, 0],
        'upperarm.L': [-0.04, 0, 0],
        'forearm.L': [-0.12, 0, 0],
        hips: [0, 0, 0],
        spine: [0.02, 0, 0],
        chest: [0, 0, 0],
      },
    },
    {
      // Terminal stance. Heel is off, weight rolling onto the toe and the hip
      // extending hard. This key and the next are where a walk's length
      // actually comes from.
      t: 0.44,
      root: [-0.006, 0.016, -0.004],
      pose: {
        'thigh.L': [-0.4, 0, 0],
        'shin.L': [-0.015, 0, 0],
        'foot.L': [-0.13, 0, 0],
        'toe.L': [0.28, 0, 0],
        'upperarm.R': [-0.16, 0, 0],
        'forearm.R': [-0.16, 0, 0],
        'upperarm.L': [0.18, 0, 0],
        'forearm.L': [-0.2, 0, 0],
        hips: [0, 0.05, 0],
        spine: [0.02, -0.04, 0],
        chest: [0, -0.06, 0],
      },
    },
    {
      // Toe-off. Maximum push, ankle fully pointed. The single frame that sells
      // propulsion, and the furthest the leg gets from the body all cycle.
      t: 0.52,
      root: [0.002, 0.01, -0.006],
      pose: {
        'thigh.L': [-0.5, 0, 0],
        'shin.L': [-0.3, 0, 0],
        'foot.L': [-0.26, 0, 0],
        'toe.L': [0.4, 0, 0],
        'upperarm.R': [-0.26, 0, 0],
        'forearm.R': [-0.14, 0, 0],
        'upperarm.L': [0.28, 0, 0],
        'forearm.L': [-0.24, 0, 0],
        hips: [0, 0.07, 0],
        spine: [0.02, -0.06, 0],
        chest: [0, -0.09, 0],
        neck: [0, 0.05, 0],
        head: [0, 0.04, 0],
      },
    },
    {
      // Early swing. Knee bends far harder than anywhere in stance so the foot
      // clears the ground. Peak knee flexion is the readability beat of a walk,
      // and it is what lets the leg return from -0.44 without scuffing.
      t: 0.66,
      root: [0.014, -0.004, 0.002],
      pose: {
        'thigh.L': [-0.14, 0, 0],
        'shin.L': [-0.82, 0, 0],
        'foot.L': [0.08, 0, 0],
        'toe.L': [0.05, 0, 0],
        'upperarm.R': [-0.2, 0, 0],
        'forearm.R': [-0.18, 0, 0],
        'upperarm.L': [0.22, 0, 0],
        'forearm.L': [-0.3, 0, 0],
        hips: [0, 0.04, 0],
        spine: [0.02, -0.03, 0],
        chest: [0, -0.05, 0],
      },
    },
    {
      // Mid swing.
      t: 0.8,
      root: [0.018, 0.006, 0.004],
      pose: {
        'thigh.L': [0.1, 0, 0],
        'shin.L': [-0.5, 0, 0],
        'foot.L': [0.08, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.02, 0, 0],
        'forearm.R': [-0.24, 0, 0],
        'upperarm.L': [0.02, 0, 0],
        'forearm.L': [-0.24, 0, 0],
        hips: [0, -0.02, 0],
        spine: [0.02, 0.02, 0],
        chest: [0, 0.03, 0],
      },
    },
    {
      // Terminal swing. The knee straightens for the strike, but the thigh has
      // already stopped advancing - the shin does the last of the reach. That
      // is what keeps the foot under the body instead of ahead of it.
      t: 0.92,
      root: [0.008, -0.008, 0.002],
      pose: {
        'thigh.L': [0.25, 0, 0],
        'shin.L': [-0.18, 0, 0],
        'foot.L': [0.08, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.24, 0, 0],
        'forearm.R': [-0.3, 0, 0],
        'upperarm.L': [-0.22, 0, 0],
        'forearm.L': [-0.18, 0, 0],
        hips: [0, -0.06, 0],
        spine: [0.02, 0.05, 0],
        chest: [0, 0.08, 0],
      },
    },
  ],
};

// ===========================================================================
// Run
// ===========================================================================

/**
 * A run, not a fast walk. The structural difference is a flight phase: there is
 * a window where neither foot is down, the trunk pitches forward, and the arms
 * drive from a permanently bent elbow rather than swinging loose.
 */
export const RUN: Clip = {
  name: 'run',
  loop: true,
  nominalStride: 1.12,
  keys: [
    {
      t: 0.0,
      root: [-0.01, -0.026, 0.006],
      pose: {
        'thigh.L': [0.56, 0, 0],
        'shin.L': [-0.42, 0, 0],
        'foot.L': [0.08, 0, 0],
        'toe.L': [0.05, 0, 0],
        'upperarm.R': [0.52, 0, 0],
        'forearm.R': [-1.15, 0, 0],
        'upperarm.L': [-0.52, 0, 0],
        'forearm.L': [-0.75, 0, 0],
        hips: [0.06, -0.1, 0],
        spine: [0.12, 0.09, 0],
        chest: [0.06, 0.13, 0],
        neck: [-0.1, -0.07, 0],
        head: [-0.06, -0.05, 0],
      },
    },
    {
      // Absorption. A run lands with far more knee bend than a walk.
      t: 0.1,
      root: [-0.016, -0.058, 0.018],
      pose: {
        'thigh.L': [0.34, 0, 0],
        'shin.L': [-0.72, 0, 0],
        'foot.L': [-0.04, 0, 0],
        'toe.L': [0.1, 0, 0],
        'upperarm.R': [0.36, 0, 0],
        'forearm.R': [-1.1, 0, 0],
        'upperarm.L': [-0.38, 0, 0],
        'forearm.L': [-0.8, 0, 0],
        hips: [0.06, -0.06, 0],
        spine: [0.14, 0.05, 0],
        chest: [0.07, 0.08, 0],
      },
    },
    {
      t: 0.24,
      root: [-0.012, -0.012, 0.01],
      pose: {
        'thigh.L': [-0.02, 0, 0],
        'shin.L': [-0.3, 0, 0],
        'foot.L': [-0.02, 0, 0],
        'toe.L': [0.06, 0, 0],
        'upperarm.R': [0.0, 0, 0],
        'forearm.R': [-1.0, 0, 0],
        'upperarm.L': [0.0, 0, 0],
        'forearm.L': [-1.0, 0, 0],
        hips: [0.06, 0, 0],
        spine: [0.12, 0, 0],
        chest: [0.06, 0, 0],
      },
    },
    {
      // Toe-off into flight.
      t: 0.38,
      root: [0.0, 0.032, -0.004],
      pose: {
        'thigh.L': [-0.48, 0, 0],
        'shin.L': [-0.36, 0, 0],
        'foot.L': [-0.42, 0, 0],
        'toe.L': [0.52, 0, 0],
        'upperarm.R': [-0.46, 0, 0],
        'forearm.R': [-0.8, 0, 0],
        'upperarm.L': [0.5, 0, 0],
        'forearm.L': [-1.15, 0, 0],
        hips: [0.06, 0.1, 0],
        spine: [0.12, -0.09, 0],
        chest: [0.06, -0.13, 0],
      },
    },
    {
      // Peak knee tuck. In a run the heel comes near the backside.
      t: 0.55,
      root: [0.014, 0.064, -0.012],
      pose: {
        'thigh.L': [-0.2, 0, 0],
        'shin.L': [-1.75, 0, 0],
        'foot.L': [0.1, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [-0.3, 0, 0],
        'forearm.R': [-0.85, 0, 0],
        'upperarm.L': [0.34, 0, 0],
        'forearm.L': [-1.2, 0, 0],
        hips: [0.06, 0.05, 0],
        spine: [0.12, -0.05, 0],
        chest: [0.06, -0.07, 0],
      },
    },
    {
      t: 0.76,
      root: [0.016, 0.038, -0.004],
      pose: {
        'thigh.L': [0.44, 0, 0],
        'shin.L': [-1.1, 0, 0],
        'foot.L': [0.16, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.2, 0, 0],
        'forearm.R': [-1.05, 0, 0],
        'upperarm.L': [-0.2, 0, 0],
        'forearm.L': [-0.9, 0, 0],
        hips: [0.06, -0.05, 0],
        spine: [0.12, 0.05, 0],
        chest: [0.06, 0.07, 0],
      },
    },
    {
      t: 0.9,
      root: [0.004, -0.006, 0.004],
      pose: {
        'thigh.L': [0.6, 0, 0],
        'shin.L': [-0.6, 0, 0],
        'foot.L': [0.12, 0, 0],
        'toe.L': [0.02, 0, 0],
        'upperarm.R': [0.46, 0, 0],
        'forearm.R': [-1.15, 0, 0],
        'upperarm.L': [-0.46, 0, 0],
        'forearm.L': [-0.78, 0, 0],
        hips: [0.06, -0.09, 0],
        spine: [0.12, 0.08, 0],
        chest: [0.06, 0.12, 0],
      },
    },
  ],
};

// ===========================================================================
// Idle
// ===========================================================================

/**
 * A breathing idle with a weight shift. The shift is slower than the breath and
 * on a deliberately non-integer ratio, so the two never resynchronise into an
 * obvious loop.
 */
export const IDLE: Clip = {
  name: 'idle',
  loop: true,
  keys: [
    {
      t: 0.0,
      root: [-0.004, 0.0, 0],
      pose: {
        hips: [0, 0, 0.012],
        spine: [0.012, 0, -0.008],
        chest: [-0.02, 0, 0],
        neck: [0.03, 0, 0],
        head: [0.01, 0.05, 0],
        'upperarm.L': [0.02, 0, 0.06],
        'forearm.L': [-0.14, 0, 0],
        'upperarm.R': [0.02, 0, -0.06],
        'forearm.R': [-0.14, 0, 0],
        'thigh.L': [0.01, 0, 0],
        'thigh.R': [-0.01, 0, 0],
      },
    },
    {
      t: 0.5,
      root: [0.004, 0.004, 0],
      pose: {
        hips: [0, 0, -0.012],
        spine: [-0.006, 0, 0.008],
        chest: [0.02, 0, 0],
        neck: [-0.01, 0, 0],
        head: [-0.01, -0.05, 0],
        'upperarm.L': [-0.02, 0, 0.09],
        'forearm.L': [-0.2, 0, 0],
        'upperarm.R': [-0.02, 0, -0.09],
        'forearm.R': [-0.2, 0, 0],
        'thigh.L': [-0.01, 0, 0],
        'thigh.R': [0.01, 0, 0],
      },
    },
  ],
};

// ===========================================================================
// Work verbs
// ===========================================================================

/**
 * Planting. Anticipation (rise), a fast drop to a held contact, then a slow
 * recovery. The contact is held for three keys' worth of time on purpose: the
 * seed VFX fires there, and a pose that passes straight through contact reads
 * as a mime rather than as work.
 */
export const PLANT: Clip = {
  name: 'plant',
  loop: false,
  keys: [
    {
      t: 0.0,
      root: [0, 0, 0],
      pose: {
        hips: [0.05, 0, 0],
        spine: [0.1, 0, 0],
        chest: [0.06, 0, 0],
        neck: [0.12, 0, 0],
        'shoulder.R': [0.1, 0, 0],
        'upperarm.R': [0.34, 0, 0],
        'forearm.R': [-0.5, 0, 0],
        'upperarm.L': [0.2, 0, 0],
        'forearm.L': [-0.4, 0, 0],
        'thigh.L': [0.12, 0, 0],
        'thigh.R': [0.12, 0, 0],
        'shin.L': [-0.16, 0, 0],
        'shin.R': [-0.16, 0, 0],
      },
    },
    {
      // Anticipation: up and back before going down.
      t: 0.18,
      root: [0, 0.012, -0.018],
      pose: {
        hips: [-0.04, 0, 0],
        spine: [0.02, 0, 0],
        chest: [-0.04, 0, 0],
        neck: [0.06, 0, 0],
        'shoulder.R': [0.16, 0, 0],
        'upperarm.R': [-0.1, 0, 0],
        'forearm.R': [-0.85, 0, 0],
        'upperarm.L': [0.08, 0, 0],
        'forearm.L': [-0.3, 0, 0],
        'thigh.L': [0.04, 0, 0],
        'thigh.R': [0.04, 0, 0],
        'shin.L': [-0.06, 0, 0],
        'shin.R': [-0.06, 0, 0],
      },
    },
    {
      // Contact. Deep crouch, hand at the soil.
      t: 0.42,
      root: [0, -0.118, 0.045],
      pose: {
        hips: [0.3, 0, 0],
        spine: [0.26, 0, 0],
        chest: [0.16, 0, 0],
        neck: [0.3, 0, 0],
        'shoulder.R': [0.04, 0, 0],
        'upperarm.R': [0.72, 0, 0],
        'forearm.R': [-0.62, 0, 0],
        'upperarm.L': [0.4, 0, 0],
        'forearm.L': [-0.55, 0, 0],
        'thigh.L': [0.5, 0, 0],
        'thigh.R': [0.5, 0, 0],
        'shin.L': [-0.78, 0, 0],
        'shin.R': [-0.78, 0, 0],
        'foot.L': [0.26, 0, 0],
        'foot.R': [0.26, 0, 0],
      },
    },
    {
      // Held. Press the seed in.
      t: 0.58,
      root: [0, -0.128, 0.052],
      pose: {
        hips: [0.32, 0, 0],
        spine: [0.28, 0, 0],
        chest: [0.18, 0, 0],
        neck: [0.32, 0, 0],
        'upperarm.R': [0.8, 0, 0],
        'forearm.R': [-0.52, 0, 0],
        'upperarm.L': [0.42, 0, 0],
        'forearm.L': [-0.5, 0, 0],
        'thigh.L': [0.52, 0, 0],
        'thigh.R': [0.52, 0, 0],
        'shin.L': [-0.82, 0, 0],
        'shin.R': [-0.82, 0, 0],
        'foot.L': [0.28, 0, 0],
        'foot.R': [0.28, 0, 0],
      },
    },
    {
      t: 1.0,
      root: [0, 0, 0],
      pose: {
        hips: [0.02, 0, 0],
        spine: [0.03, 0, 0],
        chest: [0, 0, 0],
        neck: [0.04, 0, 0],
        'upperarm.R': [0.06, 0, 0],
        'forearm.R': [-0.2, 0, 0],
        'upperarm.L': [0.04, 0, 0],
        'forearm.L': [-0.18, 0, 0],
        'thigh.L': [0.01, 0, 0],
        'thigh.R': [-0.01, 0, 0],
        'shin.L': [-0.03, 0, 0],
        'shin.R': [-0.03, 0, 0],
      },
    },
  ],
};

/** Watering. A lean, a tip, a sustained pour with a small wrist tremor, a lift. */
export const TEND: Clip = {
  name: 'tend',
  loop: false,
  keys: [
    {
      t: 0.0,
      root: [0, 0, 0],
      pose: {
        spine: [0.06, -0.06, 0],
        chest: [0.04, -0.08, 0],
        neck: [0.14, 0.04, 0],
        'shoulder.R': [0.14, 0, 0],
        'upperarm.R': [0.2, 0, -0.1],
        'forearm.R': [-0.7, 0, 0],
        'upperarm.L': [0.06, 0, 0.06],
        'forearm.L': [-0.24, 0, 0],
      },
    },
    {
      t: 0.2,
      root: [-0.006, -0.018, 0.018],
      pose: {
        spine: [0.14, -0.02, 0],
        chest: [0.1, -0.04, 0],
        neck: [0.2, 0.02, 0],
        'shoulder.R': [0.2, 0, 0],
        'upperarm.R': [0.54, 0, -0.16],
        'forearm.R': [-0.5, 0, 0],
        'upperarm.L': [0.12, 0, 0.08],
        'forearm.L': [-0.3, 0, 0],
        'thigh.L': [0.14, 0, 0],
        'thigh.R': [0.1, 0, 0],
        'shin.L': [-0.2, 0, 0],
        'shin.R': [-0.16, 0, 0],
      },
    },
    {
      // Pour. Wrist rolled over; held nearly still, because a watering can that
      // waves around does not read as pouring.
      t: 0.42,
      root: [-0.01, -0.032, 0.034],
      pose: {
        spine: [0.17, 0.0, 0],
        chest: [0.12, 0.0, 0],
        neck: [0.24, 0, 0],
        'shoulder.R': [0.22, 0, 0],
        'upperarm.R': [0.62, 0, -0.2],
        'forearm.R': [-0.42, 0, -0.34],
        'upperarm.L': [0.14, 0, 0.1],
        'forearm.L': [-0.32, 0, 0],
        'thigh.L': [0.16, 0, 0],
        'thigh.R': [0.12, 0, 0],
        'shin.L': [-0.22, 0, 0],
        'shin.R': [-0.18, 0, 0],
      },
    },
    {
      t: 0.72,
      root: [-0.008, -0.03, 0.032],
      pose: {
        spine: [0.16, 0.02, 0],
        chest: [0.11, 0.03, 0],
        neck: [0.23, 0, 0],
        'shoulder.R': [0.21, 0, 0],
        'upperarm.R': [0.6, 0, -0.19],
        'forearm.R': [-0.44, 0, -0.3],
        'upperarm.L': [0.13, 0, 0.1],
        'forearm.L': [-0.31, 0, 0],
        'thigh.L': [0.15, 0, 0],
        'thigh.R': [0.11, 0, 0],
        'shin.L': [-0.21, 0, 0],
        'shin.R': [-0.17, 0, 0],
      },
    },
    {
      t: 1.0,
      root: [0, 0, 0],
      pose: {
        spine: [0.03, 0, 0],
        chest: [0, 0, 0],
        neck: [0.05, 0, 0],
        'upperarm.R': [0.06, 0, 0],
        'forearm.R': [-0.2, 0, 0],
        'upperarm.L': [0.04, 0, 0],
        'forearm.L': [-0.18, 0, 0],
      },
    },
  ],
};

/**
 * Harvest. The most aggressive clip: a long wind-up across the body, a strike
 * that covers a lot of angle in very little time, then a recoil that overshoots
 * before settling. The asymmetry between wind-up (0.30 of the clip) and strike
 * (0.10) is what makes it read as effort.
 */
export const HARVEST: Clip = {
  name: 'harvest',
  loop: false,
  keys: [
    {
      t: 0.0,
      root: [0, 0, 0],
      pose: {
        spine: [0.08, 0.04, 0],
        chest: [0.05, 0.06, 0],
        neck: [0.12, -0.04, 0],
        'shoulder.R': [0.08, 0, 0],
        'upperarm.R': [0.26, 0, -0.1],
        'forearm.R': [-0.6, 0, 0],
        'upperarm.L': [0.14, 0, 0.08],
        'forearm.L': [-0.34, 0, 0],
      },
    },
    {
      // Wind-up. Body coils away from the target; the arm crosses the chest.
      t: 0.3,
      root: [0.018, -0.014, -0.024],
      pose: {
        spine: [0.02, 0.4, 0],
        chest: [-0.02, 0.44, 0],
        neck: [0.16, -0.3, 0],
        head: [0.06, -0.2, 0],
        'shoulder.R': [0.2, 0, 0],
        'upperarm.R': [-0.36, 0, -0.5],
        'forearm.R': [-1.25, 0, 0],
        'upperarm.L': [0.3, 0, 0.16],
        'forearm.L': [-0.5, 0, 0],
        'thigh.R': [0.1, 0, 0],
        'shin.R': [-0.14, 0, 0],
      },
    },
    {
      // Strike. Everything unwinds through the target.
      t: 0.4,
      root: [-0.01, -0.042, 0.054],
      pose: {
        spine: [0.22, -0.32, 0],
        chest: [0.16, -0.36, 0],
        neck: [0.24, 0.22, 0],
        head: [0.1, 0.16, 0],
        'shoulder.R': [0.04, 0, 0],
        'upperarm.R': [0.86, 0, 0.12],
        'forearm.R': [-0.28, 0, 0],
        'upperarm.L': [0.1, 0, 0.06],
        'forearm.L': [-0.26, 0, 0],
        'thigh.L': [0.24, 0, 0],
        'thigh.R': [0.18, 0, 0],
        'shin.L': [-0.34, 0, 0],
        'shin.R': [-0.26, 0, 0],
      },
    },
    {
      // Follow-through past the target. Overshoot, then settle - the beat the
      // old symmetric arc had no way to express.
      t: 0.55,
      root: [-0.018, -0.052, 0.072],
      pose: {
        spine: [0.26, -0.42, 0],
        chest: [0.2, -0.46, 0],
        neck: [0.26, 0.3, 0],
        head: [0.12, 0.22, 0],
        'upperarm.R': [1.0, 0, 0.2],
        'forearm.R': [-0.4, 0, 0],
        'upperarm.L': [0.06, 0, 0.04],
        'forearm.L': [-0.22, 0, 0],
        'thigh.L': [0.28, 0, 0],
        'thigh.R': [0.2, 0, 0],
        'shin.L': [-0.4, 0, 0],
        'shin.R': [-0.3, 0, 0],
      },
    },
    {
      t: 0.74,
      root: [-0.006, -0.02, 0.024],
      pose: {
        spine: [0.12, -0.12, 0],
        chest: [0.08, -0.14, 0],
        neck: [0.16, 0.08, 0],
        'upperarm.R': [0.4, 0, 0.02],
        'forearm.R': [-0.44, 0, 0],
        'upperarm.L': [0.06, 0, 0.02],
        'forearm.L': [-0.22, 0, 0],
        'thigh.L': [0.1, 0, 0],
        'shin.L': [-0.16, 0, 0],
      },
    },
    {
      t: 1.0,
      root: [0, 0, 0],
      pose: {
        spine: [0.03, 0, 0],
        chest: [0, 0, 0],
        neck: [0.05, 0, 0],
        'upperarm.R': [0.06, 0, 0],
        'forearm.R': [-0.2, 0, 0],
        'upperarm.L': [0.04, 0, 0],
        'forearm.L': [-0.18, 0, 0],
      },
    },
  ],
};

/** A two-handed wave, played when proximity scares a fox off. */
export const WAVE: Clip = {
  name: 'wave',
  loop: false,
  keys: [
    {
      t: 0.0,
      root: [0, 0, 0],
      pose: {
        spine: [0.02, 0, 0],
        'upperarm.R': [0.1, 0, 0],
        'forearm.R': [-0.24, 0, 0],
        'upperarm.L': [0.1, 0, 0],
        'forearm.L': [-0.24, 0, 0],
      },
    },
    {
      t: 0.22,
      root: [0, -0.025, -0.018],
      pose: {
        spine: [-0.08, -0.1, 0],
        chest: [-0.06, -0.12, 0],
        neck: [0.06, 0.08, 0],
        'shoulder.R': [0.3, 0, 0],
        'upperarm.R': [-0.3, 0, 1.5],
        'forearm.R': [-0.65, 0, 0.28],
        'shoulder.L': [0.3, 0, 0],
        'upperarm.L': [-0.3, 0, -1.5],
        'forearm.L': [-0.65, 0, -0.28],
        'thigh.L': [0.12, 0, 0],
        'thigh.R': [0.12, 0, 0],
        'shin.L': [-0.2, 0, 0],
        'shin.R': [-0.2, 0, 0],
      },
    },
    {
      t: 0.46,
      root: [0.018, 0.018, 0.012],
      pose: {
        spine: [-0.08, 0.06, 0],
        chest: [-0.06, 0.08, 0],
        'shoulder.R': [0.32, 0, 0],
        'upperarm.R': [-0.34, 0, 1.72],
        'forearm.R': [-0.55, 0, -0.22],
        'shoulder.L': [0.32, 0, 0],
        'upperarm.L': [-0.34, 0, -1.58],
        'forearm.L': [-0.55, 0, 0.22],
        'thigh.L': [-0.06, 0, 0],
        'thigh.R': [0.08, 0, 0],
      },
    },
    {
      t: 0.68,
      root: [-0.018, -0.012, 0.006],
      pose: {
        spine: [-0.08, -0.06, 0],
        chest: [-0.06, -0.08, 0],
        'shoulder.R': [0.32, 0, 0],
        'upperarm.R': [-0.34, 0, 1.6],
        'forearm.R': [-0.58, 0, 0.3],
        'shoulder.L': [0.32, 0, 0],
        'upperarm.L': [-0.34, 0, -1.72],
        'forearm.L': [-0.58, 0, -0.3],
        'thigh.L': [0.08, 0, 0],
        'thigh.R': [-0.06, 0, 0],
      },
    },
    {
      t: 1.0,
      root: [0, 0, 0],
      pose: {
        spine: [0.02, 0, 0],
        'upperarm.R': [0.08, 0, 0],
        'forearm.R': [-0.2, 0, 0],
        'upperarm.L': [0.08, 0, 0],
        'forearm.L': [-0.2, 0, 0],
      },
    },
  ],
};

export const CLIPS = { WALK, RUN, IDLE, PLANT, TEND, HARVEST, WAVE } as const;
