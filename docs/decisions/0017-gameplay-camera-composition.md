# 0017. Lock the complete gameplay camera composition

- **Status:** Accepted
- **Date:** 2026-08-10
- **Supersedes:** ADR 0011's pitch-only camera decision; its no-tone-mapping decision remains active.

## Context

ADR 0011 corrected the original near-top-down 61° pitch to 38°, but it did not define distance,
field of view or azimuth as one composition. Later art review tightened the camera to 13.25 m,
34° pitch and 42° vertical field of view so the farmer, animals and work tools survived at gameplay
distance.

The audit first found an undocumented azimuth mismatch: Blender's decisive gameplay review used an
18° azimuth while `FollowController` silently used its 45° default. The final parity pass then found
two subtler problems after the values were unified: the Blender mock placed the starter farm on the
opposite world axis, and its camera negated the runtime's world-Z orbit term. It also converted the
42° Three.js vertical FOV as if it were Blender's horizontal sensor FOV. Matching numbers therefore
still produced a different shot.

## Decision

The gameplay camera is one four-part art-direction constant:

- distance: **13.25 m**;
- pitch: **34° above horizontal**;
- vertical field of view: **42°**;
- yaw/azimuth: **-42°**.

All four values live in `GAMEPLAY_CAMERA`, are mirrored in `tools/blender/palette.py`, and are
compared by `cameraFraming.test.ts`. The runtime must pass pitch and yaw explicitly to
`FollowController`; review code may not rely on an undocumented literal, controller default or
beauty-shot target offset. The gameplay review looks at the farmer just as the runtime controller
does, uses the same positive world-Z cosine orbit convention, and converts the vertical FOV to a
focal length for Blender's explicit 36 mm horizontal sensor. Its starter player, six beds and
shelter use the canonical world coordinates from the shared game rules.

Renderer tone mapping remains **`NoToneMapping`** as decided by ADR 0011.

## Consequences

- The mirrored diagonal places the plots left of the player and the shelter/animals right of the
  player instead of pushing both gameplay masses against the same edge.
- The Blender gameplay sheet and the shipping runtime now judge the same orientation, projection
  and starter-farm layout.
- Camera changes become cross-language, test-enforced art-direction changes rather than local
  tuning.
- Less diagonal map area is visible than at 45°, but the scene gains a clearer foreground,
  midground and horizon hierarchy.

## Alternatives considered

- **Keep runtime yaw at 45° and change the review sheet.** Rejected because the live opening frame
  had weaker farm clustering and more foreground roof occlusion.
- **Use the review mock's old 18° literal.** Rejected after a desktop runtime check: the mock farm's
  layout differs from the real starter farm, and 18° still cropped the shelter while leaving both
  plots and shelter on the right side of the player.
- **Leave yaw as a controller default.** Rejected because a default cannot be protected by the
  camera anti-drift test and can change independently of the review renderer.
- **Compare constants only.** Rejected because equal pitch/yaw/FOV values do not guarantee equal
  images when the orbit sign, sensor convention or review-scene axes differ.
- **Use an orthographic or fixed isometric camera.** Still rejected for the reasons in ADR 0011:
  the game is a walk-around farm, not a map editor.
