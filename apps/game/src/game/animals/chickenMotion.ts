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
}

export const CHICKEN_COLLISION_RADIUS = 0.28;

const TROUGH_OFFSET_X = -1.9;
const TROUGH_OFFSET_Z = -1.44;
// Includes the trough proxy, the raster's conservative half-cell expansion,
// and the chicken radius rather than only keeping the bird's centre clear.
const TROUGH_CLEARANCE = 1.42;
const COOP_CLEARANCE = 2.45;

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
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + elapsedSeconds * pace;
  // Keep the orbit outside the coop's solid proxy. The variation gives each
  // bird its own lane instead of drawing a perfectly artificial ring.
  const radius = COOP_CLEARANCE + ((index * 37) % 7) * 0.11;
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

  const step = elapsedSeconds * (6.4 + (index % 4) * 0.55) + index * 1.7;
  const peck = Math.max(0, Math.sin(elapsedSeconds * 2.3 + index * 2.1) - 0.72) / 0.28;
  const bob = Math.abs(Math.sin(step)) * 0.025 + animalHop;
  const squash = Math.abs(Math.sin(step)) * 0.045;

  out.x = shelter.x + offsetX;
  out.y = bob;
  out.z = shelter.z + offsetZ;
  out.pitch = peck * 0.52;
  out.yaw = -angle + Math.PI / 2;
  out.roll = Math.sin(step) * 0.055;
  out.scaleX = (1 + squash * 0.25) * purchaseIntro;
  out.scaleY = (1 - squash + animalHop * 0.18) * purchaseIntro;
  out.scaleZ = (1 + squash * 0.45) * purchaseIntro;
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
  };
}
