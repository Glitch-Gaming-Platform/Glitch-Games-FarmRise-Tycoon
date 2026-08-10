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

/** Cell size of the mesh, in metres. Blotches are much larger than this. */
const SEGMENT_METRES = 2;

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

    // Value variation. A first attempt used 0.84..1.14 on the theory that
    // subtlety was safer; rendered at the actual gameplay camera it was
    // invisible, which is the same as not having done it. This range is what
    // actually reads as "land" at 20 m.
    const n = fbm(x, z);
    const value = 0.76 + n * 0.42;

    // A second, independent field decides where the ground is greener. Tying
    // green to the same noise as value would make every light patch green and
    // every dark patch bare, which reads as a repeating pattern.
    //
    // Greening the ground is safe for crop readability specifically because
    // crops never stand on it - every crop sits on a tilled soil plot, and the
    // soil/crop contrast pair is the one the palette check actually guards.
    const lush = smoothstep(0.43, 0.78, fbm(x * 0.37 + 71.3, z * 0.37 - 19.7));
    const ochre = smoothstep(0.53, 0.83, fbm(x * 0.23 - 31.4, z * 0.23 + 48.8));

    // Gold scrub, muted olive pasture and red-ochre worn earth are the three
    // large colour masses in the supplied references. They remain broad and
    // softly blended: texture-sized noise would violate the style and shimmer
    // at the gameplay camera. The multipliers tint the palette-owned base
    // colour rather than introducing a second hard-coded ground palette.
    const greenRed = 1 - 0.43 * lush;
    const greenGreen = 1 + 0.15 * lush;
    const greenBlue = 1 - 0.42 * lush;
    const earthRed = 1 + 0.11 * ochre * (1 - lush);
    const earthGreen = 1 - 0.24 * ochre * (1 - lush);
    const earthBlue = 1 - 0.32 * ochre * (1 - lush);
    colours[i * 3] = value * greenRed * earthRed;
    colours[i * 3 + 1] = value * greenGreen * earthGreen;
    colours[i * 3 + 2] = value * greenBlue * earthBlue;
  }

  position.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}
