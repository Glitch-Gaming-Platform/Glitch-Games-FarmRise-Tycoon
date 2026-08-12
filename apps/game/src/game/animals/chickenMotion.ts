import { TICK_SECONDS } from '@farmrise/shared';

/**
 * Deterministic chicken motion shared by rendering and collision.
 *
 * Chickens are stored as a count rather than as simulation entities. Keeping
 * their procedural position in one pure function prevents the visible flock
 * and its lightweight dynamic colliders from drifting apart.
 */
export interface ChickenPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** 1 while walking, 0 while resting/pecking. Fed to the instanced shader. */
  motion: number;
  /** 0..1 peck amount, isolated to the head by the shader. */
  action: number;
  /** Exact gait phase shared with the leg shader. */
  gaitPhase: number;
}

export const CHICKEN_COLLISION_RADIUS = 0.33;

const TROUGH_OFFSET_X = -1.9;
const TROUGH_OFFSET_Z = -1.44;
// Includes the trough proxy, the raster's conservative half-cell expansion,
// and the chicken radius rather than only keeping the bird's centre clear.
const TROUGH_CLEARANCE = 1.48;
const COOP_CLEARANCE = 2.52;

interface ChickenPathPoint {
  x: number;
  z: number;
}

function smoothStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function smootherStep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

/** Fades a walk in and out without changing the deterministic path endpoints. */
function locomotionEnvelope(progress: number): number {
  return Math.min(smoothStep01(progress / 0.12), smoothStep01((1 - progress) / 0.16));
}

/** Writes the coop/trough-adjusted local path point without allocating per bird. */
function writeChickenPathPoint(angle: number, radius: number, out: ChickenPathPoint): void {
  let offsetX = Math.cos(angle) * radius;
  let offsetZ = Math.sin(angle) * radius;

  // The feed trough sits off the coop's south-west corner. Push the procedural
  // path smoothly around it so chickens obey the same authored prop footprint
  // as every physics-driven actor.
  const troughDx = offsetX - TROUGH_OFFSET_X;
  const troughDz = offsetZ - TROUGH_OFFSET_Z;
  const troughDistance = Math.hypot(troughDx, troughDz);
  if (troughDistance < TROUGH_CLEARANCE) {
    const normalX = troughDistance > 0.001 ? troughDx / troughDistance : Math.cos(angle + 0.5);
    const normalZ = troughDistance > 0.001 ? troughDz / troughDistance : Math.sin(angle + 0.5);
    const correction = TROUGH_CLEARANCE - troughDistance;
    offsetX += normalX * correction;
    offsetZ += normalZ * correction;
  }

  // Trough avoidance can push a lane inward. Re-project it beyond a circular
  // envelope around the coop so the complete chicken body stays out of the
  // conservative static raster at every angle.
  const coopDistance = Math.hypot(offsetX, offsetZ);
  if (coopDistance < COOP_CLEARANCE) {
    const scale = COOP_CLEARANCE / Math.max(0.001, coopDistance);
    offsetX *= scale;
    offsetZ *= scale;
  }

  out.x = offsetX;
  out.z = offsetZ;
}

export function chickenPose(
  shelter: { readonly x: number; readonly z: number },
  index: number,
  total: number,
  elapsedSeconds: number,
  animalHop = 0,
  purchaseIntro = 1,
  out: ChickenPose = createChickenPose(),
): ChickenPose {
  const pace = 0.32 + (index % 3) * 0.11;
  const cycleLength = 9.5 + (index % 4) * 0.85;
  const localTime = elapsedSeconds + index * 1.73;
  const cycle = Math.floor(localTime / cycleLength);
  const withinCycle = localTime - cycle * cycleLength;
  const walkDuration = cycleLength * (0.58 + (index % 3) * 0.035);
  const walking = withinCycle < walkDuration;
  const walkProgress = Math.min(1, withinCycle / walkDuration);
  // The old linear clamp started and stopped every bird at full tangential
  // speed. Easing the travelled fraction gives the flock anticipation and
  // settle while keeping the exact same path, endpoints and collision source.
  const travelledWalk = smootherStep01(walkProgress) * walkDuration;
  const motionTime = cycle * walkDuration + travelledWalk;
  const motion = walking ? locomotionEnvelope(walkProgress) : 0;
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + motionTime * pace;
  // Keep the orbit outside the coop's solid proxy. The variation gives each
  // bird its own lane instead of drawing a perfectly artificial ring.
  const radius = COOP_CLEARANCE + ((index * 37) % 7) * 0.11;
  writeChickenPathPoint(angle, radius, out);
  const offsetX = out.x;
  const offsetZ = out.z;
  // Average the heading across the same fixed tick used by simulation. This
  // also gives the bird a stable direction through the trough-avoidance bend.
  const nextLocalTime = localTime + TICK_SECONDS;
  const nextCycle = Math.floor(nextLocalTime / cycleLength);
  const nextWithinCycle = nextLocalTime - nextCycle * cycleLength;
  const nextWalkProgress = Math.min(1, nextWithinCycle / walkDuration);
  const nextMotionTime = nextCycle * walkDuration + smootherStep01(nextWalkProgress) * walkDuration;
  const nextAngle = (index / Math.max(1, total)) * Math.PI * 2 + nextMotionTime * pace;
  writeChickenPathPoint(nextAngle, radius, out);
  const tangentX = out.x - offsetX;
  const tangentZ = out.z - offsetZ;

  const step = motionTime * (6.4 + (index % 4) * 0.55) + index * 1.7;
  const restTime = Math.max(0, withinCycle - walkDuration);
  const peck = walking
    ? Math.max(0, Math.sin(localTime * 1.7 + index * 2.1) - 0.88) / 0.12
    : Math.max(0, Math.sin(restTime * 4.6 + index * 0.7));
  // Gait profile rather than a sine. `Math.abs(Math.sin(step))` rises and falls
  // at the same rate, so the body floated up as smoothly as it dropped; a
  // walking bird falls onto a planted foot quickly and rises slowly. Reusing
  // the same 62% stance the chicken shader uses keeps the body bob in step with
  // the legs instead of beating against them.
  const gaitPhase = (((step / (Math.PI * 2)) % 1) + 1) % 1;
  const stance = 0.62;
  const lift = gaitPhase < stance ? 0 : Math.sin(((gaitPhase - stance) / (1 - stance)) * Math.PI);
  const bob = lift * 0.034 * motion + animalHop;
  // Compression peaks at the plant, which is the start of stance, not at the
  // top of the lift.
  const impact = gaitPhase < 0.18 ? 1 - gaitPhase / 0.18 : 0;
  const squash = walking ? impact * 0.06 * motion : peck * 0.018;
  const restLook = walking ? 0 : Math.sin(restTime * 0.72 + index * 1.37);

  out.x = shelter.x + offsetX;
  out.y = bob;
  out.z = shelter.z + offsetZ;
  // The shader already rotates the head through the peck. Pitching the whole
  // bird by another 37 degrees doubled the action and made its feet leave the
  // floor; the body now only follows through enough to sell intent.
  out.pitch = peck * 0.085;
  // Blender -Y becomes Three.js +Z, so the authored beak/head is local +Z.
  // Aim that axis along the adjusted path tangent; using the orbit angle alone
  // made the birds move sideways and sometimes backwards near the trough.
  const travelYaw = Math.hypot(tangentX, tangentZ) > 1e-8 ? Math.atan2(tangentX, tangentZ) : -angle;
  out.yaw = travelYaw + restLook * 0.11 * (1 - peck);
  out.roll = walking
    ? Math.sin(step) * 0.065 * motion
    : restLook * 0.026 + Math.sin(restTime * 1.7) * 0.008;
  out.scaleX = (1 + squash * 0.25) * purchaseIntro;
  out.scaleY = (1 - squash + animalHop * 0.18) * purchaseIntro;
  out.scaleZ = (1 + squash * 0.45) * purchaseIntro;
  out.motion = motion;
  out.action = peck;
  out.gaitPhase = gaitPhase;
  return out;
}

export function createChickenPose(): ChickenPose {
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
    action: 0,
    gaitPhase: 0,
  };
}
