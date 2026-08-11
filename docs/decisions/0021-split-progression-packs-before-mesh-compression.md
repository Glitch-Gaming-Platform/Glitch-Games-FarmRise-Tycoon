# 0021. Split progression packs before adopting mesh compression

- **Status:** Superseded after implementation by [0024](0024-seasonal-crops-and-return-tiers.md)
- **Date:** 2026-08-10

## Context

The progression asset set measures about 485 KB after gzip. Meshopt plus its approximate 5 KB
decoder would reduce the same all-assets transfer to about 449 KB, a net saving near 35.8 KB. This
now crosses ADR 0015's 25 KB re-evaluation trigger.

Crossing the trigger requires a re-evaluation, not automatic adoption. The current comparison still
measures the wrong startup shape: locked crops, livestock
and late-stage buildings still share monolithic family GLBs with starter content, and FarmScene
loads its fixed model family list. A stage-driven pack split can remove substantially more starter
transfer and decoded geometry than compressing content the player should not load yet.

## Decision

Continue shipping plain GLB for this release, but treat the model payload as over budget. The next
asset-loading change must split starter-common and progression content into manifest-driven packs,
measure the resulting critical path, and then repeat the raw/Draco/Meshopt comparison on each pack.

Do not add Meshopt to the current monolithic families merely to make the aggregate number smaller.

## Consequences

- The loader remains decoder-free for now.
- The approximately 485 KB all-family gzip payload remains visible as an overage.
- Lazy progression packs are required work, not an optional optimization.
- Meshopt remains a likely follow-up if a post-split pack still saves at least 25 KB net or physical
  cold-load profiling shows a user-visible transfer bottleneck.

## Alternatives considered

- **Enable Meshopt immediately.** Rejected because it optimizes transfer of locked content instead
  of correcting why that content is on the startup path.
- **Raise the model budget.** Rejected; the starter-path target remains approximately 350 KB gzip.
- **Use Draco.** Rejected because its much larger decoder still makes first load worse.
