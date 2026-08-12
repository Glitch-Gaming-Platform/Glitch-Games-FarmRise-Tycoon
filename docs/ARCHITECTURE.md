# Architecture

## The one rule

**Reusable engine systems never know that FarmRise Tycoon exists.**

Everything else in this document follows from that. If `engine/` could reach into `game/`, the
engine would stop being liftable into a second project and would start accumulating farm-shaped
special cases — which is exactly how a codebase ends up with a 4,000-line `Game` class.

## Layers

```
                 ┌──────────────────────────────────────────┐
                 │            bootstrap/  (composition)     │
                 │  the only module that knows all the rest │
                 └───────────────┬──────────────────────────┘
                                 │ constructs
   ┌──────────────┬──────────────┼──────────────┬──────────────┐
   ▼              ▼              ▼              ▼              ▼
┌────────┐   ┌────────┐   ┌──────────┐   ┌────────┐   ┌──────────┐
│  ui/   │──▶│ game/  │──▶│ engine/  │◀──│assets/ │   │   net/   │
└────────┘   └────────┘   └──────────┘   └────────┘   └──────────┘
                  │             │              │             │
                  └─────────────┴──────┬───────┴─────────────┘
                                       ▼
                            ┌────────────────────┐
                            │ @farmrise/shared   │
                            │  schemas · rules   │
                            └─────────┬──────────┘
                                      ▲
                            ┌─────────┴──────────┐
                            │  apps/server       │
                            │ routes · services  │
                            │ repositories · db  │
                            └────────────────────┘
```

## Dependency rules

These are enforced by `import/no-restricted-paths` in `eslint.config.js`. Breaking one fails
`npm run lint`, not just code review.

| Layer | May import | May **not** import |
| --- | --- | --- |
| `engine/` | `@farmrise/shared`, `three` | `game/`, `ui/`, `net/`, `assets/` |
| `game/` | `engine/`, `@farmrise/shared` | `ui/` |
| `assets/` | `engine/`, `@farmrise/shared`, `three` | `game/`, `ui/`, `net/` |
| `net/` | `@farmrise/shared`, `engine/core` | `game/`, `ui/` |
| `ui/` | `engine/`, `game/` (read-only), `@farmrise/shared` | — |
| `bootstrap/` | everything | — |
| `packages/shared` | `zod` only | any app |
| `apps/server` | `@farmrise/shared` | `apps/game` |
| `apps/game` | `@farmrise/shared` | `apps/server` |

Two asymmetries are deliberate and worth stating plainly:

- **`ui/` may read `game/`, but `game/` may never touch `ui/`.** The UI observes the simulation
  through event subscriptions and read-only projections. The simulation emits events and does not
  know whether anyone is listening. This is what lets the entire economy be tested in Node.
- **`apps/game` and `apps/server` share schemas, never logic.** `@farmrise/shared` holds the wire
  format and the rules both sides must agree on. Anything whose secrecy has value — order
  generation seeds, anti-cheat thresholds — stays in `apps/server`. See
  [NETWORKING.md](NETWORKING.md).

## What lives where

### `packages/shared` — the contract

| Folder | Contents |
| --- | --- |
| `protocol/` | Version negotiation, route builders, the response envelope, error codes |
| `schemas/` | Zod schemas for requests, responses, legacy saves, career saves and site state |
| `domain/` | Crops, animals, buildings, buyers, incidents, parcels, processing, seasons, workers and town data |
| `rules/` | Pure functions for growth, progression, land, logistics, quality, finance, incidents and migration |

Nothing here may read `process.env`, touch the DOM, import Three.js, or perform I/O. Every function
is deterministic, which is what allows the server to re-run them over a submitted save.

### `apps/game/src/engine` — the runtime

| Folder | Contents |
| --- | --- |
| `core/` | `Engine`, `GameLoop`, `Clock`, `Scheduler`, `EventBus`, `ServiceContainer`, `System` |
| `render/` | `RendererSystem`, `ViewportSizer`, capability detection |
| `camera/` | `CameraRig` plus swappable controllers |
| `scene/` | `SceneManager`, the `GameScene` interface, GPU-safe teardown |
| `input/` | `InputSystem` (buffered), action maps, pointer state |
| `audio/` | `AudioSystem` with named buses and gesture unlocking |
| `i18n/` | Locale-neutral catalog runtime, formatting, interpolation and DOM bindings |
| `physics/` | `TileGrid`, static sub-tile raster, bucketed moving circles, `GridPhysics`, A* — behind `PhysicsPort` |
| `debug/` | Frame overlay, debug flags |

The `Engine` owns exactly three things: a list of systems, the loop that drives them, and the
container they find each other through. It knows nothing about renderers or farms; those are
systems registered by the composition root.

**Two orderings, deliberately separate.** `priority` decides *when in a frame* a system runs (input
→ simulation → camera → audio → render → debug). Registration order decides *what already exists
when a system initialises*. Conflating them would force the renderer — which must draw last — to
also initialise last, which is backwards.

### `apps/game/src/game` — the game

| Folder | Contents |
| --- | --- |
| `world/` | `FarmWorld` facade, focused models and command modules, levels and views |
| `career/` | Persistent `Career`, progression/season director and seeded offline contract board |
| `player/` | `Player` model, `PlayerController`, `PlayerView` |
| `enemies/` | `Fox`, `EnemyDirector` |
| `events/` | `IncidentDirector` — persisted, targeted and recoverable disruptions |
| `items/` | Read-only inventory projections for the UI |
| `states/` | `GameStateMachine`, the guarded transition table, phase implementations |
| `systems/` | Session, contextual interaction and placement controllers |
| `rules/` | Client-only session rules; re-exports the shared, server-validated ones |
| `scenes/` | `FarmScene` — composes the above and ticks it in dependency order |

The split between `FarmWorld` and `FarmCommands` is the important one: "how the farm evolves on its
own" and "what the player is allowed to do to it" are different concerns with different test needs.

### `apps/server` — the authority

| Folder | Contents |
| --- | --- |
| `app/api/v1/` | Route handlers. Thin: validate, delegate, return |
| `src/http/` | The route wrapper, errors, envelope, rate limiting, request context |
| `src/auth/` | scrypt hashing, JWT issuing/verification, cookie construction |
| `src/services/` | Auth, saves, save validation, market — where the decisions are made |
| `src/repositories/` | Ports, plus Drizzle/SQLite and in-memory adapters |
| `src/db/` | Schema, connection, migration runner, hand-written SQL migrations |

All SQL lives in `repositories/drizzle/`. A query anywhere else is a bug.

## Cross-cutting patterns

**Systems, not managers.** Anything needing a slice of the frame implements `EngineSystem` with
optional `init` / `fixedUpdate` / `update` / `dispose`. New behaviour is a new small system, never
another branch in a central update method.

**Events for outward communication.** `EventBus<M>` is typed per emitter. A throwing listener is
logged and skipped — one broken HUD widget must not stop the game loop.

**Ports for swappable infrastructure.** `PhysicsPort` and the repository interfaces exist so the
grid could become Rapier, and SQLite could become Postgres, without gameplay or service code
changing.

**Locale-neutral state, translated presentation.** Saves, shared domain records and simulation
events retain stable ids and raw values. One localization instance is composed in `bootstrap/`,
while `ui/` resolves message catalogs and domain display text. See
[INTERNATIONALIZATION.md](INTERNATIONALIZATION.md) and ADR 0025.

**Results, not exceptions, in rules.** Rule functions return `Result<T>` carrying a shared error
code. The server turns a failure into an HTTP error and the client turns the same failure into a
toast, from the same value.

**Failure isolation.** A system that throws is quarantined rather than allowed to throw sixty times
a second. "The minimap stopped updating" is a far better failure than "the tab froze".

## Testing strategy

| Project | Environment | Covers |
| --- | --- | --- |
| `shared` | node | Rules, schemas, protocol contracts, RNG determinism |
| `game` | jsdom | Loop, engine core, physics, input, world model, state machine, transport |
| `server` | node | Hashing, tokens, rate limits, save validation, migrations, services, routes |
| `e2e` | real browsers | Rendering, resize, the loop actually advancing, pause/resume |

WebGL is **not** stubbed in jsdom. A fake context would let a broken renderer pass; proving that it
renders is Playwright's job.

## Known limitations

- The Postgres adapter is not written. `repositories/container.ts` throws a pointed error.
- Rate limiting is per process. Behind N instances the effective limit is N×.
- Save validation is a plausibility check, not a full re-simulation. Trades are fully authoritative;
  see [NETWORKING.md](NETWORKING.md) for exactly where the line is.
- The 52 authored world assets still load as family bundles; stage-driven lazy world packs are
  deferred until the measured transfer saving justifies the extra loading states (ADR 0021).
- Multi-site travel/coarse simulation and machinery are reserved progression slices, not current
  milestone rewards (ADR 0020).
- No account deletion or data-export route yet.
