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

## Scope rules — where the numbers live

| Scope rule | Implemented as | File |
| --- | --- | --- |
| Three crops | wheat, corn, pumpkin | `packages/shared/src/domain/crops.ts` |
| One animal | chicken → eggs, fed on corn | `packages/shared/src/domain/animals.ts` |
| Four structures | barn, irrigation, road, fence | `packages/shared/src/domain/buildings.ts` |
| One buyer | Millbrook Grocers | `packages/shared/src/rules/orders.ts` |
| Two events | drought, fox raid | `packages/shared/src/domain/events.ts` |
| One adjacent parcel | `landParcels`, capped at +1 per save write | `packages/shared/src/schemas/save.ts` |

Each of the three crops carries a distinct decision, per the scope rule: wheat is the fast, cheap,
low-margin safety net; corn is thirsty enough that irrigation changes its economics; pumpkin has the
best margin, the longest wait and the worst disease risk, so it is the crop a drought actually hurts.

## Pillars — the mechanism behind each

**Hands-On Ownership.** Planting, tending and harvesting all require the player to be within
`interactRange` of the plot, and each locks them in place for a short work animation
(`InteractionController`). There is no remote-management button.

**Meaningful Reinvestment.** The four buildings map to four different things money can buy —
capacity, reliability, labour, resilience — and are priced close enough together that none is an
obvious first purchase. Roads lower A* traversal cost, so a compact layout measurably reduces travel
time (`engine/physics/pathfinding.ts`).

**Recoverable Disruption.** `EventDirector` enforces the contract structurally: an event cannot fire
without first emitting a warning, `prevent()` is only legal during the warning window, and damage is
a yield multiplier on named plots rather than destruction. A drought-hit plot still harvests. The
integration test asserts that every `started` event is preceded by a `warned` event.

## Core loop — what exists and what does not

| Step | Status |
| --- | --- |
| 1. Read Conditions | Partial. HUD shows money, storage, ready plots and the active warning. Market orders exist server-side but have no in-game panel yet. |
| 2. Choose Output | Implemented for crops (`Q` cycles the seed). Animal production is automatic once fed. |
| 3. Commit Resources | Implemented. Seed cost is charged on planting; feed is consumed per cycle. |
| 4. Work the Farm | Implemented: movement, planting, tending, harvesting, building placement. |
| 5. Respond to Trouble | Implemented: paid prevention during the warning, and scaring foxes by physically approaching them. |
| 6. Harvest and Trade | Harvest and storage implemented client-side; selling is server-side and exposed through `GameApi`, but has no UI yet. |
| 7. Reinvest and Expand | Building implemented. Buying the adjacent parcel is modelled in the save schema but has no command or UI. |

## Known gaps against the blueprint

- **No trade UI.** `spotSell` and `fulfilOrder` work and are tested, but nothing in the HUD calls
  them. This is the largest gap and the next thing to build.
- **Crop disease and contamination** are modelled (`diseased`, `eventMultiplier`) but only drought
  and fox raid are wired into the director — matching the two-event scope rule.
- **Hauling** is implicit: harvested goods go straight to storage. There is no carry capacity or
  physical trip to the barn yet, which weakens the road's contribution to Hands-On Ownership.
- **Land expansion** has a data model and no verb.
- **The core playtest question cannot yet be answered**, because step 6 has no interface. The loop is
  mechanically complete from planting through the setback; it stops at the point of sale.
