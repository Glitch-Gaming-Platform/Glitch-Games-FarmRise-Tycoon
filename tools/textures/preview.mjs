/**
 * Contact sheet for the texture library.
 *
 *   node tools/textures/preview.mjs
 *
 * Renders every material twice: albedo repeated 2x2, and its normal map
 * repeated 2x2. The 2x2 repeat is the point - a seam, if one existed, would run
 * straight down the middle of each cell, which is far easier to see than
 * squinting at the edges of a single tile. Writes `art/textures/contact_sheet.png`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeRgbPng } from './png.mjs';
import { MATERIALS } from './materials.mjs';
import { clamp01 } from './noise.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(HERE, '..', '..', 'art', 'textures');

const CELL = 192;
const COLS = 5;
const ROWS = Math.ceil(MATERIALS.length / COLS);

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function cell(material, mode) {
  const out = new Uint8Array(CELL * CELL * 3);
  const height = new Float32Array(CELL * CELL);
  const rgb = new Uint8Array(CELL * CELL * 3);

  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      // Two repeats across the cell, so the wrap edge lands in the middle.
      const u = ((x / CELL) * 2) % 1;
      const v = ((y / CELL) * 2) % 1;
      const s = material.sample(u, v);
      const i = y * CELL + x;
      height[i] = clamp01(s.height);
      const [from, to] = material.bands[Math.min(s.band, material.bands.length - 1)];
      const a = hexToRgb(from);
      const z = hexToRgb(to);
      const t = clamp01(s.t);
      rgb[i * 3] = a[0] + (z[0] - a[0]) * t;
      rgb[i * 3 + 1] = a[1] + (z[1] - a[1]) * t;
      rgb[i * 3 + 2] = a[2] + (z[2] - a[2]) * t;
    }
  }

  if (mode === 'albedo') return rgb;

  // Lambert shade of the height field with a raking key from the upper left -
  // the same grazing angle the terrain sees at the gameplay camera, and the
  // one that exposes a flat normal map for what it is.
  const texel = (material.tile * 2) / CELL;
  const wrapAt = (f, x, y) => f[(((y % CELL) + CELL) % CELL) * CELL + (((x % CELL) + CELL) % CELL)];
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const dx =
        ((wrapAt(height, x + 1, y) - wrapAt(height, x - 1, y)) * material.relief) / (2 * texel);
      const dy =
        ((wrapAt(height, x, y + 1) - wrapAt(height, x, y - 1)) * material.relief) / (2 * texel);
      const len = Math.hypot(-dx, -dy, 1);
      const light = clamp01((-dx / len) * -0.55 + (-dy / len) * -0.55 + (1 / len) * 0.63 + 0.16);
      const i = y * CELL + x;
      const shade = 0.25 + light * 0.85;
      out[i * 3] = Math.min(255, rgb[i * 3] * shade);
      out[i * 3 + 1] = Math.min(255, rgb[i * 3 + 1] * shade);
      out[i * 3 + 2] = Math.min(255, rgb[i * 3 + 2] * shade);
    }
  }
  return out;
}

const width = CELL * COLS;
const height = CELL * ROWS * 2;
const sheet = new Uint8Array(width * height * 3);

MATERIALS.forEach((material, index) => {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  ['albedo', 'lit'].forEach((mode, modeIndex) => {
    const data = cell(material, mode);
    const originX = col * CELL;
    const originY = (row * 2 + modeIndex) * CELL;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const src = (y * CELL + x) * 3;
        const dst = ((originY + y) * width + originX + x) * 3;
        sheet[dst] = data[src];
        sheet[dst + 1] = data[src + 1];
        sheet[dst + 2] = data[src + 2];
      }
    }
  });
});

mkdirSync(ART_DIR, { recursive: true });
writeFileSync(join(ART_DIR, 'contact_sheet.png'), encodeRgbPng(width, height, Buffer.from(sheet)));
console.log(
  `art/textures/contact_sheet.png  ${width}x${height}  ` +
    `rows alternate albedo / raking-light shade; order: ${MATERIALS.map((m) => m.id).join(', ')}`,
);
