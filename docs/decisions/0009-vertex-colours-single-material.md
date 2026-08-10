# 0009. Vertex colours and one material, no textures or UVs

- **Status:** Superseded in part by ADR 0014; the 3D-world decision remains accepted
- **Date:** 2026-08-10

## Context

The chosen art direction is flat, saturated, hand-painted low-poly with no surface detail. Colour
had to reach the GPU somehow: texture atlases, per-colour materials, or vertex attributes.

## Decision

Every 3D-world mesh carries colour in a `COLOR_0` vertex attribute. The world uses one
`MeshStandardMaterial` with `vertexColors: true`, `roughness: 0.85`, `metalness: 0`,
`side: DoubleSide`. There are no UVs or sampled textures in the 3D world. ADR 0014 permits
Blender-rendered transparent WebPs as DOM interface art.

## Consequences

- **Draw calls scale with distinct meshes, not distinct colours.** Plots, crops, scatter and the
  chicken flock are all `InstancedMesh`; a farm with sixty plots costs what six cost.
- **Zero texture memory and zero texture requests.** The entire art set is 115 KB gzipped.
- **No KTX2/Basis transcoder** — nothing to transcode. That is ~250 KB of decoder not shipped.
- Single-sided foliage becomes viable (a leaf is one quad strip), halving triangles on every crop,
  because the shared material renders both faces.
- **Colour resolution is limited by tessellation.** A gradient needs geometry. Accepted: this
  direction has no gradients.
- **No surface detail is possible at all** — no wood grain, no fabric weave, no dirt. If the project
  later wants #5/#6's painted foliage, this decision must be reversed, UVs authored, and the
  compression measurements redone.
- One non-obvious trap, now documented and enforced: colour must be tracked in a **face custom-data
  layer**, not a dict keyed by `BMFace`. `bmesh.ops.bevel` recreates faces and invalidates such keys,
  which silently repainted every bevelled building grey.
- sRGB→linear conversion must happen at authoring time; glTF `COLOR_0` and Blender colour attributes
  are both linear.

## Alternatives considered

- **Texture atlases.** Closer to the references' painted foliage; needs a texture artist, a
  transcoder and texture memory, to serve a direction that has no surface detail.
- **One material per colour.** Simplest to author, and material count grows linearly with variety and
  draw calls follow it.
- **A palette lookup texture indexed by UV.** Compact, and it reintroduces UVs and a texture fetch for
  no benefit over vertex colours at this scale.
