"""
Render the review sheets the visual rubric is graded against.

Three passes, because they answer three different questions:

  contact_sheet.png     Does each asset read on its own? (form, proportion,
                        colour separation, detail hierarchy)
  gameplay_distance.png Does it read in situ, from the actual follow camera?
                        This is the ONLY view that decides whether the art
                        works, and it is the one most easily skipped.
  silhouette.png        Does it read with all colour removed? If an asset is
                        unidentifiable here, it is relying on colour to do a
                        job that shape should be doing.

Run after build_assets.py:
    blender --background --python tools/blender/review_render.py
"""

from __future__ import annotations

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from palette import (  # noqa: E402
    GAMEPLAY_REVIEW_DISTANCE,
    GAMEPLAY_REVIEW_PITCH_DEGREES,
    PALETTE,
    TILE_SIZE,
    linear_rgba,
)

OUT_DIR = os.path.join(ROOT, "art", "review")
BLEND = os.path.join(ROOT, "art", "source", "farmrise_assets.blend")


def clear() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=True)


def setup_render(width=1400, height=800, samples=32) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    # Standard, matching the change made to the engine: this art direction
    # depends on flat saturated colour reaching the screen unmodified, and a
    # filmic curve desaturates exactly the crop hues the gameplay read needs.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        scene.eevee.taa_render_samples = samples
    except AttributeError:
        pass


def world_colour(name: str, strength: float = 1.0) -> None:
    world = bpy.data.worlds.get("ReviewWorld") or bpy.data.worlds.new("ReviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = linear_rgba(name) if name in PALETTE else (1, 1, 1, 1)
    bg.inputs[1].default_value = strength
    bpy.context.scene.world = world


def add_sun() -> bpy.types.Object:
    """
    One key light, matching the game's single DirectionalLight. The game also
    has a hemisphere fill, which is approximated here by the world colour.
    """
    data = bpy.data.lights.new("Sun", type="SUN")
    data.energy = 3.2
    data.color = (1.0, 0.95, 0.86)
    data.angle = math.radians(6)   # soft-ish contact shadows, not razor edges
    obj = bpy.data.objects.new("Sun", data)
    obj.rotation_euler = Euler((math.radians(52), 0, math.radians(38)), "XYZ")
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _hash2(ix: int, iz: int) -> float:
    """Mirror of hash2() in apps/game/src/game/world/view/groundGeometry.ts."""
    h = (ix * 374761393 + iz * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296.0


def _smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = min(1.0, max(0.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def _value_noise(x: float, z: float) -> float:
    x0, z0 = math.floor(x), math.floor(z)
    sx = _smoothstep(0, 1, x - x0)
    sz = _smoothstep(0, 1, z - z0)
    a = _hash2(x0, z0) + (_hash2(x0 + 1, z0) - _hash2(x0, z0)) * sx
    bb = _hash2(x0, z0 + 1) + (_hash2(x0 + 1, z0 + 1) - _hash2(x0, z0 + 1)) * sx
    return a + (bb - a) * sz


def _fbm(x: float, z: float) -> float:
    return (0.60 * _value_noise(x / 11, z / 11)
            + 0.28 * _value_noise(x / 4.1, z / 4.1)
            + 0.12 * _value_noise(x / 1.7, z / 1.7))


def add_ground(colour: str, size: float = 80.0, variation: bool = False,
               playable: float = 32.0) -> bpy.types.Object:
    """
    The ground. With `variation`, this reproduces the runtime ground exactly:
    the same integer hash, the same three octaves, the same value and lushness
    ranges, the same flat-inside-the-playable-grid rule.

    The duplication is deliberate and is the point. If the review render used a
    flat plane while the game shipped a varied one, every grade written against
    these images would be a grade of something the player never sees - which is
    precisely the failure the review pass exists to prevent.
    """
    if not variation:
        bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
        plane = bpy.context.active_object
        plane["is_ground"] = True
        mat = bpy.data.materials.new(f"M_Ground_{colour}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = linear_rgba(colour)
        bsdf.inputs["Roughness"].default_value = 0.95
        plane.data.materials.append(mat)
        return plane

    segments = max(1, int(round(size / 2.0)))
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=segments, y_subdivisions=segments,
                                    size=size, location=(0, 0, 0))
    plane = bpy.context.active_object
    plane["is_ground"] = True
    mesh = plane.data

    relief_falloff = max(1.0, (size - playable) / 4.0)
    layer = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for i, vertex in enumerate(mesh.vertices):
        x, y = vertex.co.x, vertex.co.y
        dx = max(0.0, abs(x) - playable / 2)
        dy = max(0.0, abs(y) - playable / 2)
        outside = math.hypot(dx, dy)
        if outside > 0:
            ramp = _smoothstep(0, relief_falloff, outside)
            vertex.co.z = (_fbm(x * 0.55, y * 0.55) - 0.5) * 2 * 0.85 * ramp
        value = 0.76 + _fbm(x, y) * 0.42
        lush = _smoothstep(0.43, 0.78, _fbm(x * 0.37 + 71.3, y * 0.37 - 19.7))
        ochre = _smoothstep(0.53, 0.83, _fbm(x * 0.23 - 31.4, y * 0.23 + 48.8))
        green_red = 1 - 0.43 * lush
        green_green = 1 + 0.15 * lush
        green_blue = 1 - 0.42 * lush
        earth_red = 1 + 0.11 * ochre * (1 - lush)
        earth_green = 1 - 0.24 * ochre * (1 - lush)
        earth_blue = 1 - 0.32 * ochre * (1 - lush)
        layer.data[i].color = (value * green_red * earth_red,
                               value * green_green * earth_green,
                               value * green_blue * earth_blue, 1.0)

    mat = bpy.data.materials.new(f"M_GroundVaried_{colour}")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    base = nodes.new("ShaderNodeRGB")
    base.outputs[0].default_value = linear_rgba(colour)
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 1.0
    links.new(base.outputs[0], mix.inputs["Color1"])
    links.new(attr.outputs["Color"], mix.inputs["Color2"])
    links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    mesh.materials.append(mat)
    return plane


# Mesh datablocks captured from the master before the first clear(). The
# review script runs inside the same Blender session that built the assets,
# so appending from the file would mean appending from ourselves - which
# Blender refuses. Instancing the datablocks directly is also cheaper: every
# placement of the same asset shares one mesh, exactly as the engine does.
SOURCES: dict[str, bpy.types.Mesh] = {}
SOURCE_MATERIALS: dict[str, list[str]] = {}


def capture_sources() -> int:
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("SM_"):
            obj.data.use_fake_user = True   # survives the scene being emptied
            SOURCES[obj.name] = obj.data
            SOURCE_MATERIALS[obj.name] = [
                m.name if m else "" for m in obj.data.materials
            ]
    return len(SOURCES)


def assert_sources_unpainted(after_pass: str) -> None:
    """
    A render pass may dress its own objects; it may never repaint the shared
    source meshes. Without this check the damage is invisible until some later
    pass renders the wrong colours, which is a slow and confusing way to find
    out.
    """
    for name, mesh in SOURCES.items():
        current = [m.name if m else "" for m in mesh.materials]
        expected = SOURCE_MATERIALS[name]
        if current != expected:
            raise RuntimeError(
                f"The '{after_pass}' pass mutated the shared mesh '{name}': "
                f"materials {expected} became {current}. Use override_material(), "
                f"which sets object-linked slots, instead of writing to obj.data."
            )


def link_asset(name: str, location, rotation_z: float = 0.0, scale: float = 1.0):
    """Places a new object sharing the captured mesh datablock."""
    mesh = SOURCES.get(name)
    if mesh is None:
        return None
    obj = bpy.data.objects.new(f"{name}_inst", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(location)
    obj.rotation_euler = Euler((0, 0, rotation_z), "XYZ")
    obj.scale = (scale, scale, scale)
    return obj


def add_player_outline(player: bpy.types.Object) -> bpy.types.Object:
    """Mirror the engine's player-only inverted-hull readability rim."""
    mesh = player.data.copy()
    mesh.name = "SM_char_farmer_outline_mesh"
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    outline = bpy.data.objects.new("SM_char_farmer_outline", mesh)
    outline.location = player.location.copy()
    outline.rotation_euler = player.rotation_euler.copy()
    outline.scale = tuple(value * 1.04 for value in player.scale)
    outline["is_player_outline"] = True
    bpy.context.scene.collection.objects.link(outline)

    mat = bpy.data.materials.get("M_PlayerOutline") or bpy.data.materials.new("M_PlayerOutline")
    mat.use_nodes = True
    mat.use_backface_culling = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = linear_rgba("roof_grey_light")
    bsdf.inputs["Roughness"].default_value = 1.0
    outline.data.materials.append(mat)
    return outline


def add_camera(location, look_at, lens=42.0) -> bpy.types.Object:
    data = bpy.data.cameras.new("ReviewCam")
    data.lens = lens
    obj = bpy.data.objects.new("ReviewCam", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(location)
    direction = Vector(look_at) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = obj
    return obj


def render_to(filename: str) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, filename)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# ==========================================================================
# Pass 1 - contact sheet
# ==========================================================================

CONTACT_ROWS = [
    ["SM_crop_wheat_s1", "SM_crop_wheat_s2", "SM_crop_wheat_s3", "SM_crop_wheat_s4",
     "SM_crop_corn_s1", "SM_crop_corn_s2", "SM_crop_corn_s3", "SM_crop_corn_s4"],
    ["SM_crop_pumpkin_s1", "SM_crop_pumpkin_s2", "SM_crop_pumpkin_s3", "SM_crop_pumpkin_s4",
     "SM_char_farmer", "SM_animal_chicken", "SM_animal_fox", "SM_prop_rock"],
    ["SM_building_fence", "SM_building_road", "SM_building_irrigation",
     "SM_prop_water_trough", "SM_building_coop", "SM_building_barn"],
    ["SM_prop_grass_tuft", "SM_prop_bush", "SM_prop_wildflowers",
     "SM_prop_scrub_patch", "SM_prop_rock_cluster", "SM_prop_dead_tree",
     "SM_prop_eucalyptus"],
    ["SM_prop_eucalyptus_tall", "SM_tool_watering_can", "SM_tool_sickle",
     "SM_tool_trowel"],
]


def contact_sheet() -> str:
    clear()
    setup_render(1800, 1250)
    world_colour("sand_path", 0.55)
    add_sun()
    add_ground("soil_tilled", 90)

    # Rows are spaced by the widest asset in the set (the barn, ~3.7 m) plus
    # margin, and the camera is placed far enough back with a long-ish lens
    # to keep perspective distortion off the silhouettes being judged.
    spacing = 3.4
    row_gap = 4.6
    for row_index, row in enumerate(CONTACT_ROWS):
        y = -row_index * row_gap
        offset = (len(row) - 1) * spacing / 2
        for col, name in enumerate(row):
            scale = 2.35 if name.startswith("SM_tool_") else 1.0
            link_asset(name, (col * spacing - offset, y, 0),
                       rotation_z=math.radians(-28), scale=scale)

    centre_y = -(len(CONTACT_ROWS) - 1) * row_gap / 2
    add_camera((0, centre_y - 44.0, 24.0), (0, centre_y, 1.0), lens=60)
    return render_to("contact_sheet.png")


# ==========================================================================
# Pass 2 - gameplay distance (the view that decides)
# ==========================================================================

def gameplay_scene() -> None:
    """
    A mock farm laid out like the real starter level: a 3x2 plot block with
    every crop at a different stage, structures behind, actors in front.
    """
    clear()
    setup_render(1600, 900, samples=64)
    world_colour("water_teal", 0.35)
    add_sun()
    # 96 m of visible land around a 32 m playable grid - the same 3x extent the
    # engine builds, so the relief ramps in at the same place it does in game.
    add_ground("ground_scrub", 96, variation=True, playable=32.0)

    # Six plots on their own tilled beds, laid out on the 2 m tile grid so
    # the review scene matches the level the engine actually builds.
    layout = [
        ("SM_crop_wheat_s4", -3, 2), ("SM_crop_wheat_s2", -2, 2),
        ("SM_crop_corn_s4", -1, 2), ("SM_crop_corn_s3", 0, 2),
        ("SM_crop_pumpkin_s4", -3, 1), ("SM_crop_pumpkin_s2", -2, 1),
        ("SM_crop_wheat_s3", -1, 1), ("SM_crop_pumpkin_s3", 0, 1),
        ("SM_crop_corn_s2", -3, 0), ("SM_crop_wheat_s1", -2, 0),
        ("SM_crop_pumpkin_s1", -1, 0), ("SM_crop_corn_s1", 0, 0),
    ]
    for name, tx, ty in layout:
        x, y = tx * TILE_SIZE, ty * TILE_SIZE
        link_asset("SM_ground_plot", (x, y, 0.0))
        link_asset(name, (x, y, 0.10))

    link_asset("SM_building_barn", (-5.3, 8.3, 0), rotation_z=math.radians(10))
    link_asset("SM_building_coop", (5.0, 7.0, 0), rotation_z=math.radians(-14))
    link_asset("SM_building_irrigation", (1.4, 7.1, 0), rotation_z=math.radians(-4))
    link_asset("SM_prop_water_trough", (4.1, 5.3, 0), rotation_z=math.radians(-18))
    for i in range(4):
        link_asset("SM_building_fence", (2.7 + i * TILE_SIZE * 0.96, 4.0, 0))
    for i in range(3):
        link_asset("SM_building_fence", (7.5, 4.9 + i * TILE_SIZE * 0.96, 0),
                   rotation_z=math.radians(90))
    for i in range(5):
        link_asset("SM_building_road", (0.7, -2.8 + i * TILE_SIZE * 0.98, 0))
    link_asset("SM_prop_rock_cluster", (7.6, 1.0, 0), rotation_z=0.4)
    link_asset("SM_prop_rock", (-8.0, 2.8, 0))
    # Scatter dressing. Large flat areas of scrub read as empty rather than
    # as land, and these are the cheapest possible fix.
    for i, (gx, gy) in enumerate([
        (-9.2, -2.0), (-6.2, -4.5), (-2.5, -5.5), (2.2, -4.2), (6.0, -2.5),
        (8.6, 0.5), (7.5, 9.0), (-4.0, 11.0), (3.0, 11.0), (-9.8, 6.0),
        (9.4, 5.5), (0.0, -6.5), (-7.0, 1.0), (4.5, 2.5), (-5.0, -1.5),
        (2.5, 2.8), (7.0, -4.5), (-8.4, 9.0),
    ]):
        link_asset("SM_prop_grass_tuft", (gx, gy, 0), rotation_z=i * 0.7)
    for i, (bx, by) in enumerate([(-9.5, -0.5), (9.0, 8.0), (-5.5, 12.0), (5.5, -5.5)]):
        link_asset("SM_prop_bush", (bx, by, 0), rotation_z=i * 1.1)

    for i, (px, py, scale) in enumerate([
        (-7.4, -2.2, 1.25), (-4.8, -4.6, 0.95), (3.4, -4.7, 1.1),
        (7.0, -2.7, 1.25), (-8.2, 6.0, 1.05), (8.4, 8.8, 1.15),
        (-1.0, 10.8, 1.2),
    ]):
        link_asset("SM_prop_scrub_patch", (px, py, 0.006),
                   rotation_z=i * 0.67, scale=scale)
    for i, (fx, fy) in enumerate([
        (-6.6, -2.5), (-3.7, -4.1), (3.0, -3.6), (6.8, 1.8),
        (-8.0, 7.6), (8.2, 7.2),
    ]):
        link_asset("SM_prop_wildflowers", (fx, fy, 0), rotation_z=i * 0.81)

    # Tree crowns frame the playable farm without turning the centre into a
    # forest. Their broad clustered masses are the visual richness seen in
    # the Dinkum references, achieved without per-leaf geometry.
    for i, (tx, ty, scale) in enumerate([
        (-9.4, 4.2, 1.10), (-8.7, 8.7, 1.25), (-6.8, 11.8, 1.0),
        (6.7, 10.8, 1.10), (9.0, 6.6, 1.25), (9.4, 1.9, 0.95),
    ]):
        tree_name = "SM_prop_eucalyptus_tall" if i % 2 else "SM_prop_eucalyptus"
        link_asset(tree_name, (tx, ty, 0), rotation_z=i * 0.83,
                   scale=scale)
    link_asset("SM_prop_dead_tree", (-8.7, -0.5, 0), rotation_z=-0.5, scale=1.05)

    player = link_asset("SM_char_farmer", (-0.6, -2.1, 0), rotation_z=math.radians(155))
    if player:
        add_player_outline(player)
    link_asset("SM_animal_chicken", (4.8, 5.8, 0), rotation_z=math.radians(-60))
    link_asset("SM_animal_chicken", (6.0, 6.1, 0), rotation_z=math.radians(20))
    link_asset("SM_animal_chicken", (5.7, 4.9, 0), rotation_z=math.radians(130))
    link_asset("SM_animal_fox", (7.4, 3.1, 0), rotation_z=math.radians(-130))

    # The real camera: 20 m out, ~61 degrees, matching FollowController.
    # Read from the palette module so this can never drift from what the
    # engine actually ships. 38 degrees, not 61: the first review was shot at
    # 61 and read as near-top-down, foreshortening away all vertical crop
    # mass and letting flat ground dominate the frame.
    distance = GAMEPLAY_REVIEW_DISTANCE
    pitch = math.radians(GAMEPLAY_REVIEW_PITCH_DEGREES)
    target = Vector((-1.6, 2.3, 1.0))
    cam_pos = target + Vector((
        math.sin(math.radians(18)) * math.cos(pitch) * distance,
        -math.cos(math.radians(18)) * math.cos(pitch) * distance,
        math.sin(pitch) * distance,
    ))
    add_camera(cam_pos, target, lens=42)


def gameplay_distance() -> str:
    gameplay_scene()
    return render_to("gameplay_distance.png")


def accessibility_variants(source_path: str) -> dict[str, str]:
    """Render the palette checks the rubric requires beyond raw contrast."""
    import numpy as np

    source = bpy.data.images.load(source_path, check_existing=False)
    width, height = source.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    source.pixels.foreach_get(pixels)
    rgba = pixels.reshape((height, width, 4))
    rgb = rgba[:, :, :3]

    transforms = {
        "protanopia": np.array([
            [0.152286, 1.052583, -0.204868],
            [0.114503, 0.786281, 0.099216],
            [-0.003882, -0.048116, 1.051998],
        ], dtype=np.float32),
        "deuteranopia": np.array([
            [0.367322, 0.860646, -0.227968],
            [0.280085, 0.672501, 0.047413],
            [-0.011820, 0.042940, 0.968881],
        ], dtype=np.float32),
        "tritanopia": np.array([
            [1.255528, -0.076749, -0.178779],
            [-0.078411, 0.930809, 0.147602],
            [0.004733, 0.691367, 0.303900],
        ], dtype=np.float32),
    }

    outputs: dict[str, str] = {}
    for name, matrix in transforms.items():
        converted = np.clip(rgb @ matrix.T, 0.0, 1.0)
        variant = np.concatenate((converted, rgba[:, :, 3:4]), axis=2)
        image = bpy.data.images.new(f"Review_{name}", width=width, height=height, alpha=True)
        image.pixels.foreach_set(variant.ravel())
        path = os.path.join(OUT_DIR, f"gameplay_{name}.png")
        image.file_format = "PNG"
        image.filepath_raw = path
        image.save()
        outputs[name] = path
        bpy.data.images.remove(image)

    # Outdoor mobile screens lose contrast before they lose hue. Blending
    # toward white approximates glare and catches crops that only read in a
    # perfectly dark review room.
    glare_rgb = np.clip(rgb * 0.76 + 0.24, 0.0, 1.0)
    glare = np.concatenate((glare_rgb, rgba[:, :, 3:4]), axis=2)
    image = bpy.data.images.new("Review_bright_sun", width=width, height=height, alpha=True)
    image.pixels.foreach_set(glare.ravel())
    path = os.path.join(OUT_DIR, "gameplay_bright_sun.png")
    image.file_format = "PNG"
    image.filepath_raw = path
    image.save()
    outputs["bright_sun"] = path
    bpy.data.images.remove(image)
    bpy.data.images.remove(source)
    return outputs


# ==========================================================================
# Pass 3 - silhouette
# ==========================================================================

def override_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    """
    Point this object's slots at `mat` WITHOUT touching the mesh datablock.

    Every review object shares its mesh with the master asset - link_asset
    instances the datablock rather than copying it - so writing materials into
    obj.data repaints the source assets for every later pass. That is exactly
    what went wrong the first time this ran: the silhouette pass painted the
    shared meshes with flat black emission, and the portrait pass that followed
    rendered the farmer as a black cut-out. Object-linked slots keep the
    override on the instance, which is what slot linking exists for.
    """
    if not obj.data.materials:
        obj.data.materials.append(None)   # a slot must exist before it can be overridden
    for slot in obj.material_slots:
        slot.link = "OBJECT"
        slot.material = mat


def silhouette() -> str:
    gameplay_scene()
    world_colour("_white", 1.0)
    bpy.context.scene.world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    bpy.context.scene.world.node_tree.nodes["Background"].inputs[1].default_value = 3.0

    black = bpy.data.materials.new("M_Silhouette")
    black.use_nodes = True
    nodes = black.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (0.02, 0.02, 0.03, 1)
    black.node_tree.links.new(emit.outputs[0], out.inputs["Surface"])

    white = bpy.data.materials.new("M_SilhouetteOutline")
    white.use_nodes = True
    white_nodes = white.node_tree.nodes
    white_nodes.clear()
    white_out = white_nodes.new("ShaderNodeOutputMaterial")
    white_emit = white_nodes.new("ShaderNodeEmission")
    white_emit.inputs[0].default_value = (1, 1, 1, 1)
    white.node_tree.links.new(white_emit.outputs[0], white_out.inputs["Surface"])
    white.use_backface_culling = True

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if obj.get("is_player_outline"):
            override_material(obj, white)
            continue
        if obj.get("is_ground") or obj.name.startswith("Cube"):
            obj.hide_render = True   # ground and soil slab stay white
            continue
        override_material(obj, black)

    for light in [o for o in bpy.context.scene.objects if o.type == "LIGHT"]:
        light.hide_render = True

    return render_to("silhouette.png")


def character_portrait() -> str:
    """
    A close-up of the farmer.

    Added because "how good is the face?" cannot be answered from the 20 m
    gameplay view, and it is the question most often asked about a character.
    It is explicitly NOT the view the art is optimised for - the gameplay pass
    remains the one that decides - but it is the honest way to show what the
    face actually is.
    """
    clear()
    setup_render(900, 1000, samples=64)
    world_colour("sand_path", 0.75)
    add_sun()
    add_ground("ground_scrub", 40)
    # The farmer's face is authored on -Y (see the eye_y constant in assets.py),
    # so the rest pose already looks toward a camera placed at negative Y. The
    # camera sits at a bearing of about 27 degrees off that axis, and turning
    # the head 16 degrees leaves roughly 11 degrees of turn away from lens - a
    # three-quarter portrait, which shows both the brow angle and the profile
    # of the nose instead of flattening them.
    link_asset("SM_char_farmer", (0, 0, 0), rotation_z=math.radians(16))

    # Eye height, slightly above and to the side: a portrait framing rather
    # than the top-down the game uses.
    add_camera((0.95, -1.85, 1.72), (0, 0, 1.42), lens=85)
    return render_to("character_portrait.png")


def main() -> dict:
    # `npm run art:review` starts a fresh Blender process. Load the generated
    # master explicitly when the current file is empty so the documented
    # build -> review workflow works across separate commands.
    if not any(obj.type == "MESH" and obj.name.startswith("SM_")
               for obj in bpy.data.objects):
        if not os.path.exists(BLEND):
            raise RuntimeError(
                f"Generated art file not found at {BLEND}. Run npm run art:build first."
            )
        bpy.ops.wm.open_mainfile(filepath=BLEND)
    captured = capture_sources()
    suffixed = [n for n in SOURCES if "." in n]
    if suffixed:
        raise RuntimeError(
            f"Datablock name collision: {suffixed[:3]}. A previous build left "
            f"orphaned meshes behind. Re-run build_assets.py, which purges them."
        )
    if captured == 0:
        raise RuntimeError(
            "No SM_* meshes in memory. Run build_assets.py in this session first, "
            "or open art/source/farmrise_assets.blend."
        )
    gameplay_path = gameplay_distance()
    paths = {"gameplay_distance": gameplay_path}
    assert_sources_unpainted("gameplay_distance")
    paths["contact_sheet"] = contact_sheet()
    assert_sources_unpainted("contact_sheet")
    paths["silhouette"] = silhouette()
    assert_sources_unpainted("silhouette")
    paths["character_portrait"] = character_portrait()
    assert_sources_unpainted("character_portrait")
    paths.update({f"accessibility_{name}": path
                  for name, path in accessibility_variants(gameplay_path).items()})
    paths["assets_captured"] = str(len(SOURCES))
    return paths


if __name__ == "__main__":
    main()
