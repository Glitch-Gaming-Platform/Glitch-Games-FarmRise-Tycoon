import * as THREE from 'three';

const SIZE = 256;
const COLS = 4;
const ROWS = 4;

const SURFACES = [
  'plain',
  'wall_boards',
  'roof_shingles',
  'timber_grain',
  'metal_panels',
  'glass',
  'live_bark',
  'dead_bark',
  'leaf',
  'stone',
  'woven',
  'water',
] as const;

function noise(x: number, y: number, seed: number): number {
  let value = (Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263) + seed * 69_069) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177) >>> 0;
  return ((value ^ (value >>> 16)) & 0xffff) / 65_535;
}

function detail(surface: (typeof SURFACES)[number], x: number, y: number, seed: number): number {
  const cellWidth = SIZE / COLS;
  const cellHeight = SIZE / ROWS;
  const u = x / (cellWidth - 1);
  const v = y / (cellHeight - 1);
  const grain = (noise(x, y, seed) - 0.5) * 0.055;

  switch (surface) {
    case 'plain':
      return 1;
    case 'wall_boards': {
      const groove = Math.min(y % 10, 10 - (y % 10));
      return (groove < 1.5 ? 0.64 : 0.97) + grain;
    }
    case 'roof_shingles': {
      const row = Math.floor(y / 10);
      const horizontal = y % 10 < 2 ? 0.64 : 0.98;
      const joint = (x + (row % 2) * 9) % 18;
      const vertical = joint < 2 && y % 10 < 8 ? 0.72 : 1;
      return Math.min(horizontal, vertical) + grain;
    }
    case 'timber_grain': {
      const wave = Math.sin(u * 38 + Math.sin(v * 13) * 2.2);
      const knot = Math.hypot(u - 0.68, (v - 0.38) * 1.8);
      const knotLine = knot > 0.1 && knot < 0.15 ? 0.76 : 1;
      return Math.min(0.91 + wave * 0.055, knotLine) + grain;
    }
    case 'metal_panels': {
      const seam = Math.min(x % 22, 22 - (x % 22));
      const rivet = Math.hypot((x % 22) - 2.5, (y % 22) - 3);
      return rivet <= 1.8 ? 0.68 : seam < 1.5 ? 0.74 : 0.97;
    }
    case 'glass': {
      const mullion = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5));
      if (mullion < 0.026) return 0.7;
      const diagonal = Math.abs(u + v * 0.58 - 0.72);
      return diagonal > 0.08 ? 1 : 1.16;
    }
    case 'live_bark': {
      const crack = Math.abs(Math.sin(u * 31 + Math.sin(v * 17) * 1.9));
      const peel = noise(Math.floor(x / 7), Math.floor(y / 9), 21);
      return 0.72 + crack * 0.24 + peel * 0.06;
    }
    case 'dead_bark': {
      const vertical = Math.abs(Math.sin(u * 24 + Math.sin(v * 8) * 2.8));
      const cross = Math.abs(Math.sin(v * 27 + u * 5));
      return 0.66 + Math.min(vertical, cross) * 0.3 + grain;
    }
    case 'leaf': {
      const midrib = Math.abs(v - 0.5);
      const edgeFade = Math.min(u, 1 - u);
      return midrib < 0.018 && edgeFade > 0.05 ? 0.8 : 1 + grain;
    }
    case 'stone':
      return 0.84 + noise(Math.floor(x / 3), Math.floor(y / 3), 8) * 0.16;
    case 'woven':
      return x % 8 < 2 || y % 8 < 2 ? 0.78 : 0.98;
    case 'water':
      return 0.9 + Math.sin(u * 28 + Math.sin(v * 11)) * 0.07;
  }
}

/** One greyscale atlas shared by every authored world mesh. */
export function createSurfaceDetailTexture(): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const cellWidth = SIZE / COLS;
  const cellHeight = SIZE / ROWS;

  for (let surfaceIndex = 0; surfaceIndex < SURFACES.length; surfaceIndex += 1) {
    const surface = SURFACES[surfaceIndex]!;
    const cellX = surfaceIndex % COLS;
    const cellY = Math.floor(surfaceIndex / COLS);
    for (let y = 0; y < cellHeight; y += 1) {
      for (let x = 0; x < cellWidth; x += 1) {
        const atlasX = cellX * cellWidth + x;
        // Blender's glTF exporter has already converted its top-origin image
        // coordinates to glTF UVs. DataTexture does not flip rows on upload,
        // so the runtime atlas must be written bottom-up in the same order as
        // those exported UVs. Inverting this row put every `plain` surface in
        // the unused fourth atlas row, turning grass, dirt and most meshes
        // into near-black cut-outs at the gameplay camera.
        const atlasY = cellY * cellHeight + y;
        const value = Math.max(0.48, Math.min(1, detail(surface, x, y, surfaceIndex)));
        const byte = Math.round(value * 255);
        const offset = (atlasY * SIZE + atlasX) * 4;
        data[offset] = byte;
        data[offset + 1] = byte;
        data[offset + 2] = byte;
        data[offset + 3] = 255;
      }
    }
  }

  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.name = 'FarmRiseSurfaceDetail';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
