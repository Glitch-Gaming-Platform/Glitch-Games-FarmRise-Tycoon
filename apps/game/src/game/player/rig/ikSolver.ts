/**
 * Analytic two-bone IK, in the sagittal plane.
 *
 * Used for two things:
 *
 *   - **Foot lock.** The pose clips get the stance foot approximately right,
 *     but "approximately" is exactly what foot sliding is. Once a foot plants,
 *     its world position is recorded, and for the rest of stance the leg is
 *     solved to keep the ankle at that recorded point. The residual slide goes
 *     from a few centimetres per step to zero.
 *   - **Tool contact.** The trowel, watering can and sickle used to be placed
 *     at hard-coded offsets that had no relationship to the arm, which is why
 *     the audit said hands "do not convincingly grip the tools". Now the tool
 *     defines where the hand must be and the arm is solved to reach it.
 *
 * Analytic rather than iterative (CCD/FABRIK) because a two-link chain has a
 * closed-form solution: it is one law-of-cosines call, it cannot fail to
 * converge, and it costs the same every frame - which matters when the
 * alternative is an iteration count that silently degrades under load.
 */

export interface TwoBoneSolution {
  /** Rotation of the upper bone about X, in the parent's space. */
  readonly upper: number;
  /** Rotation of the lower bone about X, relative to the upper. Always <= 0. */
  readonly lower: number;
  /** True when the target was out of reach and the chain was left extended. */
  readonly clamped: boolean;
}

/**
 * Solves a two-link chain rooted at the origin to place its end effector at
 * (`forward`, `down`), both measured from the root in the sagittal plane.
 *
 * `down` is positive downward, matching how a leg hangs, so a foot 0.39 m below
 * the hip is `down = 0.39`.
 *
 * `bendSign` is +1 for a joint that folds backward (a knee, whose shin trails)
 * and -1 for one that folds forward (an elbow).
 */
export function solveTwoBone(
  forward: number,
  down: number,
  upperLength: number,
  lowerLength: number,
  bendSign: 1 | -1 = 1,
): TwoBoneSolution {
  const distance = Math.hypot(forward, down);
  const reach = upperLength + lowerLength;
  const minimum = Math.abs(upperLength - lowerLength);

  // Clamping rather than failing. A target beyond reach is not an error - it
  // happens every time the player stands further from a plot than their arm is
  // long - and the correct behaviour is to point the whole chain at it.
  const clamped = distance > reach - 1e-5 || distance < minimum + 1e-5;
  const effective = Math.min(reach - 1e-4, Math.max(minimum + 1e-4, distance));

  // Angle of the target from straight down, positive toward +Z.
  const targetAngle = Math.atan2(forward, down);

  // Law of cosines: the angle between the upper bone and the root-to-target
  // line, and the interior angle at the joint.
  const cosUpper =
    (upperLength * upperLength + effective * effective - lowerLength * lowerLength) /
    (2 * upperLength * effective);
  const cosJoint =
    (upperLength * upperLength + lowerLength * lowerLength - effective * effective) /
    (2 * upperLength * lowerLength);

  const upperOffset = Math.acos(Math.min(1, Math.max(-1, cosUpper)));
  const jointAngle = Math.acos(Math.min(1, Math.max(-1, cosJoint)));

  return {
    upper: targetAngle + upperOffset * bendSign,
    // Interior angle pi means straight. The bone's local rotation is the
    // deviation from straight, negated so a knee reads as a negative number
    // everywhere in this codebase.
    lower: -(Math.PI - jointAngle) * bendSign,
    clamped,
  };
}

/**
 * Blends an IK result over a raw FK pose.
 *
 * Foot lock must fade in and out rather than switch, or the leg snaps at heel
 * strike and toe-off. `weight` is driven by a smoothstep across the first and
 * last slice of stance.
 */
export function blendAngle(fk: number, ik: number, weight: number): number {
  return fk + (ik - fk) * Math.min(1, Math.max(0, weight));
}
