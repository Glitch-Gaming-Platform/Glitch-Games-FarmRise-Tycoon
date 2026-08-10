# 0011. 38° camera pitch and no tone mapping

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The bootstrap shipped a follow camera at 61° above horizontal (`Math.PI * 0.34`) and
`ACESFilmicToneMapping`. Both were chosen before any art existed, by defaulting to plausible values.
The first art review, rendered at those settings, showed both were wrong.

## Decision

- Follow camera pitch: **38°**.
- Renderer tone mapping: **`NoToneMapping`**, sRGB output, with the tone mapping now configurable.

## Consequences

**Camera.** At 61° the game read as near-top-down:

- All vertical crop mass was foreshortened away — the exact thing the art direction spends its
  triangle budget on.
- Every building front was invisible; the player saw roofs.
- Flat ground dominated the frame, and the flattest object in the scene — the path — became the
  largest silhouette mass, inverting the detail hierarchy.

38° restores depth to a game whose whole premise is walking around a farm. It also means building
fronts, the character's face and crop silhouettes all become visible, which raises the value of art
already built.

Costs: less of the farm fits on screen at once, so the player sees fewer plots simultaneously, and
the camera is now more likely to be occluded by tall corn or a barn. Neither has been addressed —
occlusion handling is future work.

**Tone mapping.** ACES filmic desaturates and rolls off saturated highlights, which is correct for
photographic HDR content and actively harmful here: the gold of ready wheat and the orange of a ripe
pumpkin are *gameplay signals*. The contrast ratios the palette audit enforces are computed on raw
sRGB values, so any tone curve invalidates them.

Removing it also makes the Blender review renders trustworthy — they use `Standard` for the same
reason, so what is judged is what ships.

Cost: no highlight roll-off, so an over-bright light would clip hard. Acceptable with one key light
at a fixed intensity, and the `toneMapping` option exists for a future scene that needs it.

## Alternatives considered

- **Keep 61° and make the art taller.** Fights the camera rather than fixing it, and costs triangles.
- **Orthographic camera.** Very legible for a builder and it removes the depth cue that makes a
  walk-around game feel three-dimensional. Rejected against reference #5/#6, which are perspective.
- **`LinearToneMapping` with exposure 1.0.** Nearly identical output to none; `NoToneMapping` states
  the intent more plainly.
