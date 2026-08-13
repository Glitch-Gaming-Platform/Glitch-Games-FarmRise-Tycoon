/** Deterministic farm-dog patrol shared by rendering and dynamic collision. */
export const DOG_COLLISION_RADIUS = 0.44;

const DOG_VISUAL_STRIDE = 0.3;

function smoothStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function smootherStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

export interface DogPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  scale: number;
  motion: number;
  alert: number;
  gaitPhase: number;
}

export function createDogPose(): DogPose {
  return {
    x: 0,
    y: 0,
    z: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    scale: 1,
    motion: 0,
    alert: 0,
    gaitPhase: 0,
  };
}

export function dogPose(
  shelter: { readonly x: number; readonly z: number },
  index: number,
  count: number,
  simulationSeconds: number,
  purchaseIntro: number,
  out: DogPose,
): DogPose {
  const cycleLength = 10.5 + (index % 4) * 0.85;
  const localTime = simulationSeconds + index * 1.91;
  const cycle = Math.floor(localTime / cycleLength);
  const withinCycle = localTime - cycle * cycleLength;
  const patrolDuration = cycleLength * 0.64;
  const patrolling = withinCycle < patrolDuration;
  const progress = Math.min(1, withinCycle / patrolDuration);
  const motionTime = cycle * patrolDuration + smootherStep01(progress) * patrolDuration;
  const motion = patrolling
    ? Math.min(smoothStep01(progress / 0.12), smoothStep01((1 - progress) / 0.16))
    : 0;
  const pace = 0.1 + (index % 3) * 0.006;
  const phase = index * 2.399 + motionTime * pace;
  const ring = 1.85 + (index % 3) * 0.52 + Math.min(0.8, count * 0.05);
  out.x = shelter.x + Math.cos(phase) * ring;
  out.z = shelter.z + Math.sin(phase) * ring * 0.68;

  const gaitRate = (pace * ring * 0.82) / DOG_VISUAL_STRIDE;
  out.gaitPhase = (((motionTime * gaitRate) % 1) + 1) % 1;
  const stepLift = Math.max(0, Math.sin(out.gaitPhase * Math.PI * 2)) * motion;
  const alertTime = Math.max(0, withinCycle - patrolDuration);
  out.alert = patrolling ? 0 : 0.88 + Math.sin(alertTime * 2.3 + index) * 0.12;
  out.y = stepLift * 0.018;
  out.pitch = out.alert * -0.025;
  out.yaw = Math.atan2(-Math.sin(phase), Math.cos(phase) * 0.68);
  out.roll = Math.sin(out.gaitPhase * Math.PI * 2) * 0.022 * motion;
  out.scale = purchaseIntro * (0.96 + (index % 4) * 0.025);
  out.motion = motion;
  return out;
}
