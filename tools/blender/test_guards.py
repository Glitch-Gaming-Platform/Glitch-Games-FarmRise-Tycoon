"""
Negative tests for the art build's three regression guards.

Each guard exists because a real bug shipped past code review:

  1. TRIANGLE BUDGET      a 1,296-triangle barn against a 900 budget
  2. UNPAINTED FACES      bmesh.ops.bevel recreated faces and invalidated a
                          face->colour dict, rendering every bevelled
                          building flat grey
  3. NAME COLLISION       orphaned fake-user datablocks forced Blender to
                          name a new mesh SM_crop_wheat_s4.001, and that
                          suffix travelled into the GLB as the node name,
                          silently breaking every name-based lookup

A guard that has never been observed to fire is a guard you are trusting on
faith. This file deliberately reintroduces each fault and asserts the build
refuses it.

    blender --background --python tools/blender/test_guards.py
"""

from __future__ import annotations

import os
import sys
import traceback

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

for _module in ("palette", "buildlib", "assets", "build_assets"):
    sys.modules.pop(_module, None)

import build_assets  # noqa: E402
from buildlib import MeshBuilder, collection  # noqa: E402


class GuardNotTriggered(AssertionError):
    """The fault was reintroduced and the build accepted it anyway."""


def expect_failure(name: str, fault, expected_fragment: str) -> dict:
    """Runs `fault`, requiring it to raise with a recognisable message."""
    try:
        fault()
    except Exception as exc:  # noqa: BLE001 - we are asserting on any raise
        message = str(exc)
        if expected_fragment.lower() not in message.lower():
            return {
                "guard": name,
                "passed": False,
                "detail": (
                    f"raised, but the message did not mention "
                    f"'{expected_fragment}'. Got: {message[:160]}"
                ),
            }
        return {"guard": name, "passed": True, "detail": message.split(".")[0][:120]}
    return {
        "guard": name,
        "passed": False,
        "detail": "NO EXCEPTION - the guard did not fire and the fault would ship",
    }


# --------------------------------------------------------------------------
# 1. Triangle budget
# --------------------------------------------------------------------------

def fault_over_budget() -> None:
    """A prop far over the 300-triangle prop budget."""
    b = MeshBuilder("TEST_over_budget", budget="prop")
    # A 32x32 UV sphere is ~2,000 triangles: comfortably over.
    b.sphere("rock", 1.0, u=32, v=32)
    b.build(collection("TEST"))


# --------------------------------------------------------------------------
# 2. Unpainted faces
# --------------------------------------------------------------------------

def fault_unpainted_faces() -> None:
    """
    Geometry that reaches build() with no palette colour on it.

    This simulates exactly the original bug: faces exist, but nothing has
    written the colour layer, so they would render as the fallback grey.
    """
    b = MeshBuilder("TEST_unpainted", budget="prop")
    b.box("rock", size=(1, 1, 1))
    # Wipe the colour layer, imitating a topology operator that dropped it.
    for face in b.bm.faces:
        face[b.colour_layer] = 0
    b.build(collection("TEST"))


# --------------------------------------------------------------------------
# 3. Datablock name collision
# --------------------------------------------------------------------------

def fault_name_collision() -> dict:
    """
    Leaves an orphaned fake-user mesh named like a real asset, then runs a
    full build and checks the exported node names came out clean.

    This one cannot simply assert a raise: the guard is a PURGE, so the
    correct behaviour is that the build succeeds AND produces unsuffixed
    names. A regression here is silent, which is what made the original bug
    so expensive.
    """
    build_assets.wipe_scene()
    stale = bpy.data.meshes.new("SM_crop_wheat_s4")
    stale.use_fake_user = True

    build_assets.main()

    suffixed = sorted(m.name for m in bpy.data.meshes if "." in m.name)
    wheat = [m.name for m in bpy.data.meshes if m.name.startswith("SM_crop_wheat_s4")]
    if suffixed:
        return {
            "guard": "name collision",
            "passed": False,
            "detail": f"purge failed; suffixed datablocks survived: {suffixed[:3]}",
        }
    if wheat != ["SM_crop_wheat_s4"]:
        return {
            "guard": "name collision",
            "passed": False,
            "detail": f"expected exactly one clean wheat mesh, got {wheat}",
        }
    return {
        "guard": "name collision",
        "passed": True,
        "detail": "stale fake-user datablock purged; node names clean",
    }


def main() -> dict:
    results = []
    build_assets.wipe_scene()

    results.append(expect_failure("triangle budget", fault_over_budget, "budget"))
    build_assets.wipe_scene()

    results.append(expect_failure("unpainted faces", fault_unpainted_faces, "palette colour"))
    build_assets.wipe_scene()

    try:
        results.append(fault_name_collision())
    except Exception as exc:  # noqa: BLE001
        results.append({
            "guard": "name collision",
            "passed": False,
            "detail": f"build raised unexpectedly: {exc}",
        })

    passed = sum(1 for r in results if r["passed"])
    return {
        "results": results,
        "passed": passed,
        "total": len(results),
        "ok": passed == len(results),
    }


if __name__ == "__main__":
    outcome = main()
    for row in outcome["results"]:
        print(f"[{'PASS' if row['passed'] else 'FAIL'}] {row['guard']}: {row['detail']}")
    print(f"\n{outcome['passed']}/{outcome['total']} guards verified")
    if not outcome["ok"]:
        traceback.print_stack()
        raise SystemExit(1)
