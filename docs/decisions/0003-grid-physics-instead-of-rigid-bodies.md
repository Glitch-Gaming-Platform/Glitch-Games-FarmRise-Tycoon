# 0003. A tile grid and A* instead of a rigid-body physics engine

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The game needs to answer three spatial questions: is this plot free, can the player walk here, and
how long does hauling from A to B take. Roads must measurably speed up movement, because that is what
turns "build a road" from decoration into an economic decision.

The obvious default is a rigid-body engine — Rapier or Cannon-es. Rapier is roughly a megabyte of
WASM; Cannon-es is pure JS but slower and less accurate.

## Decision

A purpose-built layer in `engine/physics/`:

- `TileGrid` — a flat `Uint8Array` of per-tile flags (blocked, occupied, road, soil, enclosed), plus
  a 0.5 m static collision raster for authored building and prop footprints.
- `GridPhysics` — swept movement resolved one axis at a time, which produces the expected
  slide-along-the-wall behaviour. Small moving actors use circle colliders stored in tile buckets;
  a movement query inspects only its 3×3 neighbouring buckets rather than scanning the whole flock.
- `findPath` — A* with per-tile traversal costs, so roads are genuinely preferred.

All of it sits behind `PhysicsPort`, which is the only interface game code uses.

## Consequences

- Near-zero bundle cost, and no WASM to load before the first frame.
- Static collision is five byte lookups per movement attempt. Dynamic chicken/player/fox collision
  is local and allocation-free during ticks; collider objects and occupied bucket arrays are reused.
- Fully deterministic and runnable in Node, so collision and pathfinding are unit-tested with no
  browser and the server could re-check them if it ever needed to.
- The port means a Rapier-backed implementation can be dropped in later without gameplay changes.
- No ragdolls, stacking, joints or projectile physics. If the game ever wants a physics-driven
  vehicle or falling debris, this decision must be revisited — and that is a new ADR, not an
  extension of `GridPhysics`.
- Static collision uses a five-point approximation of a circle against the raster, while moving
  actors use exact circle-circle distance. The raster approximation error is sub-pixel at this tile
  size; it would not be at a much smaller one.
- The A* open set is a linear-scan array. Faster than a heap on a 64×64 grid because of the tiny
  constant factor; revisit past roughly 10,000 tiles.

## Alternatives considered

- **Rapier (rapier3d-compat).** Excellent and deterministic, and about a megabyte of WASM to solve
  problems this game does not have.
- **Cannon-es.** Lighter to reason about, still far more machinery than tile occupancy needs.
- **No spatial system at all — free movement with distance checks.** Cheapest, but then roads cannot
  affect travel time and one of the three design pillars loses its mechanism.
