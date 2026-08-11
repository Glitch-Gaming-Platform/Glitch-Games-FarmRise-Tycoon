# 0023. Shared procedural surface-detail atlas

Date: 2026-08-10
Status: Accepted; supersedes the no-UV/no-sampled-world-texture portion of ADR 0009

## Context

The vertex-colour-only world passed the gameplay-distance silhouette rubric, but a close-detail
review exposed flat roofs, walls, doors, windows, bark and foliage. Adding separate materials or
bitmap files per asset would increase draw calls, loading complexity and texture transport cost.
Encoding every seam, shingle and vein as geometry would break the mobile triangle budget.

## Decision

Keep one authored world material and vertex colours for hue, but multiply them by one deterministic
greyscale detail atlas:

- Blender and the runtime generate the same 256 × 256 atlas procedurally; no image file is shipped.
- `TEXCOORD_0` selects cells for siding, shingles, timber grain, metal panels, glass, live bark,
  dead bark, leaf veins, stone, woven material and water.
- The atlas changes value only. Named palette colours remain the single source of hue.
- Physical details that affect silhouette or interaction—door knobs, sliding handles, frames and
  separate leaves—remain geometry.
- GLBs export UVs but do not embed materials or images. `ModelLibrary` applies the one shared
  `MeshStandardMaterial` and one shared `DataTexture` at runtime.

## Consequences

- Buildings and trees hold up under the new close-detail review while preserving one material and
  the existing instancing model.
- UV data increases GLB payload, so compression measurements and manifest bytes must be regenerated.
- The runtime owns one additional 256 × 256 RGBA texture, about 256 KiB before GPU compression.
- KTX2 is still unnecessary because no texture file crosses the network; revisit only if a shipped
  bitmap world atlas replaces or supplements the generated texture.
- ADR 0009 still governs vertex-colour hue, double-sided foliage and one-material batching, but its
  prohibition on UVs and sampled world textures no longer applies.
