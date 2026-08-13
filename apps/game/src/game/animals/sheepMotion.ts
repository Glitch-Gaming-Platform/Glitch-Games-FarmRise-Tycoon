/** Deterministic sheep placement shared by rendering, collision and guidance. */
export const SHEEP_COLLISION_RADIUS = 0.52;

const SHEEP_VISUAL_STRIDE = 0.27;

function smoothStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function smootherStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function locomotionEnvelope(progress: number): number {
  return Math.min(smoothStep01(progress / 0.14), smoothStep01((1 - progress) / 0.2));
}

export interface SheepPose {
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

export function createSheepPose(): SheepPose {
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

export function sheepPose(
  shelter: { readonly x: number; readonly z: number },
  index: number,
  count: number,
  simulationSeconds: number,
  purchaseIntro: number,
  out: SheepPose,
): SheepPose {
  const cycleLength = 17.5 + (index % 4) * 1.15;
  const localTime = simulationSeconds + index * 2.17;
  const cycle = Math.floor(localTime / cycleLength);
  const withinCycle = localTime - cycle * cycleLength;
  const walkDuration = cycleLength * (0.45 + (index % 2) * 0.04);
  const grazeDuration = cycleLength * 0.36;
  const walking = withinCycle < walkDuration;
  const grazing = withinCycle >= walkDuration && withinCycle < walkDuration + grazeDuration;
  const walkProgress = Math.min(1, withinCycle / walkDuration);
  const motionTime = cycle * walkDuration + smootherStep01(walkProgress) * walkDuration;
  const motion = walking ? locomotionEnvelope(walkProgress) : 0;
  const pace = 0.052 + (index % 3) * 0.004;
  const phase = index * 2.13 + motionTime * pace;
  const ring = 3.05 + (index % 3) * 0.72 + Math.min(1.1, count * 0.07);
  out.x = shelter.x + Math.cos(phase) * ring;
  out.z = shelter.z + Math.sin(phase) * ring * 0.78;

  const gaitRate = (pace * ring * 0.89) / SHEEP_VISUAL_STRIDE;
  const gaitPhase = (((motionTime * gaitRate) % 1) + 1) % 1;
  const stepLift = Math.max(0, Math.sin(gaitPhase * Math.PI * 2)) * motion;
  const grazeTime = Math.max(0, withinCycle - walkDuration);
  const grazeProgress = grazeTime / grazeDuration;
  const grazeEnvelope = grazing
    ? Math.min(smoothStep01(grazeProgress / 0.16), smoothStep01((1 - grazeProgress) / 0.2))
    : 0;
  const graze = grazeEnvelope * (0.95 + Math.sin(grazeTime * 2.7 + index * 0.8) * 0.05);

  out.y = stepLift * 0.018;
  out.pitch = graze * 0.018;
  out.yaw = Math.atan2(-Math.sin(phase), Math.cos(phase) * 0.78);
  out.roll = walking
    ? Math.sin(gaitPhase * Math.PI * 2) * 0.021 * motion
    : Math.sin(grazeTime * 1.2 + index) * 0.009 * grazeEnvelope;
  const baseScale = purchaseIntro * (0.95 + (index % 4) * 0.025);
  out.scaleX = baseScale * (1 + stepLift * 0.014);
  out.scaleY = baseScale * (1 - stepLift * 0.018);
  out.scaleZ = baseScale * (1 + stepLift * 0.01);
  out.motion = motion;
  out.graze = graze;
  out.gaitPhase = gaitPhase;
  return out;
}
