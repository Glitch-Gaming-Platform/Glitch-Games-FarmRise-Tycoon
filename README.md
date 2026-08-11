# FarmRise Tycoon

A single-player farming and city-building sandbox. Plant and tend, harvest and haul, build and
upgrade, trade and expand — with limited money and time forcing trade-offs between growth,
resilience and recovery from disruptive events.

This repository contains a playable persistent-career build. The original farm loop now expands
across four physical parcels through hauling, buyer contracts, specialization, processing, soil and
quality management, workers, finance, incidents, seasons and town projects. The engine, simulation,
save migration, asset pipeline, UI and transition-validating backend are kept as separate layers.

- **Client:** TypeScript + Three.js, bundled with Vite
- **Server:** Next.js (App Router) route handlers, SQLite via Drizzle
- **Shared:** one contract package holding wire schemas and the simulation rules both sides run
- **Physics:** a purpose-built tile grid, collision resolver and A* pathfinder — no rigid-body engine
- **Multiplayer:** none. The networking layer provides durable account saves, authoritative market
  routes and transition validation for the offline-first career.

---

## Quick start

```bash
node --version          # requires >= 22.12
npm install             # npm workspaces; do not substitute another package manager

npm run build --workspace @farmrise/shared   # the other packages import its build output
npm run db:migrate                            # creates apps/server/data/farmrise.sqlite
SEED_USER_PASSWORD='<local-password>' npm run db:seed  # optional: farmer@example.com

npm run dev             # Vite on :5173, Next.js on :3000 (Vite proxies /api)
```

Open <http://localhost:5173>. Press **Work the farm**.

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Move |
| `Shift` | Sprint |
| `E` / left click | Context action: field work, pickup/deposit, repair; confirm a placement |
| `Q` | Cycle the selected crop |
| `M` / Market icon | Market — sell at spot or fulfil a contract |
| `B` / Build icon | Build & Reinvest — structures, livestock, carriers and neighbouring land |
| `C` / Office icon | Farm Office — milestones, specialization, processing, workers, loans and insurance |
| `T` / Town icon | Millbrook — prosperity and community projects |
| `R` | Pickup/deposit shortcut at the current stack or store |
| `F` | Pay to prevent the warned event |
| `Esc` | Pause |
| `` ` `` | Toggle the debug overlay (also `?debug=overlay`) |

On touch-primary phones and tablets, movement uses the bottom-left analog joystick. **Work** handles
the contextual action in reach, including field work and putting down a carried load. **Seed**
changes crop, **Protect** answers a warning, the illustrated Market, Build, Office and Town buttons
open their panels, and a building is placed by tapping open ground. These controls and the
lower-memory render/audio profile are mobile-only; desktop controls and quality remain unchanged.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Client and server together |
| `npm run build` | Builds shared, then the client bundle, then the Next.js server |
| `npm run typecheck` | `tsc --build` across all three projects |
| `npm run lint` | ESLint, **including the architectural boundary rules** |
| `npm run format` / `format:check` | Prettier |
| `npm test` | All Vitest projects (shared, game, server) |
| `npm run test:e2e` | Build the production client, then run serialized Playwright desktop/mobile projects (needs `npx playwright install` once) |
| `npm run verify` | format:check → lint → typecheck → test → build |
| `npm run db:migrate` / `db:rollback` / `db:seed` | Database lifecycle |
| `npm run art:build` | Rebuild all 102 art assets from script and export GLB (needs Blender 5.2+) |
| `npm run art:review` | Render the three art review sheets to `art/review/` |
| `npm run art:ui-icons` | Render the 44 transparent DOM-interface illustrations from Blender |
| `npm run art:check` | Palette contrast audit — no Blender needed, safe in CI |
| `npm run audio:generate` | Re-process audio; regenerate music with `-- --music-only --force-music` |
| `npm run audio:verify` | Require four-minute loops and reject gaps, padding, seam jumps or ending fades |

`npm run verify` is what CI runs and what you should run before opening a pull request.

For focused live progression review in a development build, append `?debug=progression` for the
Local Supplier acceptance career or `?debug=estate` for the completed Agricultural Estate. These
fixtures load through the normal v2 save hydration path, never run in production, and disable
autosave so they cannot overwrite a player's farm.

Focused incident review uses the same path. Append one catalogue id, for example
`?debug=incident-drought` or `?debug=incident-processor-breakdown`; the player starts beside the
real response target with a shortened warning and autosave disabled.

## Layout

```
tools/blender/       The art, as Python. Palette, builders, 102 assets, review renders.
tools/audio/         ElevenLabs briefs plus deterministic local audio post-processing.
art/                 Generated: Blender outputs, raw audio sources, and measured reports.
packages/shared/     Wire schemas, domain definitions, pure simulation rules. The contract.
apps/game/
  src/engine/        Reusable, game-agnostic runtime: loop, renderer, camera, input, audio,
                     scenes, grid physics, debug tools. Knows nothing about farms.
  src/game/          FarmRise Tycoon itself: world model, commands, player, enemies, events,
                     levels, states, rules.
  src/assets/        Manifests, async loaders, material registry.
  src/net/           Transport, auth client, connection state, typed API calls.
  src/ui/            Menus, HUD, loading screen, settings. DOM overlay, no framework.
  src/bootstrap/     Composition root — the only place that wires everything together.
apps/server/         Next.js API: auth, saves, market, economy, repositories, migrations.
docs/                Architecture, game loop, asset pipeline, networking, backend, ADRs,
                     AI instructions, game design.
tests/e2e/           Playwright specs.
```

## Where to read next

| If you want to… | Read |
| --- | --- |
| Understand the layers and dependency rules | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Understand ticks, rendering and determinism | [docs/GAME_LOOP.md](docs/GAME_LOOP.md) |
| Add art, audio or video | [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) |
| Understand sound cues, music and audio generation | [docs/AUDIO.md](docs/AUDIO.md) |
| Understand what the server is authoritative for | [docs/NETWORKING.md](docs/NETWORKING.md) |
| Run, extend or troubleshoot the backend | [docs/BACKEND.md](docs/BACKEND.md) |
| Deploy Distribution or Webhosting on Glitch | [docs/GLITCH_DEPLOYMENT.md](docs/GLITCH_DEPLOYMENT.md) |
| Add a crop, building, event or system | [docs/ADDING_A_FEATURE.md](docs/ADDING_A_FEATURE.md) |
| Work on this repo as an AI agent | [docs/AI_INSTRUCTIONS.md](docs/AI_INSTRUCTIONS.md) |
| Know why a decision was made | [docs/decisions/](docs/decisions/) |
| Know what the game is trying to be | [docs/game-design/mechanics-and-core-loop.md](docs/game-design/mechanics-and-core-loop.md) |
| Understand the playable slice | [docs/FIRST_PLAYABLE.md](docs/FIRST_PLAYABLE.md) |
| Work on the first session | [docs/ONBOARDING.md](docs/ONBOARDING.md) |
| Understand the art style and why | [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) |
| Make an asset that fits | [docs/ART_IMPLEMENTATION_GUIDE.md](docs/ART_IMPLEMENTATION_GUIDE.md) |
| Design or extend a menu or HUD element | [docs/UI_DIRECTION.md](docs/UI_DIRECTION.md) |
| Extend or physically verify mobile support | [docs/MOBILE.md](docs/MOBILE.md) |
| Understand locomotion, wind, animals, water and VFX motion | [docs/ANIMATION.md](docs/ANIMATION.md) |
| Grade art quality | [docs/VISUAL_RUBRIC.md](docs/VISUAL_RUBRIC.md) |

## Status

Verified on Node 24.14.0 / npm 10.8.2 (macOS):

- `typecheck`, `lint`, `format:check` clean
- **686 tests passing** across shared, client and server projects
- Client bundle builds (439.93 kB app + 607.37 kB Three.js pre-gzip; 131.50 + 153.96 kB gzip); Next.js builds all 10 API routes
- Migrations apply and roll back; the seed script runs; a live server was exercised end to end
  (register → save → orders → 401 on anonymous access → 426 on protocol mismatch)

The complete serialized Playwright matrix passes **80 checks** with 14 platform-inapplicable skips
across Chromium, Firefox, WebKit, mobile Chrome and mobile WebKit. It covers production boot,
continuous animation, the first-session progression loop, panel isolation, render caps, joystick,
Work, orientation bounds and touch placement.

**Art:** 102 world assets built from script, 37,712 authored triangles split across common and
seasonal crop packs, one shared authored asset material and one generated 256 px surface-detail
atlas. The complete GLB catalog is about 979 KB gzipped; a session loads common art plus only the
current/standing crop-season packs. The DOM interface adds 44 Blender-rendered transparent WebP
illustrations totaling 166,366 bytes. Palette contrast audit passes, with
protanopia/deuteranopia/tritanopia and bright-sun review renders alongside the core sheets. Runtime
motion covers character idle/walk/sprint, distinct plant/tend/harvest actions, chicken, cow and fox
movement, crop growth/drought response, construction and operational building mechanisms,
species-specific crop/tree wind, standing/running water, and pooled work VFX. The whole game is
graded **9.3/10** against `docs/VISUAL_RUBRIC.md`, up from 3.3 for the procedural bootstrap art; the
focused buildings/crops/trees audit is **10/10** for all three groups. The requested whole-game 9.8
remains the target; the rubric does not award it without resolving the arcade locomotion scale
conflict and adding the remaining contact-specific world VFX.

A physical iPhone 12 mini production run observed 91 draws and 222,856 rendered triangles at the
current starter view. A 10-minute foreground soak with traversal, work, harvest, panels and settings
held 59–60 FPS at one-minute checkpoints; immediate action samples remained above the accepted
30 FPS phone floor. These are regression measurements on one device, not a broad support claim.

**Audio:** 23 generated sound effects plus five 32-second farming music loops. Effects and one
default loop are optional preloads with procedural fallbacks; four alternate loops remain lazy.
The delivered set is 2.91 MB, with 856 KB on the default audio preload path. See
`docs/AUDIO.md` for the action audit and measured pipeline.

Not implemented: the Postgres adapter (the ports and the container case exist; the folder does not),
account deletion, dialogue-grade facial animation, multi-site travel/coarse simulation, machinery,
and stage-driven lazy world-asset packs. The current playable progression intentionally completes
one 32×32 estate before those regional systems are enabled; see ADR 0020.
