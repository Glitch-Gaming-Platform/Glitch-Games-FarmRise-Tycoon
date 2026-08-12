# Render pipeline

This document is the contract between the render layer and everyone building on
top of it — terrain, vegetation, buildings, actors, VFX. If something here is
wrong, the render layer is wrong, not this file.

## The one rule

**Absence of a pipeline means the old behaviour.**

`RenderPipeline` is constructed only on the Ultra tier. On `low`,
`createEngine` passes no pipeline, `RendererSystem` takes exactly the branches
it took before this system existed, and every `pipeline?.` call site in the game
layer short-circuits. There is no "low tier code path" to keep in sync, because
low *is* the absence of code.

Consequences you can rely on:

- On `low` there are no extra draw calls, no extra shader programs, no render
  targets, no tone mapping and no changes to `scene.background`, `scene.fog` or
  `scene.environment`.
- `pipeline.registerMaterial(m, role)` is a no-op on `low`, so you may call it
  unconditionally.
- Any code that reads `pipeline` must tolerate `null`.

## Tiers

| | `low` | `ultra` |
| --- | --- | --- |
| Default on | touch-primary devices, ≤ 4 CPU threads | desktop |
| Tone mapping | none | AgX, exposure 0.62 |
| Ambient | `HemisphereLight` 1.24 | PMREM sky IBL at 0.42 + token hemisphere 0.12 |
| Sky | flat clear colour | Preetham dome driven by sun direction |
| Fog | `Fog(0xa7d7e8, 42, 108)` | `FogExp2`, colour sampled from the sky |
| Shadows | PCF, 512 (mobile) / 1024, farm-wide frustum | PCSS, 4096, fitted 96 m cascade |
| Post | none | GTAO → bloom → AgX → grade/vignette → SMAA |

Resolution order for the tier, most authoritative first:

1. `?quality=ultra` / `?quality=low`
2. the persisted settings value (`localStorage['farmrise:quality']`, set from
   the Settings panel; takes effect on the next reload)
3. device class

The tier is fixed for the lifetime of the page. It decides renderer
construction flags and a global shader chunk, neither of which can be changed
on a live context without recompiling every program in the scene.

## The API

Get the pipeline from the service container, or take it as a constructor
argument (preferred — it keeps your view testable):

```ts
import { RenderPipelineToken, type RenderPipeline } from '@engine/render/RenderPipeline.js';

const pipeline = services.tryResolve(RenderPipelineToken); // RenderPipeline | null
```

`FarmScene` already resolves it in `bootstrap/startGame.ts` and hands it to
`FarmView` through `FarmViewOptions.pipeline`. Follow that pattern: bootstrap
wires, views receive.

### Quality tier

```ts
pipeline?.tier                  // 'low' | 'ultra'
pipeline?.active                // false on low
pipeline?.profile               // shadow sizes, pixel ratio caps, sun angular size
pipeline?.features.ao           // every effect, individually
```

Branch on `features`, not on `tier`. A reviewer capturing `?off=ao` must get a
scene that behaves as if AO never existed, and code that checks
`tier === 'ultra'` breaks that.

### Environment map for PBR materials

```ts
pipeline?.environment           // THREE.Texture | null — PMREM of the sky
pipeline?.environmentIntensity  // the weight applied to scene.environmentIntensity
```

You almost never need this directly. The pipeline assigns `scene.environment`
on attach, and `MeshStandardMaterial` picks it up automatically. Read
`environment` only if you are building a material that needs an explicit
`envMap` (a water shader, a custom `ShaderMaterial`).

### Sun and sky state

```ts
const sun = pipeline?.sun;      // null on low
sun.direction                   // unit Vector3 pointing at the sun
sun.elevation, sun.azimuth      // degrees
sun.color                       // linear-sRGB, after atmospheric extinction
sun.intensity                   // suggested DirectionalLight.intensity
sun.horizonColor                // sampled from the dome; this is the fog colour
sun.zenithColor
sun.positionFor(focus, dist?)   // where to put a DirectionalLight

pipeline.setSunElevation(deg, azimuthDeg?);  // time of day
pipeline.setTurbidity(t);                    // haze, 2 clean … 10 dust event
pipeline.setFogDistance(metres);
```

`setSunElevation` re-convolves the environment map and re-samples the fog, so it
is not free — it is a "time of day changed" call, not a per-frame call. Whoever
owns time of day should call it at most a few times a second.

**If you place your own light from the sun state, place it from
`sun.positionFor()`.** A `DirectionalLight` needs a position, and the common
mistake — putting it at the direction vector itself, one unit from the origin —
silently collapses the shadow frustum.

### Shadow settings

```ts
const { mapSize, extent, depth, radius } = pipeline.shadow;
```

`radius` is **not** a blur radius on Ultra. The PCSS patch reads
`light.shadow.radius` as the penumbra growth rate, derived from the shadow
frustum and the sun's angular size. Copy it verbatim; inventing a value produces
either razor-hard or completely smeared shadows.

If you add a shadow-casting light, note that the Ultra cascade is *fitted*: it
covers `extent` metres around the player and nothing beyond. Casters outside it
do not cast. That is deliberate — see "Known weaknesses".

### Registering a material

```ts
pipeline?.registerMaterial(material, 'foliage');
```

Roles and what they mean:

| Role | envMapIntensity | roughness floor | Use for |
| --- | --- | --- | --- |
| `terrain` | 1.00 | 0.70 | ground, soil, roads, rock |
| `foliage` | 1.15 | 0.55 | leaves, crops, grass |
| `structure` | 0.85 | 0.45 | timber, render, shingles |
| `metal` | 1.30 | 0.18 | tanks, tools, machinery |
| `water` | 1.60 | 0.04 | troughs, dams |
| `skin` | 0.80 | 0.50 | animals, characters |
| `cloth` | 0.75 | 0.72 | shirts, sacks, awnings |
| `unlit` | — | — | opt out entirely |

The roughness floor only ever raises roughness. Art authored for the flat path
tends to sit at 0.2–0.4, which under image-based light reads as wet plastic; the
floor is what stops a texture pack landing and turning the farm into a showroom.

`registerMaterial` is idempotent and returns the material, so it chains:

```ts
this.#material = pipeline?.registerMaterial(new THREE.MeshStandardMaterial({...}), 'structure')
  ?? new THREE.MeshStandardMaterial({...});
```

Call `unregisterMaterial` when you dispose a view.

### Toggling passes and grading at runtime

```ts
pipeline.setPassEnabled('ao' | 'bloom' | 'output' | 'grade' | 'smaa', false);
pipeline.setGrade({ saturation, warmGain, growthGain, contrast, vignette });
pipeline.setExposure(0.62);
pipeline.setEnvironmentIntensity(0.42);
```

## Post-processing stack

Built on `EffectComposer` from `three/examples/jsm`. No new runtime dependency:
every pass ships inside the `three` package already in `package.json`.

The alternative — the `postprocessing` library — merges passes into one shader
and would be measurably faster. It was rejected because it is a new runtime
dependency that carries its own copy of the tone-mapping and colour-space logic
and has to be re-qualified on every three.js upgrade. At five passes the ping-
pong cost is two or three full-screen blits, which is small next to the AO
prepass.

| Order | Pass | Purpose | Notes |
| --- | --- | --- | --- |
| 1 | `RenderPass` | scene → half-float linear HDR | three disables tone mapping when the destination is a render target, so this buffer is scene-referred |
| 2 | `GTAOPass` | ground-truth AO, radius 0.55 m, blend 0.72 | needs linear radiance and real depth, so it precedes everything |
| 3 | `UnrealBloomPass` | strength 0.24, threshold 1.05 | threshold above 1 means only genuinely over-white pixels bloom |
| 4 | `OutputPass` | AgX tone map + linear → sRGB | reads `renderer.toneMapping` |
| 5 | `ShaderPass(GradeShader)` | hue-weighted re-saturation + vignette | display-referred, i.e. after the transform whose rolloff it answers |
| 6 | `SMAAPass` | anti-aliasing | last: morphological AA reads perceptual edges, so it must see final contrast |

### Why tone mapping is back, and why the docs are being overturned

`docs/ART_DIRECTION.md` banned tone mapping because ACES rolls ready-wheat gold
towards white and ripe-pumpkin orange towards brown, and those hues are gameplay
signals. That objection was right about ACES and wrong about tone mapping.

Two things answer it:

1. **AgX rather than ACES.** AgX keeps hue far closer to its input as luminance
   rises. ACES pulls saturated oranges toward yellow near white and no grade
   fully undoes that.
2. **A grade that pays the chroma back, weighted by hue.** `GradeShader`
   computes two weights per pixel:

   ```
   warmth = (r - max(g, b)) / peak     gold, orange, terracotta soil
   growth = (g - max(r, b)) / peak     young crop green, pasture
   ```

   and applies `saturation + warmGain·warmth + growthGain·growth`. A ready wheat
   plot gets most of the boost; sky, shadow and grey timber get almost none and
   keep their tone-mapped neutrality.

If a future change makes crops read as muddy, the first thing to check is
`warmGain`, not the crop's albedo.

## Sky, sun and atmosphere

`SkyRig` owns three things that are one physical fact:

1. A Preetham dome (`three/addons/objects/Sky.js`) drawn as the background.
2. A PMREM convolution of that dome, used as `scene.environment`. Regenerated
   only when the sun moves, because the convolution is a chain of render passes.
3. The sun as direction + colour + intensity, so the sun that lights the world
   is provably the sun the sky drew.

The fog colour is **sampled from the dome**, not chosen: `SkyRig` renders two
4×4 views (horizon along the sun's bearing, and zenith) into a float target and
averages them. That is what makes aerial perspective agree with the sky by
construction rather than by someone remembering to update a hex value.

`FogExp2` rather than linear `Fog`: exponential-squared puts most of the fade in
the far half of the frame, where atmosphere actually lives. Linear fog fading
from 42 m is what produced the flat horizon band the pipeline was asked to fix.

## Soft shadows

Ultra replaces the fixed-radius shadow filter with PCSS: a 16-tap blocker search
followed by a 16-tap Vogel-disk PCF whose radius is the estimated penumbra.

- `renderer.shadowMap.type = THREE.BasicShadowMap`, then
  `installPcssShadows()` rewrites the "basic" branch of
  `THREE.ShaderChunk.shadowmap_pars_fragment`. The PCF branch binds the map as a
  `sampler2DShadow`, which can only be read through a hardware depth comparison;
  a blocker search needs the raw depth, and only the basic path exposes it.
- The patch is global but installed only from `RenderPipeline.init()`, which
  only runs on Ultra, and `restorePcssShadows()` puts the original string back.
- `light.shadow.radius` carries
  `frustumDepth · tan(sunAngularSize) / frustumWidth`. Nothing is hard-coded in
  the GLSL, so changing `shadowExtent` in a quality profile does not require
  editing a shader.
- The cascade is fitted: 4096 texels over 96 m (≈ 43 texels/m), centred on the
  player and snapped to whole texels so the edges do not crawl.
- `installPcssShadows()` returns `false` and logs if the upstream chunk has
  drifted. A three.js upgrade should downgrade shadow quality, not produce a
  scene of shader-compile failures.

## Review and tuning

The pipeline is graded from screenshots of the shipping renderer — see
`tools/review/README.md`. Two query parameters exist for that loop:

```
?quality=ultra&render=exposure:0.55,env:0.3,ao:0.9,sat:1.1,warm:0.7
?quality=ultra&off=ao,bloom          # bisect a pass
?quality=ultra&on=vignette
```

`render` keys: `exposure`, `env`, `ao`, `bloom`, `fog`, `sat`, `warm`, `growth`,
`contrast`, `vignette`, `sun`, `azimuth`, `turbidity`.
`off`/`on` names: `sky`, `environmentMap`, `aerialFog`, `softShadows`, `ao`,
`smaa`, `bloom`, `grade`, `vignette`.

Unknown keys and unparseable numbers are ignored, so a typo in a capture script
costs one wrong screenshot rather than a black page.

Review shots live in `art/review/pipeline/`.

## Known weaknesses

Read these before blaming your own layer for them.

- **The fitted cascade drops distant shadows.** Anything more than ~48 m from
  the player casts nothing. At the gameplay camera those objects are already
  behind fog, but a wide establishing shot will show it. A second, coarse
  cascade is the fix and is not implemented.
- **PCSS is 32 taps.** It is a real cost on integrated GPUs. The tier gate is
  the only mitigation; there is no per-object quality reduction.
- **AO is screen-space.** It cannot occlude anything off screen, and it thins
  visibly at grazing angles on the ground plane.
- **Bloom is full-resolution UnrealBloom.** Cheaper than it looks but not free,
  and it has no dirt mask or lens model.
- **No depth of field.** It was scoped and dropped; at this camera distance it
  mostly blurred the parts of the farm the player is trying to read.
- **No TAA.** SMAA fixes edges but not shimmer on high-frequency geometry such
  as grass tufts and fence wire. TAA in three re-renders the scene several times
  per frame and was not affordable.
- **One shared material for all authored art.** `ModelLibrary` exposes a single
  vertex-colour `MeshStandardMaterial`, so crops, buildings, characters and
  animals all receive the neutral `structure` treatment. Per-role treatment for
  authored art needs the material split first — a prerequisite for the texture
  and vegetation work, not something the pipeline can fix alone.
