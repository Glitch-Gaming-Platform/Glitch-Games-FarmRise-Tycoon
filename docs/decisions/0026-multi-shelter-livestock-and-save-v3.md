# 0026. Stable multi-shelter livestock assignment and career save v3

- **Status:** Accepted
- **Date:** 2026-08-13

## Context

The inherited coop was previously the only livestock location. Every animal rendered around it,
every product appeared beside it, and every fox raid targeted it even after the estate expanded.
That made buying animals from another parcel visually misleading and prevented shelter placement
from becoming a meaningful layout decision.

Animal groups already persisted coordinates, but coordinates alone cannot safely identify a
particular purchased building. Adding shelter identity therefore changes the save wire format. The
build menu also needs to expose the existing authored coop and trough assets without creating a
parallel art style or duplicating world meshes.

## Decision

Give every animal group a stable `shelterId`. The inherited coop uses the reserved
`shelter-starter` id; a purchased Animal Shelter uses its placed building id. When livestock is
bought, use the player's current tile to select the nearest completed shelter with a deterministic
tie-break. Existing groups remain assigned to their current shelter when another shelter is built.

All location-dependent behavior follows that assignment: rendered animals, dynamic collision,
proximity guidance, product drops, incident handling and fox targets. A successful fox removes one
animal only from the group it reached.

The Animal Shelter unlock is granted by the Stage 1 milestone, costs $30, occupies a 2×2 footprint
and reserves one walkable product-collection tile outside its rotated doorway. It contributes four
site-wide shelter slots when complete. Existing completed fences continue to contribute two slots.
The Water Trough costs $10, has no unlock requirement and occupies one tile. Both reuse their
existing authored world meshes; Blender renders dedicated transparent WebP menu illustrations from
those meshes.

Bump the career save to version 3. Version 2 animal groups migrate to `shelter-starter`, which is
lossless because version 2 had only the inherited shelter. Version 2 careers already at Stage 1 or
later receive the new shelter blueprint during migration. The server validates shelter identity,
animal-group immutability, completed capacity and the reserved collection tile.

## Consequences

- Livestock bought on distant land visibly lives and produces beside the nearest completed shelter.
- A shelter under construction neither attracts livestock nor contributes capacity.
- Building a new shelter does not teleport established flocks or herds.
- Assignment is spatial while capacity remains a site-wide progression resource, preserving the
  existing fence investment rule.
- Product piles remain reachable because shelter placement reserves the doorway collection tile on
  both client and server.
- Save version 2 remains loadable through an explicit, tested migration rather than an inferred
  default in runtime code.

## Alternatives considered

- **Move every existing animal to the newest or nearest shelter.** Rejected because construction
  would unexpectedly relocate production piles and incident targets.
- **Use shelter coordinates as identity.** Rejected because rotation, future relocation rules and
  server validation need a stable relational key.
- **Let barns count as animal shelters.** Rejected because barns remain storage infrastructure and
  would make their capacity ambiguous; the dedicated shelter keeps the build choice legible.
- **Create new coop and trough meshes.** Rejected because the approved authored assets already exist
  and are used in the starter composition.
