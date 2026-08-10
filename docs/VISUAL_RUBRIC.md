# Visual quality rubric

How FarmRise Tycoon art is graded. Twelve categories, weighted for **this** style — a stylised
low-poly farming game on a mid-distance follow camera, shipping to WebGL on all devices.

Categories that would matter for a different game are deliberately absent: there is no
"mechanical articulation" category because nothing in this game is mechanical, and no "texture
fidelity" category because the game has no textures.

## How to use it

1. Render the three review passes: `npm run art:build && npm run art:review`.
2. Grade each category from the renders, not from a beauty shot in a modelling viewport.
3. **Every score needs visible evidence.** Separate fact ("the road occupies more silhouette area
   than the barn") from interpretation ("this inverts the detail hierarchy").
4. Fix the lowest weighted-score-times-weight first.

### The three review passes

| Pass | Question it answers |
| --- | --- |
| `contact_sheet.png` | Does each asset read on its own? Form, proportion, colour separation. |
| `gameplay_distance.png` | Does it read *in situ*, from the real follow camera? **This is the only view that decides.** |
| `silhouette.png` | Does it read with all colour removed? If not, colour is doing shape's job. |

## Weights

| # | Category | Weight | Why this weight |
| --- | --- | ---: | --- |
| 1 | Growth-stage legibility | 14% | The core loop. Six plots are on screen at all times and every decision starts by reading them. |
| 2 | Silhouette | 12% | The only thing that survives 20 m reliably. |
| 3 | Colour & value separation | 12% | This direction has no textures and no outlines, so colour carries the whole load. |
| 4 | Form language consistency | 10% | What makes 24 procedurally-built assets look like one game. |
| 5 | Detail hierarchy | 8% | Prevents a path out-shouting a barn. |
| 6 | Concept clarity / focal read | 8% | Can a player name the object in one second? |
| 7 | Proportions & scale | 7% | A walk-around 3D game breaks instantly when a door is the wrong size. |
| 8 | Character identity & appeal | 7% | One character, always on screen, always the player's avatar. |
| 9 | Grounding & contact | 6% | Floating objects destroy the illusion faster than low poly counts do. |
| 10 | Environment composition & navigation | 6% | The farm is a grid the player must be able to plan on. |
| 11 | Lighting & presentation | 5% | Deliberately simple here; a single key plus fill is the whole story. |
| 12 | Performance discipline (web) | 5% | Non-negotiable ceiling, but cheap to satisfy in this style. |

---

## The categories

### 1. Growth-stage legibility — 14%

**Measures:** can a player identify which of four growth stages a plot is in, and whether it is
harvestable, at gameplay distance and at a glance?

| Score | Looks like |
| --- | --- |
| 1 | One mesh scaled vertically. Stages differ by height alone. |
| 5 | Distinct colours per stage, but similar silhouettes; the player must look twice. |
| 8 | Four distinct meshes per crop with a clear hue journey. Ready is unmistakable. Adjacent mid-stages may still be similar. |
| 10 | Every stage distinguishable from every other at 20 m, for every crop, including with colour removed. |

**AI failure modes:** generating one plant and scaling it; making all four stages the same green;
putting the visual change in size rather than colour; letting a "nearly ready" stage look ready.

**Objective checks:** `npm run art:check` PROGRESSION pairs ≥ 1.5:1. Unit test asserting stage 4
occurs *if and only if* the crop is harvestable (`plotVisuals.test.ts`).

### 2. Silhouette — 12%

**Measures:** identifiability from shape alone.

| Score | Looks like |
| --- | --- |
| 1 | Everything is a box or a cone; different objects share a silhouette. |
| 5 | Major objects distinguishable; small ones merge with the ground. |
| 8 | Every gameplay-relevant object identifiable in the silhouette pass; a few actors merge with what they stand on. |
| 10 | Every object identifiable, including actors against every surface they can occupy. |

**AI failure modes:** symmetrical blobs; detail added as surface rather than as outline; a character
whose silhouette is a featureless capsule.

**Objective check:** the silhouette pass. If you cannot name an object in it, it fails.

### 3. Colour & value separation — 12%

**Measures:** does each element separate from its background by hue *and* by luminance?

| Score | Looks like |
| --- | --- |
| 1 | Arbitrary colours; foreground and background at similar values. |
| 5 | A deliberate palette, but contrast never verified. |
| 8 | Systematic palette with a stated organising rule and an automated contrast audit that passes. |
| 10 | As 8, plus verified under simulated protanopia/deuteranopia/tritanopia and in bright-sunlight screen conditions. |

**AI failure modes:** picking colours that look good in isolation; ignoring what the object sits on;
red-green pairs for ripe/unripe (the single most common accessibility failure in farming games);
writing sRGB hex straight into a linear vertex-colour buffer.

**Objective check:** `npm run art:check`. Both bands must pass.

### 4. Form language consistency — 10%

**Measures:** do all assets appear to come from one game?

| Score | Looks like |
| --- | --- |
| 1 | Mixed primitives with no rule — sharp boxes beside smooth spheres. |
| 5 | Broadly consistent, with visible exceptions nobody decided on. |
| 8 | A written rule (bevel width, smoothing angle, convexity) applied everywhere, with documented exceptions. |
| 10 | As 8, and the rule is enforced at build time rather than by review. |

**AI failure modes:** varying bevel and smoothing per asset; mixing flat-shaded and smooth-shaded
objects arbitrarily; one asset at a different level of detail from its neighbours.

**Objective checks:** bevel width and smoothing angle are constants in `palette.py`; triangle budgets
fail the build.

### 5. Detail hierarchy — 8%

**Measures:** does visual weight match gameplay importance?

Correct order for this game: **actors ≈ crops > buildings > ground dressing > paths.**

| Score | Looks like |
| --- | --- |
| 1 | Inverted — decoration dominates. |
| 5 | Roughly right, with one or two loud offenders. |
| 8 | Correct ordering; minor competition between neighbours. |
| 10 | Correct at every distance and every camera angle. |

**AI failure modes:** uniform detail everywhere; lavishing geometry on a prop because it is fun to
model; large flat objects (paths, water, roofs) accidentally dominating.

### 6. Concept clarity / focal read — 8%

**Measures:** can a new player name the object within a second?

**AI failure modes:** generic shapes standing in for specific ones; a "barn" that is a red box; an
animal identifiable only by colour.

### 7. Proportions & scale — 7%

**Measures:** consistent real-world scale; correct chibi ratio; objects that fit each other.

| Score | Looks like |
| --- | --- |
| 1 | Arbitrary scale; a character cannot fit through their own door. |
| 5 | Broadly consistent; some props obviously wrong. |
| 8 | Everything authored in true metres to a documented tile size; character ratio consistent. |
| 10 | As 8, verified against the collision grid and the player's reach. |

**Objective checks:** tile = 2.00 m; player = 1.60 m at 4 heads; door ≥ 1.9 m; crops never overhang
their 1.8 m bed.

### 8. Character identity & appeal — 7%

**Measures:** is the player character appealing, readable and distinctly theirs?

| Score | Looks like |
| --- | --- |
| 1 | An untextured capsule. |
| 5 | Recognisably a person; generic, no memorable feature. |
| 8 | Strong silhouette hook (a hat, a tool, a colour) and a clean face read at distance. |
| 10 | As 8, plus animation with weight and personality, and appeal that survives a close-up. |

**AI failure modes:** faces with too much detail that turn to mush at distance; symmetrical
featureless bodies; proportions that drift between assets.

### 9. Grounding & contact — 6%

**Measures:** do objects feel attached to the ground?

**AI failure modes:** origins not at the base, so everything floats or sinks; no contact shadow; feet
intersecting terrain.

**Objective check:** the build script snaps every origin to the lowest vertex.

### 10. Environment composition & navigation — 6%

**Measures:** can a player read the tile grid, plan a build, and navigate without a minimap?

**AI failure modes:** unbroken fields of one colour; plots that merge into one field; dressing placed
on tiles gameplay needs.

### 11. Lighting & presentation — 5%

**Measures:** is the lighting simple, consistent and flattering to flat colour?

**AI failure modes:** filmic tone mapping over a flat saturated palette; multiple shadow-casting
lights; shadows so dark they read as holes.

### 12. Performance discipline (web) — 5%

**Measures:** does the art respect a WebGL budget on a mid-range phone?

**Objective checks:** per-asset triangle budgets fail the build; draw calls fixed by mesh count, not
object count; total gzipped model payload recorded in `art/build_report.json`.

---

## Grading: before and current

Graded from the core/accessibility review passes, the live runtime and the source. The "before"
column is the original procedural bootstrap (boxes, cones, cylinders and one vertically scaled box
for every crop stage). A 10 is deliberately difficult: it means the category has no visible gap at
the real camera, not merely that a feature exists.

| # | Category | W | Before | Current | Evidence |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | Growth-stage legibility | 14 | **2** | **9** | Twelve distinct crop meshes, stronger pumpkin s2/s3 leaf/flower/fruit progression, audited contrast and stage-4 ⇔ harvestable tests. Held off 10 because adjacent mid-stages remain deliberately subtler than ready. |
| 2 | Silhouette | 12 | **2** | **9** | Crops, buildings, animals and props read in `silhouette.png`; the farmer has a hat/satchel hook plus a pale player-only rim and contact mark. Held off 10 because tiny face/tool detail cannot survive every overlap at 20 m. |
| 3 | Colour & value separation | 12 | **4** | **10** | Named warm/cool palette, automated contrast audit, correct sRGB→linear conversion and generated protanopia, deuteranopia, tritanopia and bright-sun passes. |
| 4 | Form language consistency | 10 | **3** | **9** | One bevel/smoothing system, one authored material, convex low-poly language and enforced budgets across all 34 assets. Procedural repetition remains visible in close-up. |
| 5 | Detail hierarchy | 8 | **3** | **9** | Actors/crops lead, buildings support, narrow paths and subdued instanced dressing stay secondary. Held off 10 because a few dense flower/rock overlaps can compete at unusual camera edges. |
| 6 | Concept clarity | 8 | **2** | **9** | Gambrel barn, coop, tank/irrigation, trough, crop species and white-tipped fox are identifiable within a glance. The simplest small props still depend partly on context. |
| 7 | Proportions & scale | 7 | **6** | **9** | True metres, 2 m tiles, 1.60 m four-head farmer, 1.9 m doors, bounded crop beds and runtime collision-grid framing tests. No dedicated interaction-hand/prop fit pass. |
| 8 | Character identity & appeal | 7 | **2** | **9** | Straw hat, scarf/satchel asymmetry, two-dot face, outline and contact mark. Runtime virtual rig adds independent arm/leg swing, torso twist, walk/sprint/work cadence, breathing, lean, secondary motion and dust. Held off 10 without authored skeletal clips, IK and a close-up facial pass. |
| 9 | Grounding & contact | 6 | **4** | **9** | Origins snap to base, authored farmer float fixed, tilled beds self-ground, contact shadows and dust reinforce feet/actions. Held off 10 without AO or surface-specific foot placement. |
| 10 | Environment composition | 6 | **3** | **9** | Extended terrain, perimeter tree line, deterministic full-grid scatter, dead trees, rocks, flowers, scrub and trough remove the original empty-plane read while preserving buildable tiles. |
| 11 | Lighting & presentation | 5 | **5** | **9** | Warm sun, cool sky fill, one shadow caster, no palette-crushing tone mapping, PCF shadows, fog and animated water. Held off 10 without AO, weather lighting or a time-of-day presentation pass. |
| 12 | Performance discipline | 5 | **8** | **9** | 34 assets / 13,241 authored triangles / about 259 KB gzip, hard per-asset budgets, instanced repeated objects and pooled dust. Live starter view: 36 draws and 72,694 rendered triangles; all browser projects verify draw count remains constant across animated frames. Held off 10 because model transport is slightly over its 250 KB budget. |
| | **Weighted total** | 100 | **3.3** | **9.1** | Rounded from 9.12. |

### Animation evidence

The runtime pass is graded, not inferred from static screenshots:

- Player: idle, walk, sprint and work states drive a virtual rig plus whole-body weight and dust.
- Animals: chickens wander/peck/bob; foxes face travel and lean/stretch with speed.
- Environment: crops, grass, flowers, bushes, eucalyptus and dead trees sway with rooted,
  per-instance wind.
- Water: trough/basin ripples and an animated running stream on irrigation structures.
- A terrain-only frame pair 850 ms apart changed 8.6% of pixels; Chromium tests confirm changing
  canvas output without increasing draw calls.

See [ANIMATION.md](ANIMATION.md) for the motion architecture and tests.

### Highest-value remaining work toward 9.8

Ranked by weighted gap and practical visual impact:

1. **Authored character/animal animation** — skeletons, starts/stops/turns, distinct work clips,
   foot/hand IK and stronger anticipation/follow-through.
2. **Grounding and presentation** — baked vertex AO or a measured low-cost SSAO pass.
3. **Contact-specific VFX** — harvest bursts, water splashes, weather response and surface-specific
   footsteps instead of one general dust treatment.
4. **Close-up character appeal** — a dedicated face/hand pass only if portraits or dialogue cameras
   become real gameplay requirements.

Until those are visible and reviewed, **9.8 is a target, not an evidence-backed score**.
