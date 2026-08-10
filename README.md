# FarmRise Tycoon

A single-player farming and city-building sandbox. Plant and tend, harvest and haul, build and
upgrade, trade and expand — with limited money and time forcing trade-offs between growth,
resilience and recovery from disruptive events.

This repository currently contains the **architecture and a playable bootstrap**, not the finished
game. The engine, the simulation model, the asset pipeline, the networking layer, the UI shell and
an authoritative backend are all in place, compiling, tested and documented. Gameplay depth is
deliberately thin so the structure can be judged on its own.

- **Client:** TypeScript + Three.js, bundled with Vite
- **Server:** Next.js (App Router) route handlers, SQLite via Drizzle
- **Shared:** one contract package holding wire schemas and the simulation rules both sides run
- **Physics:** a purpose-built tile grid, collision resolver and A* pathfinder — no rigid-body engine
- **Multiplayer:** none. The networking layer exists to keep the *economy* server-authoritative.

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
| `E` / left click | Plant, tend or harvest the plot in reach; confirm a placement |
| `Q` | Cycle the selected crop |
| `M` / Market icon | Market — sell at spot or fulfil a contract |
| `B` / Build icon | Build & Reinvest — place roads, barns, irrigation or fences; buy a hen or neighbouring land |
| `F` | Pay to prevent the warned event |
| `Esc` | Pause |
| `` ` `` | Toggle the debug overlay (also `?debug=overlay`) |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Client and server together |
| `npm run build` | Builds shared, then the client bundle, then the Next.js server |
| `npm run typecheck` | `tsc --build` across all three projects |
| `npm run lint` | ESLint, **including the architectural boundary rules** |
| `npm run format` / `format:check` | Prettier |
| `npm test` | All Vitest projects (shared, game, server) |
| `npm run test:e2e` | Playwright, real browsers (needs `npx playwright install` first) |
| `npm run verify` | format:check → lint → typecheck → test → build |
| `npm run db:migrate` / `db:rollback` / `db:seed` | Database lifecycle |
| `npm run art:build` | Rebuild all 34 art assets from script and export GLB (needs Blender 5.2+) |
| `npm run art:review` | Render the three art review sheets to `art/review/` |
| `npm run art:ui-icons` | Render the 19 transparent DOM-interface illustrations from Blender |
| `npm run art:check` | Palette contrast audit — no Blender needed, safe in CI |
| `npm run audio:generate` | Re-process audio; regenerate music with `-- --music-only --force-music` |
| `npm run audio:verify` | Require four-minute loops and reject gaps, padding, seam jumps or ending fades |

`npm run verify` is what CI runs and what you should run before opening a pull request.

## Layout

```
tools/blender/       The art, as Python. Palette, builders, 34 assets, review renders.
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
| Understand locomotion, wind, animals, water and VFX motion | [docs/ANIMATION.md](docs/ANIMATION.md) |
| Grade art quality | [docs/VISUAL_RUBRIC.md](docs/VISUAL_RUBRIC.md) |

## Status

Verified on Node 24.18.1 / npm 11.16 (macOS):

- `typecheck`, `lint`, `format:check` clean
- **371 tests passing** across shared, client and server projects
- Client bundle builds (270 kB app + 606 kB Three.js, pre-gzip); Next.js builds all 10 API routes
- Migrations apply and roll back; the seed script runs; a live server was exercised end to end
  (register → save → orders → 401 on anonymous access → 426 on protocol mismatch)

All **92 Playwright checks** pass in desktop Chromium, mobile Chromium, Firefox and WebKit. They
cover bootstrap, menu input isolation, clickable/hotkey menu shortcuts, the full first-session loop,
placement and animated WebGL.

**Art:** 34 world assets built from script, 13,241 triangles, one shared authored asset material,
no world textures, about 259 KB gzipped. The DOM interface adds 19 Blender-rendered transparent WebP
illustrations totaling about 81.6 KB. Palette contrast audit passes, with
protanopia/deuteranopia/tritanopia and bright-sun review renders alongside the core sheets. Runtime
motion covers character idle/walk/sprint, distinct plant/tend/harvest actions, chicken and fox
movement, crop growth/drought response, construction, crop/grass/tree wind, standing/running water,
and pooled work VFX. Graded **9.1/10** against
`docs/VISUAL_RUBRIC.md`, up from 3.3 for the procedural bootstrap art. The requested 9.8 remains the
target; the rubric does not award it without authored skeletal/animal animation and contact-specific
VFX.

A live browser review observed 36 draw calls and 72,694 rendered triangles at the starter view; the
cross-browser animation specs pass. These are regression measurements on one machine, not a claim
that every supported device sustains the same frame rate or GPU cost.

**Audio:** 23 generated sound effects plus five 32-second farming music loops. Effects and one
default loop are optional preloads with procedural fallbacks; four alternate loops remain lazy.
The delivered set is 2.91 MB, with 856 KB on the default audio preload path. See
`docs/AUDIO.md` for the action audit and measured pipeline.

Not implemented: the Postgres adapter (the ports and the container case exist; the folder does not),
account deletion, true skeletal/facial animation, and any gameplay beyond the bootstrap loop.
