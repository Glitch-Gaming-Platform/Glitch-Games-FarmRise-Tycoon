"""Render the DOM interface icon set from the authored FarmRise meshes.

Run after ``npm run art:build`` so ``art/source/farmrise_assets.blend`` is
current:

    blender --background art/source/farmrise_assets.blend \
      --python tools/blender/render_ui_icons.py

The output is intentionally raster UI art rather than new world textures. The
3D game remains vertex-colour-only; these transparent WebPs let menus show the
same crops, buildings, animals and character the player sees in the farm.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time

import bpy
from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from palette import linear_rgba  # noqa: E402

OUT_DIR = os.path.join(ROOT, "apps", "game", "public", "assets", "ui", "icons")
REPORT = os.path.join(ROOT, "art", "ui_icon_report.json")

SOURCES = {
    obj.name: obj.data
    for obj in bpy.data.objects
    if obj.type == "MESH" and obj.name.startswith("SM_")
}


def material(name: str, palette_name: str, roughness: float = 0.88):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = linear_rgba(palette_name)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def clear_render_objects() -> None:
    for obj in list(bpy.context.scene.objects):
        if obj.get("ui_render"):
            bpy.data.objects.remove(obj, do_unlink=True)


def mark(obj):
    obj["ui_render"] = True
    return obj


def instance(name: str, location=(0, 0, 0), rotation_z=0.0, scale=1.0):
    mesh = SOURCES.get(name)
    if mesh is None:
        raise RuntimeError(f"UI icon source mesh is missing: {name}")
    obj = mark(bpy.data.objects.new(f"UI_{name}", mesh))
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(location)
    obj.rotation_euler = Euler((0, 0, rotation_z), "XYZ")
    obj.scale = (scale, scale, scale)
    return obj


def add_cube(name: str, location, scale, palette_name: str, rotation_z=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, scale=scale)
    obj = mark(bpy.context.active_object)
    obj.name = name
    obj.rotation_euler.z = rotation_z
    obj.data.materials.append(material(f"M_UI_{palette_name}", palette_name))
    bevel = obj.modifiers.new("UI bevel", "BEVEL")
    bevel.width = 0.06
    bevel.segments = 2
    return obj


def add_ground_disc(radius=1.52):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=0.08, location=(0, 0, -0.05))
    disc = mark(bpy.context.active_object)
    disc.name = "UI_GroundDisc"
    disc.scale.y = 0.72
    disc.data.materials.append(material("M_UI_Ground", "sand_path", 0.96))
    return disc


def add_gear():
    parts = []
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.63,
        minor_radius=0.16,
        major_segments=24,
        minor_segments=8,
        location=(0, 0, 0.75),
        rotation=(math.radians(90), 0, 0),
    )
    ring = mark(bpy.context.active_object)
    ring.data.materials.append(material("M_UI_Gear", "metal_galv", 0.78))
    parts.append(ring)
    for index in range(8):
        angle = index * math.tau / 8
        part = add_cube(
            f"UI_GearTooth_{index}",
            (math.cos(angle) * 0.82, 0, 0.75 + math.sin(angle) * 0.82),
            (0.19, 0.16, 0.13),
            "wall_teal",
            -angle,
        )
        parts.append(part)
    return parts


def add_eggs():
    eggs = []
    for index, (x, y, scale) in enumerate(((-0.45, 0.02, 0.72), (0.0, -0.08, 0.84), (0.46, 0.05, 0.68))):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=20,
            ring_count=12,
            location=(x, y, 0.45 * scale),
            scale=(0.36 * scale, 0.30 * scale, 0.48 * scale),
        )
        egg = mark(bpy.context.active_object)
        egg.name = f"UI_Egg_{index}"
        egg.data.materials.append(material("M_UI_Egg", "chicken_body", 0.92))
        eggs.append(egg)
    return eggs


def add_contract_sign():
    board = add_cube("UI_ContractBoard", (0, 0.1, 0.78), (0.88, 0.12, 0.62), "trim_white")
    header = add_cube("UI_ContractHeader", (0, -0.04, 1.2), (0.74, 0.08, 0.12), "wall_teal")
    stamp = add_cube("UI_ContractStamp", (0.47, -0.05, 0.58), (0.18, 0.07, 0.18), "wheat_ready", math.radians(45))
    return [board, header, stamp, instance("SM_crop_wheat_s4", (-0.35, -0.2, 0.04), scale=0.58)]


def bounds(objects):
    # Object placement and scaling are authored immediately before this call.
    # Force Blender to refresh matrix_world so multi-object icons normalize as
    # a complete composition rather than occasionally clipping an edge asset.
    bpy.context.view_layer.update()
    points = []
    for obj in objects:
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return minimum, maximum


def normalise(objects, target=2.45):
    minimum, maximum = bounds(objects)
    centre = (minimum + maximum) * 0.5
    size = maximum - minimum
    factor = target / max(size.x, size.y, size.z, 0.001)
    for obj in objects:
        obj.location = (obj.location - Vector((centre.x, centre.y, minimum.z))) * factor
        obj.scale = tuple(value * factor for value in obj.scale)


def add_camera(width: int, height: int, hero=False):
    data = bpy.data.cameras.new("UI_Camera")
    data.type = "ORTHO"
    data.ortho_scale = 3.72 if not hero else 5.3
    camera = mark(bpy.data.objects.new("UI_Camera", data))
    bpy.context.scene.collection.objects.link(camera)
    camera.location = Vector((4.4, -6.8, 4.2 if not hero else 3.7))
    target = Vector((0, 0, 0.9))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 80
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def add_lighting():
    world = bpy.data.worlds.get("UI_World") or bpy.data.worlds.new("UI_World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = linear_rgba("sky_haze")
    background.inputs["Strength"].default_value = 0.65
    bpy.context.scene.world = world

    sun_data = bpy.data.lights.new("UI_Sun", "AREA")
    sun_data.energy = 650
    sun_data.shape = "DISK"
    sun_data.size = 5.0
    sun = mark(bpy.data.objects.new("UI_Sun", sun_data))
    sun.location = (3.5, -4.5, 7.0)
    sun.rotation_euler = (Vector((0, 0, 0.7)) - sun.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(sun)


def render_icon(filename: str, factory, width=256, height=256, hero=False):
    clear_render_objects()
    objects = list(factory())
    normalise(objects, 3.35 if hero else 2.92)
    add_ground_disc(1.95 if hero else 1.42)
    add_camera(width, height, hero)
    add_lighting()
    path = os.path.join(OUT_DIR, filename)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def single(name: str, rotation=math.radians(-24), scale=1.0):
    return lambda: [instance(name, rotation_z=rotation, scale=scale)]


def market_group():
    return [
        instance("SM_crop_wheat_s4", (-0.82, 0.18, 0), rotation_z=-0.25, scale=0.76),
        instance("SM_crop_corn_s4", (0.05, 0.08, 0), rotation_z=0.12, scale=0.8),
        instance("SM_crop_pumpkin_s4", (0.86, 0.2, 0), rotation_z=0.35, scale=0.76),
    ]


def land_group():
    return [
        instance("SM_ground_plot", (-0.25, 0.15, 0), rotation_z=-0.25, scale=1.05),
        instance("SM_prop_eucalyptus", (0.72, 0.42, 0), rotation_z=0.2, scale=0.62),
    ]


def hero_group():
    return [
        instance("SM_building_barn", (1.12, 0.88, 0), rotation_z=-0.12, scale=0.72),
        instance("SM_char_farmer", (-1.25, -0.32, 0), rotation_z=math.radians(18), scale=1.12),
        instance("SM_crop_wheat_s4", (-0.25, 0.52, 0), rotation_z=-0.2, scale=0.48),
        instance("SM_crop_pumpkin_s4", (-0.15, -0.68, 0), rotation_z=0.3, scale=0.48),
        instance("SM_animal_chicken", (0.7, -0.72, 0), rotation_z=-0.4, scale=0.76),
    ]


def tools_group():
    return [
        instance("SM_tool_watering_can", (-0.52, 0.10, 0), rotation_z=-0.34, scale=1.18),
        instance("SM_tool_sickle", (0.02, 0.18, 0), rotation_z=0.62, scale=1.25),
        instance("SM_tool_trowel", (0.52, 0.02, 0), rotation_z=-0.42, scale=1.18),
    ]


ICONS = {
    "hero-farm.webp": (hero_group, 560, 320, True),
    "farmer.webp": (single("SM_char_farmer", math.radians(18)), 192, 192, False),
    "settings.webp": (add_gear, 192, 192, False),
    "market.webp": (market_group, 192, 192, False),
    "contract.webp": (add_contract_sign, 192, 192, False),
    "wheat.webp": (single("SM_crop_wheat_s4"), 192, 192, False),
    "corn.webp": (single("SM_crop_corn_s4"), 192, 192, False),
    "pumpkin.webp": (single("SM_crop_pumpkin_s4"), 192, 192, False),
    "eggs.webp": (add_eggs, 192, 192, False),
    "barn.webp": (single("SM_building_barn"), 192, 192, False),
    "irrigation.webp": (single("SM_building_irrigation"), 192, 192, False),
    "road.webp": (single("SM_building_road"), 192, 192, False),
    "fence.webp": (single("SM_building_fence"), 192, 192, False),
    "chicken.webp": (single("SM_animal_chicken"), 192, 192, False),
    "land.webp": (land_group, 192, 192, False),
    "warning.webp": (single("SM_animal_fox"), 192, 192, False),
    "watering.webp": (single("SM_tool_watering_can", math.radians(-18)), 192, 192, False),
    "harvest.webp": (single("SM_tool_sickle", math.radians(32)), 192, 192, False),
    "tools.webp": (tools_group, 192, 192, False),
}


def main():
    started = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)
    for obj in bpy.data.objects:
        obj.hide_render = True

    outputs = []
    for filename, (factory, width, height, hero) in ICONS.items():
        path = render_icon(filename, factory, width, height, hero)
        outputs.append({"file": filename, "bytes": os.path.getsize(path)})

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "blender": bpy.app.version_string,
        "duration_seconds": round(time.time() - started, 2),
        "icons": outputs,
        "total_bytes": sum(item["bytes"] for item in outputs),
    }
    with open(REPORT, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
