# 0022. Expand progression art catalog budgets

- **Status:** Superseded by [0024](0024-seasonal-crops-and-return-tiers.md)
- **Date:** 2026-08-10

## Context

The first playable's 20,000-triangle whole-catalog and 100 KB interface-art budgets were set before
clover, dairy cows, seven progression buildings and processed-goods/livestock interface icons
existed. Keeping those limits would require either invisible progression content or misleading
generic icons.

The optimized deterministic build uses 20,172 authored triangles. The 32 transparent WebP interface
illustrations measure 119,206 bytes and remain lazy DOM assets; they do not add WebGL materials,
textures or draw calls to the farm scene. The project owner explicitly approved 2,000 triangles of
additional whole-catalog capacity for later progression presentation while retaining the tighter
per-asset constraints.

## Decision

Set the whole authored-catalog guardrail to 22,000 triangles and the complete lazy DOM-interface
catalog guardrail to 125 KB. Keep every existing per-asset triangle budget unchanged. Keep the
starter critical model-path target unchanged; ADR 0021 addresses that separate loading problem.

## Consequences

- Clover, cows, processed goods and every buildable structure have legible authored presentation.
- A single crop, animal, building, character or prop still cannot exceed its class budget.
- The current catalog has 1,828 triangles of measured headroom; that capacity is not a per-asset
  entitlement.
- The larger totals are measured and test-enforced rather than estimates.
- Further budget increases require another explicit decision and physical-device evidence.

## Alternatives considered

- **Reuse wheat/land icons.** Rejected because it hides item and building identity at the exact point
  progression adds more choices.
- **Remove authored cow or clover meshes.** Rejected because unlocked simulation entities must be
  visible in the authored-art path.
- **Raise per-asset budgets.** Rejected; no new asset required it.
