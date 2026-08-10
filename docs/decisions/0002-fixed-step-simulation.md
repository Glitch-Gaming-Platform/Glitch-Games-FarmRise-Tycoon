# 0002. Fixed-step simulation at 60 Hz, with money as integer cents

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

Crop growth, animal production, construction and upkeep are all timers, and all of them convert into
money. The server needs to be able to check whether a submitted save is a possible continuation of
the one it stored, which means both sides must compute time identically.

Separately, floating-point currency accumulates rounding error. A client predicting a balance in
floats and a server computing it in floats will diverge in the last cents, and every divergence looks
like an anti-cheat failure.

## Decision

- The simulation advances in fixed integer ticks at `TICK_HZ = 60`, defined once in
  `@farmrise/shared` and read by both the client loop and the server clock.
- Rendering runs once per animation frame and interpolates with an `alpha` in `[0, 1)`.
- Every duration in the game is expressed in ticks.
- Money is an integer count of cents (`Cents`), everywhere, on the wire and in the database.
- Anything random that affects money uses a seeded PRNG whose state is saved. `Math.random`,
  `Date.now` and `performance.now` are banned inside the simulation.

## Consequences

- A 30 Hz machine and a 144 Hz machine earn identical amounts from identical play.
- A session can be replayed from a seed, so bug reports are reproducible.
- The loop needs two safety valves: a 250 ms delta clamp and a 5-substep ceiling. Both discard
  simulated time under load — a real cost, accepted because the alternative is a frozen tab.
- Rendering must interpolate, or high-refresh displays stutter. That is extra work in every view.
- Tuning values live in ticks, which is less readable than seconds; `secondsToTicks` is used at every
  definition site to compensate.

## Alternatives considered

- **Variable delta everywhere.** Simpler, and it makes the economy frame-rate dependent, which is
  both unfair and unverifiable.
- **A slower simulation tick (10–20 Hz) with interpolated movement.** Cheaper, but player movement
  and interaction reach felt imprecise in a game whose core verbs are spatial.
- **Floating-point money with rounding at the boundary.** Every boundary becomes a place to get the
  rounding wrong.
