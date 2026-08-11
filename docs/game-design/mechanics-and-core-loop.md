# FarmRise Tycoon — Mechanics and Core Loop Blueprint

> This is the approved design blueprint, preserved as written. Implementation notes are appended
> at the end under "Implementation status" and are clearly separated from the design itself. Do not
> edit the design sections to match the code — if the code diverges, either fix the code or bring a
> deliberate design change through review and record it here.

## Game descriptor

A casual single-player farming and city-building sandbox where players actively run a farm, sell
produce, and reinvest profits into an expanding agricultural empire. Limited money and time force
trade-offs between growth, resilience, and recovery from disruptive natural events.

## Core fantasy

Feel like a hands-on farm owner who turns a modest plot into a resilient agricultural empire through
smart planning, active work, and calculated expansion.

## Core verbs

Plant and tend → Harvest and haul → Build and upgrade → Trade and expand

## Design pillars

- **Hands-On Ownership:** Every production cycle includes direct field work, hauling, placement, or
  emergency response so growth feels actively earned.
- **Meaningful Reinvestment:** Money must always present a choice between increasing output,
  reducing labor, protecting assets, or saving toward new land.
- **Recoverable Disruption:** Disasters create visible problems that alter plans and require action,
  but warnings and countermeasures keep setbacks understandable and recoverable.

## Mechanics

- **Timed Crop Plots:** The player selects a crop, pays for seed, plants it, and performs short
  tending actions before harvest. Crops differ in growth time, sale value, water demand, and failure
  risk, creating a choice between quick income and larger delayed returns.
- **Active Farm Work:** The player moves through the farm to plant, harvest, load goods, repair
  damage, and chase away threats. Roads and compact layouts reduce travel time, making city-building
  decisions affect action efficiency.
- **Animal Production:** Animals consume feed and occupy shelter before producing goods on recurring
  timers. The player chooses whether to spend crop output on stable long-term products or sell it
  immediately for cash.
- **Dynamic Market Orders:** A small set of buyers posts quantity, price, and deadline-based orders
  for crops and animal goods. The player can accept reliable contracts, sell immediately at a lower
  spot price, or hold goods while risking spoilage and missed opportunities.
- **Functional Infrastructure:** Barns increase storage, irrigation stabilizes crop growth, roads
  accelerate hauling, and fences protect animals. Construction costs money and takes time, forcing
  the player to balance immediate production against future efficiency and resilience.
- **Warned Farm Events:** Drought, crop disease, fox attacks, and contamination appear with short
  warnings and target specific assets. The player can spend money on prevention, perform an active
  response, accept reduced output, or abandon an exposed area to protect higher-value operations.

## Moment-to-moment core loop

1. **Read Conditions:** Check market orders, weather warnings, storage, and available money to
   identify the most valuable and urgent opportunity.
2. **Choose Output:** Select crops or animal production based on demand, growth time, operating cost,
   and current risks.
3. **Commit Resources:** Buy seed or feed and assign limited plots, shelters, water, and production
   time.
4. **Work the Farm:** Plant, tend, move supplies, and maintain facilities while production timers
   advance.
5. **Respond to Trouble:** React to threats by protecting valuable assets, repairing damage, or
   sacrificing lower-priority output.
6. **Harvest and Trade:** Collect finished goods and decide whether to fulfill an order, sell
   immediately, store them, or feed them to animals.
7. **Reinvest and Expand:** Spend earnings on more capacity, faster logistics, stronger protection, or
   neighboring land, then begin a larger production cycle.

## Session loop

1. Review farm status, market demand, and incoming risks
2. Set a production plan and spend the available operating budget
3. Perform farm work while adapting to timers and disruptive events
4. Harvest, process, and sell goods through the best available trade option
5. Reinvest profits in efficiency, protection, or expansion before continuing

## Core playtest question

> Does choosing what to grow, responding to one warned setback, and deciding how to reinvest the
> resulting profit create an engaging reason to begin another production cycle?

## Scope rules

- The first playable uses three crops, one animal, four functional structures, one buyer, and two
  disruptive events.
- Expansion initially means purchasing one adjacent plot; competing farm acquisition, trains, dams,
  rivers, and large regional systems wait until the farm loop is proven.
- Every new crop, animal, building, or event must introduce a distinct economic, spatial, timing, or
  risk decision rather than only adding visual variety.

---

# Implementation status

Everything below describes the code as it currently stands. It is not part of the approved design.

## Implemented career scope

| System | Current implementation | Primary owner |
| --- | --- | --- |
| Crops | four year-round crops plus three exclusive crops per season, with rarity returns, planting windows, soil draw, quality and freshness | `packages/shared/src/domain/crops.ts` |
| Livestock | chickens/eggs and dairy cows/milk with feed, shelter and pasture constraints | `packages/shared/src/domain/animals.ts` |
| Buildings | eight infrastructure types plus mill, creamery and preserve kitchen | `packages/shared/src/domain/buildings.ts` |
| Market | four behaviorally distinct buyers, trust, quality gates, deadlines, penalties and seeded offline offers | `packages/shared/src/domain/buyers.ts`, `game/career/ContractBoard.ts` |
| Incidents | seven persisted incident definitions with named targets, severity, cooldowns and active responses | `packages/shared/src/domain/incidents.ts`, `game/events/IncidentDirector.ts` |
| Land | one homestead and three purchasable gated parcels on the Millbrook estate | `packages/shared/src/domain/parcels.ts` |
| Career | milestone stages, specialization, seasons, town projects, workers, finance and restructuring | `packages/shared/src/domain/`, `game/career/` |
| Persistence | career save v2, v1 migration, scene hydration, local-first timed/irreversible-action autosave and server transition validation | `packages/shared/src/schemas/career.ts`, `game/platform/save/`, `server/src/services/saveValidation.ts` |

## Pillars — the mechanism behind each

**Hands-On Ownership.** Planting, tending and harvesting all require the player to be within
`interactRange` of the plot, and each locks them in place for a short work animation
(`InteractionController`). There is no remote-management button.

**Meaningful Reinvestment.** Infrastructure still begins with capacity, reliability, labour and
resilience, then expands into land, carts, cold storage, processing, workers, finance and town
projects. Unlocks expose these choices as the farm creates the bottleneck they solve.

**Recoverable Disruption.** `IncidentDirector` persists warning, impact, target ids, severity and
response progress. Incidents offer active work and often a paid fallback, apply bounded losses to
named assets, support insurance, and cannot be rerolled by refreshing the page.

## Core loop — what exists and what does not

| Step | Status |
| --- | --- |
| 1. Read Conditions | Implemented through the HUD plus market, career and town panels: storage, carry load, contracts, milestones, seasons, incidents and finances are visible. |
| 2. Choose Output | Implemented for crops, livestock and processor recipes, with specialization and buyer demand changing the answer. |
| 3. Commit Resources | Implemented: seeds, feed, construction, land, wages, processor inputs, loans and project materials all consume real resources. |
| 4. Work the Farm | Implemented: contextual field work, physical hauling, placement, workers and processing queues. |
| 5. Respond to Trouble | Implemented through targeted incident responses, protective infrastructure, insurance and recoverable restructuring. |
| 6. Harvest and Trade | Implemented through spot sales and accepted buyer contracts with quality, deadlines and trust consequences. |
| 7. Reinvest and Expand | Implemented across four estate parcels, infrastructure, carts, livestock, processors, staff and town projects. |

## Deliberate remaining boundaries

- The current progression ends after completing the Millbrook estate. Multi-site travel, coarse
  simulation and machinery remain future slices and are not granted by any milestone.
- Stage-driven lazy world-asset packs remain deferred; the current authored family bundles are
  within the accepted measured budget, but the main Three.js chunk still produces a size warning.
- Account career saves are transition-validated rather than fully replayed from intent. Trade routes
  remain fully authoritative; the exact trust boundary is documented in `docs/NETWORKING.md`.
- The complete serialized Playwright matrix passes 80 checks with 14 platform-inapplicable skips
  across the three desktop engines and both mobile projects.
