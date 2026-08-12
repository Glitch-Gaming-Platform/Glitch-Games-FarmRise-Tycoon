/** Deterministic cow placement shared by rendering and dynamic collision. */
export const COW_COLLISION_RADIUS = 0.62;

const COW_VISUAL_STRIDE = 0.32;

function smoothStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function smootherStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function locomotionEnvelope(progress: number): number {
  return Math.min(smoothStep01(progress / 0.14), smoothStep01((1 - progress) / 0.18));
}

export interface CowPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  motion: number;
  graze: number;
  gaitPhase: number;
}

export function createCowPose(): CowPose {
  return {
    x: 0,
    y: 0,
    z: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    motion: 0,
    graze: 0,
    gaitPhase: 0,
  };
}

export function cowPose(
  shelter: { x: number; z: number },
  index: number,
  count: number,
  simulationSeconds: number,
  purchaseIntro: number,
  out: CowPose,
): CowPose {
  const cycleLength = 14.0 + (index % 3) * 1.35;
  const localTime = simulationSeconds + index * 2.73;
  const cycle = Math.floor(localTime / cycleLength);
  const withinCycle = localTime - cycle * cycleLength;
  const walkDuration = cycleLength * (0.5 + (index % 2) * 0.05);
  const grazeDuration = cycleLength * 0.32;
  const walking = withinCycle < walkDuration;
  const grazing = withinCycle >= walkDuration && withinCycle < walkDuration + grazeDuration;
  const walkProgress = Math.min(1, withinCycle / walkDuration);
  const motionTime = cycle * walkDuration + smootherStep01(walkProgress) * walkDuration;
  const motion = walking ? locomotionEnvelope(walkProgress) : 0;
  const pace = 0.04 + (index % 3) * 0.004;
  const phase = index * 2.399 + motionTime * pace;
  const ring = 2.8 + (index % 2) * 1.15 + Math.min(1.2, count * 0.08);
  out.x = shelter.x + Math.cos(phase) * ring;
  out.z = shelter.z + Math.sin(phase) * ring * 0.72;
  // Cadence follows approximate ground distance instead of an unrelated
  // timer. The previous 0.78 cycles/s shuffled the hooves several times for
  // every body-length travelled around this deliberately slow pasture path.
  const gaitRate = (pace * ring * 0.86) / COW_VISUAL_STRIDE;
  const gaitPhase = (((motionTime * gaitRate) % 1) + 1) % 1;
  const stepLift = Math.max(0, Math.sin(gaitPhase * Math.PI * 2)) * motion;
  const grazeTime = Math.max(0, withinCycle - walkDuration);
  const grazeProgress = grazeTime / grazeDuration;
  const grazeEnvelope = grazing
    ? Math.min(smoothStep01(grazeProgress / 0.18), smoothStep01((1 - grazeProgress) / 0.18))
    : 0;
  const graze = grazeEnvelope * (0.94 + Math.sin(grazeTime * 3.1 + index) * 0.06);
  out.y = stepLift * 0.014;
  out.pitch = graze * 0.025;
  // Tangent of x=cos(phase), z=.72sin(phase). The old phase+PI/2 heading is
  // radial at key points, so cows visibly travelled broadside around the coop.
  out.yaw = Math.atan2(-Math.sin(phase), Math.cos(phase) * 0.72);
  out.roll = walking
    ? Math.sin(gaitPhase * Math.PI * 2) * 0.016 * motion
    : Math.sin(grazeTime * 1.4 + index * 0.7) * 0.008 * grazeEnvelope;
  const baseScale = purchaseIntro * (0.96 + (index % 3) * 0.035);
  out.scaleX = baseScale * (1 + stepLift * 0.008);
  out.scaleY = baseScale * (1 - stepLift * 0.012);
  out.scaleZ = baseScale * (1 + stepLift * 0.006);
  out.motion = motion;
  out.graze = graze;
  out.gaitPhase = gaitPhase;
  return out;
}
