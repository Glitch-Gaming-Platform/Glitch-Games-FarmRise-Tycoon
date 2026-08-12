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
 * ## The stance keys are solved, not dialled
 *
 * Two audits tried to fix this walk by adjusting joint angles and looking at
 * the result. Both left it covering 0.365 m of ground per cycle, against the
 * roughly 0.6 m the same 0.4 m leg can cover with the foot genuinely flat -
 * so the runtime had to invent the missing distance, and the feet slid.
 *
 * This version is written the other way round. The ankle path is designed in
 * hip space as a table of (forward, ground clearance, pelvis height), and
 * `solveTwoBone` - the same solver the foot lock uses - produces the thigh and
 * shin angles that put the ankle exactly there. The stance excursion is
 * therefore 0.37 m by construction, and the pelvis track is not decoration: it
 * is the third variable in that solve, which is why the pelvis is *lowest* at
 * both double-support beats (t = 0 and t = 0.6) and highest at midstance.
 * That is the compass gait, and it is what buys the reach - a foot 0.185 m in
 * front of the hip is only reachable with the pelvis 4 cm down.
 *
 * ## Why the forward reach is larger than the previous version's
 *
 * The old table capped the ankle at 0.106 m in front of the hip because a
 * forward-thrown leg reads as a goose-step. But the goose-step read comes from
 * a *straight leg swung forward under a high pelvis*, not from reach as such.
 * Here the reach is paid for with pelvis drop and a bent knee through loading
 * response, which is the silhouette of someone taking a step rather than
 * someone marching. The excursion is still slightly rear-biased in effect,
 * because the trailing half of the cycle is where the toe roll adds its own
 * extension.
 */
export const WALK: Clip = {
  name: 'walk',
  loop: true,
  nominalStride: 0.6,
  keys: [
    {
      // Heel strike, and one of the two lowest points of the cycle.
      //
      // Every stance key below was solved rather than dialled: the ankle path
      // was designed in hip space - how far in front, how far behind, how much
      // clearance - and `solveTwoBone` produced the thigh and shin angles that
      // put the ankle exactly there. That is why the numbers look arbitrary and
      // why they should not be nudged casually: they are the answer to a
      // geometry problem, and the pelvis height in `root` is part of the same
      // answer. A foot 0.185 m in front of the hip is only reachable with the
      // pelvis 4 cm down.
      //
      // The knee is nearly straight here because a straight leg reaches further
      // for less hip flexion. That is also what separates this pose from a
      // goose-step: a goose-step is a straight leg thrown forward under a high
      // pelvis, and this is a straight leg reaching for the floor under a low
      // one.
      t: 0.0,
      root: [-0.034, -0.0427, 0.002],
      pose: {
        'thigh.L': [0.568, 0, 0],
        'shin.L': [-0.171, 0, 0],
        'foot.L': [0.16, 0, 0],
        'toe.L': [0, 0, 0],
        'shoulder.R': [0.06, 0, -0.04],
        'upperarm.R': [0.38, 0, -0.08],
        'forearm.R': [-0.34, 0, -0.03],
        'shoulder.L': [0.02, 0, 0.035],
        'upperarm.L': [-0.34, 0, 0.09],
        'forearm.L': [-0.18, 0, 0.025],
        hips: [0.02, -0.09, 0.06],
        spine: [0.035, 0.07, -0.028],
        chest: [0.01, 0.11, -0.038],
        neck: [0.005, -0.06, 0.014],
        head: [0, -0.045, 0.014],
      },
    },
    {
      // Loading response. The knee absorbs the landing - a fast dip immediately
      // after an extreme, which is the beat that reads as weight and the one a
      // sine wave cannot express. The pelvis rises as it does so, because the
      // leg is coming under the body.
      t: 0.12,
      root: [-0.038, -0.038, 0.008],
      pose: {
        'thigh.L': [0.53, 0, 0],
        'shin.L': [-0.634, 0, 0],
        'foot.L': [0.02, 0, 0],
        'toe.L': [0, 0, 0],
        'shoulder.R': [0.055, 0, -0.045],
        'upperarm.R': [0.36, 0, -0.09],
        'forearm.R': [-0.32, 0, -0.035],
        'shoulder.L': [0.025, 0, 0.04],
        'upperarm.L': [-0.3, 0, 0.1],
        'forearm.L': [-0.16, 0, 0.03],
        hips: [0.05, -0.07, 0.075],
        spine: [0.055, 0.05, -0.04],
        chest: [0.03, 0.08, -0.05],
        neck: [0.012, -0.04, 0.02],
      },
    },
    {
      // Midstance. The support leg passes under the hips and the body is at its
      // highest - the compass-gait apex.
      t: 0.3,
      root: [-0.026, -0.0048, 0.002],
      pose: {
        'thigh.L': [0.112, 0, 0],
        'shin.L': [-0.301, 0, 0],
        'foot.L': [-0.02, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.11, 0, -0.06],
        'forearm.R': [-0.24, 0, -0.025],
        'upperarm.L': [-0.08, 0, 0.065],
        'forearm.L': [-0.14, 0, 0.02],
        hips: [0, -0.02, 0.045],
        spine: [0.02, 0.01, -0.022],
        chest: [0, 0.02, -0.028],
      },
    },
    {
      // Terminal stance. Heel off, weight rolling onto the toe, hip extending.
      // This key and the next are where the walk's length comes from.
      t: 0.46,
      root: [-0.006, -0.018, -0.004],
      pose: {
        'thigh.L': [-0.223, 0, 0],
        'shin.L': [-0.193, 0, 0],
        'foot.L': [-0.16, 0, 0],
        'toe.L': [0.3, 0, 0],
        'upperarm.R': [-0.2, 0, -0.045],
        'forearm.R': [-0.18, 0, -0.02],
        'upperarm.L': [0.24, 0, 0.075],
        'forearm.L': [-0.22, 0, 0.025],
        hips: [-0.01, 0.05, 0.018],
        spine: [0.02, -0.04, -0.012],
        chest: [0, -0.07, -0.016],
      },
    },
    {
      // Toe-off and opposite-foot loading. The pelvis is low and decisively
      // over the right support leg while the left heel rolls over the toe.
      t: 0.6,
      root: [0.03, -0.045, -0.006],
      pose: {
        'thigh.L': [-0.4, 0, 0],
        'shin.L': [-0.56, 0, 0],
        'foot.L': [-0.3, 0, 0],
        'toe.L': [0.46, 0, 0],
        'upperarm.R': [-0.36, 0, -0.075],
        'forearm.R': [-0.16, 0, -0.025],
        'upperarm.L': [0.38, 0, 0.09],
        'forearm.L': [-0.26, 0, 0.03],
        hips: [0.02, 0.085, -0.06],
        spine: [0.035, -0.07, 0.03],
        chest: [0.012, -0.11, 0.042],
        neck: [0.006, 0.06, -0.014],
        head: [0, 0.045, -0.014],
      },
    },
    {
      // The push resolves behind the body before recovery begins. The folded
      // knee keeps this strong hip extension in swing rather than dragging the
      // toe, producing an unmistakably rear-biased propulsion silhouette.
      t: 0.68,
      root: [0.032, -0.035, 0.004],
      pose: {
        'thigh.L': [-0.545, 0, 0],
        'shin.L': [-0.8, 0, 0],
        'foot.L': [0.1, 0, 0],
        'toe.L': [0.06, 0, 0],
        'upperarm.R': [-0.3, 0, -0.09],
        'forearm.R': [-0.18, 0, -0.03],
        'upperarm.L': [0.32, 0, 0.1],
        'forearm.L': [-0.3, 0, 0.035],
        hips: [0.05, 0.06, -0.075],
        spine: [0.055, -0.05, 0.04],
        chest: [0.03, -0.08, 0.05],
      },
    },
    {
      // Rear-most propulsion arrives after the foot lock has released. This
      // keeps the support-to-swing hand-off monotonic while preserving the
      // stronger rear excursion that gives the walk its push.
      t: 0.72,
      root: [0.032, -0.025, 0.005],
      pose: {
        'thigh.L': [-0.6, 0, 0],
        'shin.L': [-1.12, 0, 0],
        'foot.L': [0.11, 0, 0],
        'toe.L': [0.04, 0, 0],
        'upperarm.R': [-0.2, 0, -0.083],
        'forearm.R': [-0.2, 0, -0.029],
        'upperarm.L': [0.22, 0, 0.093],
        'forearm.L': [-0.3, 0, 0.034],
        hips: [0.038, 0.04, -0.068],
        spine: [0.043, -0.038, 0.036],
        chest: [0.023, -0.058, 0.046],
      },
    },
    {
      // Recovery folds the heel beneath the body before the thigh comes
      // forward. Separating those beats prevents a straight airborne leg.
      t: 0.76,
      root: [0.03, -0.012, 0.004],
      pose: {
        'thigh.L': [-0.4, 0, 0],
        'shin.L': [-1.25, 0, 0],
        'foot.L': [0.12, 0, 0],
        'toe.L': [0.02, 0, 0],
        'upperarm.R': [-0.1, 0, -0.075],
        'forearm.R': [-0.22, 0, -0.028],
        'upperarm.L': [0.1, 0, 0.085],
        'forearm.L': [-0.28, 0, 0.03],
        hips: [0.02, 0.02, -0.055],
        spine: [0.03, -0.02, 0.03],
        chest: [0.015, -0.03, 0.038],
      },
    },
    {
      t: 0.84,
      root: [0.022, 0.02, 0.004],
      pose: {
        'thigh.L': [0.055, 0, 0],
        'shin.L': [-1.4, 0, 0],
        'foot.L': [0.14, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.12, 0, -0.065],
        'forearm.R': [-0.28, 0, -0.025],
        'upperarm.L': [-0.14, 0, 0.07],
        'forearm.L': [-0.24, 0, 0.025],
        hips: [0, -0.02, -0.03],
        spine: [0.02, 0.02, 0.018],
        chest: [0, 0.03, 0.024],
      },
    },
    {
      t: 0.88,
      root: [0.016, 0.01, 0.003],
      pose: {
        'thigh.L': [0.235, 0, 0],
        'shin.L': [-1.2, 0, 0],
        'foot.L': [0.145, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.22, 0, -0.068],
        'forearm.R': [-0.31, 0, -0.028],
        'upperarm.L': [-0.24, 0, 0.076],
        'forearm.L': [-0.22, 0, 0.025],
        hips: [0.006, -0.045, -0.005],
        spine: [0.026, 0.04, 0.004],
        chest: [0.006, 0.06, 0.006],
      },
    },
    {
      // Terminal swing begins only after the heel has descended. The nearly
      // fixed thigh and straightening knee create a clean heel-first path.
      t: 0.92,
      root: [0.008, 0, 0.002],
      pose: {
        'thigh.L': [0.45, 0, 0],
        'shin.L': [-0.46, 0, 0],
        'foot.L': [0.15, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.32, 0, -0.07],
        'forearm.R': [-0.34, 0, -0.03],
        'upperarm.L': [-0.3, 0, 0.08],
        'forearm.L': [-0.2, 0, 0.025],
        hips: [0.012, -0.065, 0.02],
        spine: [0.032, 0.055, -0.012],
        chest: [0.012, 0.09, -0.018],
      },
    },
    {
      // Lower the heel on a mostly vertical path. The forward reach grows in
      // small increments now, so the shoe is not skimming the soil at sprint
      // speed immediately before contact.
      t: 0.94,
      root: [-0.004, -0.008, 0.002],
      pose: {
        'thigh.L': [0.47, 0, 0],
        'shin.L': [-0.372, 0, 0],
        'foot.L': [0.153, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.34, 0, -0.073],
        'forearm.R': [-0.345, 0, -0.03],
        'upperarm.L': [-0.315, 0, 0.083],
        'forearm.L': [-0.195, 0, 0.026],
        hips: [0.015, -0.073, 0.033],
        spine: [0.033, 0.06, -0.017],
        chest: [0.012, 0.095, -0.024],
        neck: [0.006, -0.045, 0.01],
        head: [0, -0.035, 0.01],
      },
    },
    {
      // Pre-contact gains reach by opening the knee, not by kicking the thigh
      // farther forward; the following root drop supplies the final heel fall.
      t: 0.96,
      root: [-0.016, -0.02, 0.002],
      pose: {
        'thigh.L': [0.49, 0, 0],
        'shin.L': [-0.269, 0, 0],
        'foot.L': [0.155, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.36, 0, -0.076],
        'forearm.R': [-0.35, 0, -0.03],
        'upperarm.L': [-0.33, 0, 0.086],
        'forearm.L': [-0.19, 0, 0.026],
        hips: [0.018, -0.08, 0.045],
        spine: [0.034, 0.064, -0.022],
        chest: [0.012, 0.1, -0.03],
        neck: [0.006, -0.05, 0.012],
        head: [0, -0.04, 0.012],
      },
    },
    {
      t: 0.98,
      root: [-0.026, -0.032, 0.002],
      pose: {
        'thigh.L': [0.52, 0, 0],
        'shin.L': [-0.212, 0, 0],
        'foot.L': [0.158, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.37, 0, -0.078],
        'forearm.R': [-0.35, 0, -0.03],
        'upperarm.L': [-0.34, 0, 0.088],
        'forearm.L': [-0.185, 0, 0.026],
        hips: [0.02, -0.086, 0.052],
        spine: [0.035, 0.067, -0.025],
        chest: [0.012, 0.105, -0.033],
        neck: [0.006, -0.055, 0.013],
        head: [0, -0.044, 0.013],
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
 *
 * The flight phase is also where a run's ground speed comes from. Stance
 * reaches no further than the walk's - the leg is the same length - but it
 * occupies about a third of the cycle instead of two thirds, and the body
 * keeps travelling through the two thirds when no foot is down. That is what
 * lets the same skeleton cover 1.1 m per cycle running against 0.6 m walking
 * without either clip lying about contact.
 */
export const RUN: Clip = {
  name: 'run',
  loop: true,
  nominalStride: 1.1,
  keys: [
    {
      // Contact. Stance keys are solved the same way the walk's are: an ankle
      // path designed in hip space, with `solveTwoBone` producing the joint
      // angles, and the pelvis height in `root` part of the same solve.
      t: 0.0,
      root: [-0.012, -0.048, 0.006],
      pose: {
        'thigh.L': [0.651, 0, 0],
        'shin.L': [-0.272, 0, 0],
        'foot.L': [0.1, 0, 0],
        'toe.L': [0.04, 0, 0],
        'upperarm.R': [0.56, 0, 0],
        'forearm.R': [-1.15, 0, 0],
        'upperarm.L': [-0.56, 0, 0],
        'forearm.L': [-0.75, 0, 0],
        hips: [0.06, -0.11, 0.05],
        spine: [0.12, 0.1, -0.03],
        chest: [0.06, 0.14, -0.04],
        neck: [-0.1, -0.08, 0],
        head: [-0.06, -0.055, 0],
      },
    },
    {
      // Absorption. A run lands with far more knee flexion than a walk, and the
      // pelvis takes its whole drop in this one beat.
      t: 0.1,
      root: [-0.018, -0.055, 0.018],
      pose: {
        'thigh.L': [0.5, 0, 0],
        'shin.L': [-0.941, 0, 0],
        'foot.L': [-0.02, 0, 0],
        'toe.L': [0.1, 0, 0],
        'upperarm.R': [0.4, 0, 0],
        'forearm.R': [-1.1, 0, 0],
        'upperarm.L': [-0.42, 0, 0],
        'forearm.L': [-0.8, 0, 0],
        hips: [0.06, -0.07, 0.055],
        spine: [0.14, 0.06, -0.035],
        chest: [0.07, 0.09, -0.045],
      },
    },
    {
      // Propulsion. The support leg extends under a rising body.
      t: 0.22,
      root: [-0.012, -0.025, 0.01],
      pose: {
        'thigh.L': [0.12, 0, 0],
        'shin.L': [-0.639, 0, 0],
        'foot.L': [0.0, 0, 0],
        'toe.L': [0.06, 0, 0],
        'upperarm.R': [0.0, 0, 0],
        'forearm.R': [-1.0, 0, 0],
        'upperarm.L': [0.0, 0, 0],
        'forearm.L': [-1.0, 0, 0],
        hips: [0.06, 0, 0.02],
        spine: [0.12, 0, -0.012],
        chest: [0.06, 0, -0.016],
      },
    },
    {
      // Toe-off into flight. The ankle reaches no further behind the hip than
      // the walk's does - the leg is the same length - but it gets there in a
      // third of the cycle instead of two thirds, and the body keeps travelling
      // through the flight that follows. That is where a run's ground speed
      // comes from, and why it can cover 1.1 m per cycle without either clip
      // lying about contact.
      t: 0.34,
      root: [0.0, -0.045, -0.006],
      pose: {
        'thigh.L': [-0.195, 0, 0],
        'shin.L': [-0.445, 0, 0],
        'foot.L': [-0.46, 0, 0],
        'toe.L': [0.56, 0, 0],
        'upperarm.R': [-0.5, 0, 0],
        'forearm.R': [-0.8, 0, 0],
        'upperarm.L': [0.54, 0, 0],
        'forearm.L': [-1.15, 0, 0],
        hips: [0.06, 0.1, -0.05],
        spine: [0.12, -0.1, 0.03],
        chest: [0.06, -0.14, 0.04],
      },
    },
    {
      // Flight apex. It occurs early enough for the pelvis to descend into the
      // opposite contact at phase 0.5 instead of carrying flight height through
      // the landing.
      t: 0.4,
      root: [0.012, 0.04, -0.012],
      pose: {
        'thigh.L': [-0.17, 0, 0],
        'shin.L': [-1.3, 0, 0],
        'foot.L': [0.06, 0, 0],
        'toe.L': [0.08, 0, 0],
        'upperarm.R': [-0.36, 0, 0],
        'forearm.R': [-0.85, 0, 0],
        'upperarm.L': [0.42, 0, 0],
        'forearm.L': [-1.2, 0, 0],
        hips: [0.06, 0.06, -0.03],
        spine: [0.12, -0.06, 0.018],
        chest: [0.06, -0.085, 0.024],
      },
    },
    {
      // Peak knee tuck as the opposite foot lands. A gait cycle contains two
      // contacts; leaving the root at its flight apex here made the mirrored
      // landing leg appear twenty centimetres forward and ten centimetres in
      // the air. The left heel can stay tucked while the pelvis accepts weight
      // over the right support leg.
      t: 0.5,
      root: [0.018, -0.052, -0.008],
      pose: {
        'thigh.L': [0.08, 0, 0],
        'shin.L': [-1.78, 0, 0],
        'foot.L': [0.1, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [-0.18, 0, 0],
        'forearm.R': [-0.9, 0, 0],
        'upperarm.L': [0.26, 0, 0],
        'forearm.L': [-1.2, 0, 0],
        hips: [0.06, 0.02, 0],
        spine: [0.12, -0.02, 0],
        chest: [0.06, -0.03, 0],
      },
    },
    {
      t: 0.66,
      root: [0.016, -0.018, 0.0],
      pose: {
        'thigh.L': [0.34, 0, 0],
        'shin.L': [-1.5, 0, 0],
        'foot.L': [0.14, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.12, 0, 0],
        'forearm.R': [-1.02, 0, 0],
        'upperarm.L': [-0.12, 0, 0],
        'forearm.L': [-0.95, 0, 0],
        hips: [0.06, -0.02, 0.01],
        spine: [0.12, 0.02, -0.006],
        chest: [0.06, 0.03, -0.008],
      },
    },
    {
      t: 0.78,
      root: [0.01, 0.018, 0.006],
      pose: {
        'thigh.L': [0.53, 0, 0],
        'shin.L': [-1.1, 0, 0],
        'foot.L': [0.16, 0, 0],
        'toe.L': [0, 0, 0],
        'upperarm.R': [0.36, 0, 0],
        'forearm.R': [-1.1, 0, 0],
        'upperarm.L': [-0.36, 0, 0],
        'forearm.L': [-0.85, 0, 0],
        hips: [0.06, -0.06, 0.03],
        spine: [0.12, 0.06, -0.018],
        chest: [0.06, 0.085, -0.024],
      },
    },
    {
      // Late flight. Keep the thigh advancing steadily while the knee stays
      // folded. Reaching from the hip here puts the shoe in front while it is
      // still visibly airborne and creates an extra reversal before contact.
      t: 0.85,
      root: [0.008, 0.042, 0.006],
      pose: {
        'thigh.L': [0.545, 0, 0],
        'shin.L': [-1.11, 0, 0],
        'foot.L': [0.17, 0, 0],
        'toe.L': [0.01, 0, 0],
        'upperarm.R': [0.45, 0, 0],
        'forearm.R': [-1.13, 0, 0],
        'upperarm.L': [-0.45, 0, 0],
        'forearm.L': [-0.8, 0, 0],
        hips: [0.06, -0.082, 0.038],
        spine: [0.12, 0.078, -0.023],
        chest: [0.06, 0.11, -0.031],
      },
    },
    {
      // Reach. The foot is still clear and the thigh continues toward contact
      // without overtaking the landing pose; from here the shin supplies most
      // of the remaining forward travel as the heel descends.
      t: 0.88,
      root: [0.004, 0.02, 0.006],
      pose: {
        'thigh.L': [0.61, 0, 0],
        'shin.L': [-0.9, 0, 0],
        'foot.L': [0.14, 0, 0],
        'toe.L': [0.02, 0, 0],
        'upperarm.R': [0.5, 0, 0],
        'forearm.R': [-1.15, 0, 0],
        'upperarm.L': [-0.5, 0, 0],
        'forearm.L': [-0.78, 0, 0],
        hips: [0.06, -0.09, 0.04],
        spine: [0.12, 0.085, -0.025],
        chest: [0.06, 0.12, -0.034],
      },
    },
    {
      t: 0.94,
      root: [0.0, -0.02, 0.006],
      pose: {
        'thigh.L': [0.645, 0, 0],
        'shin.L': [-0.7, 0, 0],
        'foot.L': [0.12, 0, 0],
        'toe.L': [0.02, 0, 0],
        'upperarm.R': [0.54, 0, 0],
        'forearm.R': [-1.15, 0, 0],
        'upperarm.L': [-0.54, 0, 0],
        'forearm.L': [-0.76, 0, 0],
        hips: [0.06, -0.105, 0.048],
        spine: [0.12, 0.095, -0.028],
        chest: [0.06, 0.13, -0.038],
      },
    },
    {
      // Final extension happens only once the whole-body arc has descended.
      // Delaying the knee opening keeps the airborne shoe under the hips and
      // still arrives heel-first at the next contact.
      t: 0.98,
      root: [-0.006, -0.042, 0.006],
      pose: {
        'thigh.L': [0.65, 0, 0],
        'shin.L': [-0.42, 0, 0],
        'foot.L': [0.11, 0, 0],
        'toe.L': [0.03, 0, 0],
        'upperarm.R': [0.57, 0, 0],
        'forearm.R': [-1.15, 0, 0],
        'upperarm.L': [-0.57, 0, 0],
        'forearm.L': [-0.75, 0, 0],
        hips: [0.06, -0.108, 0.049],
        spine: [0.12, 0.098, -0.029],
        chest: [0.06, 0.135, -0.039],
        neck: [-0.09, -0.07, 0],
        head: [-0.05, -0.045, 0],
      },
    },
  ],
};

// ===========================================================================
// Idle
// ===========================================================================

/**
 * A breathing idle with an asymmetric weight shift and a small look-around.
 *
 * The original two-key sway technically moved, but every body part reversed on
 * the same beat, which read as a metronome rather than a person at rest. Six
 * poses let the breath lead the shoulders, the head notice something after the
 * torso settles, and the bag/ponytail follow last. The amplitudes stay tiny so
 * the farmer remains a calm planning anchor at the gameplay camera.
 */
export const IDLE: Clip = {
  name: 'idle',
  loop: true,
  keys: [
    {
      t: 0.0,
      root: [-0.01, -0.002, 0],
      pose: {
        hips: [0.008, 0, 0.026],
        spine: [0.018, -0.012, -0.018],
        chest: [-0.018, -0.01, 0.012],
        neck: [0.028, 0.018, -0.008],
        head: [0.012, 0.045, 0.018],
        'upperarm.L': [0.015, 0, 0.07],
        'forearm.L': [-0.14, 0, 0.012],
        'upperarm.R': [0.025, 0, -0.055],
        'forearm.R': [-0.155, 0, -0.008],
        'thigh.L': [0.018, 0, 0.018],
        'shin.L': [-0.035, 0, 0],
        'thigh.R': [-0.008, 0, -0.008],
        ponytail: [-0.018, 0, -0.014],
        satchel: [0.012, 0, 0.018],
      },
    },
    {
      // Inhale lifts the chest before the head moves.
      t: 0.18,
      root: [-0.014, 0.006, -0.002],
      pose: {
        hips: [-0.005, 0, 0.03],
        spine: [-0.018, -0.008, -0.02],
        chest: [-0.045, 0.012, 0.014],
        neck: [0.015, 0.026, -0.006],
        head: [-0.008, 0.072, 0.014],
        'shoulder.L': [-0.018, 0, 0],
        'shoulder.R': [-0.018, 0, 0],
        'upperarm.L': [-0.005, 0, 0.078],
        'forearm.L': [-0.16, 0, 0.015],
        'upperarm.R': [0.0, 0, -0.062],
        'forearm.R': [-0.17, 0, -0.012],
        'thigh.L': [0.012, 0, 0.02],
        'shin.L': [-0.04, 0, 0],
        ponytail: [-0.028, 0, -0.022],
        satchel: [0.018, 0, 0.025],
      },
    },
    {
      // The eyes/head lead a quiet glance after the body has settled.
      t: 0.38,
      root: [-0.008, 0.002, 0.002],
      pose: {
        hips: [0.002, -0.015, 0.018],
        spine: [0.005, -0.035, -0.012],
        chest: [-0.012, -0.045, 0.006],
        neck: [0.018, 0.075, -0.012],
        head: [0.008, 0.13, 0.026],
        'upperarm.L': [0.018, 0, 0.068],
        'forearm.L': [-0.15, 0, 0.018],
        'upperarm.R': [0.018, 0, -0.07],
        'forearm.R': [-0.18, 0, -0.016],
        'thigh.L': [0.006, 0, 0.014],
        'shin.L': [-0.026, 0, 0],
        ponytail: [-0.015, 0, -0.032],
        satchel: [0.01, 0, 0.02],
      },
    },
    {
      // Weight crosses to the other boot; the pelvis arrives before the bag.
      t: 0.56,
      root: [0.012, -0.004, 0],
      pose: {
        hips: [0.012, 0.008, -0.03],
        spine: [0.016, 0.02, 0.02],
        chest: [0.01, 0.028, -0.012],
        neck: [0.02, -0.018, 0.01],
        head: [0.008, -0.04, -0.018],
        'upperarm.L': [0.02, 0, 0.055],
        'forearm.L': [-0.17, 0, 0.008],
        'upperarm.R': [0.012, 0, -0.088],
        'forearm.R': [-0.21, 0, -0.014],
        'thigh.L': [-0.008, 0, 0.006],
        'thigh.R': [0.02, 0, -0.018],
        'shin.R': [-0.045, 0, 0],
        ponytail: [0.012, 0, 0.018],
        satchel: [-0.018, 0, -0.032],
      },
    },
    {
      // Exhale and a tiny hand/bag check keep the asymmetric silhouette alive.
      t: 0.76,
      root: [0.008, 0.004, 0.001],
      pose: {
        hips: [-0.006, 0, -0.024],
        spine: [-0.012, 0.02, 0.015],
        chest: [0.032, 0.018, -0.01],
        neck: [-0.008, -0.035, 0.008],
        head: [-0.012, -0.075, -0.014],
        'upperarm.L': [-0.012, 0, 0.06],
        'forearm.L': [-0.19, 0, 0.01],
        'upperarm.R': [-0.025, 0, -0.12],
        'forearm.R': [-0.24, 0, -0.025],
        'thigh.R': [0.014, 0, -0.014],
        'shin.R': [-0.036, 0, 0],
        ponytail: [0.025, 0, 0.028],
        satchel: [-0.03, 0, -0.04],
      },
    },
    {
      t: 0.92,
      root: [-0.004, 0, 0],
      pose: {
        hips: [0.006, -0.005, 0.016],
        spine: [0.012, 0.0, -0.01],
        chest: [-0.012, -0.005, 0.008],
        neck: [0.018, 0.012, -0.006],
        head: [0.006, 0.025, 0.01],
        'upperarm.L': [0.012, 0, 0.068],
        'forearm.L': [-0.15, 0, 0.012],
        'upperarm.R': [0.018, 0, -0.065],
        'forearm.R': [-0.17, 0, -0.01],
        'thigh.L': [0.012, 0, 0.012],
        'shin.L': [-0.03, 0, 0],
        ponytail: [-0.012, 0, -0.018],
        satchel: [0.008, 0, 0.012],
      },
    },
  ],
};

// ===========================================================================
// Work verbs
// ===========================================================================

/**
 * Planting is the soil-working verb: brace, reach, meet resistance, drag the
 * trowel through the bed, then recover. The ankles remain within roughly a
 * centimetre of their standing height through contact; the crouch comes from
 * asymmetric knee compression and torso reach rather than sinking the whole
 * character into the soil.
 */
export const PLANT: Clip = {
  name: 'plant',
  loop: false,
  keys: [
    {
      t: 0.0,
      root: [0, 0, 0],
      pose: {
        hips: [0.07, 0.02, -0.045],
        spine: [0.13, -0.025, 0.03],
        chest: [0.1, -0.04, 0.045],
        neck: [0.12, 0.03, -0.018],
        head: [0.045, 0.025, -0.014],
        'shoulder.L': [0.015, 0, -0.035],
        'shoulder.R': [0.1, 0, -0.045],
        'upperarm.R': [0.34, 0, -0.045],
        'forearm.R': [-0.5, 0, 0],
        'upperarm.L': [0.2, -0.02, 0.18],
        'forearm.L': [-0.42, 0, 0.05],
        'thigh.L': [0.08, 0, -0.075],
        'thigh.R': [0.18, 0, 0.085],
        'shin.L': [-0.16, 0, 0],
        'shin.R': [-0.28, 0, 0],
      },
    },
    {
      // Anticipation: lower into a wide, staggered base while the chest and eyes
      // stay on the bed. The free hand reaches across to join the force line.
      t: 0.16,
      root: [-0.028, -0.016, -0.018],
      pose: {
        hips: [0.18, 0.075, -0.13],
        spine: [0.21, -0.015, 0.06],
        chest: [0.13, -0.03, 0.09],
        neck: [-0.065, 0.025, -0.03],
        head: [-0.045, 0.02, -0.022],
        'shoulder.L': [-0.015, -0.015, -0.075],
        'shoulder.R': [0.13, 0.02, -0.105],
        'upperarm.R': [0.15, 0, -0.06],
        'forearm.R': [-0.78, 0, 0],
        'upperarm.L': [0.3, -0.06, 0.3],
        'forearm.L': [-0.62, 0, 0.1],
        'thigh.L': [0.14, 0, -0.13],
        'thigh.R': [0.42, 0, 0.16],
        'shin.L': [-0.28, 0, 0.07],
        'shin.R': [-0.68, 0, -0.09],
        'foot.L': [0.08, 0, 0],
        'foot.R': [0.18, 0, 0],
      },
    },
    {
      // Contact: the front knee absorbs the hit, the rear leg braces wide, and
      // both shoulders slope into the working hand instead of hovering level.
      t: 0.38,
      root: [0.04, -0.026, 0.06],
      pose: {
        hips: [0.3, 0.07, -0.15],
        spine: [0.32, 0.025, 0.075],
        chest: [0.18, -0.01, 0.11],
        neck: [-0.13, 0.02, -0.045],
        head: [-0.09, 0.015, -0.03],
        'shoulder.L': [-0.025, -0.025, -0.1],
        'shoulder.R': [0.075, 0.045, -0.13],
        'upperarm.R': [0.78, 0, -0.12],
        'forearm.R': [-0.58, 0, -0.035],
        'upperarm.L': [0.54, -0.08, 0.32],
        'forearm.L': [-0.76, 0, 0.11],
        'thigh.L': [0.24, 0, -0.16],
        'thigh.R': [0.58, 0, 0.19],
        'shin.L': [-0.44, 0, 0.09],
        'shin.R': [-0.88, 0, -0.11],
        'foot.L': [0.12, 0, 0],
        'foot.R': [0.24, 0, 0],
      },
    },
    {
      // Resistance: sink a fraction deeper without losing the rear-foot brace;
      // the assisting hand closes toward the tool as the head holds its target.
      t: 0.54,
      root: [0.044, -0.026, 0.072],
      pose: {
        hips: [0.32, 0.055, -0.15],
        spine: [0.34, 0.035, 0.075],
        chest: [0.18, 0, 0.105],
        neck: [-0.15, 0.015, -0.045],
        head: [-0.1, 0.01, -0.03],
        'shoulder.L': [-0.03, -0.03, -0.105],
        'shoulder.R': [0.05, 0.05, -0.135],
        'upperarm.R': [0.84, 0, -0.13],
        'forearm.R': [-0.52, 0, -0.04],
        'upperarm.L': [0.58, -0.1, 0.3],
        'forearm.L': [-0.82, 0, 0.1],
        'thigh.L': [0.24, 0, -0.17],
        'thigh.R': [0.57, 0, 0.2],
        'shin.L': [-0.44, 0, 0.1],
        'shin.R': [-0.89, 0, -0.12],
        'foot.L': [0.12, 0, 0],
        'foot.R': [0.24, 0, 0],
      },
    },
    {
      // Push: the front leg lengthens behind a chest that continues through the
      // tool, while the rear leg and free hand stop the body from toppling.
      t: 0.66,
      root: [0.038, -0.022, 0.09],
      pose: {
        hips: [0.34, 0.095, -0.11],
        spine: [0.38, 0.075, 0.06],
        chest: [0.22, 0.07, 0.08],
        neck: [-0.16, -0.025, -0.035],
        head: [-0.11, -0.015, -0.022],
        'shoulder.L': [-0.02, -0.025, -0.08],
        'shoulder.R': [0.035, 0.045, -0.115],
        'upperarm.R': [0.84, 0, -0.12],
        'forearm.R': [-0.46, 0, -0.035],
        'upperarm.L': [0.46, -0.08, 0.24],
        'forearm.L': [-0.7, 0, 0.08],
        'thigh.L': [0.26, 0, -0.14],
        'thigh.R': [0.5, 0, 0.17],
        'shin.L': [-0.48, 0, 0.08],
        'shin.R': [-0.76, 0, -0.1],
        'foot.L': [0.14, 0, 0],
        'foot.R': [0.2, 0, 0],
      },
    },
    {
      // Retraction: pull back through the stagger rather than snapping upright;
      // the free arm opens and catches the returning centre of mass.
      t: 0.82,
      root: [-0.018, -0.008, -0.014],
      pose: {
        hips: [0.08, -0.085, 0.07],
        spine: [-0.015, -0.105, -0.05],
        chest: [-0.075, -0.125, -0.06],
        neck: [0.1, 0.07, 0.02],
        head: [0.06, 0.065, 0.015],
        'shoulder.L': [0.01, 0.015, -0.04],
        'shoulder.R': [0.02, 0, -0.035],
        'upperarm.R': [0.44, 0, -0.035],
        'forearm.R': [-0.44, 0, 0],
        'upperarm.L': [0.3, 0.03, 0.34],
        'forearm.L': [-0.46, 0, 0.1],
        'thigh.L': [0.06, 0, -0.1],
        'thigh.R': [0.22, 0, 0.12],
        'shin.L': [-0.14, 0, 0.05],
        'shin.R': [-0.4, 0, -0.07],
        'foot.L': [0.04, 0, 0],
        'foot.R': [0.1, 0, 0],
      },
    },
    {
      // Balance recovery overshoots neutral before the final settle.
      t: 0.92,
      root: [0.012, -0.004, -0.006],
      pose: {
        hips: [0.05, 0.055, -0.045],
        spine: [0.09, 0.065, 0.03],
        chest: [0.05, 0.085, 0.04],
        neck: [0.085, -0.04, -0.015],
        head: [0.04, -0.03, -0.01],
        'shoulder.L': [0.01, 0, -0.025],
        'shoulder.R': [0.04, 0, -0.04],
        'upperarm.R': [0.2, 0, -0.04],
        'forearm.R': [-0.3, 0, 0],
        'upperarm.L': [0.1, 0, 0.12],
        'forearm.L': [-0.28, 0, 0.035],
        'thigh.L': [0.02, 0, -0.06],
        'thigh.R': [0.1, 0, 0.075],
        'shin.L': [-0.05, 0, 0.03],
        'shin.R': [-0.18, 0, -0.04],
      },
    },
    {
      t: 1.0,
      root: [0, 0, 0],
      pose: {
        hips: [0.03, 0.02, -0.025],
        spine: [0.045, -0.02, 0.018],
        chest: [0.02, -0.025, 0.02],
        neck: [0.05, 0.02, -0.008],
        head: [0.018, 0.014, -0.005],
        'shoulder.L': [0.005, 0, -0.015],
        'shoulder.R': [0.04, 0, -0.04],
        'upperarm.R': [0.08, 0, -0.04],
        'forearm.R': [-0.22, 0, 0],
        'upperarm.L': [0.05, 0, 0.06],
        'forearm.L': [-0.18, 0, 0],
        'thigh.L': [0.02, 0, -0.035],
        'thigh.R': [0.05, 0, 0.045],
        'shin.L': [-0.05, 0, 0],
        'shin.R': [-0.08, 0, 0],
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
        hips: [0.025, 0.02, -0.04],
        spine: [0.045, -0.06, 0.025],
        chest: [0.025, -0.08, 0.035],
        neck: [0.01, 0.04, -0.015],
        head: [-0.01, 0.025, -0.01],
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
        hips: [0.05, 0.04, -0.08],
        spine: [0.08, -0.02, 0.04],
        chest: [0.045, -0.04, 0.055],
        neck: [-0.04, 0.02, -0.025],
        head: [-0.025, 0.015, -0.018],
        'shoulder.R': [0.2, 0, 0],
        'upperarm.R': [0.54, 0, -0.16],
        'forearm.R': [-0.5, 0, 0],
        'upperarm.L': [0.12, 0, 0.08],
        'forearm.L': [-0.3, 0, 0],
        'thigh.L': [0.14, 0, -0.08],
        'thigh.R': [0.24, 0, 0.1],
        'shin.L': [-0.28, 0, 0.04],
        'shin.R': [-0.42, 0, -0.05],
      },
    },
    {
      // Pour. Wrist rolled over; held nearly still, because a watering can that
      // waves around does not read as pouring.
      t: 0.42,
      root: [-0.01, -0.032, 0.034],
      pose: {
        hips: [0.08, 0.05, -0.1],
        spine: [0.1, 0, 0.05],
        chest: [0.06, 0, 0.07],
        neck: [-0.07, 0, -0.03],
        head: [-0.045, 0, -0.022],
        'shoulder.R': [0.22, 0, 0],
        'upperarm.R': [0.62, 0, -0.2],
        'forearm.R': [-0.42, 0, -0.34],
        'upperarm.L': [0.14, 0, 0.1],
        'forearm.L': [-0.32, 0, 0],
        'thigh.L': [0.16, 0, -0.09],
        'thigh.R': [0.3, 0, 0.12],
        'shin.L': [-0.32, 0, 0.05],
        'shin.R': [-0.5, 0, -0.06],
      },
    },
    {
      t: 0.72,
      root: [-0.008, -0.03, 0.032],
      pose: {
        hips: [0.075, 0.045, -0.095],
        spine: [0.095, 0.02, 0.05],
        chest: [0.055, 0.03, 0.065],
        neck: [-0.06, 0, -0.03],
        head: [-0.04, 0, -0.02],
        'shoulder.R': [0.21, 0, 0],
        'upperarm.R': [0.6, 0, -0.19],
        'forearm.R': [-0.44, 0, -0.3],
        'upperarm.L': [0.13, 0, 0.1],
        'forearm.L': [-0.31, 0, 0],
        'thigh.L': [0.15, 0, -0.085],
        'thigh.R': [0.28, 0, 0.115],
        'shin.L': [-0.3, 0, 0.045],
        'shin.R': [-0.46, 0, -0.055],
      },
    },
    {
      t: 1.0,
      root: [0, 0, 0],
      pose: {
        hips: [0.02, 0.01, -0.02],
        spine: [0.03, 0, 0.012],
        chest: [0.01, 0, 0.012],
        neck: [0, 0, -0.006],
        head: [0, 0, -0.004],
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
