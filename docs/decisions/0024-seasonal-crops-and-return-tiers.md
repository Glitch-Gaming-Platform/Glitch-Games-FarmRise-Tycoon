# 0024. Seasonal crop packs and crop-specific return tiers

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

The four-crop catalog did not make the calendar materially change planting decisions. Crop returns
also shared only a global 2×–6× healthy band, so rarity was implicit and could drift independently
from seed cost, growth time and risk. Adding twelve crops as one monolithic GLB would load forty-eight
irrelevant growth meshes in every season, and reusing Wheat art in the market would hide the new
inventory choices.

## Decision

Keep Wheat, Corn, Pumpkin and Clover available year-round. Add Radish, Pea and Strawberry in Spring;
Sunflower, Tomato and Avocado in Summer; Beetroot, Cranberry and Grape in Autumn; and Carrot, Cabbage
and Garlic in Winter. Planting is gated by the seed window, but standing crops may finish after the
calendar turns and harvested goods may always be sold.

Each crop declares a rarity tier that derives its fresh, fully tended premium return: Common 3×,
Uncommon 5×, Rare 7× and Exotic 10× seed cost. Growth-time bands are strictly ordered by return tier,
so no higher-return crop finishes faster than a lower-return crop. Standing harvest delay and stored
freshness decay continue to reduce quality and therefore market payout.

Author four stage meshes per crop, split into `crops-spring`, `crops-summer`, `crops-autumn` and
`crops-winter` GLBs. Load the active season plus any pack needed by a standing crop in a resumed save;
load later packs at season boundaries. Give every crop a Blender-rendered lazy UI icon.

Raise the measured whole-catalog triangle guardrail from 22,000 to 40,000 while retaining every
per-asset budget, and raise the complete lazy UI-art guardrail from 125 KB to 175 KB. The resulting
catalog measures 102 assets, 36,792 triangles and 171,446 UI-art bytes.

## Consequences

- The season changes the seed roster without removing productive year-round options.
- Return, time and rarity are one enforceable relationship rather than three independent labels.
- Delayed harvest and spoilage can push realized return below the advertised tier.
- The complete model catalog grows to about 951 KB gzip, but seasonal crop geometry is not loaded all
  at once. The initial critical Spring model path is about 566 KB gzip, with the 86 KB props pack
  preloaded separately, and still requires physical-device profiling.
- Draw-call capacity rises from sixteen to twenty-eight crop-stage buckets for common plus current
  seasonal crops; instancing still keeps plot count out of that equation.
- ADR 0022's aggregate budgets are superseded; its tighter per-asset budgets remain unchanged.

## Alternatives considered

- **Make all sixteen crops available year-round.** Rejected because it adds content without making
  the calendar a planting decision.
- **Make seasonal crops die at the boundary.** Rejected because an invisible timer would turn a
  planning system into unrecoverable punishment.
- **Keep one monolithic crop GLB.** Rejected because three quarters of seasonal growth meshes would
  be irrelevant to the current seed window.
- **Assign seed prices by hand.** Rejected because the return tier would drift whenever price, yield
  or quality changed.
- **Reuse generic crop icons.** Rejected because inventory and market choices need immediate species
  identity.
