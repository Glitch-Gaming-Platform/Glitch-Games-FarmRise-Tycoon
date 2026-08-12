/**
 * Generates the FarmRise procedural PBR texture library.
 *
 *   node tools/textures/generate.mjs [--check]
 *
 * Writes three files per material into `art/textures/` and mirrors them into
 * `apps/game/public/assets/textures/` so Vite serves them:
 *
 *   <id>_albedo.png   indexed-colour, sRGB. Base colour.
 *   <id>_normal.png   truecolour, linear. Tangent-space normal, +Y in green,
 *                     v increasing DOWN the image (see the loader note below).
 *   <id>_orm.png      truecolour, linear, half resolution. R = ambient
 *                     occlusion, G = roughness, B = metalness.
 *
 * Three files rather than five is the whole budget argument. AO, roughness and
 * metalness are each one channel of low-frequency data, so packing them into
 * one RGB image costs a third of what three greyscale files cost and one
 * texture unit instead of three. They are generated at half resolution for the
 * same reason: none of the three carries detail finer than the normal map
 * already carries, and halving the side length quarters the pixels.
 *
 * The alpha channel is deliberately unused. Packing a data channel into PNG
 * alpha is a classic own-goal: `createImageBitmap` may premultiply, which
 * destroys the RGB channels wherever the packed value is low.
 *
 * `--check` re-generates in memory and verifies the seam metric without
 * writing, which is what CI would run if this were wired into CI.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIndexedPng, encodeRgbPng } from './png.mjs';
import { MATERIALS } from './materials.mjs';
import { clamp01 } from './noise.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ART_DIR = join(ROOT, 'art', 'textures');
const PUBLIC_DIR = join(ROOT, 'apps', 'game', 'public', 'assets', 'textures');

/**
 * Ramp steps per palette band.
 *
 * Four bands of 63 steps is 252 entries, just inside the 256-entry limit of an
 * 8-bit indexed PNG. 63 steps is more than an 8-bit-per-channel image can
 * resolve as banding at these value ranges, and it is measurably smaller than
 * a truecolour encode of the same image.
 */
const RAMP = 63;

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function buildPalette(bands) {
  const palette = [];
  for (let b = 0; b < 4; b += 1) {
    const [from, to] = bands[Math.min(b, bands.length - 1)];
    const a = hexToRgb(from);
    const z = hexToRgb(to);
    for (let i = 0; i < RAMP; i += 1) {
      const t = i / (RAMP - 1);
      palette.push([
        Math.round(a[0] + (z[0] - a[0]) * t),
        Math.round(a[1] + (z[1] - a[1]) * t),
        Math.round(a[2] + (z[2] - a[2]) * t),
      ]);
    }
  }
  return palette;
}

/** Wrapped fetch, so every difference operator below is seamless by construction. */
const at = (field, size, x, y) =>
  field[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

/**
 * Cavity ambient occlusion.
 *
 * A separable wrapped box blur of the height field, subtracted from the height
 * itself: anything that sits below its neighbourhood is in a hollow and gets
 * darkened. This is not a ray-traced AO bake, and it does not pretend to be -
 * but at texture scale, under a screen-space AO pass that cannot see detail
 * this small, a cavity map is what actually reads.
 */
function cavityAo(height, size) {
  const radius = Math.max(2, Math.round(size / 24));
  const horizontal = new Float32Array(size * size);
  const blurred = new Float32Array(size * size);
  const width = radius * 2 + 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += at(height, size, x + k, y);
      horizontal[y * size + x] = sum / width;
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += at(horizontal, size, x, y + k);
      blurred[y * size + x] = sum / width;
    }
  }
  const ao = new Float32Array(size * size);
  for (let i = 0; i < ao.length; i += 1) {
    ao[i] = clamp01(0.72 + (height[i] - blurred[i]) * 2.6);
  }
  return ao;
}

/**
 * Tileability test.
 *
 * The first version of this compared pixel differences across the wrap edge
 * against differences one column in, and it was wrong twice over: it flagged
 * `roof_shingle`, whose tile edge legitimately falls on a course boundary, and
 * it would have missed a lattice-period bug that produced only a subtle drift.
 *
 * The correct test is analytic. A tileable pattern satisfies
 * `f(u + 1, v) === f(u, v)` *exactly*, because every noise lattice in noise.mjs
 * wraps. So sample the material either side of the wrap and compare the raw
 * five-channel result. Any non-zero difference is a real bug in a period, not a
 * judgement call about how visible a seam is.
 */
function tileabilityError(material) {
  const probes = 4096;
  let worst = 0;
  for (let i = 0; i < probes; i += 1) {
    // A low-discrepancy sequence, so the probes cover the square evenly
    // instead of clustering the way a hash would.
    const u = (i * 0.7548776662466927) % 1;
    const v = (i * 0.5698402909980532) % 1;
    for (const [du, dv] of [
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const a = material.sample(u, v);
      const b = material.sample(u + du, v + dv);
      worst = Math.max(
        worst,
        Math.abs(a.height - b.height),
        Math.abs(a.t - b.t),
        Math.abs(a.rough - b.rough),
        Math.abs((a.metal ?? 0) - (b.metal ?? 0)),
        a.band === b.band ? 0 : 1,
      );
    }
  }
  return worst;
}

function generate(material) {
  const { size, relief, tile } = material;
  const palette = buildPalette(material.bands);

  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const metal = new Float32Array(size * size);
  const indices = Buffer.alloc(size * size);

  for (let y = 0; y < size; y += 1) {
    // v runs DOWN the image, matching the loader, which disables both the
    // ImageBitmap orientation flip and three's own flipY. One convention, in
    // one place, verifiable from a screenshot.
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const s = material.sample(u, v);
      const i = y * size + x;
      height[i] = clamp01(s.height);
      rough[i] = clamp01(s.rough);
      metal[i] = clamp01(s.metal ?? 0);
      const bandIndex = Math.min(3, Math.max(0, s.band | 0));
      const step = Math.round(clamp01(s.t) * (RAMP - 1));
      indices[i] = bandIndex * RAMP + step;
    }
  }

  const ao = cavityAo(height, size);

  // Cavity occlusion is folded into the albedo as well as written to the ORM
  // pack. Baked-in contact darkening is what makes a crack read as deep at 13
  // metres, where a screen-space AO pass has nothing to work with.
  for (let i = 0; i < indices.length; i += 1) {
    const bandIndex = Math.floor(indices[i] / RAMP);
    const step = indices[i] % RAMP;
    const darkened = Math.round(step * (0.55 + 0.45 * ao[i]));
    indices[i] = bandIndex * RAMP + Math.max(0, Math.min(RAMP - 1, darkened));
  }

  // Normal map. The height field is in normalised units, so it is scaled to
  // metres by `relief` and differentiated against the physical texel size.
  //
  // The height is tent-filtered first. Single-texel noise in a height field
  // becomes single-texel noise in a normal map, which does two bad things: it
  // aliases into a crawling sparkle as the camera moves, and it is close to
  // incompressible, so it dominates the download. Removing it cut the library
  // by roughly a third and looks better, which is the rare change that needs no
  // trade-off argument.
  const smooth = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let weight = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const w = (ox === 0 ? 2 : 1) * (oy === 0 ? 2 : 1);
          sum += at(height, size, x + ox, y + oy) * w;
          weight += w;
        }
      }
      smooth[y * size + x] = sum / weight;
    }
  }

  const texel = tile / size;
  const normal = Buffer.alloc(size * size * 3);
  // Quantising the encoded normal to even byte values costs one bit of angular
  // precision - far below what an 8-bit normal map resolves in practice - and
  // buys another ~12% of file size by halving the symbol alphabet deflate sees.
  const quantise = (value) => Math.min(254, Math.round((value * 0.5 + 0.5) * 254) & ~1);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((at(smooth, size, x + 1, y) - at(smooth, size, x - 1, y)) * relief) / (2 * texel);
      const dy = ((at(smooth, size, x, y + 1) - at(smooth, size, x, y - 1)) * relief) / (2 * texel);
      const len = Math.hypot(-dx, -dy, 1);
      const o = (y * size + x) * 3;
      normal[o] = quantise(-dx / len);
      normal[o + 1] = quantise(-dy / len);
      normal[o + 2] = quantise(1 / len);
    }
  }

  // ORM at half resolution, box-filtered rather than point-sampled so the
  // downsample does not alias the roughness of a rivet into a whole panel.
  const half = size / 2;
  const orm = Buffer.alloc(half * half * 3);
  for (let y = 0; y < half; y += 1) {
    for (let x = 0; x < half; x += 1) {
      let a = 0;
      let r = 0;
      let m = 0;
      for (let oy = 0; oy < 2; oy += 1) {
        for (let ox = 0; ox < 2; ox += 1) {
          const i = (y * 2 + oy) * size + (x * 2 + ox);
          a += ao[i];
          r += rough[i];
          m += metal[i];
        }
      }
      const o = (y * half + x) * 3;
      orm[o] = Math.round((a / 4) * 255);
      orm[o + 1] = Math.round((r / 4) * 255);
      orm[o + 2] = Math.round((m / 4) * 255);
    }
  }

  // Mean linear colour. The terrain shader multiplies the vertex-coloured
  // palette base by albedo/mean, so a texture contributes variation without
  // shifting the average hue the palette contrast audit was run against.
  let lr = 0;
  let lg = 0;
  let lb = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const c = palette[indices[i]];
    lr += srgbToLinear(c[0] / 255);
    lg += srgbToLinear(c[1] / 255);
    lb += srgbToLinear(c[2] / 255);
  }
  const n = indices.length;

  return {
    files: {
      albedo: encodeIndexedPng(size, size, indices, palette),
      normal: encodeRgbPng(size, size, normal),
      orm: encodeRgbPng(half, half, orm),
    },
    tileError: tileabilityError(material),
    meanLinear: [lr / n, lg / n, lb / n],
    size,
    half,
  };
}

const check = process.argv.includes('--check');
if (!check) {
  mkdirSync(ART_DIR, { recursive: true });
  mkdirSync(PUBLIC_DIR, { recursive: true });
}

const entries = [];
let total = 0;
let worstSeam = 0;
let failures = 0;

for (const material of MATERIALS) {
  const result = generate(material);
  const maps = {};
  for (const [kind, buffer] of Object.entries(result.files)) {
    const name = `${material.id}_${kind}.png`;
    if (!check) {
      writeFileSync(join(ART_DIR, name), buffer);
      writeFileSync(join(PUBLIC_DIR, name), buffer);
    }
    maps[kind] = { file: name, bytes: buffer.length };
    total += buffer.length;
  }
  const seam = result.tileError;
  worstSeam = Math.max(worstSeam, seam);
  if (seam > 1e-6) {
    failures += 1;
    console.error(`NOT TILEABLE  ${material.id}  max wrap error ${seam.toFixed(4)}`);
  }
  entries.push({
    id: material.id,
    role: material.role,
    summary: material.summary,
    size: result.size,
    ormSize: result.half,
    tileMetres: material.tile,
    reliefMetres: material.relief,
    meanLinear: result.meanLinear.map((c) => Number(c.toFixed(4))),
    maps,
    bytes: Object.values(maps).reduce((sum, m) => sum + m.bytes, 0),
  });
  console.log(
    `${material.id.padEnd(20)} ${String(result.size).padStart(4)}px  ` +
      `${(entries.at(-1).bytes / 1024).toFixed(1).padStart(7)} KiB  wrap-error ${seam.toFixed(4)}`,
  );
}

const manifest = {
  version: 1,
  generator: 'tools/textures/generate.mjs',
  note: 'Generated. Do not hand-edit; run `node tools/textures/generate.mjs`.',
  totalBytes: total,
  materials: entries,
};

/**
 * The client-side manifest.
 *
 * Generated rather than hand-maintained so the declared byte counts are the
 * real ones. `docs/ASSET_PIPELINE.md` requires that nothing loads an asset by
 * hardcoded URL, and it requires the byte counts to be honest because they
 * weight the loading bar; a generated manifest is the only way to have both
 * without someone remembering to retype thirty numbers.
 *
 * Every entry is `lazy`. These textures are Ultra-only, and `lazy` is what
 * guarantees the low tier's critical and preload phases are byte-for-byte what
 * they were before this library existed.
 */
function manifestSource() {
  const lines = [];
  for (const material of entries) {
    for (const [kind, map] of Object.entries(material.maps)) {
      const colourSpace = kind === 'albedo' ? 'srgb' : 'linear';
      lines.push(
        `  {\n` +
          `    id: 'texture:${material.id}_${kind}',\n` +
          `    kind: 'texture',\n` +
          `    url: 'assets/textures/${map.file}',\n` +
          `    phase: 'lazy',\n` +
          `    bytes: ${map.bytes.toLocaleString('en-US').replace(/,/g, '_')},\n` +
          `    scenes: ['farm'],\n` +
          `    options: { colorSpace: '${colourSpace}', flipY: false, anisotropy: 8 },\n` +
          `  },`,
      );
    }
  }
  return `/**
 * Procedural PBR surface textures. GENERATED FILE - do not hand-edit.
 *
 * Regenerate with \`node tools/textures/generate.mjs\`. The patterns live in
 * tools/textures/materials.mjs and the rationale in art/textures/README.md.
 *
 * Every entry is \`lazy\`: SurfaceLibrary is constructed only on the Ultra tier,
 * so on \`low\` none of these bytes are ever requested.
 *
 * Total: ${(total / 1024).toFixed(1)} KiB across ${entries.length} materials.
 */
import type { AssetEntry } from './types.js';

export const SURFACE_TEXTURE_ASSETS: readonly AssetEntry[] = [
${lines.join('\n')}
];

/** Material ids in the library, in the order they were generated. */
export const SURFACE_IDS = [
${entries.map((e) => `  '${e.id}',`).join('\n')}
] as const;

export type SurfaceId = (typeof SURFACE_IDS)[number];
`;
}

if (!check) {
  writeFileSync(join(ART_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(PUBLIC_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(ROOT, 'apps', 'game', 'src', 'assets', 'manifests', 'textures.manifest.ts'),
    manifestSource(),
  );
}

console.log(`\ntotal ${(total / 1024).toFixed(1)} KiB across ${MATERIALS.length} materials`);
console.log(`worst wrap error ${worstSeam.toFixed(6)} (0 is exact; anything above 1e-6 fails)`);
if (!check) {
  const bar = statSync(join(ART_DIR, 'manifest.json')).size;
  console.log(`manifest ${bar} bytes`);
}
process.exit(failures > 0 ? 1 : 0);
