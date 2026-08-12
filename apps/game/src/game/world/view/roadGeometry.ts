import * as THREE from 'three';

export const enum RoadConnection {
  North = 1 << 0,
  East = 1 << 1,
  South = 1 << 2,
  West = 1 << 3,
}

export interface RoadTileLike {
  readonly tileX: number;
  readonly tileZ: number;
}

export interface RoadGeometryOptions {
  readonly tileSize: number;
  readonly connections: number;
  readonly variant: number;
  /** Standalone roads use the selected quarter-turn; connected roads follow topology. */
  readonly rotation?: number;
}

interface LinearColour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function srgbChannelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearColour(hex: number): LinearColour {
  return {
    r: srgbChannelToLinear((hex >> 16) & 0xff),
    g: srgbChannelToLinear((hex >> 8) & 0xff),
    b: srgbChannelToLinear(hex & 0xff),
  };
}

// Exact palette.py colours. Runtime geometry has no license to invent hues.
const SAND_STONE = linearColour(0xb0a083);
const SAND_PATH = linearColour(0xc9b896);
const SOIL_DRY = linearColour(0xb9603a);
const SOIL_EDGE = linearColour(0x8f3e25);
const ROCK = linearColour(0x8a8378);

function mixColour(a: LinearColour, b: LinearColour, amount: number): LinearColour {
  const t = Math.min(1, Math.max(0, amount));
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function shadeColour(colour: LinearColour, amount: number): LinearColour {
  return { r: colour.r * amount, g: colour.g * amount, b: colour.b * amount };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function tileKey(tileX: number, tileZ: number): string {
  return `${tileX}:${tileZ}`;
}

/** Which sides of this road tile touch another road tile. */
export function roadConnectionMask(
  roads: readonly RoadTileLike[],
  tileX: number,
  tileZ: number,
): number {
  const occupied = new Set(roads.map((road) => tileKey(road.tileX, road.tileZ)));
  let mask = 0;
  if (occupied.has(tileKey(tileX, tileZ - 1))) mask |= RoadConnection.North;
  if (occupied.has(tileKey(tileX + 1, tileZ))) mask |= RoadConnection.East;
  if (occupied.has(tileKey(tileX, tileZ + 1))) mask |= RoadConnection.South;
  if (occupied.has(tileKey(tileX - 1, tileZ))) mask |= RoadConnection.West;
  return mask;
}

/** Four stable surface arrangements stop a long run from repeating one tile. */
export function roadSurfaceVariant(tileX: number, tileZ: number): number {
  const mixed = Math.imul(tileX + 41, 73856093) ^ Math.imul(tileZ - 17, 19349663);
  return (mixed >>> 0) % 4;
}

/**
 * Builds a packed-earth road tile whose silhouette responds to its neighbours.
 *
 * The previous authored tile was one rectangular slab, so a road read as a
 * chain of paving mats with a seam every two metres. This low-resolution
 * occupancy mesh creates continuous straights, corners, T-junctions and
 * crossings. Jagged shoulders and sparse stones are part of the same geometry,
 * preserving one draw per connection/variant bucket and the zero-texture rule.
 */
export function createRoadGeometry(options: RoadGeometryOptions): THREE.BufferGeometry {
  const divisions = 13;
  const cell = options.tileSize / divisions;
  const half = options.tileSize / 2;
  const halfPath = options.tileSize * 0.33;
  // A road is compacted into the land, not laid on top as a paving slab.
  const top = 0.022;
  const bottom = 0.002;
  const mask = options.connections & 0b1111;
  const occupied = new Set<string>();

  const contains = (x: number, z: number): boolean => {
    const edgeFadeX = 1 - smoothstep(half * 0.68, half, Math.abs(x));
    const edgeFadeZ = 1 - smoothstep(half * 0.68, half, Math.abs(z));
    const verticalShoulder =
      halfPath +
      Math.sin((z / options.tileSize) * Math.PI * 4.6 + options.variant * 1.73) *
        cell *
        0.32 *
        edgeFadeZ;
    const horizontalShoulder =
      halfPath +
      Math.sin((x / options.tileSize) * Math.PI * 4.2 + options.variant * 2.11) *
        cell *
        0.32 *
        edgeFadeX;
    if (mask === 0) {
      const end = options.tileSize * 0.43 + Math.sin(options.variant * 1.9 + x * 3.2) * cell * 0.18;
      return Math.abs(x) <= verticalShoulder && Math.abs(z) <= end;
    }
    const hub = Math.abs(x) <= verticalShoulder && Math.abs(z) <= horizontalShoulder;
    const north =
      (mask & RoadConnection.North) !== 0 && Math.abs(x) <= verticalShoulder && z <= halfPath;
    const east =
      (mask & RoadConnection.East) !== 0 && Math.abs(z) <= horizontalShoulder && x >= -halfPath;
    const south =
      (mask & RoadConnection.South) !== 0 && Math.abs(x) <= verticalShoulder && z >= -halfPath;
    const west =
      (mask & RoadConnection.West) !== 0 && Math.abs(z) <= horizontalShoulder && x <= halfPath;
    return hub || north || east || south || west;
  };

  for (let zIndex = 0; zIndex < divisions; zIndex += 1) {
    for (let xIndex = 0; xIndex < divisions; xIndex += 1) {
      const x = -half + (xIndex + 0.5) * cell;
      const z = -half + (zIndex + 0.5) * cell;
      if (contains(x, z)) occupied.add(`${xIndex}:${zIndex}`);
    }
  }

  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];

  const addVertex = (x: number, y: number, z: number, colour: LinearColour): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    colours.push(colour.r, colour.g, colour.b);
    return index;
  };
  const addQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    colour: LinearColour,
  ): void => {
    const start = addVertex(...a, colour);
    addVertex(...b, colour);
    addVertex(...c, colour);
    addVertex(...d, colour);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  const addTopQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    boundary: boolean,
  ): void => {
    const topColour = (x: number, z: number): LinearColour => {
      const northSouth = mask === 0 || (mask & (RoadConnection.North | RoadConnection.South)) !== 0;
      const eastWest = (mask & (RoadConnection.East | RoadConnection.West)) !== 0;
      const wheelOffset = halfPath * 0.54;
      const trackWidth = Math.max(0.08, halfPath * 0.24);
      const verticalTrack = northSouth
        ? Math.exp(-(((Math.abs(x) - wheelOffset) / trackWidth) ** 2))
        : 0;
      const horizontalTrack = eastWest
        ? Math.exp(-(((Math.abs(z) - wheelOffset) / trackWidth) ** 2))
        : 0;
      const wheelWear = Math.max(verticalTrack, horizontalTrack);

      // A low-frequency sweep crosses several occupancy cells. The old
      // modulo hash selected one of two colours per cell and became a literal
      // checkerboard at the gameplay camera.
      const sweep =
        Math.sin((x * 0.82 + z * 0.57) * (Math.PI / options.tileSize) + options.variant * 1.43) *
          0.5 +
        0.5;
      const roadEarth = mixColour(SOIL_DRY, SAND_STONE, 0.58);
      const paleWear = mixColour(SAND_STONE, SAND_PATH, 0.42);
      const compacted = Math.min(0.62, 0.16 + wheelWear * 0.27 + sweep * 0.06);
      const clayScuff =
        smoothstep(
          0.78,
          0.98,
          Math.sin((x * 1.31 - z * 0.94) * 2.2 + options.variant * 2.17) * 0.5 + 0.5,
        ) *
        (0.04 + wheelWear * 0.07);
      // Runtime roads do not have the vertex-AO bake authored meshes receive.
      // A measured diffuse shade keeps the high-intensity farm sun from
      // clipping packed earth into a pale concrete slab.
      return shadeColour(
        mixColour(
          mixColour(mixColour(roadEarth, paleWear, compacted), SOIL_EDGE, boundary ? 0.1 : 0),
          SOIL_EDGE,
          clayScuff,
        ),
        0.66,
      );
    };

    const start = addVertex(...a, topColour(a[0], a[2]));
    addVertex(...b, topColour(b[0], b[2]));
    addVertex(...c, topColour(c[0], c[2]));
    addVertex(...d, topColour(d[0], d[2]));
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };

  const isOccupied = (x: number, z: number): boolean => occupied.has(`${x}:${z}`);
  for (let zIndex = 0; zIndex < divisions; zIndex += 1) {
    for (let xIndex = 0; xIndex < divisions; xIndex += 1) {
      if (!isOccupied(xIndex, zIndex)) continue;
      const minX = -half + xIndex * cell;
      const maxX = minX + cell;
      const minZ = -half + zIndex * cell;
      const maxZ = minZ + cell;
      const boundary =
        !isOccupied(xIndex - 1, zIndex) ||
        !isOccupied(xIndex + 1, zIndex) ||
        !isOccupied(xIndex, zIndex - 1) ||
        !isOccupied(xIndex, zIndex + 1);
      addTopQuad(
        [minX, top, minZ],
        [minX, top, maxZ],
        [maxX, top, maxZ],
        [maxX, top, minZ],
        boundary,
      );

      if (!isOccupied(xIndex - 1, zIndex)) {
        addQuad(
          [minX, bottom, minZ],
          [minX, bottom, maxZ],
          [minX, top, maxZ],
          [minX, top, minZ],
          SOIL_EDGE,
        );
      }
      if (!isOccupied(xIndex + 1, zIndex)) {
        addQuad(
          [maxX, bottom, maxZ],
          [maxX, bottom, minZ],
          [maxX, top, minZ],
          [maxX, top, maxZ],
          SOIL_EDGE,
        );
      }
      if (!isOccupied(xIndex, zIndex - 1)) {
        addQuad(
          [maxX, bottom, minZ],
          [minX, bottom, minZ],
          [minX, top, minZ],
          [maxX, top, minZ],
          SOIL_EDGE,
        );
      }
      if (!isOccupied(xIndex, zIndex + 1)) {
        addQuad(
          [minX, bottom, maxZ],
          [maxX, bottom, maxZ],
          [maxX, top, maxZ],
          [minX, top, maxZ],
          SOIL_EDGE,
        );
      }
    }
  }

  const stoneLayouts = [
    [
      [-0.16, -0.46, 0.105],
      [0.19, 0.08, 0.085],
      [-0.12, 0.5, 0.075],
    ],
    [
      [0.14, -0.5, 0.09],
      [-0.2, -0.02, 0.075],
      [0.18, 0.44, 0.1],
    ],
    [
      [-0.18, -0.31, 0.08],
      [0.16, 0.24, 0.11],
      [-0.08, 0.56, 0.07],
    ],
    [
      [0.18, -0.42, 0.075],
      [-0.15, 0.12, 0.105],
      [0.1, 0.51, 0.08],
    ],
  ] as const;
  const stones = stoneLayouts[options.variant % stoneLayouts.length] ?? stoneLayouts[0];
  for (let stoneIndex = 0; stoneIndex < stones.length; stoneIndex += 1) {
    const [normalizedX, normalizedZ, normalizedRadius] = stones[stoneIndex]!;
    let centerX = normalizedX * options.tileSize;
    let centerZ = normalizedZ * options.tileSize;
    if (!contains(centerX, centerZ)) {
      // Rotate the arrangement into a horizontal-only road or pull it into a
      // junction hub. The fallback is deterministic and stays off the seams.
      [centerX, centerZ] = [centerZ * 0.72, centerX * 0.72];
      if (!contains(centerX, centerZ)) {
        centerX *= 0.42;
        centerZ *= 0.42;
      }
    }
    const radius = normalizedRadius * options.tileSize;
    const stoneTop = top + 0.016 + stoneIndex * 0.002;
    const sides = 6;
    const center = addVertex(centerX, stoneTop, centerZ, stoneIndex === 1 ? ROCK : SAND_PATH);
    const ring: number[] = [];
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2 + options.variant * 0.31;
      const wobble = 0.84 + (((side * 7 + stoneIndex * 3 + options.variant) % 5) / 5) * 0.22;
      ring.push(
        addVertex(
          centerX + Math.cos(angle) * radius * wobble,
          stoneTop,
          centerZ + Math.sin(angle) * radius * wobble * 0.78,
          stoneIndex === 1 ? ROCK : SAND_PATH,
        ),
      );
    }
    for (let side = 0; side < sides; side += 1) {
      indices.push(center, ring[side]!, ring[(side + 1) % sides]!);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const isolatedRotation = mask === 0 ? Math.abs(Math.trunc(options.rotation ?? 0)) % 2 : 0;
  if (isolatedRotation === 1) geometry.rotateY(Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData['roadConnectionMask'] = mask;
  geometry.userData['roadVariant'] = options.variant;
  geometry.userData['roadRotation'] = isolatedRotation;
  geometry.userData['roadSurfaceStyle'] = 'packed-earth-bands';
  return geometry;
}
