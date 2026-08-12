/**
 * A minimal, dependency-free PNG encoder.
 *
 * Why hand-rolled: the texture library must be reproducible from a clean
 * checkout with nothing but Node, and adding `pngjs`/`sharp` to the repo for
 * three functions is a dependency the project would then have to keep
 * qualified. PNG's baseline encoder is ~120 lines: an IHDR, a zlib stream of
 * filtered scanlines and an IEND.
 *
 * Two colour types are used:
 *
 *   - **Type 3 (indexed)** for albedo. Every albedo in this library is authored
 *     as ramps between palette anchors, so it genuinely has fewer than 256
 *     distinct colours. One byte per pixel instead of three is a large saving
 *     on the biggest maps, and it makes "no colour may be invented outside
 *     tools/blender/palette.py" a property of the file format rather than a
 *     rule someone has to remember.
 *   - **Type 2 (truecolour)** for the normal and ORM packs, which are real
 *     three-channel data.
 *
 * Adaptive per-row filtering (the standard minimum-sum-of-absolute-differences
 * heuristic) is worth roughly 25-40% on normal maps and is a large part of why
 * the library fits its budget.
 */
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Paeth predictor, verbatim from the PNG specification. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Filters one scanline with all five PNG filters and keeps the cheapest.
 *
 * The cost function is the sum of absolute signed byte values, which is what
 * libpng uses. It is a heuristic for "how compressible is this row", and it
 * beats fixed filter 0 by a wide margin on smooth normal-map gradients.
 */
function filterRow(row, previous, bpp, out, outOffset) {
  const width = row.length;
  let bestType = 0;
  let bestCost = Infinity;
  let best = null;
  const candidate = Buffer.allocUnsafe(width);

  for (let type = 0; type < 5; type += 1) {
    let cost = 0;
    for (let i = 0; i < width; i += 1) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = previous ? previous[i] : 0;
      const c = i >= bpp && previous ? previous[i - bpp] : 0;
      let value;
      switch (type) {
        case 0:
          value = row[i];
          break;
        case 1:
          value = row[i] - a;
          break;
        case 2:
          value = row[i] - b;
          break;
        case 3:
          value = row[i] - ((a + b) >> 1);
          break;
        default:
          value = row[i] - paeth(a, b, c);
          break;
      }
      value &= 0xff;
      candidate[i] = value;
      cost += value < 128 ? value : 256 - value;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestType = type;
      best = Buffer.from(candidate);
    }
  }

  out[outOffset] = bestType;
  best.copy(out, outOffset + 1);
}

function encode(width, height, colourType, pixels, bpp, palette) {
  const stride = width * bpp;
  const raw = Buffer.allocUnsafe((stride + 1) * height);
  let previous = null;
  for (let y = 0; y < height; y += 1) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    filterRow(row, previous, bpp, raw, y * (stride + 1));
    previous = row;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colourType;

  const chunks = [SIGNATURE, chunk('IHDR', ihdr)];
  if (palette) chunks.push(chunk('PLTE', palette));
  chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

/** Indexed-colour PNG. `indices` is one byte per pixel; `palette` is [r,g,b] triples. */
export function encodeIndexedPng(width, height, indices, palette) {
  const table = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], i) => {
    table[i * 3] = r;
    table[i * 3 + 1] = g;
    table[i * 3 + 2] = b;
  });
  return encode(width, height, 3, indices, 1, table);
}

/** Truecolour PNG. `rgb` is three bytes per pixel. */
export function encodeRgbPng(width, height, rgb) {
  return encode(width, height, 2, rgb, 3, null);
}
