# Art direction

## Target statement

> **Warm hand-painted low-poly, red-ochre outback.** Rounded convex forms, no razor edges.
> In the 3D world, ground, crop and structure are separated by **hue and value, never by texture
> detail**. Crops read
> as icons in four unmistakable growth stages from 20 metres. Chibi four-head characters with
> two-dot faces. Soft single-key light; contact shadows exist to ground objects, never to dramatise.
> **Colour does the work.**

Confirmed with the project owner before the rubric was written. The spine is references #5/#6
(Dinkum-style); #1 corroborates; #2 is the simplification target for animals; #3 and #4 were
explicitly ruled out.

## Reference analysis

Six references were supplied. What they share:

- Stylised low-poly with a rounded, convex, "carved-from-soap" form language.
- Saturated, high-chroma palettes that separate ground / crop / structure by **hue**.
- Crop and animal silhouettes designed to read as icons at mid distance.
- Chibi / toy proportions for characters (3.5–4.5 heads).
- Soft single-key outdoor light. Shadows ground objects; they never dramatise.

### Where the references conflict

| Tension | Resolution |
| --- | --- |
| **Voxel (#3) vs. smooth low-poly (all others)** | Hard conflict — different grid, silhouette rule and camera. **Rejected.** |
| **Blob animals (#2) vs. semi-realistic architecture (#4)** | #4 attempts both and reads incoherent. **We take #2's animals and reject #4's architecture.** |
| **Per-blade grass + real GI (#4)** | The most expensive thing in any reference, on a WebGL target for all devices. **Rejected**; scatter props do the same job for ~200 triangles. |
| **Three palettes (#1 orange, #2 pasture green, #5/#6 red-ochre)** | These are *biomes*, not styles. **Red-ochre ships first**; the others become seasons later. |

### What is essential to preserve

1. **Crop stages readable at gameplay distance.** #6 solves exactly this and is the reason it is the
   spine.
2. **A bold ground/foliage hue split.** The red-ochre-versus-gold opposition is what makes the farm
   legible without outlines or post-processing.
3. **Chibi characters that stay findable** among crops taller than they are.
4. **Icon-shaped crops.** A player must identify a crop by shape alone, before colour.

## The organising rule

> **Warm ground, cool structure.**

Earth, scrub and crops occupy red → orange → gold → green. Every player-built structure occupies
teal → blue-grey → galvanised metal.

This one rule does more for readability than any amount of modelling detail. It is why a fence never
disappears into the scrub and why a barn is identifiable the instant it enters frame — with no
outline pass, no rim light and no per-pixel work.

## Camera

**20 m out, 38° above horizontal, 42 mm equivalent.**

The original implementation used 61° (`Math.PI * 0.34`). The first art review at that angle showed
why it was wrong:

- It foreshortened away all the vertical crop mass the art direction depends on.
- Every building front was invisible; you saw only roofs.
- Flat ground dominated the frame, and the flattest object in the scene — the path — became the
  largest silhouette mass.

38° restores the sense of walking around inside a three-dimensional farm, which matters because the
player does exactly that. Changed in `FarmScene`; the review renderer uses the same value so what is
judged is what ships.

## Tone mapping

**None.** `THREE.NoToneMapping`, sRGB output.

ACES filmic (the previous setting) desaturates and rolls off exactly the hues this direction depends
on. The gold of ready wheat and the orange of a ripe pumpkin are **gameplay signals**, not
photographic highlights, and they must reach the screen unmodified. Blender's review renders use
`Standard` for the same reason — previewing through a filmic curve would mean judging art the engine
never shows.

The renderer still accepts a `toneMapping` option so a future scene with real HDR lighting can opt
back in.

## Palette

Defined once in `tools/blender/palette.py`. Nothing else may invent a colour — not a material, not a
Three.js constant, not a hex literal in a view class.

| Band | Role |
| --- | --- |
| `soil_*`, `ground_scrub*`, `sand_*`, `rock*` | Ground. Warm, lower chroma, lower value than any crop. |
| `crop_*`, `wheat_*`, `corn_*`, `pumpkin_*` | Crops. High chroma greens and golds. |
| `wall_*`, `roof_*`, `timber_*`, `metal_*`, `water_*` | Structures. Cool. |
| `skin`, `hair_*`, `shirt_*`, `pants_*`, `straw_hat*` | Character. |
| `chicken_*`, `fox_*` | Animals. |

### Growth is a hue journey, not a size journey

| Stage | Colour | Message |
| --- | --- | --- |
| 1 | bright yellow-green, sparse | "something is planted" |
| 2 | mid green, knee height | "it is coming along" |
| 3 | deep green, full height | "nearly — do not harvest yet" |
| 4 | **gold or orange**, full mass | "harvest me" |

The 3→4 transition is deliberately the largest colour jump in the game. `visualStage()` reserves
stage 4 strictly for harvestable crops, and there is a unit test asserting it — so the colour flip is
a promise the game always keeps: **if it looks ready, it is ready.**

### Contrast is audited, not eyeballed

`npm run art:check` computes WCAG contrast ratios for every gameplay-critical pair and exits
non-zero on failure. Two thresholds:

- **Findability ≥ 1.6:1** — can a player locate this against the ground it sits on?
- **Progression ≥ 1.5:1** — can a player tell this stage from the next?

Because WCAG contrast is a pure luminance measure, passing it also means the art survives any form of
colour blindness — which a hue comparison cannot tell you.

The audit found three real problems on its first run, all now fixed:

| Problem | Ratio | Fix |
| --- | --- | --- |
| Fox nearly invisible on scrub | 1.24:1 | Body deepened to `#D0602A`; white belly and tail tip carry the read |
| Player shirt lost against soil | 1.41:1 | Lightened to `#6FA3D4` |
| Ripe vs unripe pumpkin (a red-green confusion) | 1.24:1 | Unripe darkened, ripe brightened → 2.32:1 |

Note the deliberate exception recorded in the audit: a mid-orange fox body cannot clear 1.6 against
*both* red soil and gold scrub without turning brown and losing its identity, so the burden is
carried by its white markings instead. That is a design choice, written down rather than hidden.

## What this direction rules out

Stating these plainly is what stops the style eroding one reasonable-sounding request at a time.

- **No PBR realism.** Metalness is 0 everywhere; roughness is 0.85 everywhere. A stray specular
  highlight reads as a rendering bug.
- **No world texture detail.** There are no UVs in the 3D world. Colour is per-vertex. The DOM
  interface may use transparent Blender-rendered WebPs under ADR 0014; they are illustrations, not
  sampled world materials.
- **No world outlines or post-processing.** Separation comes from hue and value, and it is
  measured. The player alone has a narrow pale inverted-hull rim plus a soft contact mark: a
  documented accessibility exception so the avatar stays findable on soil, road and crop beds.
- **No per-blade grass, no real GI.** Scatter props instead.
- **No detail below ~4 cm.** It does not survive 20 metres, and it costs triangles and download.
- **No razor edges.** Everything is bevelled; rock is the single deliberate exception.

## Interface extension

Menus use the same palette, rounded form language and object silhouettes, but their job is decision
clarity rather than spatial simulation. Cream paper, timber frames, teal controls and gold primary
actions create a physical farm-ledger feel. Item art is rendered from the real Blender meshes so a
wheat crop, barn or chicken is recognizable before its label is read.

See [UI_DIRECTION.md](UI_DIRECTION.md) for component hierarchy, accessibility and input-isolation
rules.
