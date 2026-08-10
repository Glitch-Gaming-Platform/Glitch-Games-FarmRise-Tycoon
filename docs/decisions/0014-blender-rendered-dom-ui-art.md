# 0014. Blender-rendered art for the DOM interface

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The DOM interface was structurally usable but visually resembled a generic web application. The
world already had a strict low-poly palette, recognizable meshes and an art-as-code pipeline. Menus
needed large item illustrations without duplicating the whole 3D renderer inside every panel or
introducing a second, unrelated icon style.

ADR 0009 rejected textures and UVs for the **3D world**. It did not account for transparent raster
illustrations displayed by the DOM.

## Decision

Interface illustrations are transparent WebP files rendered by Blender from the generated master
blend and the existing game meshes. `tools/blender/render_ui_icons.py` owns composition, camera,
lighting and export. `uiIcons.manifest.ts` owns URLs and measured bytes; UI code references those
catalog entries instead of hardcoding paths.

The 3D world remains vertex-color-only, with no UVs or sampled textures. DOM interface art has a
100 KB total budget and is lazy browser-loaded. It does not create WebGL materials or draw calls.

## Consequences

- Crops, buildings, animals and the farmer look identical in menus and in the farm.
- The assets remain reproducible, reviewable and palette-bound instead of becoming hand-edited
  image files.
- Menus get stronger visual hierarchy without rendering extra Three.js scenes.
- The current 19-image set costs about 81.6 KB and is guarded by a unit test.
- A changed world mesh can require regenerating and visually reviewing the affected interface art.
- Transparent WebP support is part of the browser baseline. A future format change must preserve
  alpha, measured bytes and graceful image loading.

## Alternatives considered

- **CSS-only pictograms.** Small and accessible, but unable to carry the game's object identity.
- **A second WebGL scene in each panel.** Exact 3D fidelity, with unnecessary renderer complexity,
  GPU cost and lifecycle work.
- **Hand-drawn or downloaded icon packs.** Faster initially, but visually disconnected and outside
  the art-as-code source of truth.
- **Screenshots of the running game.** Inconsistent camera/background, difficult to regenerate and
  poor at isolating a single purchasable object.
