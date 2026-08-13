# Art implementation guide

How to make an asset that belongs in this game. Read
[ART_DIRECTION.md](ART_DIRECTION.md) first for *why*; this document is *how*.

## The unusual part: the art is code

Every asset is built by a Python script in `tools/blender/`. There is no hand-modelling step.

```bash
npm run art:build     # rebuild all 103 assets, export GLB, write art/build_report.json
npm run art:review    # render the core sheets plus four accessibility variants
npm run art:ui-icons  # render transparent DOM-interface WebPs + art/ui_icon_report.json
npm run art:check     # palette contrast audit (no Blender needed) - exits non-zero on failure
npm run art:test      # negative tests: prove the three build guards actually fire
```

**Why:** a `.blend` is not diffable, drifts from the style guide, and takes nineteen manual edits to
apply a palette change. A script is reviewable in a pull request, cannot drift (the style guide *is*
the code), and regenerates everything in under a second.

**What it costs, stated plainly:** procedural construction cannot produce sculpted, hand-crafted
form. Facial appeal, cloth folds, hand-painted texture and authored skeletal animation are outside
the Blender build pipeline. Runtime shader/transform animation supplies motion at gameplay distance;
close-up performance still needs a specialist.

| File | Owns |
| --- | --- |
| `tools/blender/palette.py` | Colour, scale constants, triangle budgets, contrast maths |
| `tools/blender/buildlib.py` | `MeshBuilder`, primitives, bevel, budget enforcement, the shared material |
| `tools/blender/assets.py` | Every asset, one function each |
| `tools/blender/seasonal_crops.py` | Twelve seasonal crops, four authored stages each |
| `tools/blender/build_assets.py` | Scene setup, build order, GLB export, the report |
| `tools/blender/review_render.py` | Core review passes plus colour-vision / bright-sun variants |
| `tools/blender/render_ui_icons.py` | DOM-interface compositions rendered from the authored meshes |
| `tools/blender/check_palette.py` | Standalone contrast audit for CI |
| `tools/blender/test_guards.py` | Negative tests proving each build guard rejects its fault |

## Scale

Authored in **true metres**. Nothing is ever scaled at runtime — a runtime scale produces
inconsistent normals and a character who is subtly the wrong size next to a doorway.

| Constant | Value |
| --- | --- |
| Tile | 2.00 m (matches `TileGrid.tileSize`) |
| Plot bed / crop footprint | 1.80 m — crops must never overhang |
| Player height | 1.60 m, four heads |
| Minimum door | 1.90 m |
| Review camera | 13.25 m at 34°, 42° vertical FOV, -42° azimuth |

## Form language

| Rule | Value |
| --- | --- |
| Bevel width | 0.02 m |
| Bevel segments | **Scales inversely with asset size.** 1 for buildings, 2 for small props. |
| Smoothing angle | 35° |
| Metalness | 0.0 everywhere |
| Roughness | 0.85 everywhere |
| Minimum feature size | ~4 cm — below this it does not survive the gameplay camera |

The inverse bevel rule is not arbitrary: the barn's edges are metres long, so a single chamfer
already reads as a rim highlight, and the second segment cost 640 triangles for something no player
can resolve. Small props sit closer to the eye and earn the extra segment.

**Bevel everything.** An unbevelled cube catches no light along its edges and reads as a flat
silhouette; a 2 cm bevel gives every edge a bright rim for free under any lighting. Rock is the one
deliberate exception — it is the only non-organic, non-manufactured material in the palette.

## Colour

Every colour comes from `PALETTE` in `palette.py`, by name. `linear_rgba()` raises on an unknown
name, so a typo fails the build rather than shipping a grey asset.

**Colour lives in a face custom-data layer, never in a dict keyed by `BMFace`.** This is a hard-won
rule: `bmesh.ops.bevel` destroys and recreates faces, which invalidates every key in such a dict and
silently repaints an entire building with the fallback colour. That bug shipped grey buildings
through a full review cycle before the contact sheet caught it. A face layer is copied onto new
geometry by the operator and survives topology changes.

**sRGB in, linear out.** Palette entries are sRGB hex. Blender colour attributes and glTF `COLOR_0`
are both linear. `linear_rgba()` does the conversion; writing hex straight into a float colour
attribute is the classic route to washed-out, milky vertex colours.

## Materials

**One material for the authored 3D-world asset set**: `M_FarmRise_VertexColour`.

- Hue comes entirely from the `COLOR_0` vertex attribute.
- `TEXCOORD_0` selects a cell in one shared greyscale procedural detail atlas for siding, shingles,
  wood grain, metal, glass, live/dead bark, leaves, stone and water.
- Blender and `ModelLibrary` generate the atlas deterministically; no bitmap world texture ships.
- `doubleSided: true`, because foliage is single-sided geometry — a leaf is one quad strip, not a
  solid, which halves the triangle count on every crop.

This is what keeps draw calls proportional to the number of distinct *meshes* rather than the number
of distinct colours. Runtime views add a small fixed set of presentation materials: cloned wind and
character materials with shader hooks, two water shaders, a semi-transparent player contact mark, a
pale back-face outline, one dust material and one unlit vertex-colour material for tiny handheld
tools. This prevents a sickle or watering can from dropping to black when its action pose faces away
from the sun. They are class-level resources, so farm growth does not multiply draw calls.

The DOM interface is a separate presentation target. `render_ui_icons.py` renders existing meshes
to transparent WebP files, and `uiIcons.manifest.ts` records their paths and measured bytes. These
images do not change the world material contract or add WebGL draw calls. See ADR 0014 and
[UI_DIRECTION.md](UI_DIRECTION.md).

## Triangle budgets

Enforced at build time. `assert_budget` raises and stops the build.

| Class | Budget | Note |
| --- | ---: | --- |
| `crop` | 900 | One asset is a **whole plot bed**, not one plant |
| `building` | 900 | |
| `character` | 3,500 | Final ceiling for the always-visible ULTRA hero mesh; the immutable low pack is unchanged. |
| `animal` | 700 | |
| `prop` | 300 | |

Current worst cases: `SM_char_farmer` at 3,488, `SM_building_barn` at 892 and ready grapes at 894.
Total across 103 assets: **37,428 triangles**, split so only common crops plus relevant seasonal
packs are resident.

Raising a budget requires updating this table and saying why in the commit. A budget that is merely
documented is a budget that gets exceeded; this one stops the build.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Mesh / exported node | `SM_<family>_<name>[_s<stage>]` | `SM_crop_wheat_s4` |
| Crop stages | `_s1`–`_s4`, 1 = seedling, 4 = harvestable | `SM_crop_pumpkin_s4` |
| Blender collection | UPPERCASE family | `CROPS`, `BUILDINGS` |
| GLB file | lowercase family | `crops.glb` |
| Asset manifest id | `model:<family>` | `model:crops` |
| Palette entry | `snake_case`, band-prefixed | `soil_tilled`, `wall_teal` |

**Node names are load-bearing.** The engine looks meshes up by exact name, so a rename in
`assets.py` silently breaks rendering. Two protections: `build_assets.py` purges orphaned datablocks
before building (a leftover `SM_crop_wheat_s4` would otherwise force `.001` onto the new one and
travel into the GLB), and `review_render.py` refuses to run if it sees a suffixed name.

## Export

Set in `build_assets.py`; do not override per-asset.

| Setting | Value | Why |
| --- | --- | --- |
| Format | GLB | Single binary, no sidecar files |
| `export_yup` | true | glTF convention |
| `export_texcoords` | **false** | No UVs exist |
| `export_normals` | true | |
| `export_tangents` | false | No normal maps |
| `export_vertex_color` | `ACTIVE` | Where all colour lives |
| `export_apply` | true | Modifiers baked |
| Mesh compression | **none** | See [ASSET_PIPELINE.md](ASSET_PIPELINE.md) — measured, not assumed |

One GLB per family. Six requests, not thirty, and a scene that needs only crops never downloads
the character.

## Lighting

Set by `FarmView`, mirrored in the review renderer so what is judged is what ships.

- One `HemisphereLight` (cool sky, warm bounce) as fill.
- One `DirectionalLight` as the sun and **the only shadow caster**. More shadow casters is the
  fastest way to lose a mid-range mobile GPU.
- Shadow map 1024², bias −0.0008 (without it, large shadow-camera extents produce acne on flat
  ground).
- Standard PCF shadow filtering. Three r185 removed the separate `PCFSoftShadowMap` implementation.
- `NoToneMapping`.

## Review process

Non-negotiable order:

1. `npm run art:build` — budgets and the palette audit must pass.
2. `npm run art:review` — regenerate the three core sheets and four accessibility variants.
3. **Judge `gameplay_distance.png` first.** It is the only view that decides. A beauty render in a
   modelling viewport has never caught a real problem in this project; the gameplay pass has caught
   every one.
4. Check `silhouette.png`. Anything you cannot name is relying on colour to do shape's job.
5. Use `contact_sheet.png` only for per-asset form and proportion.
6. Check `gameplay_protanopia.png`, `gameplay_deuteranopia.png`, `gameplay_tritanopia.png` and
   `gameplay_bright_sun.png`; ready crops and the player must remain findable.
7. Re-grade against [VISUAL_RUBRIC.md](VISUAL_RUBRIC.md) and fix the largest weight × gap.

## The three build guards, and why they are tested

Each guard exists because a real bug shipped past review. A guard nobody has
watched fire is a guard you are trusting on faith, so `npm run art:test`
reintroduces each fault and asserts the build refuses it.

| Guard | The bug it caught | Verified by |
| --- | --- | --- |
| Triangle budget | A 1,296-triangle barn against a 900 budget | `fault_over_budget` |
| Unpainted faces | `bmesh.ops.bevel` recreated faces, invalidating a `BMFace`-keyed colour dict — every bevelled building rendered flat grey | `fault_unpainted_faces` |
| Datablock name collision | An orphaned fake-user mesh forced `SM_crop_wheat_s4.001`, and the suffix travelled into the GLB, breaking name lookup silently | `fault_name_collision` |

A fourth guard lives on the TypeScript side: `cameraFraming.test.ts` parses
`palette.py` and fails if the camera constants drift between the engine and the
review renderer. It also inspects the decisive review setup for the runtime's
positive world-Z orbit convention and the explicit vertical-FOV conversion; matching
numbers are not sufficient if Blender interprets them through a different transform
or sensor axis. The gameplay review scene uses the canonical starter coordinates from
the shared parcel and new-career rules.

## Adding an asset

1. Add any new colours to `PALETTE`, in the right band.
2. Write a function in `assets.py`. Comment the **art decision**, not the geometry.
3. Register it in `BUILD_ORDER`.
4. If it is a new family, add the collection to `FAMILIES` in `build_assets.py`.
5. `npm run art:build` — fix budget failures by removing detail, not by raising the budget.
6. Add the family to `core.manifest.ts` with its **measured** byte count from `art/build_report.json`.
7. Reference it by name from a view, always through `ModelLibrary.has()` / `require()`.
8. `npm run art:review` and grade it.
9. `npm run verify`.

## Engine-side contract

| Rule | Where |
| --- | --- |
| Views must work **without** art on disk | Every view takes `ModelLibrary \| null` and falls back to primitives |
| Library geometry is shared — views must not dispose it | `ModelLibrary.dispose()` owns it |
| Repeated objects use `InstancedMesh` | Plots, crops, scatter, chickens |
| Growth is shown by swapping meshes, never by scaling one | `PlotView.visualStage()` |
| Nothing invents a colour | Palette → vertex colours × greyscale detail atlas → one material |

The fallback path is not decoration: it is what keeps the jsdom test suite running with no art and no
network, and it means a missing GLB shows placeholder primitives rather than a black screen.

---

# Improvement plan

## Completed in the graphics polish pass

1. Pumpkin stages 2 and 3 now differ in leaf mass, flower/fruit state, height and fruit diameter.
2. Scatter now includes eucalyptus trees, dead trees, rock clusters, wildflowers, scrub patches and
   a trough, distributed across the whole grid rather than repeating every 16 samples.
3. The visible ground extends beyond the collision grid and is framed by an unreachable instanced
   three-family tree line, scenic mature fields and farmstead landmarks, so the follow camera never
   exposes the terrain edge or an empty ochre horizon.
4. The player has an asymmetrical satchel/scarf silhouette, a 25-bone independent-limb virtual rig
   for idle/walk/sprint/work motion, ponytail/satchel lag, a rigid chest strap, a contact mark and a
   player-only rim. Work VFX is synchronized to tool contact and watering uses both hands.
5. Manifest byte counts and compression measurements are current after the rebuild.
6. Wheat, corn, pumpkin and clover each use a distinct rooted wind profile; grass, flowers and
   bushes retain the lighter shared gust. Living eucalyptus use cantilever bend, torsion and tip
   flutter, while dead trees use a restrained separate material.
7. Every playable building kind has an authored base mesh. Mill wheels, cold-store/creamery fans,
   well cranks, processor steam, irrigation flow, construction rise and completion dust make
   operational state visible; broken structures stop and shake.
8. Chickens use exact walk/rest/peck gait state, cows and sheep walk/graze/rest with species-specific
   quadruped motion, and foxes switch between idle/travel/raid/flee motion. Troughs ripple, irrigation
   structures carry a visible running stream, and player movement/work emits pooled dust.
9. Vertex AO and the shared generated surface-detail atlas add crevice, contact and material breakup
   without multiplying authored materials or shipping a bitmap world texture.
10. Terrain uses a one-metre colour/normal field, pasture/earth-aware grass and dirt scatter,
    adjacency-aware packed-earth roads, physical parcel gates and surface-specific contact dust.

## High-impact revisions (days, still no artist)

1. **Seasonal palettes.** The reference set contained three biomes. The palette is a single dictionary
   with a contrast audit, so a second season is mostly data.
2. **World-space economy presentation.** Sales, event prevention and parcel purchases need authored
   farm-side beats if those UI actions are meant to carry the same visual weight as field work.
3. **LODs — only if profiling demands it.** The 37,428 authored triangles are distributed across
   lazy seasonal packs; add LODs only if a loaded-season device trace is geometry-bound.

## Needs a professional artist or specialist

4. **Locomotion-scale follow-up.** The completed skeletal rig, compact rear-only walk, capped visual
   stride warp and IK remove the former forward-kick silhouette. The final 2.1252 m/s walk is much
   closer to the 0.385 m legs' honest reach, while the 5.20674 m/s sprint still accepts measured slip
   as an arcade-travel compromise. Eliminating that remainder would require another gameplay-speed
   or character-proportion decision, then specialist animation retuning.
5. **Hand-painted texture pass**, if the project ever wants painted foliage or scanned ground. UVs
    now exist for the generated greyscale atlas, but shipped bitmap colour/normal textures would
    still need a texture artist plus a KTX2 pipeline — re-run the compression measurements first.
6. **Character appeal at close range.** The face now includes blink/focus expression; a
   dialogue-grade portrait still needs a dedicated close-up head.
7. **Remaining contact feedback**: surface-specific visual dust, work/harvest bursts and water
   impact rings are complete; footstep audio, overflow spills and fox carry/escape contacts remain.
