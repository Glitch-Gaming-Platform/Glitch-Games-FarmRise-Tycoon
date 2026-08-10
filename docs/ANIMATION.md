# Animation and motion

FarmRise animation is a layered presentation system. The simulation owns only state such as player
position, activity, animals and water infrastructure; the render views turn that state into motion
with transforms, shader deformation and small instanced effects.

The visual target is the lively, readable motion of a stylised farming game, not motion-capture
realism. Every moving layer must remain legible at the 20 m gameplay camera and must preserve the
WebGL instancing budget.

## Current movement coverage

| Category | Current implementation | Runtime owner |
| --- | --- | --- |
| Character locomotion | Independent virtual-rig leg and arm swing, torso twist, walk/run cadence, lean, squash, contact-shadow pulse and foot dust | `PlayerController`, `PlayerView`, `animationMaterials.ts` |
| Character idle | Breathing, weight shift, hat/hair lag and satchel secondary motion | `PlayerView`, `animationMaterials.ts` |
| Work actions | Distinct one-shot planting crouch/seed press, tending pour/sway and harvest pull/recoil, each with palette-matched particles | `Player`, `PlayerView`, `PlayerActionEffects` |
| Chicken movement | Deterministic wandering, heading, step bob, squash and intermittent pecking; purchase and produce events trigger flock-wide introduction/hop beats | `FarmView` |
| Fox movement | Faces actual travel direction, with gait bob and speed-driven lean/stretch; raiding adds a repeated pounce and a successful scare triggers a player shoo gesture | `FarmView`, `PlayerView` |
| Crops and field dressing | Height-weighted gusts with per-instance phase; crop stage changes use a rooted overshoot and drought/disease visibly wilt and tint the plant | `PlotView`, `FarmView`, `animationMaterials.ts` |
| Trees | Slower, broader canopy and branch sway, phased per instance | `FarmView`, `StructureView`, `animationMaterials.ts` |
| Standing water | Two-frequency surface displacement and scrolling colour bands in troughs and irrigation basins | `StructureView`, `animationMaterials.ts` |
| Running water | Visible animated stream with faster directional bands on completed irrigation structures | `StructureView`, `animationMaterials.ts` |
| Construction | A ghosted structure rises with real build progress, pulses while active and settles with a completion pop | `StructureView` |
| Drought | Warning/impact warms the sun and ground bounce; target crop state drives wilt, lean and diseased-palette tint | `FarmView`, `PlotView` |
| VFX | Pooled instanced foot/work dust plus one pooled multicolour draw for seed, water and harvest particles | `PlayerView`, `PlayerActionEffects` |

There is currently no dialogue, close-up conversation camera, drivable vehicle, cloth garment or
mechanical gameplay prop. Facial lip sync, vehicle suspension and mechanical articulation would be
false complexity until those features exist. When one is added, its motion belongs in this audit
before it is considered complete.

## Action-to-animation audit

This table is the result of the second full gameplay verb audit. “Prepared” means the simulation
state has presentation, even though the command has no player-facing UI in the current bootstrap.

| Action or state change | Visual response | Audit result |
| --- | --- | --- |
| Idle / walk / sprint / stop | Breathing, start-free continuous gait, speed-scaled stride, lean, squash, contact pulse and dust | Covered |
| Plant | Downward crouch/press, seed particles and crop emergence pop | Covered |
| Tend / water | Side-to-side pour gesture, blue falling droplets and crop stress recovery on the next frame | Covered |
| Harvest | Strong pull/recoil, green/gold/orange burst and crop removal | Covered |
| Crop growth stage changes | Rooted scale overshoot instead of a hard mesh pop | Covered |
| Drought warning and impact | Lighting transition plus targeted wilt/tint/lean | Covered |
| Fox approach / raid / flee | Travel gait, raid pounce, faster flee posture and player shoo response | Covered |
| Chicken purchase / production | Flock introduction scale and production hop; normal wander/peck continues | Covered, but no egg prop yet |
| Build selection and positioning | A pulsing translucent footprint follows the pointer, green where buildable and red where blocked, with a banner naming the cancel key | Covered |
| Building placed / constructing / completed | Ghost pulse, progress rise and completion pop | Covered; the build panel now drives it |
| Irrigation active | Basin ripples and a directional running stream | Covered |
| Crop selection / pause / resume | HUD/menu transition and audio, deliberately no world locomotion | Appropriate UI-only feedback |
| Onboarding beat / hint | Coach mark slides in, one at a time, never modal; HUD elements fade in as they are revealed | Covered |
| Run success / failure | Outcome screen with run summary and a distinct sting | Covered in UI; no world-space celebration |
| Spot sale / contract / land purchase | Market and reinvest panels animate in, HUD money updates, payout-tier audio fires, objective meter fills | Covered in UI; **no world-space beat yet** — a sale is still invisible out in the field |
| Paid event prevention | `F` during the warning window; HUD shows the cost, audio confirms, warning label clears | Partly covered; **no world-space activation beat** — the farm looks identical before and after paying |
| Storage overflow | HUD/audio warning; generic harvest burst still plays | Remaining gap: no spill-specific world VFX |
| Successful fox theft | Raid pounce and loss audio, then the fox is removed | Remaining gap: no carry/escape beat before removal |

The BlenderMCP source audit found **zero armatures, zero action clips, zero shape-key meshes and zero
animated objects** in `farmrise_assets.blend`. The farmer is one unparented mesh with no modifiers.
The runtime virtual rig is therefore using all available authored data; there is no dormant Blender
animation to connect.

## Render pipeline

```text
fixed simulation state
        ↓
PlayerController / FarmWorld / EnemyDirector
        ↓
RenderContext { deltaSeconds, alpha, elapsedSeconds }
        ↓
object transforms ── shader deformation ── instanced VFX
        ↓
RendererSystem
```

- Simulation remains fixed at 60 Hz and deterministic.
- Cosmetic animation uses `elapsedSeconds` during variable-rate rendering.
- `alpha` offsets the character cadence so high-refresh displays do not show repeated poses.
- Wind and character materials use `onBeforeCompile`; the authored vertex colours and one-material
  asset pipeline remain intact.
- Repeated crops, dressing and chickens stay instanced. Animation changes matrices or shader
  uniforms instead of creating one draw call per object.
- Dust uses a fixed pool of 22 instances and never allocates particles during a frame.

## Motion design rules

1. **Movement must communicate state.** Sprint cadence is faster and stronger than walking; fox
   posture reflects travel; work motion is distinct from idle.
2. **Roots and contact points stay believable.** Wind strength is height weighted, water remains
   inside its container and the player contact mark pulses instead of sliding.
3. **Use secondary motion.** Hat/hair, satchel, torso, dust and squash trail the primary action.
4. **Keep the camera calm.** This game uses object motion rather than constant camera shake. Strong
   camera vibration would hurt tile planning and motion accessibility at this framing.
5. **Do not break instancing for animation.** Prefer per-instance phase derived from
   `instanceMatrix`, dynamic instance transforms or one shared time uniform.
6. **No gameplay decisions in shaders.** Shaders may present state but never decide speed, reach,
   growth, yields or collisions.
7. **Animated contact must share one path.** Chicken rendering and collision both evaluate the same
   deterministic `chickenPose` function from simulation time. This prevents an invisible collider
   from lagging behind a visible animal while preserving one instanced draw call for the flock.

## Verification

- `apps/game/tests/unit/playerAnimation.test.ts` verifies idle, walk, sprint and work state.
- `apps/game/tests/unit/animationMaterials.test.ts` verifies wind, character and water shader hooks
  plus their time/motion uniforms without stubbing WebGL.
- `apps/game/tests/unit/plotVisuals.test.ts` verifies crop stage overshoot and drought/disease stress.
- `apps/game/tests/unit/worldAnimation.test.ts` verifies construction progress/completion, drought
  lighting and the raid-pounce silhouette.
- `apps/game/tests/unit/chickenMotion.test.ts` samples every supported flock lane over 30 seconds and
  verifies each full chicken radius stays clear of the coop and trough collision proxies.
- `apps/game/tests/integration/sessionLoop.test.ts` drives the full loop headlessly, so animation
  triggers (placement, sale, prevention, outcome) are all exercised as real state changes.
- `tests/e2e/slice.spec.ts` verifies the placement preview appears and clears, and that the coach
  mark never blocks the world behind it.
- `tests/e2e/animation.spec.ts` runs desktop Chromium, mobile Chromium, Firefox and WebKit; it checks
  that the farm canvas changes across frames while draw calls stay constant, holds Shift+W to
  exercise sprint locomotion, and performs a real planting action through its pose, particles and
  crop pop.
- A live starter review measured 36 draw calls and 72,694 rendered triangles. A terrain-only
  pair 850 ms apart changed 8.6% of pixels, confirming visible environmental motion.

Those numbers are a regression reference from one development machine, not a universal frame-rate
guarantee.

## Remaining path to the 9.8 target

The procedural pass gives every currently present moving category a deliberate animation layer, but
a strict 9.8/10 claim is not yet defensible. The largest remaining visual gains require authored
craft rather than more generic oscillation:

1. A true skeletal farmer rig with authored starts, stops, turns and distinct plant/tend/harvest
   clips, plus hand and foot IK.
2. Hand-authored animal gait cycles with foot planting rather than whole-mesh squash and bob.
3. Art-directed surface-specific splashes, overflow spills and a fox carry/escape beat tied to exact
   contacts. Plant/tend/harvest and drought now have distinct procedural presentation.
5. **World-space beats for the newly playable economy actions.** Selling, paying for prevention and
   buying the parcel are currently UI-and-audio only. A sale that produces nothing visible out in the
   field is the largest new gap this pass introduced: the actions became playable before they became
   watchable.
4. A close-up facial rig only when dialogue or portrait cameras become part of the game.

Motion matching, performance capture and vehicle systems are not justified for the current camera,
scope or asset set.
