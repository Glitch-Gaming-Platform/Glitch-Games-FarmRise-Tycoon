/**
 * Tileable procedural noise primitives.
 *
 * Every function here takes coordinates in the unit square and a *period* in
 * lattice cells, and wraps its lattice with `mod period`. Seamlessness is
 * therefore a property of the construction, not something checked afterwards
 * and patched with a mirrored blend: `f(u + 1, v) === f(u, v)` exactly, for
 * every octave, for every function. That matters because the ground textures
 * tile roughly every 2.4 m across a 100 m plane, so a seam would repeat about
 * forty times across the frame.
 *
 * The hash is the same integer hash used by `groundGeometry.ts`, deliberately:
 * these textures and the vertex-colour ground fields should agree about where
 * the land is dry, and sharing a hash is the cheapest way to make "deterministic"
 * mean the same thing in both.
 */

function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 69069);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrap = (value, period) => ((value % period) + period) % period;

export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function mix(a, b, t) {
  return a + (b - a) * t;
}

/** Quintic fade. Smoother second derivative than smoothstep, so no lattice creases. */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Value noise on a lattice of `period` cells across the unit square. Returns 0..1. */
export function valueNoise(u, v, period, seed) {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const xa = wrap(x0, period);
  const xb = wrap(x0 + 1, period);
  const ya = wrap(y0, period);
  const yb = wrap(y0 + 1, period);
  const n00 = hash2(xa, ya, seed);
  const n10 = hash2(xb, ya, seed);
  const n01 = hash2(xa, yb, seed);
  const n11 = hash2(xb, yb, seed);
  return mix(mix(n00, n10, fx), mix(n01, n11, fx), fy);
}

/** Fractal sum of `octaves` value-noise layers, each doubling in frequency. Returns 0..1. */
export function fbm(u, v, period, octaves, seed, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(u, v, period * 2 ** i, seed + i * 101);
    total += amplitude;
    amplitude *= gain;
  }
  return sum / total;
}

/** Ridged fractal noise. Sharp crests, rounded troughs - dunes, bark ribs, clods. */
export function ridged(u, v, period, octaves, seed) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = Math.abs(valueNoise(u, v, period * 2 ** i, seed + i * 313) * 2 - 1);
    sum += amplitude * (1 - n);
    total += amplitude;
    amplitude *= 0.55;
  }
  return sum / total;
}

/**
 * Domain warp. Two independent noise fields displace the sample point, which
 * turns mechanical sine bands and regular cell walls into something organic.
 * Both fields are tileable, so the warped result still tiles.
 */
export function warp(u, v, period, amount, seed) {
  return [
    u + (fbm(u, v, period, 2, seed) - 0.5) * amount,
    v + (fbm(u, v, period, 2, seed + 7919) - 0.5) * amount,
  ];
}

/**
 * Worley / cellular noise on a wrapped grid of `cells` cells.
 *
 * Returns `{ f1, f2, id }`. `f2 - f1` is the classic crack/veining mask: it is
 * near zero exactly on the boundary between two cells. `id` is a stable
 * per-cell random value, used to tint individual pebbles, shingles and soil
 * plates so they do not all share one value.
 */
export function worley(u, v, cells, seed, jitter = 0.85) {
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const gx = cx + ox;
      const gy = cy + oy;
      const wx = wrap(gx, cells);
      const wy = wrap(gy, cells);
      const px = gx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
      const py = gy + 0.5 + (hash2(wx, wy, seed + 5501) - 0.5) * jitter;
      const d = Math.hypot(x - px, y - py);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(wx, wy, seed + 1237);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1: f1 / cells, f2: f2 / cells, id };
}

/**
 * Anisotropic streaks: fine detail along `angle`, coarse across it.
 *
 * Grass blades, fur, brushed metal and wood grain are all the same
 * mathematical object - noise with a very high aspect ratio - so they share one
 * function. The rotation is applied to a tileable field by rotating the
 * *frequency* rather than the coordinates, because rotating coordinates
 * destroys the wrap.
 */
export function streak(u, v, alongPeriod, acrossPeriod, seed, octaves = 3) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    const p = 2 ** i;
    const x = u * acrossPeriod * p;
    const y = v * alongPeriod * p;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const px = acrossPeriod * p;
    const py = alongPeriod * p;
    const n00 = hash2(wrap(x0, px), wrap(y0, py), seed + i * 61);
    const n10 = hash2(wrap(x0 + 1, px), wrap(y0, py), seed + i * 61);
    const n01 = hash2(wrap(x0, px), wrap(y0 + 1, py), seed + i * 61);
    const n11 = hash2(wrap(x0 + 1, px), wrap(y0 + 1, py), seed + i * 61);
    sum += amplitude * mix(mix(n00, n10, fx), mix(n01, n11, fx), fy);
    total += amplitude;
    amplitude *= 0.5;
  }
  return sum / total;
}

/** Tileable sine band. `phase` may be a warped coordinate. */
export function band(t, period) {
  return Math.sin(t * period * Math.PI * 2) * 0.5 + 0.5;
}

export { hash2 };
