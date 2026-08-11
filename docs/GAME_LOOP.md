# The game loop

## Shape

**Fixed-step simulation, variable-step rendering.**

```
requestAnimationFrame
        │
        ▼
  Clock.tick()  ── clamps the delta to 250 ms ───┐
        │                                        │  (a backgrounded tab must not
        ▼                                        │   ask for 3,600 catch-up steps)
  accumulator += delta                           │
        │                                        │
        ├── while accumulator >= 1/60 and steps < 5 ──▶ fixedUpdate({ stepSeconds, tick })
        │       accumulator -= 1/60                        input → simulation → …
        │       steps++
        │
        ├── still behind? drop the backlog, emit engine:overrun
        │
        └──▶ update({ deltaSeconds, alpha, elapsedSeconds })
                 camera → audio → render → debug
```

Implementation: `apps/game/src/engine/core/GameLoop.ts`.

## Why fixed-step, for a farming game

Growth timers, upkeep and event countdowns are money. Three consequences follow:

1. **Fairness.** With a variable delta, a 144 Hz machine and a 30 Hz machine would accumulate
   different amounts of growth from the same wall-clock time. Integer ticks make them identical.
2. **Verifiability.** The server re-runs the same shared rule functions with the same integer step.
   That is only possible if "one tick" means the same thing everywhere.
3. **Reproducibility.** Combined with the seeded RNG, a session can be replayed from a save. Bug
   reports become deterministic.

`TICK_HZ = 60` is defined once, in `@farmrise/shared/domain/time.ts`, and read by both the client's
loop and the server's clock. Neither hardcodes it.

## Why `alpha` exists

Simulation runs at 60 Hz; displays run at 30, 60, 120 or 144 Hz. Without interpolation, a 144 Hz
display would show the same simulation state for two or three consecutive frames and stutter.
`alpha` is how far the renderer is between the last tick and the next, in `[0, 1)`. Views use it to
smooth position and animation.

Views sync during `update`, not `fixedUpdate` — visuals stay smooth between ticks and cost nothing
extra while the simulation is paused.

Character cadence, animal transforms, vegetation wind, running water and pooled dust all consume the
same `RenderContext`; none of them feed cosmetic motion back into the deterministic world. See
[ANIMATION.md](ANIMATION.md) for the complete movement audit and performance rules.

## The two ceilings

**`maxSubSteps = 5`.** Without it, a frame that falls behind simulates more than it renders, making
the next frame slower still — the classic spiral of death. When the cap is hit, the backlog is
dropped and `engine:overrun` is emitted. Dropping simulated time is a real cost, and it is the
correct trade against locking the tab.

**`Clock.tick` clamps the delta to 250 ms.** An alt-tabbed tab can return with a multi-second delta.
Feeding that straight into the accumulator would request thousands of steps in one frame.

Both are covered by tests in `apps/game/tests/unit/gameLoop.test.ts`.

## Frame order

`SystemPriority` in `engine/core/System.ts` defines the bands. Keep new systems inside them.

| Priority | System | Why here |
| --- | --- | --- |
| `Input` (0) | `InputSystem` | Drains the event queue before anything reads it |
| `Input + 1` | `GameStateSystem` | A pause pressed this tick takes effect this tick |
| `Simulation` (100) | `SceneManager` → active scene | The world moves |
| `Camera` (200) | `CameraRig` | Follows a player who has already moved |
| `Audio` (300) | `AudioSystem` | Reacts to what just happened |
| `Render` (400) | `RendererSystem` | Draws after everything has settled |
| `Debug` (500) | `DebugOverlaySystem` | Reports on the frame that just ran |

Inside `FarmScene.fixedUpdate` the order is equally deliberate:

```
playerController → interaction → session → career.advance(1) → IncidentDirector
                 → CareerDirector → dynamic collision refresh → EnemyDirector
```

Movement must precede interaction (reach is evaluated from the *new* position); the world must
advance before the directors read it.

## Input buffering

DOM events arrive whenever the browser decides. The simulation runs on fixed ticks and may run zero
or several times per frame. If gameplay read the live event stream, a tap that began and ended
inside one frame would be missed.

So events are queued and drained at the top of each fixed step. "Was `interact` pressed this tick?"
becomes a well-defined question, and press-and-release within a single frame still registers —
asserted in `apps/game/tests/unit/inputSystem.test.ts`.

Mobile controls use the same queue through semantic action values. The analog joystick writes four
fractional movement actions, while Work/Seed/Protect/Pause write edge-triggered actions. No gameplay
system knows whether an action came from a key, mouse button or touch control. A touch tap records
its coordinates on `pointerdown` because touchscreens do not provide a hover move before placement.

Blur releases everything held, which prevents the classic "held W while alt-tabbing, came back
walking forever" bug.

## Determinism rules

Inside `fixedUpdate` and anywhere in `@farmrise/shared/rules`:

- **No `Math.random()`.** Use `createRng(seed)`. The seed comes from the save; the stream position
  is saved so a session resumes the same sequence.
- **No `Date.now()` or `performance.now()`.** Time is the tick counter.
- **No floating-point currency.** Money is integer cents (`Cents`), everywhere.
- **No DOM or Three.js reads.** Simulation state must be computable in Node.

`update` is free to use real time, `Math.random` for cosmetic jitter, and anything else visual — it
does not affect the economy.

## Pausing

Pausing stops the *simulation*, not the render loop: `PausedState` calls
`setSimulationRunning(false)`, and `FarmScene.fixedUpdate` returns early. The frozen farm stays
visible behind the pause panel, and the renderer keeps drawing so the UI stays responsive.

## Mobile page lifecycle

Phone/tablet page hiding is different from the pause screen. `bindMobileLifecycle()` stops the
entire engine loop on `visibilitychange` hidden or `pagehide`, disables input so every held joystick
action is released, and suspends Web Audio. On `pageshow` or visible it re-enables input, resumes
audio and restarts only a loop that was running before the hide. Desktop does not install this
binding.

Stopping the loop means a backgrounded phone does not render, accumulate a catch-up burst or return
with a stuck movement action. Listener ownership stays in `startGame()`, which calls the returned
unbind function during disposal.

## Testing the loop

`createManualScheduler()` replaces `requestAnimationFrame` with a scheduler you drive by hand, so a
test can assert exactly how many fixed steps a given frame produced. `GameLoop.runFrame(nowMs)`
takes an **absolute** timestamp — passing the same value twice yields a zero delta and no steps.
