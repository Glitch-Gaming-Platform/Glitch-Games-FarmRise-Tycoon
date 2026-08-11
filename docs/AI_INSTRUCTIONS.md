# AI instructions

Read this before changing anything in this repository. It is the contract an autonomous agent is
expected to work inside.

---

## 1. Where new files belong

| You are adding | Put it in |
| --- | --- |
| A rule that decides money, goods or progression | `packages/shared/src/rules/` |
| A crop, animal, building, event or item definition | `packages/shared/src/domain/` |
| A request or response shape | `packages/shared/src/schemas/` |
| A reusable runtime capability (rendering, input, audio, physics, scenes) | `apps/game/src/engine/<area>/` |
| Farm state or its evolution | `apps/game/src/game/world/FarmWorld.ts` |
| A player-initiated action | `apps/game/src/game/world/FarmCommands.ts` (one function per intent) |
| A per-frame game behaviour | `apps/game/src/game/systems/` |
| A level | `apps/game/src/game/world/levels/` (data, not code) |
| A Three.js mesh or visual | `apps/game/src/game/world/view/` or `<area>/*View.ts` |
| A procedural visual animation or shader | `apps/game/src/game/world/view/animationMaterials.ts` or the owning `*View.ts` |
| An asset declaration | `apps/game/src/assets/manifests/` (`core.manifest.ts`, or the kind-specific manifest) |
| An audio id or concise sound brief | `apps/game/src/assets/audio/soundIds.ts` or `musicIds.ts` |
| An ElevenLabs generation prompt or audio processing rule | `tools/audio/` |
| A shipped audio file | Generated into `apps/game/public/assets/audio/` — never hand-edited |
| A 3D asset (mesh) | `tools/blender/assets.py` — **one function per asset, never a hand-edited .blend** |
| A colour | `tools/blender/palette.py` — **nowhere else, ever** |
| A mesh-building primitive or the bevel/budget rules | `tools/blender/buildlib.py` |
| A review render pass | `tools/blender/review_render.py` |
| A Blender-rendered DOM interface illustration | Compose it in `tools/blender/render_ui_icons.py`; output goes to `apps/game/public/assets/ui/icons/` |
| A network call | `apps/game/src/net/GameApi.ts` |
| An analytics event | `apps/game/src/analytics/events.ts`, recorded from `bootstrap/bindAnalytics.ts` |
| An onboarding beat | `apps/game/src/game/onboarding/beats.ts` |
| A run-level rule (win, loss, goal price) | `packages/shared/src/rules/outcome.ts` — the server evaluates it too |
| Session orchestration (panels, placement, outcome) | `apps/game/src/game/systems/SessionController.ts` |
| A floating panel | `apps/game/src/ui/panels/` — panels float, screens are exclusive |
| A screen, HUD element or menu | `apps/game/src/ui/` |
| A mobile gameplay control | `apps/game/src/ui/hud/TouchControls.ts`; feed semantic actions into `InputSystem` |
| Mobile capability or page-lifecycle wiring | Capability in `engine/render/capabilities.ts`; ownership/wiring in `bootstrap/` |
| Wiring between layers | `apps/game/src/bootstrap/` — **the only place that may know all layers** |
| An API route | `apps/server/app/api/v1/…/route.ts` (thin) |
| A server decision | `apps/server/src/services/` |
| A query | `apps/server/src/repositories/drizzle/` — **the only place SQL may exist** |
| A schema change | `apps/server/src/db/schema.ts` **and** a new migration pair |

**If you cannot decide where something goes, that is a signal the responsibility is unclear. Split
it rather than putting it in the largest nearby file.**

---

## 2. Which layers may depend on each other

Enforced by `import/no-restricted-paths` in `eslint.config.js`. `npm run lint` fails on a violation.

```
bootstrap  →  ui  →  game  →  engine  →  shared
                       ↘  assets  ↗
                            net  ↗
```

| Layer | May import | May **not** import |
| --- | --- | --- |
| `engine/` | `@farmrise/shared`, `three` | `game/`, `ui/`, `net/`, `assets/` |
| `game/` | `engine/`, `@farmrise/shared` | `ui/` |
| `assets/` | `engine/`, `@farmrise/shared`, `three` | `game/`, `ui/`, `net/` |
| `net/` | `@farmrise/shared`, `engine/core` | `game/`, `ui/` |
| `ui/` | `engine/`, `game/` (read-only), `@farmrise/shared` | — |
| `analytics/` | `engine/core`, `@farmrise/shared` | `game/`, `ui/`, `net/`, `assets/` |
| `packages/shared` | `zod` only | any app |
| `apps/game` | `@farmrise/shared` | `apps/server` |
| `apps/server` | `@farmrise/shared` | `apps/game` |

**Never weaken a boundary to make an import work.** The two legitimate fixes are: move the shared
thing down a layer, or invert the dependency with a port/interface. `GridPhysics` accepting
`roadMultiplier` as an option rather than importing the game's tuning constant is the reference
example.

**Never put server logic in `packages/shared`.** Schemas and deterministic rules are shared; seeds,
thresholds and secrets are not. See [NETWORKING.md](NETWORKING.md).

---

## 3. Naming conventions

| Thing | Convention | Example |
| --- | --- | --- |
| Files exporting one class | PascalCase, matching the class | `SceneManager.ts` |
| Files exporting functions/constants | camelCase | `pathfinding.ts`, `sessionRules.ts` |
| Directories | lowercase, plural for collections | `repositories/`, `manifests/` |
| Classes, interfaces, types | PascalCase, no `I` prefix | `PhysicsPort`, not `IPhysics` |
| Functions, variables | camelCase | `computeYield` |
| Constants | SCREAMING_SNAKE_CASE | `TICK_HZ`, `STARTING_BALANCE` |
| System `id` | kebab-case, stable | `'scene-manager'` |
| Event names | `namespace:kebab-verb` | `'world:plot-changed'` |
| Route config `name` | `dot.case` | `'market.spotSell'` |
| Test files | `<subject>.test.ts` | `farmWorld.test.ts` |
| Playwright specs | `<subject>.spec.ts` | `bootstrap.spec.ts` |
| Asset manifest ids | `kind:name` | `'model:crops'` |
| Mesh / exported glTF node | `SM_<family>_<name>[_s<stage>]` | `SM_crop_wheat_s4` |
| Crop growth stages | `_s1`-`_s4`, 4 = harvestable | `SM_crop_pumpkin_s4` |
| Blender collection | UPPERCASE family | `CROPS` |
| Palette entry | `snake_case`, band-prefixed | `soil_tilled`, `wall_teal` |
| Migrations | `NNNN_snake_name.sql` + `.down.sql` | `0001_init.sql` |
| Money | always `Cents`, integer | `cents(450)` |
| Durations in simulation | always ticks | `secondsToTicks(90)` |
| Private class fields | `#name` | `#accumulator` |
| Unused parameters | `_` prefix | `update(_context)` |

`Result<T>` from rule functions; exceptions only for programmer error. Services throw `HttpError`.

---

## 4. Testing requirements

**Every change ships with tests. A change with no test is not done.**

| Change | Required tests |
| --- | --- |
| A shared rule | Unit test in `packages/shared/tests/`, including the boundary and failure cases |
| An engine system | Unit test with `createManualScheduler()` |
| Game logic | Unit test in `apps/game/tests/unit/`, no rendering |
| A cross-cutting behaviour | Integration test in `apps/game/tests/integration/` |
| A wire schema | Contract test in `packages/shared/tests/protocol.test.ts` |
| An API route | Route test covering **anonymous access, another user's resource, invalid input**, and a replayed request if money moves |
| A money path | Test that the server ignores any client-supplied amount |
| A migration | Extend `apps/server/tests/unit/migrator.test.ts` if the runner changed |
| Anything visible | A Playwright spec in `tests/e2e/` |
| A mobile control or layout change | `tests/e2e/mobile.spec.ts` plus trusted-touch hardware verification when a device is available |
| A new or changed 3D asset | `npm run art:build` (budgets + palette must pass), then `npm run art:review` and grade it against `docs/VISUAL_RUBRIC.md` |
| A new or changed Blender-rendered UI image | `npm run art:ui-icons`, update `uiIcons.manifest.ts`, then unit and Playwright coverage |
| A new colour | It must appear in a `check_palette.py` pair if anything gameplay-critical sits on it |
| A change to growth-stage visuals | Extend `apps/game/tests/unit/plotVisuals.test.ts` |
| A new or changed sound id / music track | `audioCatalog.test.ts`; add a binding test when event mapping changes |

Rules:

- **Do not stub WebGL.** A fake context lets a broken renderer pass. Rendering is Playwright's job.
- **Do not prove touch with `element.click()`.** Mobile acceptance requires pointer/touch input that
  produces an authoritative game-state change. Synthetic events may assist a test but are not the
  acceptance evidence.
- Prefer the in-memory repositories for server tests — no fixtures, no cleanup.
- Test the failure paths. A route test that only covers the happy path proves nothing about a
  security boundary.
- `GameLoop.runFrame(nowMs)` takes an **absolute** timestamp. Passing the same value twice yields
  zero delta and zero steps.
- Mock `fetch` with `mockImplementation`, not `mockResolvedValue` — a `Response` body is a
  single-use stream and a shared instance fails silently on the second call.

---

## 5. Commands that must run after changes

### Runtime preflight

Use the Node 24 version pinned by `.nvmrc` for installs, tests, development servers, native module
rebuilds and builds. Run `node --version` before npm commands. The Glitch Docker image also uses
Node 24, so local verification must match it.

Do not use Node 20 or the installed Node 22.13 runtime for this checkout. Opening a
`better-sqlite3` database under the latter caused a native segmentation fault that Vitest reported
only as `[vitest-pool]: Worker exited unexpectedly` in the migrator tests. If that message appears,
check the runtime first and use the database smoke test documented in the root `AGENTS.md` before
changing application code.

```bash
npm run verify
```

which is:

```bash
npm run format:check   # prettier
npm run lint           # eslint, including the boundary rules
npm run typecheck      # tsc --build across all projects
npm test               # 686 vitest tests
npm run build          # shared → client bundle → next build
```

Also run, when relevant:

```bash
npm run test:e2e       # production preview; serialized desktop/mobile projects after visible changes
npm run db:migrate     # after a schema change
npm run db:rollback    # verify your down migration actually works

npm run art:check      # palette contrast audit - no Blender required, safe in CI
npm run art:build      # after ANY change under tools/blender/
npm run art:review     # after any art change, then look at the renders
npm run art:ui-icons   # after changing UI compositions or a source mesh used by them
npm run art:test       # after changing any build guard in tools/blender/
npm run audio:generate # after processing changes; use -- --music-only --force-music for paid music regeneration
npm run audio:verify   # after any music-loop change; fails on gaps, padding, jumps or ending fades
```

**`npm run art:check` requires no Blender and should run in CI.** `art:build`, `art:review` and
`art:ui-icons` require a local Blender 5.2+ on `PATH`.

**After `art:build`, update the `bytes` fields in `core.manifest.ts`** from
`art/build_report.json`. They weight the loading bar, and stale numbers make it lie.

**After `art:ui-icons`, update the `bytes` fields in `uiIcons.manifest.ts`** from
`art/ui_icon_report.json`. Keep the complete interface-art set at or below 175 KB.

**After `audio:generate`, update `audio.manifest.ts` from
`art/audio/generation_report.json`.** The command reuses raw sources by default. `-- --force`
spends ElevenLabs credits on every effect and music track. Prefer
`-- --music-only --force-music [--music-id music.sunrise_rows]` for music work. The API key must come
from `ELEVENLABS_API_KEY`; never write it to a repository file or Vite environment.

**Do not report a task complete until `npm run verify` passes.** If a command cannot run in your
environment, say so explicitly and name what was therefore not verified. Do not describe a suite as
passing because it "should".

---

## 6. Files that must not become monolithic

These attract growth. When one exceeds roughly **300 lines** or takes on a second responsibility,
split it in the same change rather than filing it as debt.

| File | Split it by |
| --- | --- |
| `engine/core/Engine.ts` | Anything game-shaped becomes a new `EngineSystem` |
| `game/world/FarmWorld.ts` | State + evolution only. Player intents go to `FarmCommands.ts` |
| `game/world/FarmCommands.ts` | One exported function per intent; extract to `world/commands/` if it grows |
| `game/scenes/FarmScene.ts` | Composition and tick order only. An `if` about crops or money belongs elsewhere |
| `ui/UiRoot.ts` | Screen registration only. Screen content goes in its own `Screen` class |
| `bootstrap/startGame.ts` | Wiring only. Extract cohesive groups into `create*.ts` / `bind*.ts` modules |
| `game/systems/SessionController.ts` | Run orchestration only. A rule about *what a command does* belongs in `FarmCommands`; a rule about *whether the run is over* belongs in `shared/rules/outcome.ts` |
| `game/onboarding/beats.ts` | Data only. Logic belongs in `OnboardingDirector` |
| `analytics/events.ts` | Schema only. Never add a call site here |
| `server/src/services/marketService.ts` | Order generation, fulfilment and spot sales are separable |
| `server/src/http/route.ts` | Each middleware concern stays its own function |
| `packages/shared/src/rules/*.ts` | One file per rule domain — never a `helpers.ts` |
| `tools/blender/assets.py` | One function per asset. If a function exceeds ~60 lines, extract a builder into `buildlib.py` |
| `tools/blender/buildlib.py` | Primitives and rules only — no knowledge of any specific asset |
| `game/world/view/*View.ts` | One view per concern. Do not let `FarmView` absorb `PlotView` or `StructureView` |

**Forbidden outright:**

- A `GameManager`, `Game`, or any global singleton holding cross-cutting state. Dependencies are
  constructed in `bootstrap/` and passed in.
- A `utils.ts`, `helpers.ts`, `common.ts` or `misc.ts` anywhere. Name the responsibility instead.
- A god `update()` with a growing `switch`. That is what systems are for.
- SQL outside `repositories/drizzle/`.
- Business logic inside a route handler.

---

## 6b. Art rules

These are as binding as the code boundaries, and most are enforced by the build.

| Rule | Why |
| --- | --- |
| **Never invent a colour.** Every colour comes from `PALETTE` by name. | `linear_rgba()` raises on an unknown name, so a typo fails the build instead of shipping a grey asset. |
| **Never hand-edit `art/source/farmrise_assets.blend`.** | It is an output. The next `art:build` destroys your work. Edit `assets.py`. |
| **Never hand-edit generated UI WebPs.** | Change the composition in `render_ui_icons.py` and regenerate so the result remains reproducible. |
| **Never raise a triangle budget to make a build pass.** | Remove detail instead. Raising it requires updating the table in `ART_IMPLEMENTATION_GUIDE.md` and saying why. |
| **Track face colour in a custom-data layer, never a dict keyed by `BMFace`.** | `bmesh.ops.bevel` recreates faces and invalidates such keys. This silently shipped grey buildings once. |
| **Convert sRGB to linear when writing colour attributes.** | glTF `COLOR_0` and Blender colour attributes are both linear; raw hex produces milky colour. |
| **Judge art from `gameplay_distance.png` first.** | It is the only view that decides. A modelling-viewport beauty shot has never caught a real problem in this project. |
| **Every view must work with `ModelLibrary === null`.** | Keeps the test suite running with no art and no network, and turns a missing GLB into placeholder art rather than a black screen. |
| **Views must not dispose library geometry or the shared material.** | `ModelLibrary` owns them. |
| **Growth is shown by swapping meshes, never by scaling one.** | Scaling one mesh is the exact readability failure the rubric's top-weighted category exists to catch. |
| **Gameplay contains zero analytics calls.** Subscribe to an existing bus from `bootstrap/bindAnalytics.ts`. | Instrumentation embedded in gameplay rots silently and starts dictating design. |
| **A `first_*` metric uses `trackOnce`.** | Re-reporting it on every later success makes the median meaningless. |
| **Run stats are bumped by the command that causes them**, never by a scene listener. | Stats wired in `FarmScene` were invisible to every headless consumer, including tests. |
| **One coach mark, ever.** Prompts replace; they never stack. | `CoachMark` is a deliberate singleton. |
| **A panel must not pause the world; a screen must.** | Opening the market is a glance at a ledger, not a pause. |
| **An open panel owns its full backdrop.** | Pointer, movement and interaction input must not leak to the farm behind a menu. |
| **DOM interface art comes from the UI manifest.** | This keeps paths, measured bytes and the 175 KB budget reviewable in one catalog. |
| **A new build guard ships with a negative test in `test_guards.py`.** | A guard nobody has watched fire is faith, not engineering. All three current guards have been observed rejecting their fault. |
| **Camera constants live in two languages — change both, or the test fails.** | `sessionRules.ts` and `palette.py`; `cameraFraming.test.ts` enforces it. |
| **Do not import `DRACOLoader`.** | Importing it emitted 836 KB of unused decoder chunks into `dist/`. See ADR 0010. |
| **Repeated objects use `InstancedMesh`.** | Draw calls must scale with distinct meshes, not object count. |

## 7. How architectural decisions are documented

Decisions live in `docs/decisions/` as numbered ADRs: `NNNN-kebab-title.md`.

Write one whenever you:

- choose a library, framework or protocol
- change a layer boundary or dependency rule
- change the trust model or an anti-cheat mechanism
- change the tick rate, the money representation or the save format
- accept a known limitation

Format — short, and honest about the cost:

```markdown
# NNNN. Title
- **Status:** Accepted | Superseded by NNNN | Deprecated
- **Date:** YYYY-MM-DD
## Context
What forced a decision.
## Decision
What we chose.
## Consequences
What this buys, what it costs, and what would make us revisit it.
## Alternatives considered
What else, and why not.
```

**Never edit an accepted ADR to change its decision.** Write a new one and mark the old one
superseded. The record of what was believed and when is the point.

Also update:
- `AI_INSTRUCTIONS.md` (this file) when boundaries, workflows, naming or validation commands change
- the relevant topic doc (`ARCHITECTURE`, `GAME_LOOP`, `ASSET_PIPELINE`, `NETWORKING`, `BACKEND`)
- `README.md` when commands or status change

---

## 8. Ownership and lifecycle rules

- **Whoever creates a GPU resource disposes it.** Geometries, materials and textures are not
  garbage-collected. Every view exposes `dispose()`; every scene calls it.
- **Whoever subscribes unsubscribes.** `EventBus.on` returns the unsubscribe function; hold it and
  call it in `dispose`.
- **The engine owns the loop; systems own their own state.** No system reaches into another's
  internals — go through the service container or the event bus.
- **Mobile controls emit semantic actions, never synthetic keys.** `TouchControls` owns pointer ids;
  `InputSystem` owns fixed-tick buffering and release.
- **Mobile page lifecycle is bootstrap wiring.** Hidden pages stop the loop, release input and
  suspend audio; disposal removes the listeners. Do not put document lifecycle reads in gameplay.
- **The server owns money.** The client's balance is a prediction until the server confirms it.
- **Migrations are append-only.** Never edit one that has been applied; the checksum will catch you.
- **`packages/shared` is a published contract.** Treat every change as breaking until you have
  checked both consumers.
- **`tools/blender/` owns the art; `art/source/*.blend` and `public/assets/models/*.glb` are
  outputs.** Never edit an output.
- **`tools/audio/` owns audio prompts and processing; `art/audio/source/` and
  `public/assets/audio/` are outputs.** Preserve raw generations, and never put an API key in either
  tree.
- **`ModelLibrary` owns all loaded geometry and the one shared material.** Views borrow, never free.
- **Exported glTF node names are load-bearing.** The engine looks meshes up by exact name, so
  renaming in `assets.py` without updating the view that requires it breaks rendering silently.

---

## 9. Working style

1. Read the relevant doc before changing the code it describes.
2. Prefer the smallest change that fits the architecture over the smallest change overall.
3. Comment the **why**, never the what. If a line needs a comment explaining what it does, rewrite
   the line.
4. Leave failure modes better than you found them: a thrown error should say what to do next.
5. Do not add a dependency without a clear purpose, and say why in the PR or the ADR.
6. Report accurately. Do not claim coverage, measurements or browser support you did not verify.
