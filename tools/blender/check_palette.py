#!/usr/bin/env python3
"""
Palette contrast audit, runnable without Blender.

This is the objective half of the visual rubric. It answers two questions
with numbers rather than opinion:

  FINDABILITY  can a player locate this thing against the ground it sits on?
  PROGRESSION  can a player tell this growth stage from the next?

Both use the WCAG relative-contrast ratio, which is a pure luminance
measure - so it also answers "does this survive any form of colour
blindness?", which a hue comparison cannot.

Exits non-zero on failure so it can gate CI.

    npm run art:check
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from palette import PALETTE, value_contrast  # noqa: E402

FINDABILITY_MIN = 1.6
PROGRESSION_MIN = 1.5

FINDABILITY = [
    ("wheat_ready", "soil_tilled", "ready wheat must be spottable across the farm"),
    ("corn_ready", "soil_tilled", "ready corn likewise"),
    ("pumpkin_body", "soil_tilled", "ready pumpkin likewise"),
    ("crop_seedling", "soil_tilled", "a planted plot must differ from a bare one"),
    ("wall_teal", "ground_scrub", "buildings must not sink into the scrub"),
    ("straw_hat", "soil_tilled", "the hat is the player's primary silhouette read"),
    ("shirt_blue", "soil_tilled", "the shirt is the secondary one"),
    ("fox_belly", "ground_scrub", "the fox's white markings carry its read"),
    ("fox_belly", "soil_tilled", "likewise on tilled ground"),
]

PROGRESSION = [
    ("crop_seedling", "crop_young", "wheat/corn stage 1 -> 2"),
    ("crop_young", "crop_mature", "wheat/corn stage 2 -> 3"),
    ("crop_mature", "wheat_ready", "wheat stage 3 -> 4, the critical one"),
    ("crop_mature", "corn_ready", "corn stage 3 -> 4"),
    ("crop_young", "pumpkin_green", "pumpkin stage 2 -> 3"),
    ("pumpkin_green", "pumpkin_body", "pumpkin stage 3 -> 4"),
]


def main() -> int:
    failures = []
    print(f"FarmRise palette audit - {len(PALETTE)} colours\n")

    for label, pairs, threshold in (
        ("FINDABILITY", FINDABILITY, FINDABILITY_MIN),
        ("PROGRESSION", PROGRESSION, PROGRESSION_MIN),
    ):
        print(f"{label} (minimum {threshold:.2f}:1)")
        for a, b, why in pairs:
            ratio = value_contrast(a, b)
            ok = ratio >= threshold
            print(f"  {'PASS' if ok else 'FAIL'}  {ratio:5.2f}:1  {a} vs {b}  - {why}")
            if not ok:
                failures.append(f"{label} {a} vs {b}: {ratio:.2f}:1")
        print()

    if failures:
        print(f"{len(failures)} contrast failure(s):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("All contrast checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
