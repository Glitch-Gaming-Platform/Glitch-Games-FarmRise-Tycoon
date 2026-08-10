# 0010. No mesh compression: plain GLB with gzip

- **Status:** Superseded in part by ADR 0015; plain-GLB decision remains accepted
- **Date:** 2026-08-10

## Context

The game targets WebGL on all devices, so download size matters. glTF offers two mesh compression
extensions, both supported by Blender 5.2's exporter and by Three.js: Draco and Meshopt. Prevailing
advice for web glTF is to enable Draco.

An earlier version of `docs/ASSET_PIPELINE.md` repeated that advice and instructed developers to
place a DRACO decoder in `public/draco/`. It was written before any art existed, and it was wrong.

## Decision

Ship uncompressed GLB and rely on HTTP gzip/brotli. Neither Draco nor Meshopt is enabled.

## Consequences

Measured on the real asset set (`art/compression_report.json`), counting transport bytes **after
gzip plus the decoder the browser must fetch**:

| Option | Transport | Decoder | First load |
| --- | ---: | ---: | ---: |
| **Plain GLB + gzip** | 115,308 | 0 | **115,308** |
| Meshopt + gzip | 87,178 | ~5,000 | 92,178 |
| Draco + gzip | 73,884 | ~230,000 | 303,884 |

- **Draco, the conventional recommendation, is 2.6× worse than doing nothing here.** It has the best
  compression ratio and its decoder dwarfs the saving on assets this small.
- Meshopt would save 23 KB (20%) for a 5 KB decoder — real but not yet worth a build step, a runtime
  decode pass and a new dependency.
- Vertex-colour meshes with no UVs and no tangents already gzip 5.2×, which is why the uncompressed
  baseline is so competitive.
- No decoder to load, host, version or keep patched.
- **This decision is size-dependent and will expire.** Concrete triggers are recorded rather than a
  vague "revisit later": adopt Meshopt above 1 MB raw / 200 KB gzipped; reconsider Draco only above
  ~3.3 MB raw, where the saving finally exceeds its 230 KB decoder.
- **`DRACOLoader` has been removed from `modelLoader.ts` entirely.** An earlier revision of this ADR
  claimed the wiring "costs nothing unless a GLB declares the extension". That was wrong, and
  measuring it is what caught it: merely importing `DRACOLoader` caused Vite to emit **836 KB** of
  decoder chunks into `dist/` (`draco_decoder` 719 KB, two `draco_wasm_wrapper` chunks 117 KB), plus
  ~7 KB inside the `three` chunk. They were lazy chunks that never reached a player, but they bloated
  every deploy and every CDN sync for a feature nothing used. Removing the import took the client
  bundle from 610 KB to 603 KB and `dist/` from 1.6 MB to 752 KB.
- Re-enabling Draco is therefore a four-line code change rather than a flag, documented at the top of
  `modelLoader.ts`. That is the right trade: the change is rare, and the cost of leaving it wired was
  paid on every build.

## Correction history

The first version of this ADR kept the `DRACOLoader` import on the reasoning that it was free. A
bundle inspection performed while verifying the claim showed 836 KB of Draco chunks in `dist/`. The
lesson generalises: "this import is tree-shaken / lazy / free" is a measurable claim, and on this
project it was measured only because someone asked whether the fix had actually been made.

## Alternatives considered

- **Enable Draco because it is the common recommendation.** This is precisely what the measurement
  disproved. General advice assumes multi-megabyte scanned or sculpted meshes; it does not transfer
  to a 600 KB stylised set.
- **Enable Meshopt now.** Defensible. Rejected on the grounds that 23 KB does not justify a new
  runtime dependency, with an explicit threshold recorded for when it will.
- **gltfpack in the build.** Blender's exporter already exposes it; unnecessary while no compression
  is being applied.
