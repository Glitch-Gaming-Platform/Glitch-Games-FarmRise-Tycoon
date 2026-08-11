# 0018. Restructure an insolvent career instead of ending it

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

Progression turns a short run into a persistent farm. A terminal bankruptcy would make long-horizon
choices such as workers, processors, town projects and specialization irrational: one poor season
could delete the value of every earlier decision.

The farm still needs failure pressure. Simply clamping the balance at zero without a consequence
would make debt, insurance and running costs cosmetic.

## Decision

Insolvency triggers a restructuring rather than a game-over state. The career, land, buyer trust,
completed milestones and working buildings survive. The bank supplies a small punitive loan and may
liquidate idle construction value. The player returns to a plantable state with less optionality and
higher daily costs.

Insolvency means there is no route back into the core loop: no affordable seed, no stored goods to
sell and no crop already growing. A merely low balance is not insolvency.

## Consequences

- A career can always recover without silently resetting progress.
- Insurance and voluntary loans remain preferable to restructuring.
- The season review can report a restructuring without becoming a terminal outcome.
- Restructuring loans are persisted and validated against fixed server-known terms.
- If competitive or monetized play is added, liquidation choice and restructuring must become a
  server-owned intent rather than a transition-validated save change.

## Alternatives considered

- **Traditional bankruptcy/game over.** Rejected because it conflicts with persistent city-builder
  progression.
- **Free rescue grant.** Rejected because it removes the consequence of bad fixed-cost decisions.
- **Allow a permanently stuck save.** Rejected because an unrecoverable career is functionally a
  corrupted save.
