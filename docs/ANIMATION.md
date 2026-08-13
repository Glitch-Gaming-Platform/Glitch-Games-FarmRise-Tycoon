# Animation and motion

FarmRise animation is a layered presentation system. The simulation owns only state such as player
position, activity, animals and water infrastructure; the render views turn that state into motion.

The player character is driven by a **real skeleton with authored pose clips**. Everything else -
crops, trees, water, animals - is driven by vertex shaders, because those assets are instanced in
their hundreds and a skeleton per instance would be absurd.

The visual target is the lively, readable motion of a stylised farming game, not motion-capture
realism. Every moving layer must remain legible at the gameplay camera and must preserve the WebGL
instancing budget.

## The character rig

`apps/game/src/game/player/rig/` contains the whole system. It replaced a vertex shader that
evaluated `sin(uMotionTime * (7.4 + locomotion * 2.2))` against region masks built from
`position.y`. That approach had three defects that tuning could not remove:

| Defect | Why it was structural | What replaced it |
| --- | --- | --- |
| Wobble on every speed change | Phase was **time multiplied by a frequency that varies**. Changing the frequency retroactively rescaled all accumulated phase, so the pose jumped. The error grew with session length. | Phase is **integrated**: `phase += cadence * dt`. Changing cadence changes the derivative and nothing else. |
| Feet skating | Leg swing was a fixed-amplitude sine unrelated to ground speed. | Cadence is derived from **distance travelled** divided by a stride length **measured from the pose keys**, then an explicit foot-lock IK pins the stance ankle to where it planted. |
| Body deforming as one mesh | `smoothstep(0.50, 0.62, position.y)` blends a rotation across a 12 cm band, so the pelvis stretched instead of the hip bending. | 25 bones with capsule-distance skin weights computed at load time. Joints articulate; they no longer smear. |

### Bones and binding

- `skeletonDefinition.ts` - 25 bones (spine x4, head/neck, two arms x4, two legs x4, ponytail,
  satchel and rigid diagonal strap), positioned from
  the literal coordinates in `tools/blender/assets.py`. No armature is authored in Blender and no
  skinned glTF is exported; the farmer ships as the same single static mesh it always did.
- `autoSkin.ts` - each bone owns a capsule; weight falls off with the cube of distance to the
  segment, scaled by a per-bone `priority`. Four influences per vertex, normalised. Two rules earn
  their keep: **side gating** (a left-arm bone may not claim right-side vertices, or the hands tear
  toward the opposite elbow as the arms pass), **priority** (`hips` has a 0.40 m capsule so it can
  catch accessories, but loses to any limb that actually contains the vertex), and rigid spatial /
  vertex-colour binding for the disconnected satchel and strap islands. The rigid exception prevents
  those boxes stretching into triangles during broad harvest and scare gestures.
- The player is one object, so `THREE.SkinnedMesh` costs exactly the draw call the old `THREE.Mesh`
  did. The readability outline shares the same skeleton, so it deforms identically.

### Clips

`poseClips.ts` holds keyframes, not oscillators. Walk and run are cycles; plant, tend, harvest and
wave are one-shots. Transfer reuses the grounded plant body arc without its trowel, animal handling
uses the wave/shoo gesture, and repair reuses the tend body arc without its watering can. Only the left side of each gait is authored - `sampleGait` reads the clip a half
cycle later and mirrors it. Interpolation is Catmull-Rom so velocity is continuous through keys
while the curve still passes exactly through every authored pose.

The walk follows a real gait structure: heel strike, loading response (a fast knee dip immediately
after an extreme - the beat a sine cannot express), midstance, terminal stance, toe-off, then a swing
whose knee bends far harder than anything in stance. The forward thigh excursion and visual stride
warp are deliberately capped so the short-legged farmer does not goose-step at arcade movement speed.
The harvest spends 30% of its length winding up
and 10% striking; that asymmetry is what reads as effort.

**The walk excursion is rear-heavy on purpose.** The first version of the table reached +0.31 rad in
front of the hip and only -0.26 rad behind it, and that one inversion caused both of the defects the
second animation audit found. A leg thrown forward of the body is the goose-step silhouette, so the
walk read as kicking its feet out in front; and because stride is measured across *stance*, which is
the trailing half of the cycle, a forward-biased clip is also a short one - which then forced the
runtime to warp the stride harder to chase the ground, magnifying the kick it was compensating for.
The keys now run +0.30 front to -0.50 back, and the fix moved both numbers at once: measured stride
went from 0.226 m to 0.258 m, and peak hip flexion at walking speed fell from 0.71 rad to 0.33.

The ceiling on that is geometric, not artistic. Keeping the ankle within the 0.035 m planted band on
a 0.385 m leg limits the half-angle to 0.43 rad, so **0.32 m is the longest stride this character can
take with the foot genuinely flat on the ground.** A longer authored step would be a raised heel
pretending to be contact.

### Stride, cadence, and an honest limitation

`measureStrideLength` runs forward kinematics over the walk keys and reports how far the body must
travel per cycle for the stance foot to stay put - about **0.23 m**. Deriving it rather than
hard-coding it means editing the pose table cannot silently desynchronise the feet.

There is a scale conflict this rig cannot dissolve, and it is stated here rather than hidden:

- The farmer is 1.60 m tall with **0.385 m legs**.
- The player's walk speed is **2.1252 m/s**, and sprint multiplies it by 2.45 to
  **5.20674 m/s**.
- Tying cadence strictly to distance still exceeds the short-legged walk's 2.9-cycle/s safety cap,
  but the mismatch is now a fraction of the original 6.5/10.4 m/s arcade tuning.

The rest of the codebase already assumes an arcade stride - `PlayerController` fires a footstep every
1.35 m, several times what this character's legs can cover. So cadence is capped (2.7 cycles/s
walking, 3.0 running). `CharacterRig.strideScale` reports the full uncovered distance mismatch, but
the visible pose applies only a capped 1.3x leg / 1.2x arm exaggeration. This preserves readable
speed without recreating the excessive forward shoe kick found in the actor audit.

Swing widening is **split fore and aft**: rearward swing scales to 1.3x but forward swing only to
1.1x. Scaling a leg angle uniformly widens the stride in both directions, and half of that widening
lands in front of the hip where it reads as a kick. Real fast walking lengthens almost entirely
behind the body, so biasing the two directions apart buys the same apparent stride for a third of the
forward excursion.

**Below the cap the feet are genuinely planted** - the unit test measures under 12 mm of slip per
frame. Above it they slide, deliberately. Closing that gap is a gameplay decision (halving player
speed), not a rendering one, and the renderer should not make it unilaterally.

### The walk/run blend window is anchored to the two speeds the game can produce

`Player.walkSpeed` is 2.1252 m/s and `sprintMultiplier` is 2.45, so the two steady-state speeds are
2.1252 and 5.20674 m/s. The blend thresholds derive from those defaults rather than hard-coded legacy
numbers: held W remains pure WALK, Shift+W reaches pure RUN, and only acceleration crosses the blend.
This prevents an ordinary walk from silently becoming the forward-heavier run clip.

### Why the legs vibrated, and why the foot lock now fades

The jitter was the foot lock, and it had a cause and an aggravator.

The cause was a unit mismatch that looked correct. The lock advanced its IK target by **real ground
distance**, `speed * dt` - 0.108 m in a 60 Hz frame at the former 6.5 m/s tuning. But cadence was
capped, so the *pose* only advanced about 0.010 m of authored stride in that same frame. The solver was therefore dragging
its target backwards ten times faster than the clip moved the leg: one frame of violent correction,
then the target left the leg's reach, `solveTwoBone` clamped, and the lock released. The next frame
it re-planted and did it again. Sixty times a second, that is a vibration. The lock now derives its
distance from cadence (`cadence * dt * stride * legScale`), which **below the cadence cap is exactly
`speed * dt`** - so honest-speed planting is unchanged - and above it stays consistent with the pose
it is correcting.

The aggravator was a single plant/release threshold, so the foot state flipped on consecutive frames
whenever clearance sat on the boundary. Planting and releasing now happen at different heights
(0.035 m and 0.055 m), and a released lock ramps out over 0.09 s rather than dropping two joint
angles to their clip values in one frame.

Underneath both is a design point worth stating: **the lock's authority fades as `strideScale` rises,
reaching zero at 1.9.** The lock exists to remove the last centimetre of slip from a gait that
genuinely covers the ground. Once cadence saturates the gait no longer does, and a lock is then
solving for a ground contact that is not happening - every correction it applies is a pose the clip
was never authored to hit. That could not be fixed by feeding the solver better numbers, because
there is no honest answer to give it. Above the cap the authored clip now plays untouched, which is
smooth by construction.

### Tool orientation is derived from the mesh, never guessed

Tools are authored in `assets.py` in whatever local orientation was convenient to build, and the
glTF Y-up conversion maps Blender `(x, y, z)` to Three.js `(x, z, -y)`. The watering can is built
with its spout along Blender +X, so it arrives in the engine with the spout along local **+X** —
while the farmer faces **+Z**. A can placed at its authored orientation therefore pours sideways out
of the right hip, which is exactly what shipped: the pose yawed it by 0.1 rad, about six degrees, and
every other watering number was then tuned around that mistake. The stream and splash sat off to the
farmer's side because that genuinely was where the water would have come out.

The rule that prevents a repeat: **anything attached to a tool is transformed through that tool's
matrix, not placed with a literal beside it.** The spout tip, the hand grip and the off-hand support
are all constants in the can's own space, measured off the built mesh, and pushed through
`Mesh.matrix` each frame. The stream then spans spout-to-ground rather than taking an authored
length, so it cannot hang in the air or punch through the soil at any tilt. Three independent sets of
literals that had to agree with each other became one source and three derivations.

Two things this immediately surfaced, both invisible while the can lay across the body:

- The pour tilt was 1.10 rad. On the wrong axis it merely rolled the can about its own spout; on the
  right one it tipped the rose to 0.26 m off the ground. It is now 0.73 rad.
- The can is 0.82 m from handle to rose. At the 1.1 scale the other tools use, that is 0.90 m on a
  1.60 m farmer — over half their height, and it read as a barrel once the full length was visible in
  silhouette. It is now 0.9.

`art/review/tool_watering_pose_AFTER.png` is the check, and it is deliberately not a side view only:
sideways-versus-forward is the one error a side-on gait camera cannot show. The sheet includes a
top-down frame with a marker on the farmer's facing axis, which is what actually confirms the spout
is aimed down it.

### IK

`ikSolver.ts` is a closed-form two-link solver - one law-of-cosines call, no iteration count to
degrade under load. It is used for the stance foot lock and for tool contact. Tools are posed on
their own authored arcs and the **arm is solved to the grip the tool is at**, rather than hoping two
independent animations agree. That inversion is what makes the farmer hold the sickle instead of
swinging beside it. Watering adds a second left-hand solve so the can is steadied with both hands.

### Verifying poses in Blender

`tools/blender/rig_preview.py` parses `skeletonDefinition.ts` and `poseClips.ts` directly, builds a
matching armature over the exported farmer, binds it with **the same capsule weighting the runtime
uses**, and renders pose sheets to `art/review/rig_*_cycle.png`. The preview converts all three
Three.js rotation axes through each Blender bone's rest basis; locomotion is judged side-on and the
two-handed scare gesture uses a three-quarter camera.

Binding with Blender's automatic weights was tried first and was actively misleading: bone heat needs
a connected manifold, this farmer is a pile of disconnected primitives, and the resulting sheet
showed boots flying off legs that were fine. A preview that binds differently from the game reports
failures the player will never see and hides ones they will.

That sheet also caught a real modelling defect: the boot topped out at 0.161 m while the shin ended
at 0.18 m, leaving a two-centimetre gap. Invisible in a static render, glaring the moment the leg was
posed. The primitives now overlap.

## Current movement coverage

| Category | Current implementation | Runtime owner |
| --- | --- | --- |
| Character locomotion | Skeletal walk and run clips, distance-driven cadence, foot-lock IK, turn bank, contact-shadow pulse and foot dust | `CharacterRig`, `poseClips.ts`, `PlayerView` |
| Character idle | Authored breathing and weight-shift clip on its own slow clock, blended out by speed | `CharacterRig`, `poseClips.ts` |
| Work actions | Distinct anticipation/contact/follow-through beats: planting crouch/press, watering pour, harvest pull/recoil, tool-free pickup/deposit transfer, shooing animals and tool-free repair. Farm particles begin on authored tool-contact beats rather than during anticipation. | `Player`, `PlayerView`, `PlayerToolView`, `PlayerActionEffects` |
| Chicken movement | Deterministic wandering with the authored +Z beak aligned to the obstacle-adjusted path tangent, plus a 62%-stance gait, impact-timed squash and head bobbing (the head holds in world space while the body walks under it) | `chickenMotion.ts`, `animationMaterials.ts` |
| Cow movement | Deterministic walk/graze/rest states, four-beat leg gait, body compression, isolated head-lowering graze, tail swish and ear flick | `cowMotion.ts`, `animationMaterials.ts` |
| Sheep movement | Deterministic walk/graze/rest states, diagonal-pair gait, fleece compression, head-lowering graze, short-tail flick and ear motion | `sheepMotion.ts`, `SheepView.ts`, `animationMaterials.ts` |
| Dog movement | Deterministic shelter patrol/rest states, diagonal-pair gait, alert head lift, independent ears and faster tail wag while guarding | `dogMotion.ts`, `DogView.ts`, `animationMaterials.ts` |
| Fox movement | Diagonal-pair trot with a 55% stance, spine flex twice per cycle, tail swish; raiding adds a pounce and a successful scare triggers a player wave clip | `FarmView`, `animationMaterials.ts` |
| Crops and field dressing | Height-weighted gusts with per-instance phase; all sixteen crops have species-height wind profiles, crop stage changes use a rooted overshoot, and drought/disease visibly wilt and tint the plant | `PlotView`, `FarmView`, `animationMaterials.ts` |
| Terrain dressing and access | Meadow carpets, tufts, flowers and bushes use rooted gusts; parcel gates open as physical paired leaves; road, tilled-soil, grass and scrub contact dust differ in colour, height, spread and lifetime | `FarmView`, `ParcelView`, `PlayerView`, `terrainContact.ts` |
| Trees | Living eucalyptus use cantilever bending (deflection grows with the square of height), per-branch phase, torsion and tip flutter; dead trees use a separate restrained wind material | `FarmView`, `StructureView`, `animationMaterials.ts` |
| Standing water | Two-frequency surface displacement and scrolling colour bands in troughs and irrigation basins | `StructureView`, `animationMaterials.ts` |
| Running water | Visible animated stream with faster directional bands on completed irrigation structures | `StructureView`, `animationMaterials.ts` |
| Buildings | A ghosted structure rises with real build progress beneath a camera-facing percentage/time bar, then pulses and settles with completion dust. Operational state drives mill wheels, cold-store/creamery fans, well cranks, processor steam and irrigation flow; broken buildings stop their mechanisms and shake | `StructureView`, `ConstructionProgressView` |
| Drought | Warning/impact warms the sun and ground bounce; target crop state drives wilt, lean and diseased-palette tint | `FarmView`, `PlotView` |
| VFX | Pooled instanced foot/work dust plus one pooled multicolour draw for seed, water and harvest particles | `PlayerView`, `PlayerActionEffects` |

There is currently no dialogue, close-up conversation camera, drivable vehicle or cloth garment.
The mechanical gameplay props that do exist are deliberately simple building mechanisms and are
covered above. Facial lip sync, vehicle suspension and machinery-grade rigging would be false
complexity until those features exist. When one is added, its motion belongs in this audit before it
is considered complete.

## Action-to-animation audit

This table is the result of the second full gameplay verb audit. “Prepared” means the simulation
state has presentation, even though the command has no player-facing UI in the current bootstrap.

| Action or state change | Visual response | Audit result |
| --- | --- | --- |
| Idle / walk / sprint / stop | Breathing, start-free continuous gait, speed-scaled stride, lean, squash, contact pulse and dust | Covered |
| Plant | Downward crouch/press, contact-timed seed particles and crop emergence pop | Covered |
| Tend / water | Two-handed sustained pour with the spout aimed down the farmer's facing axis; stream, five falling droplets, contact ripple and crop stress recovery all derived from the spout's own transform | Covered |
| Harvest | Elbow-led sickle swing, readable unlit tool colours, gold arc, pull/recoil, contact-timed crop burst and crop removal | Covered |
| Pick up / put down | Grounded reach-and-transfer gesture with no sickle or harvest arc; carried and ground crates update at contact | Covered |
| Drive animals in | Two-handed shoo gesture at the shelter; completed response sets the targeted group sheltered | Covered |
| Repair | Tool-free repair body arc at the targeted machine or structure | Covered |
| Crop growth stage changes | Rooted scale overshoot instead of a hard mesh pop | Covered |
| Drought warning and impact | Lighting transition plus targeted wilt/tint/lean | Covered |
| Fox approach / raid / flee | Travel gait, raid pounce, faster flee posture and player shoo response | Covered |
| Chicken purchase / production | Flock introduction scale and production hop; deterministic walk/rest/peck cycles continue with collision using the same path; eggs appear in a pale basket in front of the shelter | Covered |
| Sheep purchase / wool production | Flock introduction scale and wool-production recoil; deterministic walk/graze/rest cycles continue with collision using the same path; wool enters normal site storage and market presentation | Covered |
| Build selection and positioning | A pulsing translucent footprint follows the pointer, green where buildable and red where blocked, with a banner naming the cancel key | Covered |
| Building placed / constructing / completed | Ghost pulse, progress rise, overhead progress/time bar, delayed mechanism reveal, completion pop and dust | Covered |
| Building idle / busy / broken | State-dependent wheel/fan/crank/steam motion; broken mechanisms stop and the structure shakes | Covered |
| Irrigation active / broken | Basin ripples and a directional running stream; flow stops when broken | Covered |
| Crop selection / pause / resume | HUD/menu transition and audio, deliberately no world locomotion | Appropriate UI-only feedback |
| Onboarding beat / hint | Coach mark slides in, one at a time, never modal; HUD elements fade in as they are revealed | Covered |
| Run success / failure | Outcome screen with run summary and a distinct sting | Covered in UI; no world-space celebration |
| Spot sale / contract / land purchase | Market and reinvest panels animate in, HUD money updates, payout-tier audio fires, objective meter fills | Covered in UI; **no world-space beat yet** — a sale is still invisible out in the field |
| Paid event prevention | `F` during the warning window; HUD shows the cost, audio confirms, warning label clears | Partly covered; **no world-space activation beat** — the farm looks identical before and after paying |
| Storage overflow | HUD/audio warning; generic harvest burst still plays | Remaining gap: no spill-specific world VFX |
| Successful fox theft | Raid pounce and loss audio, then the fox is removed | Remaining gap: no carry/escape beat before removal |

`farmrise_assets.blend` still contains zero armatures and zero action clips: the skeleton is defined
in TypeScript and built at load time, so the art pipeline stays "one static mesh per asset" and the
GLB payload is unchanged. `tools/blender/rig_preview.py` reconstructs an armature from the TypeScript
definitions only to render review sheets; it is never exported.

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
7. **Animated contact must share one path.** Chicken and sheep rendering/collision both evaluate their
   species' deterministic pose function from simulation time. This prevents an invisible collider
   from lagging behind a visible animal while preserving one instanced draw call per visible species.

## Verification

- `apps/game/tests/unit/playerAnimation.test.ts` verifies idle, walk, sprint and work state, plus that
  the watering can's spout is aimed along the farmer's facing axis rather than across their body and
  that the stream terminates at the rose and the ground ring. Both were watched failing against the
  shipped sideways pose (forward component 0.16 against the 0.6 required).
- `apps/game/tests/unit/characterRig.test.ts` verifies compact forward foot excursion, gait continuity,
  foot lock, root arcs, two-handed scare motion and rigid accessory binding. Two guards were added
  after the second locomotion audit and both were watched failing against the exact defect they
  describe: one bounds peak hip flexion and forward ankle reach at the shipping walk/sprint speeds,
  while retaining 6.5 m/s as a legacy saturation stress case; the other bounds per-frame angular
  *acceleration* and direction reversals across shipping and legacy speeds. Acceleration is
  the right measure for jitter: a smooth cycle keeps frame-to-frame velocity change small however
  fast it runs, while one snapped IK correction spikes it.
- `apps/game/tests/unit/animationMaterials.test.ts` verifies wind, character and water shader hooks
  plus their time/motion uniforms without stubbing WebGL.
- `apps/game/tests/unit/sheepMotion.test.ts` verifies deterministic state, stationary grazing,
  tangent-facing travel and purchase-introduction timing for the sheep's shared render/collision pose.
- `apps/game/tests/unit/plotVisuals.test.ts` verifies crop stage overshoot and drought/disease stress.
- `apps/game/tests/unit/worldAnimation.test.ts` verifies construction progress/time presentation and completion,
  building idle/busy/broken mechanism motion, drought lighting and the raid-pounce silhouette.
- `apps/game/tests/unit/terrainContact.test.ts` verifies distinct road, tilled-soil, grass and scrub
  contact profiles; `groundGeometry.test.ts` verifies texture normals never displace the collision land.
- `apps/game/tests/unit/chickenMotion.test.ts` samples every supported flock lane over 30 seconds,
  verifies each full chicken radius stays clear of the coop and trough collision proxies, and checks
  that the authored +Z beak stays aligned with actual travel through the adjusted path.
- `apps/game/tests/unit/cowMotion.test.ts` verifies deterministic walk/graze/rest transitions and
  that grazing holds position instead of moonwalking through the lowered-head pose.
- `apps/game/tests/integration/sessionLoop.test.ts` drives the full loop headlessly, so animation
  triggers (placement, sale, prevention, outcome) are all exercised as real state changes.
- `tests/e2e/slice.spec.ts` verifies the placement preview appears and clears, and that the coach
  mark never blocks the world behind it.
- `tests/e2e/animation.spec.ts` runs desktop Chromium, Firefox and WebKit; mobile-specific rendering
  and controls are covered by `mobile.spec.ts`. The animation spec checks
  that the farm canvas changes across frames while draw calls stay constant, holds Shift+W to
  exercise sprint locomotion, holds W alone to exercise the plain walk, and performs a real planting
  action through its pose, particles and crop pop. The unsprinted walk was added because every
  locomotion spec previously held Shift, so with the old blend window walking and sprinting drove
  nearly the same pose and the browser suite could not have told them apart.
- A physical iPhone starter review of the current progression build measured 91 draws and 222,856
  rendered triangles; exercised work/placement states reached 100 draws and about 225k triangles. A
  terrain-only pair 850 ms apart changed 8.6% of pixels, confirming visible environmental motion.

Those numbers are a regression reference from one development machine, not a universal frame-rate
guarantee.

## Remaining path to the 9.8 target

The current pass gives every present moving category a deliberate animation layer, including the
skeletal farmer rig, authored work clips, hand/foot IK, asymmetric animal gait curves,
species-specific crop wind, living/dead tree wind and operational building mechanisms. A strict
whole-game 9.8/10 claim is still not defensible because the remaining gains require
new contact art or gameplay decisions rather than another generic motion system:

1. **Track the intentional locomotion-scale compromise.** The final 2.1252 m/s walk and 5.20674 m/s
   sprint are far closer to the chibi legs' reach than the former 6.5/10.4 m/s arcade speeds, but
   sprint still exceeds what the short legs can plant with zero slip. The rig caps cadence and
   stride-warps instead of strobing. The second audit pass took the rendering side of this as far as it goes: the walk
   clip now covers 0.258 m of the 0.32 m its legs geometrically allow, the blend window and the swing
   bias stop the shortfall being paid for with a forward kick, and the foot lock stands down rather
   than fighting a contact that is not happening. What remains is genuinely the gameplay number.
2. Surface-specific **footstep audio**, overflow spills and a fox carry/escape beat tied to exact
   contacts. Terrain dust, plant/tend/harvest, water impact and drought already have distinct visual presentation.
3. **World-space beats for the newly playable economy actions.** Selling, paying for prevention and
   buying the parcel are currently UI-and-audio only. A sale that produces nothing visible out in the
   field is the largest new gap this pass introduced: the actions became playable before they became
   watchable.
4. A dialogue-grade facial rig only when conversation or portrait cameras become part of the game.

Motion matching, performance capture and vehicle systems are not justified for the current camera,
scope or asset set.
