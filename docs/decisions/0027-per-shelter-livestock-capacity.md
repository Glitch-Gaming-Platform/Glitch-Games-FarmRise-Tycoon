# 0027. Per-shelter livestock capacity and visible occupancy

- **Status:** Accepted
- **Date:** 2026-08-13
- **Supersedes:** The site-wide capacity and nearest-shelter purchase portions of ADR 0026

## Context

ADR 0026 gave every livestock group a stable shelter identity, but capacity remained site-wide.
That meant a purchase could be assigned to the geographically nearest shelter even when that
specific shelter's four slots were already occupied, as long as unused slots existed elsewhere on
the farm. The build panel showed one farm-wide free number, while the shelters themselves did not
show what was living there.

Sheep make the ambiguity visible because one sheep consumes two slots. Players need to know whether
a particular shelter can accept it before buying and need feedback that the purchase actually used
those slots.

## Decision

Capacity is enforced per completed shelter. The inherited shelter and every completed purchased
Animal Shelter each provide four base slots. Every completed fence still contributes two slots, but
those slots are assigned deterministically to the nearest completed shelter; equal-distance ties use
the stable shelter id.

An animal purchase selects the nearest completed shelter with enough contiguous free slots for the
whole purchase. A full nearest shelter is skipped. A sheep therefore requires two free slots at one
shelter rather than two free slots fragmented across the site.

When the player is beside a completed shelter, the existing proximity-card system shows used slots,
total capacity and available slots over that shelter. The card stays hidden at a distance, matching
storage-building capacity feedback. Full and over-capacity states are explicit. Sheep count as two
occupied slots, cows as four and chickens as one.

Save v3 is not bumped because the wire shape is unchanged. Saves created under ADR 0026 may have a
locally overfilled shelter while remaining within the old site-wide total. The server accepts that
unchanged overage but rejects any transition that increases it; new purchases always obey local
capacity.

## Consequences

- Shelter placement and nearby fencing become legible local planning decisions.
- Buying animals near a full shelter falls through to the nearest shelter that can actually hold
  them.
- Two one-slot gaps at different shelters cannot house one sheep.
- Existing v3 careers remain loadable without teleporting established animal groups.
- The sum of all local capacities remains equal to the previous site-wide capacity, preserving the
  economic value of existing fences.

## Alternatives considered

- **Keep site-wide capacity and display the same total over every shelter.** Rejected because it
  would imply that each shelter independently had access to the same free slots.
- **Move existing groups to rebalance capacity automatically.** Rejected because it would relocate
  animals, product drops and incident targets without a player action.
- **Bump the save and rewrite every old assignment.** Rejected because the persisted shape did not
  change and a monotonic compatibility rule preserves old careers safely.
