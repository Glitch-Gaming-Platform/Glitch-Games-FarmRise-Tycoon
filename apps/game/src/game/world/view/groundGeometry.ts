/**
 * The ground plane, with deterministic colour variation and edge relief.
 *
 * Why this exists: the ground is the single largest thing on screen - a plane
 * three times the width of the playable grid - and it was one flat mustard
 * colour across every pixel of it. A large unbroken area of one value reads as
 * "unfinished background", not as land, no matter how good the props standing
 * on it are. The review renders made this obvious: the barn, crops and trees
 * all held up, and the frame still looked flat.
 *
 * Two constraints shaped the fix:
 *
 *   1. It must stay ONE draw call and use no textures. The whole art pipeline
 *      is vertex colours and a single material per object (see
 *      docs/ASSET_PIPELINE.md), and the ground is not allowed to be the
 *      exception that introduces a texture budget.
 *   2. The playable grid must stay perfectly flat. Plots, structures and the
 *      placement preview all assume y = 0, and collision is a 2D grid. So the
 *      height relief is ramped in only OUTSIDE the grid, where nothing can be
 *      built and nothing can be walked on.
 *
 * Everything here is a pure function of position, so two runs produce the same
 * ground and no `Math.random` enters the render layer.
 */
import * as THREE from 'three';

/**
 * Cell size of the mesh, in metres.
 *
 * Two-metre vertices were enough for broad colour zones but made the whole
 * playable estate interpolate as a handful of large soft polygons. One metre
 * gives the land a hand-painted mid-frequency read and enough vertices for
 * procedural normal variation while keeping the ground below 20k triangles.
 */
const SEGMENT_METRES = 1;

/** Peak height of the relief at the far edge, in metres. */
const EDGE_RELIEF = 0.85;

/**
 * Integer hash. Deliberately not `Math.sin`-based: sine hashes vary in the
 * last bits between JS engines, and while this is cosmetic rather than
 * simulation, "looks slightly different on Firefox" is not worth the cost of
 * saving three lines.
 */
function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Value noise with smoothstep interpolation. Returns 0..1. */
function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const sx = smoothstep(0, 1, x - x0);
  const sz = smoothstep(0, 1, z - z0);
  const n00 = hash2(x0, z0);
  const n10 = hash2(x0 + 1, z0);
  const n01 = hash2(x0, z0 + 1);
  const n11 = hash2(x0 + 1, z0 + 1);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sz;
}

/** Three octaves. The largest one does most of the work; the rest break up banding. */
function fbm(x: number, z: number): number {
  return (
    0.6 * valueNoise(x / 11, z / 11) +
    0.28 * valueNoise(x / 4.1, z / 4.1) +
    0.12 * valueNoise(x / 1.7, z / 1.7)
  );
}

export interface GroundGeometryOptions {
  /** Width of the playable grid in metres. Relief starts beyond half of this. */
  readonly playableWidth: number;
  /** Depth of the playable grid in metres. */
  readonly playableDepth: number;
  /** How much larger the visible plane is than the playable grid. */
  readonly extentScale: number;
  /** Broad red-ochre activity zone around the working heart of the farm. */
  readonly farmyard?: { readonly x: number; readonly z: number; readonly radius: number };
  /** Muted green animal-yard mass, visually separating the shelter from crops. */
  readonly pasture?: { readonly x: number; readonly z: number; readonly radius: number };
  /** Soft worn-earth routes. They are visual desire lines, not speed-boosting roads. */
  readonly wornPaths?: readonly {
    readonly from: { readonly x: number; readonly z: number };
    readonly to: { readonly x: number; readonly z: number };
    readonly width: number;
  }[];
  /**
   * Emits an `aTerrain` attribute carrying (pasture, earth, worn) per vertex,
   * which the Ultra tier's layered ground material blends its textures with.
   *
   * Off by default, and that default is the point: on `low` the geometry that
   * reaches the GPU is byte-for-byte the geometry that reached it before this
   * material existed. An always-on attribute would be harmless in practice and
   * would still make "low is unchanged" a claim rather than a fact.
   */
  readonly surfaceWeights?: boolean;
}

export interface GroundSurfaceSample {
  /** Light-and-shade multiplier applied before the palette-owned base colour. */
  readonly value: number;
  /** Broad natural vegetation potential before traffic suppresses it. */
  readonly lush: number;
  /** Natural exposed-clay potential. */
  readonly ochre: number;
  /** Authored activity-zone weight. */
  readonly farmyard: number;
  /** Authored animal-yard weight. */
  readonly pasture: number;
  /** Authored foot-traffic desire-line weight. */
  readonly worn: number;
  /** Final green-ground weight after traffic and farm use. */
  readonly localPasture: number;
  /** Final packed/exposed-earth weight. */
  readonly localEarth: number;
  /** Fine deterministic grain used for surface texture and subtle normals. */
  readonly grain: number;
}

function distanceToSegment(
  x: number,
  z: number,
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0.0001) return Math.hypot(x - from.x, z - from.z);
  const t = Math.min(1, Math.max(0, ((x - from.x) * dx + (z - from.z) * dz) / lengthSquared));
  return Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t));
}

/**
 * Samples the art-directed ground fields without allocating.
 *
 * FarmView uses the same result for vertex colour, scatter density and contact
 * feedback. Keeping those decisions on one field prevents the common terrain
 * failure where grass grows through a worn track while the colour underneath
 * claims that the same spot is packed dirt.
 */
export function sampleGroundSurface(
  x: number,
  z: number,
  options: GroundGeometryOptions,
): GroundSurfaceSample {
  const macro = fbm(x, z);
  const grain = fbm(x * 1.65 + 113.7, z * 1.65 - 87.2);
  const brush =
    Math.sin(x * 0.18 + z * 0.075 + (fbm(x * 0.31 - 27.0, z * 0.31 + 61.0) - 0.5) * 2.4) * 0.5 +
    0.5;
  // Broad value masses do the composition work; the two smaller terms add a
  // dry hand-painted grain that survives the gameplay camera without turning
  // into texture noise or shimmering on mobile.
  const value = 0.72 + macro * 0.3 + (grain - 0.5) * 0.08 + (brush - 0.5) * 0.03;

  const lush = smoothstep(0.35, 0.69, fbm(x * 0.37 + 71.3, z * 0.37 - 19.7));
  const ochre = smoothstep(0.53, 0.83, fbm(x * 0.23 - 31.4, z * 0.23 + 48.8));
  const farmyard = options.farmyard
    ? 1 -
      smoothstep(
        options.farmyard.radius * 0.38,
        options.farmyard.radius,
        Math.hypot(x - options.farmyard.x, z - options.farmyard.z),
      )
    : 0;
  const pasture = options.pasture
    ? 1 -
      smoothstep(
        options.pasture.radius * 0.38,
        options.pasture.radius,
        Math.hypot(x - options.pasture.x, z - options.pasture.z),
      )
    : 0;
  let worn = 0;
  for (const path of options.wornPaths ?? []) {
    const distance = distanceToSegment(x, z, path.from, path.to);
    worn = Math.max(worn, 1 - smoothstep(path.width * 0.55, path.width * 1.65, distance));
  }

  // Traffic and cultivation suppress vegetation. The previous version simply
  // maxed pasture over lushness, so tufts remained visually plausible on top
  // of ground that had already been painted as a heavily worn route.
  const traffic = clamp01(worn * 0.94 + farmyard * 0.68);
  const localPasture = clamp01(Math.max(lush, pasture) * (1 - traffic));
  const localEarth = clamp01(Math.max(ochre * (1 - localPasture), farmyard * 0.72, worn));

  return {
    value,
    lush,
    ochre,
    farmyard,
    pasture,
    worn,
    localPasture,
    localEarth,
    grain,
  };
}

/** Cosmetic height field used only to tilt normals on the flat playable land. */
function surfaceNormalHeight(x: number, z: number): number {
  return (
    (fbm(x * 1.45 + 19.2, z * 1.45 - 41.7) - 0.5) * 0.075 +
    (fbm(x * 3.2 - 73.0, z * 3.2 + 12.0) - 0.5) * 0.018
  );
}

/**
 * Distance outside the playable rectangle, in metres. Zero anywhere inside it,
 * so the flat-play-area guarantee is a property of the geometry rather than a
 * comment asking future code to be careful.
 */
export function outsideDistance(
  x: number,
  z: number,
  playableWidth: number,
  playableDepth: number,
): number {
  const dx = Math.max(0, Math.abs(x) - playableWidth / 2);
  const dz = Math.max(0, Math.abs(z) - playableDepth / 2);
  return Math.hypot(dx, dz);
}

export function createGroundGeometry(options: GroundGeometryOptions): THREE.BufferGeometry {
  const { playableWidth, playableDepth, extentScale } = options;
  const width = playableWidth * extentScale;
  const depth = playableDepth * extentScale;
  const segmentsX = Math.max(1, Math.round(width / SEGMENT_METRES));
  const segmentsZ = Math.max(1, Math.round(depth / SEGMENT_METRES));

  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = position.count;
  const colours = new Float32Array(count * 3);
  const surfaces = options.surfaceWeights ? new Float32Array(count * 3) : null;

  // The relief reaches full strength halfway out into the border ring, so the
  // transition from flat play area to rolling land is gradual rather than a
  // visible crease at the grid boundary.
  const reliefFalloff = Math.max(1, (width - playableWidth) / 4);

  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);

    const outside = outsideDistance(x, z, playableWidth, playableDepth);
    if (outside > 0) {
      const ramp = smoothstep(0, reliefFalloff, outside);
      const h = (fbm(x * 0.55, z * 0.55) - 0.5) * 2;
      position.setY(i, h * EDGE_RELIEF * ramp);
    } else {
      // Snapped, not merely left alone. `rotateX` multiplies through a matrix
      // whose cos is 6.1e-17 rather than 0, so interior vertices come out of
      // it at about 1e-16 instead of exactly zero. That is physically
      // irrelevant and logically annoying: it means "the play area is flat" is
      // an approximation, and approximations invite loosened assertions later.
      position.setY(i, 0);
    }

    const sample = sampleGroundSurface(x, z, options);

    // Gold scrub, muted olive pasture and red-ochre worn earth are the three
    // large colour masses in the supplied references. They remain broad and
    // softly blended: texture-sized noise would violate the style and shimmer
    // at the gameplay camera. The multipliers tint the palette-owned base
    // colour rather than introducing a second hard-coded ground palette.
    const dryFleck = smoothstep(0.66, 0.86, sample.grain) * (1 - sample.localPasture);
    const greenRed = 1 - 0.38 * sample.localPasture;
    const greenGreen = 1 + 0.14 * sample.localPasture;
    const greenBlue = 1 - 0.37 * sample.localPasture;
    const earthRed = 1 + 0.17 * sample.localEarth + dryFleck * 0.035;
    const earthGreen = 1 - 0.31 * sample.localEarth - dryFleck * 0.028;
    const earthBlue = 1 - 0.39 * sample.localEarth - dryFleck * 0.034;
    colours[i * 3] = sample.value * greenRed * earthRed;
    colours[i * 3 + 1] = sample.value * greenGreen * earthGreen;
    colours[i * 3 + 2] = sample.value * greenBlue * earthBlue;

    if (surfaces) {
      surfaces[i * 3] = sample.localPasture;
      surfaces[i * 3 + 1] = sample.localEarth;
      surfaces[i * 3 + 2] = sample.worn;
    }
  }

  position.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  if (surfaces) geometry.setAttribute('aTerrain', new THREE.BufferAttribute(surfaces, 3));
  geometry.computeVertexNormals();

  // The collision area remains mathematically flat, but a perfectly uniform
  // up-vector makes every metre of it catch identical light. Tilting only the
  // vertex normals supplies the soft micro-relief a texture normal map would
  // normally provide, with no UVs, sampled textures or geometry/collision
  // mismatch. The displacement is deliberately tiny and cannot affect the
  // silhouette or placement readability.
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const epsilon = 0.32;
  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (outsideDistance(x, z, playableWidth, playableDepth) > 0) continue;
    const dx =
      (surfaceNormalHeight(x + epsilon, z) - surfaceNormalHeight(x - epsilon, z)) / (epsilon * 2);
    const dz =
      (surfaceNormalHeight(x, z + epsilon) - surfaceNormalHeight(x, z - epsilon)) / (epsilon * 2);
    const length = Math.hypot(dx, 1, dz);
    normal.setXYZ(i, -dx / length, 1 / length, -dz / length);
  }
  normal.needsUpdate = true;
  return geometry;
}
