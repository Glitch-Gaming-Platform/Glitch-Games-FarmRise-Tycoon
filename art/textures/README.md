# Procedural PBR surface library

Ten tileable PBR materials, generated from code. No downloads, no scans, no
licences, no binary blobs anyone has to trust: everything in this directory is
reproduced exactly by

```bash
node tools/textures/generate.mjs      # writes the PNGs, the manifest and the client manifest
node tools/textures/preview.mjs       # writes contact_sheet.png
```

The patterns live in `tools/textures/materials.mjs`, the noise primitives in
`tools/textures/noise.mjs`, and a dependency-free PNG encoder in
`tools/textures/png.mjs`. **No new npm dependency was added, at runtime or at
build time.**

---

## What ships, and what it costs

| Material | px | tile (m) | albedo | normal | ORM | total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `soil_dry_cracked` | 256 | 2.00 | 31,590 | 98,752 | 24,977 | **155,319** |
| `soil_tilled` | 256 | 1.60 | 28,083 | 95,741 | 20,952 | **144,776** |
| `grass_dry` | 256 | 1.90 | 41,452 | 120,151 | 21,165 | **182,768** |
| `scrub_gravel` | 256 | 2.20 | 20,951 | 60,649 | 18,428 | **100,028** |
| `bark_eucalyptus` | 256 | 1.10 | 16,826 | 69,074 | 16,307 | **102,207** |
| `timber_painted` | 256 | 1.00 | 13,644 | 38,924 | 13,596 | **66,164** |
| `metal_corrugated` | 256 | 1.00 | 2,497 | 7,995 | 3,792 | **14,284** |
| `roof_shingle` | 256 | 1.20 | 22,580 | 84,632 | 21,088 | **128,300** |
| `cloth_canvas` | 128 | 0.45 | 10,706 | 33,398 | 7,319 | **51,423** |
| `fur_short` | 128 | 0.30 | 9,972 | 28,225 | 6,893 | **45,090** |
| | | | | | | **990,359 (967.1 KiB)** |

`contact_sheet.png` (599 KiB) is a review artefact and is **not** shipped - it
lives here and in `art/review/terrain/`, never in `apps/game/public`.

**Bytes actually downloaded today: 582,891 (569.2 KiB)** - the four ground
materials the terrain and the bed decals consume. The other six are generated,
manifested and documented but marked `lazy` and requested by nobody yet, so they
cost zero until the stage that uses them lands. Nothing here is downloaded on
the `low` tier at all, because `SurfaceLibrary` is constructed only when the
Ultra render pipeline exists.

PNG is already a deflate stream, so HTTP compression adds essentially nothing;
the numbers above are the wire cost.

### Where the budget went, and the four decisions that paid for it

1. **Three files per material, not five.** AO, roughness and metalness are one
   channel each of low-frequency data, so they are packed into one RGB image:
   `R = ambient occlusion, G = roughness, B = metalness`. Three greyscale files
   would cost roughly three times as much and three texture units instead of
   one. Per-pixel metalness is not a luxury - it is what lets rust stop being
   metal on `metal_corrugated` without the whole sheet turning to chalk.

2. **ORM at half resolution.** None of those three channels carries detail finer
   than the normal map already carries. Halving the side quarters the pixels,
   and it is invisible.

3. **Indexed-colour albedo.** Every albedo is authored as ramps between palette
   anchors from `tools/blender/palette.py`, so it genuinely contains fewer than
   256 distinct colours and encodes as an 8-bit indexed PNG - one byte per pixel
   instead of three. This also makes "no colour may be invented outside the
   palette" a property of the file format rather than a rule someone remembers.
   Albedo is 21% of the library's bytes; a truecolour encode would have made it
   nearer 45%.

4. **The height field is tent-filtered before it becomes a normal map.**
   Single-texel noise in a height field becomes single-texel noise in a normal
   map, which crawls as the camera moves *and* is nearly incompressible. Removing
   it cut about a third off the library and looks better. Encoded normals are
   also quantised to even byte values: one bit of angular precision, far below
   what an 8-bit normal map resolves, for another ~12%.

**The alpha channel is deliberately unused.** Packing a fourth data channel into
PNG alpha is a classic own-goal - `createImageBitmap` may premultiply, which
destroys the RGB channels wherever the packed value is low.

---

## The three maps

| Map | Format | Colour space | Contents |
| --- | --- | --- | --- |
| `<id>_albedo.png` | 8-bit indexed (PNG type 3) | sRGB | Base colour, with cavity occlusion already baked in |
| `<id>_normal.png` | 8-bit truecolour (PNG type 2) | linear | Tangent-space normal, OpenGL convention (+Y green), v increasing **down** the image |
| `<id>_orm.png` | 8-bit truecolour, half res | linear | R = AO, G = roughness, B = metalness |

### On AO

There is no separate AO file, and there is AO in two places. The generator
computes a **cavity map** - a wrapped separable box blur of the height field,
subtracted from the height itself - and writes it to `ORM.r` *and* multiplies it
into the albedo ramp.

Baking it into the albedo is the part that earns its cost. Ultra runs GTAO, but
GTAO is screen-space: at 13 metres a crack 8 mm wide is well under a pixel of
depth difference and the pass has nothing to work with. The contact darkening in
a crack has to be in the texture or it does not exist.

It is not a ray-traced bake and does not pretend to be. A cavity map cannot know
about a neighbouring plate that is not directly above it. At this scale, under
this camera, nothing that costs more would be visible.

### On the loader convention

The client loads these with `flipY: false`, which disables **both** the
`createImageBitmap` orientation flip and three's own upload flip. The v axis of
the texture is therefore the row order of the file, top to bottom, which is the
convention the generator writes and the terrain shader reads. This matters for
exactly one thing - the sign of the green channel - and "which of the two flips
is active" is not a question anyone should have to answer by staring at a
screenshot of a lit sphere.

---

## Seamlessness

Every noise primitive in `noise.mjs` takes a *period* and wraps its lattice with
`mod period`. Tiling is therefore a property of the construction, not something
checked afterwards and patched with a mirrored blend.

`generate.mjs` proves it analytically. For 4,096 low-discrepancy sample points it
evaluates `f(u, v)` and `f(u + 1, v)`, `f(u, v + 1)` and `f(u + 1, v + 1)` and
compares all five returned channels. A tileable pattern satisfies these
*exactly*. Current worst wrap error across the library: **0.000000**. Any value
above `1e-6` fails the build.

The first version of this check compared pixel differences across the wrap edge
against differences one column in, and it was wrong twice over: it flagged
`roof_shingle`, whose tile edge legitimately falls on a course boundary, and it
would have missed a genuine lattice-period bug that produced only a slow drift.
The analytic test found that bug - `roof_shingle` was sampling a noise field
whose v period was 5 while its course count was 8 - and reports zero false
positives.

`contact_sheet.png` renders every material **repeated 2x2**, so if a seam
existed it would run straight down the middle of each cell where it is easy to
see, rather than around the edges where it is not. The lower row of each pair is
the height field lit from a raking angle - the same grazing light the terrain
gets at the gameplay camera, and the one that exposes a flat normal map for what
it is.

---

## The materials

Physical tiling (`tile`) is the number that decides whether a texture reads as
ground or as wallpaper, so it lives beside the pattern in `materials.mjs`.

| id | role | what it is |
| --- | --- | --- |
| `soil_dry_cracked` | terrain | Baked outback clay broken into plates by a cellular crack network, with sparse pebbles. The default ground. |
| `soil_tilled` | terrain | Worked bed soil: warped hoe furrows, broken clods, damp in the trough and sun-dried on the crest. |
| `grass_dry` | foliage | Sun-cured tussock over leaf litter, two crossed blade directions, and the few blades that stayed green. |
| `scrub_gravel` | terrain | Stony scrub floor: gold dust, sparse gibber pebbles at two scales, exposed clay, dropped twigs. |
| `bark_eucalyptus` | foliage | Smooth eucalypt trunk with vertical ribbons peeling off orange fresh wood. |
| `timber_painted` | structure | Teal weatherboard: board grooves, brush grain, paint chipped back to timber. |
| `metal_corrugated` | metal | Galvanised iron: 8 ribs/m, sheet seams, rivets on the crests, scratches, rust blooming from the laps. |
| `roof_shingle` | structure | Staggered shingle courses, per-tile weathering, granule tooth, moss where two laps meet. |
| `cloth_canvas` | cloth | Plain-weave canvas, warp over weft, fibre fuzz, one woven stripe. |
| `fur_short` | skin | Short animal coat: strands clumped into locks over a darker undercoat, plus a pale-marking ramp. |

`cloth_canvas` and `fur_short` are authored near the neutral end of their ramps
on purpose: they are meant to be multiplied by a palette colour at the call site,
so one file serves a hessian sack, an awning and a shirt.

### Corrections made after looking at the contact sheet

Written down because they are the kind of thing that quietly ships otherwise.

| Was | Why it was wrong | Now |
| --- | --- | --- |
| Pebbles used the cool `rock` ramp | Against red clay a grey-blue speck reads as dirt on the lens, not a stone | Warm `soil_edge → sand_stone`, and only 1 cell in 5 holds a pebble |
| Gravel pebbled every cell at two scales | Covered the ground in speckle and destroyed the broad dust masses the terrain blend needs | Both scales sparse; gibber ramp is warm `sand_stone → sand_path` |
| Corrugated iron was ~70% rust | A shed that is three-quarters rust reads as derelict, not as working galvanised iron | Rust threshold raised to a bloom in the laps; the rib carries the value range |
| Shingles were 5 across by 6 down with moss in every joint | Read unmistakably as grey brickwork with green grout | 4 across by 8 down, moss only where two laps meet in the wettest sixth |
| Canvas had three broad blue stripes and brown grime blobs | A beach towel. The grime was a *band* switch, and a band switch is a hard edge; dirt does not have hard edges | One narrow stripe; grime darkens the ramp instead |
| Fur's pale marking followed the fine clump field | Looked flecked with paint | Pale marking follows a coarse two-cell field, so a belly patch is a region |
| Paint chipping covered ~a third of the wall | Orange dashes on teal, not failed paint | Threshold raised to an accent |

---

## What this library does not do

- **No BC/ASTC/KTX2.** Compressed textures would be 4-8x smaller in VRAM and
  would need `KTX2Loader`, a transcoder wasm blob and a per-format encode step -
  a new runtime dependency, which is out of scope here. This is the honest first
  thing to do if the budget tightens.
- **No 512px anywhere.** At the 13.25 m gameplay camera with 16x anisotropy, 256
  across a 2 m repeat is about 128 texels per metre. Doubling it would roughly
  triple the library for detail that mostly does not survive the mip chain.
- **No height/parallax map.** The `h` field exists in the generator but is not
  shipped; parallax occlusion on a ground plane at this angle costs more than
  the normal map already delivers.
- **Metalness is per-pixel but there is no clearcoat, sheen or transmission.**
  Nothing in the farm needs them yet.
