# 0020. Complete one estate before enabling multi-site simulation

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The career schema can hold several sites, but a second playable site is not just another array
entry. It requires site creation and purchase rules, travel UI, scene reconstruction, active and
inactive simulation, deterministic catch-up, site-scoped incidents, worker assignment, save
validation and additional regional asset packs.

Granting a “second site” milestone before those systems exist would create a progression reward the
player cannot use. Simulating several full Three.js worlds would also violate the active-site model
described in the progression plan.

## Decision

This release completes progression across the full five-parcel, 32×32 Millbrook estate. The final
playable milestone recognizes regional supply from that estate and unlocks utilities. The save keeps
the `sites` array and `activeSiteId` so a later release can add multi-site travel without another
single-site-to-array migration, but the server rejects creation of additional sites for now.

The reserved `second_site` and `machinery` identifiers remain legal registry values but are not
granted by current milestones or shown in the interface.

## Consequences

- Every milestone in the shipped progression grants a capability that works now.
- The current world, rendering and controller graph remain one active site.
- Multi-site work has a clean persistence boundary but is not falsely presented as complete.
- Enabling a second site requires a new ADR covering purchase authority, catch-up rules, travel and
  asset-pack lifecycle before removing the server rejection.

## Alternatives considered

- **Create a second copy of the starter map and switch by reloading.** Rejected because it omits
  inactive simulation, travel cost and site-scoped orchestration while pretending the feature is
  complete.
- **Remove multi-site fields from v2.** Rejected because retaining the array avoids another major
  migration later and costs little now.
- **Leave the unavailable milestone visible.** Rejected because progression rewards must be usable
  when claimed.
