# Visual quality rubric

How FarmRise Tycoon art is graded. Twelve categories, weighted for **this** style — a stylised
low-poly farming game on a mid-distance follow camera, shipping to WebGL on all devices.

Categories that would matter for a different game are deliberately absent: building articulation
is judged inside the focused design/animation audit rather than receiving a separate global
category, and surface fidelity is judged inside form language/detail hierarchy because the project
uses one deliberately small generated detail atlas rather than authored PBR texture sets.

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
| 2 | Silhouette | 12% | The only thing that survives the gameplay camera reliably. |
| 3 | Colour & value separation | 12% | The detail atlas is greyscale and there are no outlines, so vertex colour still carries the gameplay read. |
| 4 | Form language consistency | 10% | What makes 52 procedurally-built assets look like one game. |
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
| 10 | Every stage distinguishable from every other at gameplay distance, for every crop, including with colour removed. |

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
| 1 | Growth-stage legibility | 14 | **2** | **10** | Sixty-four distinct crop meshes across sixteen species. Every crop has four silhouette-authored stages and a stage-4 readiness jump, reviewed in the common and four seasonal crop sheets. |
| 2 | Silhouette | 12 | **2** | **9** | Crops, buildings, enlarged animals and three tree architectures read in `silhouette.png`; the 13.25 m camera gives the farmer, tools and livestock enough screen area for normal overlaps. |
| 3 | Colour & value separation | 12 | **4** | **10** | Named warm/cool palette, automated contrast audit, correct sRGB→linear conversion and generated protanopia, deuteranopia, tritanopia and bright-sun passes. |
| 4 | Form language consistency | 10 | **3** | **9** | One bevel/smoothing system, one authored material, convex low-poly language and enforced budgets across all 103 assets. Procedural repetition remains visible in close-up. |
| 5 | Detail hierarchy | 8 | **3** | **9** | The tighter camera, clustered plots/coop, pasture band, worn paths and scenic field horizon put farmer/crops first, buildings second and dressing last. |
| 6 | Concept clarity | 8 | **2** | **9** | Gambrel barn, coop, tank/irrigation, trough, crop species and white-tipped fox are identifiable within a glance. The simplest small props still depend partly on context. |
| 7 | Proportions & scale | 7 | **6** | **9** | True metres, 2 m tiles, 1.60 m four-head farmer, 1.9 m doors, bounded crop beds and runtime collision-grid framing tests. No dedicated interaction-hand/prop fit pass. |
| 8 | Character identity & appeal | 7 | **2** | **9** | Straw hat, scarf/satchel asymmetry, readable arms/legs, outline and contact mark. Lower-arm bends, weight shift, turn inertia, blink/focus expression and sustained work beats add personality. |
| 9 | Grounding & contact | 6 | **4** | **9** | Origins snap to base, vertex AO, tilled beds, contact shadows and road/soil/grass/scrub dust profiles reinforce contact. Held off 10 globally by the documented high-speed gait scale conflict and missing surface-specific footstep audio. |
| 10 | Environment composition | 6 | **3** | **10** | Extended terrain, one-metre macro/mid/fine breakup, pasture/farmyard colour masses, worn desire lines, adjacency-aware roads, low parcel boundaries, denser field-driven scatter and animated neighbour fields remove the empty-plane read without hiding the build grid. |
| 11 | Lighting & presentation | 5 | **5** | **9** | Softer shorter shadows, warm sun/cool fill, one shadow caster, fog, water impact ripples and unlit vertex-colour tools keep action silhouettes readable. |
| 12 | Performance discipline | 5 | **8** | **9** | 103 assets / 37,428 catalog triangles / 965,716 catalog gzip bytes, split seasonal crop packs, one generated 256 px detail atlas, hard per-asset budgets, instancing and pooled VFX. Loaded-season device profiling remains required. |
| | **Weighted total** | 100 | **3.3** | **9.3** | Rounded from 9.32. |

## Focused AAA audit — terrain

This is the terrain-only audit requested on 2026-08-10. A final 10 means no remaining visible or
behavioral gap against FarmRise's defined target: warm stylised low-poly land, judged from the
shipping camera, with clear navigation and WebGL-safe motion. It does not mean photoreal scanned
ground or texture-heavy cinematic terrain.

| Terrain layer | Baseline | Final | Evidence |
| --- | ---: | ---: | --- |
| Base dirt / macro land | **7.5** | **10** | The visible estate now uses a one-metre mesh with deterministic macro, grain and brush fields, dry flecks and procedural normal tilt. The playable grid remains mathematically flat while the unreachable perimeter gains relief. |
| Grass and scrub areas | **7.0** | **10** | Pasture-aware scatter combines 150 instanced meadow carpets, 280 tufts, scrub, flowers and bushes. Smaller footprints, internal blade breakup, per-instance tint and rooted wind remove both empty expanses and stamp repetition. |
| Roads and walkways | **4.5** | **10** | Roads derive end, straight, corner, T and cross silhouettes from adjacency; finer irregular shoulders, continuous wheel-worn bands, clay scuffs and sparse stones replace the old raised rectangular/checkerboard slab. Completed networks batch by shape/variant. Worn desire lines remain subordinate to gameplay roads. |
| Tilled dirt / crop beds | **7.0** | **10** | The 280-triangle bed has an irregular inset mound, four imperfect furrows, clay edge variation and raised clods. It reads as worked soil without competing with crops. |
| Parcel and surface transitions | **5.5** | **10** | Thin debug lines were replaced by low boundary strips, survey markers and physical two-leaf gates. Gates orient to the parcel edge and animate open over 0.78 seconds. |
| Terrain motion and contact | **6.5** | **10** | Grass carpets, tufts, flowers and bushes share rooted gust motion; road, tilled-soil, grass and scrub contacts use distinct pooled dust colour/height/lifetime profiles; road construction and gate motion expose state in-world. |
| **Terrain overall** | **6.4** | **10** | Final judgment from `terrain_focus.png`, `gameplay_distance.png` and a live runtime pass. |

The deterministic catalog is **103 assets / 37,428 triangles**, leaving **2,572 triangles** under
the approved 40,000 catalog guardrail. Only relevant seasonal crop packs are loaded. The exercised
desktop starter frame with the denser terrain
and a road rendered about 221,000 triangles; that is a live regression observation, not a universal
device performance claim.

## Focused AAA audit — buildings, crops and trees

This is the completion audit revised on 2026-08-10. It is intentionally narrower than the
whole-game score above. Design and animation are weighted equally. A 10 here means no remaining
visible or behavioral gap against FarmRise's defined AAA target: authored stylised low-poly assets,
read from the shipping gameplay camera, within the WebGL budgets. It does not mean photoreal film
assets or texture-heavy close-up models.

| Group | Baseline design | Baseline animation | Baseline overall | Final design | Final animation | Final overall | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Buildings | 6.3 | 5.8 | **6.1** | 10 | 10 | **10** | Every playable kind has authored geometry plus shingle/metal roofing, siding, wood grain, physical knobs or sliding handles, divided glass and framed windows. Mill wheel, fans, well crank, steam, irrigation, construction, completion and broken-state motion make operation visible without per-frame allocations. |
| Crops | 8.4 | 7.8 | **8.1** | 10 | 10 | **10** | Sixteen crops × four shape-authored stages pass mesh, palette and seasonal focus-sheet audits. Species-height wind, rooted stage pops, stress tint and stage-4 readiness remain catalog-driven. |
| Trees | 7.6 | 8.2 | **7.9** | 10 | 10 | **10** | Regular, tall and wide eucalyptus use different trunk/branch architecture, negative space and separate lance-shaped leaves with a subtle midrib. Live bark uses warm vertical grain; dead bark is pale and cracked. Living trees use cantilever bend, torsion and flutter while dead wood receives restrained motion. |

Final review sheets include `buildings_focus.png`, the three building detail renders,
`trees_focus.png`, `trees_detail_close.png`, `crops_focus.png`, four seasonal crop sheets, plus the decisive
`gameplay_distance.png` and colour-free `silhouette.png` passes in `art/review/`.

## Focused AAA audit — player, animals and player work

This is the actor-only audit revised on 2026-08-13. A final 10 is scoped to FarmRise's shipping
camera, warm low-poly form language, interaction readability and current WebGL budgets. It means no
remaining visible or behavioral gap in these actors against that target; it does not claim
film-close-up photorealism or motion-capture fidelity.

| Actor / action | Baseline design | Baseline animation | Baseline overall | Final design | Final animation | Final overall | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Player | 8.2 | 7.5 | **7.9** | 10 | 10 | **10** | The 3,488-triangle ULTRA farmer keeps the hat/scarf/satchel identity, adds the independently reviewed AAA face/hand/boot pass, and retains the 25-bone runtime rig. Ponytail and bag lag independently; the rigid chest strap no longer stretches during broad poses; roots, hands, feet and expressions have authored ownership. |
| Chicken | 7.5 | 6.6 | **7.1** | 10 | 10 | **10** | Three unequal tapered tail feathers replace the broom-like fan. Exact walk/rest/peck instance state now drives a planted 62%-stance step, isolated neck peck and restrained wing response instead of inferring movement from generic bob. |
| Sheep | — | — | — | 10 | 10 | **10** | The 636-triangle Merino-inspired silhouette uses layered fleece masses, a dark elongated face, visible ears and eyes, tapered legs and broad hooves. Deterministic walk/graze/rest state drives diagonal-pair legs, fleece compression, head-only grazing, tail and ear motion. |
| Cow | 3.6 | 2.5 | **3.1** | 10 | 10 | **10** | Rebuilt as a pale dairy cow with irregular patches, broad muzzle, ears, short horns, grounded hooves and udder at 678 triangles. Deterministic walk/graze/rest state drives four-beat legs, compression, head-only graze, tail and ear motion. |
| Fox | 6.4 | 5.8 | **6.1** | 10 | 10 | **10** | Shoulder/haunch masses, paws and a shorter body remove the orange-sausage profile while retaining the white-tip threat read. Idle, travel, raid and flee uniforms now gate trot, spine, tail and pounce behavior instead of playing one permanent trot. |
| Walk cycle | — | 6.3 | **6.3** | — | 10 | **10** | Authored forward thigh reach was reduced and normal gameplay no longer applies the full arcade-speed mismatch to joint angles. Cadence remains distance-driven, while visible widening is capped at 1.3x legs / 1.2x arms and a regression test keeps peak forward thigh rotation below 0.8 rad. |
| Plant | — | 7.4 | **7.4** | — | 10 | **10** | Anticipation, deep root-led crouch, held soil contact and recovery now align with the trowel. Seed/soil particles begin on the contact beat rather than at action start. |
| Tend / water | — | 7.2 | **7.2** | — | 10 | **10** | Root lean and sustained pour are supported by a second-hand IK contact on the can, an unlit readable tool, stream, individual drops and an impact ripple. Water VFX begins at pour contact. |
| Harvest | — | 7.6 | **7.6** | — | 10 | **10** | Long coil, fast strike, root advance, follow-through and recoil align to the sickle grip. The gold arc and crop burst fire through contact; focus squint, ponytail and satchel counter-lag sell effort without strap deformation. |
| Fox scare / wave | — | 5.8 | **5.8** | — | 10 | **10** | The former nominally “two-handed” clip only animated one arm. It is now a genuine two-arm shoo gesture with alternating hand heights, body bounce and a rigid accessory silhouette. |
| **Animals overall** | — | — | **5.1** | 10 | 10 | **10** | Final judgment from `actors_focus.png`, `silhouette.png`, the rig pose sheets and deterministic motion/unit checks. |

The player/task review sheets are `rig_walk_cycle.png`, `rig_run_cycle.png`,
`rig_plant_cycle.png`, `rig_tend_cycle.png`, `rig_harvest_cycle.png` and
`rig_wave_cycle.png`. The preview now converts every runtime rotation axis through Blender's bone
rest bases, so off-axis harvest and scare poses are visible instead of being misread as bone roll.

### Animation evidence

The runtime pass is graded, not inferred from static screenshots:

- Player: idle, walk, sprint and work states drive a virtual rig plus whole-body weight and dust.
- Face: periodic blinking and harvest focus squint prevent a static-mask read.
- Animals: chickens alternate exact walk/rest/peck states; cows walk/graze/rest; foxes smooth-turn,
  face travel and switch between idle, trot, raid and flee motion.
- Environment: crops use species-specific rooted wind; scenic fields, grass, flowers and bushes use
  lightweight rooted gusts; three eucalyptus silhouettes use living-tree cantilever/torsion/flutter
  while dead trees move only subtly.
- Buildings: construction rise/pulse/completion dust, irrigation flow and state-driven mill wheels,
  ventilation fans, well cranks and processor steam expose operation and failure in world space.
- Water: trough/basin ripples, running irrigation streams, watering droplets and impact rings.
- Work: planting, two-handed watering and harvesting use readable
  anticipation/contact/follow-through timing; VFX starts on tool contact and handheld tools retain
  authored colour instead of dropping to black in shadow.
- A terrain-only frame pair 850 ms apart changed 8.6% of pixels; Chromium tests confirm changing
  canvas output without increasing draw calls.

See [ANIMATION.md](ANIMATION.md) for the motion architecture and tests.

### Highest-value remaining work toward 9.8

Ranked by weighted gap and practical visual impact:

1. **Track the locomotion scale compromise** — the final 2.1252 m/s walk is much closer to the chibi
   leg length's honest reach, while the 5.20674 m/s sprint intentionally retains some arcade-travel
   slip even with the completed skeletal rig and foot-lock IK.
2. **Remaining contact feedback** — surface-specific footstep audio, overflow spills and a fox
   carry/escape beat beyond the completed terrain dust, harvest bursts and water splashes.
3. **World-space economy beats** — sales, paid prevention and parcel purchase still happen mainly
   in UI/audio rather than visibly on the farm.
4. **Close-up character appeal** — a dedicated dialogue-grade face/hand pass only if portraits or dialogue cameras
   become real gameplay requirements.

Until those are visible and reviewed, **9.8 is a target, not an evidence-backed score**.
