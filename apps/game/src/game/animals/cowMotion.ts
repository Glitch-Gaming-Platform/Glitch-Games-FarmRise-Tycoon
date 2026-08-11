/** Deterministic cow placement shared by rendering and dynamic collision. */
export const COW_COLLISION_RADIUS = 0.62;

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
  const motionTime = cycle * walkDuration + Math.min(withinCycle, walkDuration);
  const pace = 0.04 + (index % 3) * 0.004;
  const phase = index * 2.399 + motionTime * pace;
  const ring = 2.8 + (index % 2) * 1.15 + Math.min(1.2, count * 0.08);
  out.x = shelter.x + Math.cos(phase) * ring;
  out.z = shelter.z + Math.sin(phase) * ring * 0.72;
  const gaitPhase = (((motionTime * (0.78 + (index % 3) * 0.06)) % 1) + 1) % 1;
  const stepLift = walking ? Math.max(0, Math.sin(gaitPhase * Math.PI * 2)) : 0;
  const grazeTime = Math.max(0, withinCycle - walkDuration);
  const graze = grazing ? Math.sin(Math.min(1, grazeTime / 1.2) * Math.PI * 0.5) : 0;
  out.y = stepLift * 0.014;
  out.pitch = graze * 0.045;
  out.yaw = phase + Math.PI * 0.5;
  out.roll = walking ? Math.sin(gaitPhase * Math.PI * 2) * 0.018 : 0;
  const baseScale = purchaseIntro * (0.96 + (index % 3) * 0.035);
  out.scaleX = baseScale * (1 + stepLift * 0.008);
  out.scaleY = baseScale * (1 - stepLift * 0.012);
  out.scaleZ = baseScale * (1 + stepLift * 0.006);
  out.motion = walking ? 1 : 0;
  out.graze = graze;
  out.gaitPhase = gaitPhase;
  return out;
}
