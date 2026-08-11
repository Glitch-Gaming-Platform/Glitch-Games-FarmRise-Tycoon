# 0019. Version the persistent career save and migrate v1 at the load boundary

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The first playable saved one short session: one inventory, one small grid and one event. Progression
adds localized stores, carried goods, parcels, workers, processors, contracts, finance, incidents,
town state and multiple named RNG streams. Reinterpreting the old document in place would make the
client, server and cloud tiers disagree about what fields mean.

## Decision

Freeze the old schema as legacy save v1 and introduce career save v2. Every load reads an unknown
document, migrates it through the shared package, validates the result and only then hydrates the
scene. A v1 inventory lands in the starter yard store; coordinates are shifted into the preallocated
32×32 estate; old crops, buildings, animals and event state receive deterministic v2 defaults.

The local-storage envelope keeps its own version separate from the career document version. Local,
account and cloud tiers all carry the same career document. New careers are created only by the
shared `newCareer` factory.

## Consequences

- Old saves resume instead of silently becoming new farms.
- Migration behavior is testable without Three.js, the DOM or a server.
- Save hydration and autosave operate on one canonical document.
- New schema changes require another explicit migration step; changing the meaning of an existing
  field in place is prohibited.
- A document that cannot migrate produces a recovery decision rather than being overwritten.

## Alternatives considered

- **Best-effort optional fields in v1.** Rejected because the old global inventory and coordinates
  have different semantics, not merely missing fields.
- **Discard old saves.** Rejected because progression work must not delete existing farms.
- **Separate client and server new-career factories.** Rejected because they had already drifted.
