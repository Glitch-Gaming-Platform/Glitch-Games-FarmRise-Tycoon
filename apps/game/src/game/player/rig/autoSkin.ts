/**
 * Binds the authored farmer mesh to the skeleton, in code, at load time.
 *
 * The rule is capsule distance: every bone owns a line segment with a radius,
 * and a vertex's weight for that bone falls off with distance to the segment.
 * Four influences per vertex, normalised, which is what `THREE.SkinnedMesh`
 * expects.
 *
 * Two special cases earn their keep:
 *
 *   - **Side gating.** A left-arm bone may only claim vertices with x < 0. The
 *     arms hang about 20 cm apart on a 40 cm-wide chibi torso, so without this
 *     the left forearm capsule reaches across the belly and picks up right-hand
 *     vertices. The visible symptom is a hand that tears toward the opposite
 *     elbow whenever the arms swing past each other.
 *   - **Bone priority.** `hips` carries a 0.40 m capsule so that the satchel on
 *     the right hip has something to bind to; nothing else reaches it, and an
 *     unclaimed vertex falls through to "nearest bone", which is the thigh,
 *     which makes the bag swing with the leg. That same wide capsule reaches
 *     deep into both thighs, so `hips` is given a low priority and loses to any
 *     limb whose capsule actually contains the vertex.
 */
import * as THREE from 'three';
import { BONES, BONE_INDEX } from './skeletonDefinition.js';

const MAX_INFLUENCES = 4;

function isBrownAccessory(r: number, g: number, b: number): boolean {
  return r > 0.025 && r > g * 1.7 && g > b * 2;
}

/**
 * The strap and bag are disconnected rigid islands. Capsule blending is ideal
 * at organic joints, but on a box it turns tiny mixed weights into stretched
 * triangles during broad arm poses. Their authored location and brown vertex
 * colour identify them unambiguously, so bind those islands rigidly.
 */
function rigidAccessoryBone(
  px: number,
  py: number,
  pz: number,
  r: number,
  g: number,
  b: number,
): number | null {
  if (!isBrownAccessory(r, g, b)) return null;

  const strap = BONES[BONE_INDEX['strap']!]!;
  if (
    distanceToSegment(
      px,
      py,
      pz,
      strap.head[0],
      strap.head[1],
      strap.head[2],
      strap.tail[0],
      strap.tail[1],
      strap.tail[2],
    ) < 0.052
  ) {
    return BONE_INDEX['strap']!;
  }

  if (px >= 0.12 && px <= 0.4 && py >= 0.42 && py <= 0.76 && pz >= -0.13 && pz <= 0.04) {
    return BONE_INDEX['satchel']!;
  }
  return null;
}

/** Squared distance from a point to a segment, plus nothing else allocated. */
function distanceToSegment(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const abLengthSq = abx * abx + aby * aby + abz * abz;
  const t =
    abLengthSq > 0 ? Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / abLengthSq)) : 0;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Adds `skinIndex` and `skinWeight` attributes to a clone of `geometry`.
 * The input is left untouched - `ModelLibrary` shares geometries between the
 * player and any other consumer, and skinning attributes must not leak.
 */
export function createSkinnedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const skinned = geometry.clone();
  const position = skinned.getAttribute('position') as THREE.BufferAttribute;
  const colour = skinned.getAttribute('color') as THREE.BufferAttribute | undefined;
  const count = position.count;

  const indices = new Uint16Array(count * MAX_INFLUENCES);
  const weights = new Float32Array(count * MAX_INFLUENCES);

  const candidateIndex: number[] = [];
  const candidateWeight: number[] = [];

  for (let v = 0; v < count; v += 1) {
    const px = position.getX(v);
    const py = position.getY(v);
    const pz = position.getZ(v);

    const rigidBone = colour
      ? rigidAccessoryBone(px, py, pz, colour.getX(v), colour.getY(v), colour.getZ(v))
      : null;
    if (rigidBone !== null) {
      indices[v * MAX_INFLUENCES] = rigidBone;
      weights[v * MAX_INFLUENCES] = 1;
      continue;
    }

    candidateIndex.length = 0;
    candidateWeight.length = 0;

    for (let b = 0; b < BONES.length; b += 1) {
      const bone = BONES[b]!;
      if (bone.radius <= 0) continue;
      if (bone.side !== 0 && bone.side !== (px < 0 ? -1 : 1)) continue;

      const distance = distanceToSegment(
        px,
        py,
        pz,
        bone.head[0],
        bone.head[1],
        bone.head[2],
        bone.tail[0],
        bone.tail[1],
        bone.tail[2],
      );
      if (distance >= bone.radius) continue;
      // Cubed falloff, then scaled by priority. Linear falloff leaves too much
      // weight at the capsule rim and reproduces the smearing the old region
      // masks had; cubing makes a vertex sitting inside a limb overwhelmingly
      // that limb's, which is what rigid low-poly joints need.
      const t = 1 - distance / bone.radius;
      candidateIndex.push(b);
      candidateWeight.push(t * t * t * bone.priority);
    }

    // Nothing claimed this vertex - it is further from every capsule than that
    // capsule's radius. Fall back to the single nearest bone so the vertex is
    // still driven by something rather than collapsing to the origin.
    if (candidateIndex.length === 0) {
      let best = BONE_INDEX['hips']!;
      let bestDistance = Infinity;
      for (let b = 0; b < BONES.length; b += 1) {
        const bone = BONES[b]!;
        if (bone.radius <= 0) continue;
        if (bone.side !== 0 && bone.side !== (px < 0 ? -1 : 1)) continue;
        const distance = distanceToSegment(
          px,
          py,
          pz,
          bone.head[0],
          bone.head[1],
          bone.head[2],
          bone.tail[0],
          bone.tail[1],
          bone.tail[2],
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = b;
        }
      }
      candidateIndex.push(best);
      candidateWeight.push(1);
    }

    // Keep the strongest four, then normalise.
    const order = candidateIndex
      .map((_, i) => i)
      .sort((a, b) => candidateWeight[b]! - candidateWeight[a]!)
      .slice(0, MAX_INFLUENCES);

    let total = 0;
    for (const i of order) total += candidateWeight[i]!;
    for (let slot = 0; slot < MAX_INFLUENCES; slot += 1) {
      const i = order[slot];
      if (i === undefined || total <= 0) {
        indices[v * MAX_INFLUENCES + slot] = 0;
        weights[v * MAX_INFLUENCES + slot] = 0;
        continue;
      }
      indices[v * MAX_INFLUENCES + slot] = candidateIndex[i]!;
      weights[v * MAX_INFLUENCES + slot] = candidateWeight[i]! / total;
    }
  }

  skinned.setAttribute('skinIndex', new THREE.BufferAttribute(indices, MAX_INFLUENCES));
  skinned.setAttribute('skinWeight', new THREE.BufferAttribute(weights, MAX_INFLUENCES));
  return skinned;
}

/** Builds the bone hierarchy and the `THREE.Skeleton` that drives the mesh. */
export function createSkeleton(): { bones: THREE.Bone[]; skeleton: THREE.Skeleton } {
  const bones = BONES.map((definition) => {
    const bone = new THREE.Bone();
    bone.name = definition.name;
    return bone;
  });

  BONES.forEach((definition, index) => {
    const bone = bones[index]!;
    if (definition.parent < 0) {
      bone.position.set(...definition.head);
      return;
    }
    const parent = BONES[definition.parent]!;
    // Bone positions are authored as absolute mesh-space coordinates because
    // that is how they are read off assets.py. three.js wants them relative to
    // the parent, so the conversion happens here rather than in the table.
    bone.position.set(
      definition.head[0] - parent.head[0],
      definition.head[1] - parent.head[1],
      definition.head[2] - parent.head[2],
    );
    bones[definition.parent]!.add(bone);
  });

  const root = bones[0]!;
  root.updateMatrixWorld(true);
  return { bones, skeleton: new THREE.Skeleton(bones) };
}
