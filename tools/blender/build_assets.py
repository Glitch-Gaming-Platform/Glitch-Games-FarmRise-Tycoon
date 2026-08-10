"""
Build every FarmRise Tycoon art asset from scratch and export it.

Run from a terminal (no GUI needed):

    blender --background --python tools/blender/build_assets.py

or from a running Blender via the MCP bridge. Either way it is destructive to
the CURRENT scene only - it never touches a file it did not create.

Outputs:
    art/source/farmrise_assets.blend          the editable master
    apps/game/public/assets/models/*.glb      what the game loads
    art/build_report.json                     tri counts and byte sizes

Every run is deterministic: the same script produces byte-identical meshes,
so a change in the report is always a change someone made on purpose.
"""

from __future__ import annotations

import gzip
import json
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

for _module in ("palette", "buildlib", "assets"):
    if _module in sys.modules:
        del sys.modules[_module]

import assets  # noqa: E402
from buildlib import triangle_count  # noqa: E402
from palette import PALETTE, TRI_BUDGET, value_contrast  # noqa: E402

BLEND_OUT = os.path.join(ROOT, "art", "source", "farmrise_assets.blend")
MODEL_DIR = os.path.join(ROOT, "apps", "game", "public", "assets", "models")
MEASURE_DIR = os.path.join(ROOT, "art", "measure")
REPORT = os.path.join(ROOT, "art", "build_report.json")

# One GLB per family. Grouping this way means the loading screen makes five
# requests rather than nineteen, and a scene that needs only crops never
# downloads the character.
FAMILIES = {
    "crops": "CROPS",
    "ground": "GROUND",
    "buildings": "BUILDINGS",
    "characters": "CHARACTERS",
    "animals": "ANIMALS",
    "props": "PROPS",
}


def wipe_scene() -> None:
    """
    Empty the current file. Only ever run against a scratch scene.

    The fake-user clear matters more than it looks: the review renderer marks
    mesh datablocks with a fake user so they survive a scene wipe, and a
    leftover SM_crop_wheat_s4 forces the next build to name its mesh
    SM_crop_wheat_s4.001. That suffix then travels into the GLB as the node
    name and silently breaks every name-based lookup in the engine.
    """
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)

    blocks = (bpy.data.meshes, bpy.data.materials, bpy.data.armatures,
              bpy.data.actions, bpy.data.images, bpy.data.cameras,
              bpy.data.lights, bpy.data.worlds)
    for block in blocks:
        for item in list(block):
            item.use_fake_user = False
    # Repeat until stable: removing a mesh can orphan the material it used.
    for _ in range(4):
        removed = 0
        for block in blocks:
            for item in list(block):
                if item.users == 0:
                    block.remove(item)
                    removed += 1
        if removed == 0:
            break


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 30
    # Standard, not AgX or Filmic. This art direction depends on saturated
    # flat colour reaching the screen unmodified; a filmic curve desaturates
    # exactly the crop colours the gameplay read depends on, and Three.js
    # will not apply Blender's view transform anyway - so previewing through
    # one would mean judging art the engine never shows.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def export_family(name: str, collection_name: str, variants: dict) -> dict:
    collection = bpy.data.collections.get(collection_name)
    if not collection or not collection.objects:
        return {}

    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = collection.objects[0]

    common = dict(
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,      # no UVs anywhere: colour is per-vertex
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_animations=False,
    )

    sizes = {}
    for variant, extra in variants.items():
        # Variants are written to art/measure/ so the decision between them can
        # be made from measured bytes rather than folklore. That directory is
        # gitignored - only the chosen encoding ships.
        target_dir = MODEL_DIR if variant == "raw" else MEASURE_DIR
        path = os.path.join(target_dir, f"{name}.{variant}.glb"
                            if variant != "raw" else f"{name}.glb")
        bpy.ops.export_scene.gltf(filepath=path, **common, **extra)
        with open(path, "rb") as handle:
            payload = handle.read()
        sizes[variant] = len(payload)
        sizes[f"{variant}_gzip"] = len(gzip.compress(payload, compresslevel=9, mtime=0))
    return sizes


def audit_palette() -> list[str]:
    """
    Objective colour checks, split into the two questions that actually
    matter in play. Both use the WCAG contrast ratio, which is a pure
    luminance measure - so it also answers "does this still work for a
    player with any form of colour blindness?", which a hue comparison
    cannot.

    FINDABILITY: can I locate this thing against the ground it sits on?
    Threshold 1.6:1. Everything a player must FIND is in this list.

    PROGRESSION: can I tell this growth stage from the next one?
    Threshold 1.5:1. Note what is deliberately NOT here: mid-growth crop
    versus soil. A stage-3 crop is not supposed to attract attention - only
    the ready stage is - so holding it to a findability threshold would mean
    breaking the growth ramp to satisfy a metric.
    """
    findability = [
        # (foreground, background, why this pair matters)
        ("wheat_ready", "soil_tilled", "ready wheat must be spottable across the farm"),
        ("corn_ready", "soil_tilled", "ready corn likewise"),
        ("pumpkin_body", "soil_tilled", "ready pumpkin likewise"),
        ("crop_seedling", "soil_tilled", "a just-planted plot must look different from a bare one"),
        ("wall_teal", "ground_scrub", "buildings must not sink into the scrub"),
        ("straw_hat", "soil_tilled", "the hat is the player's primary silhouette read"),
        ("shirt_blue", "soil_tilled", "and the shirt is the secondary one"),
        # The fox's body is a mid orange that cannot clear 1.6 against BOTH
        # grounds at once without turning brown and losing its identity, so
        # the burden is carried by its white belly and tail tip instead. That
        # is a deliberate design choice, recorded here rather than hidden.
        ("fox_belly", "ground_scrub", "the fox's white markings carry its read"),
        ("fox_belly", "soil_tilled", "likewise on tilled ground"),
    ]
    progression = [
        ("crop_seedling", "crop_young", "wheat/corn stage 1 -> 2"),
        ("crop_young", "crop_mature", "wheat/corn stage 2 -> 3"),
        ("crop_mature", "wheat_ready", "wheat stage 3 -> 4, the critical one"),
        ("crop_mature", "corn_ready", "corn stage 3 -> 4"),
        ("crop_young", "pumpkin_green", "pumpkin stage 2 -> 3"),
        ("pumpkin_green", "pumpkin_body", "pumpkin stage 3 -> 4"),
    ]

    failures = []
    for a, b, why in findability:
        ratio = value_contrast(a, b)
        if ratio < 1.6:
            failures.append(f"FINDABILITY {a} vs {b}: {ratio:.2f}:1 < 1.60 ({why})")
    for a, b, why in progression:
        ratio = value_contrast(a, b)
        if ratio < 1.5:
            failures.append(f"PROGRESSION {a} vs {b}: {ratio:.2f}:1 < 1.50 ({why})")
    return failures


def main() -> dict:
    started = time.time()
    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(MEASURE_DIR, exist_ok=True)

    wipe_scene()
    configure_scene()

    built = []
    for name, factory in assets.BUILD_ORDER:
        obj = factory()
        built.append({
            "name": obj.name,
            "asset": name,
            "triangles": triangle_count(obj),
            "vertices": len(obj.data.vertices),
        })

    variants = {
        "raw": {},
        "draco": {
            "export_draco_mesh_compression_enable": True,
            "export_draco_mesh_compression_level": 6,
            "export_draco_position_quantization": 14,
            "export_draco_normal_quantization": 10,
            "export_draco_color_quantization": 10,
        },
        "meshopt": {
            "export_meshopt_compression_enable": True,
        },
    }

    family_sizes = {}
    for family, collection_name in FAMILIES.items():
        sizes = export_family(family, collection_name, variants)
        if sizes:
            family_sizes[family] = sizes

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "blender": bpy.app.version_string,
        "duration_seconds": round(time.time() - started, 2),
        "palette_entries": len(PALETTE),
        "palette_contrast_failures": audit_palette(),
        "budgets": TRI_BUDGET,
        "assets": built,
        "total_triangles": sum(a["triangles"] for a in built),
        "family_bytes": family_sizes,
        "blend": os.path.relpath(BLEND_OUT, ROOT),
    }
    with open(REPORT, "w") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    return report


if __name__ == "__main__":
    main()
