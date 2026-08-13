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
    GAMEPLAY_REVIEW_FOV_DEGREES,
    GAMEPLAY_REVIEW_PITCH_DEGREES,
    GAMEPLAY_REVIEW_YAW_DEGREES,
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


def _distance_to_segment(x, y, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length_sq = dx * dx + dy * dy
    if length_sq <= 0.0001:
        return math.hypot(x - start[0], y - start[1])
    t = min(1.0, max(0.0, ((x - start[0]) * dx + (y - start[1]) * dy) / length_sq))
    return math.hypot(x - (start[0] + dx * t), y - (start[1] + dy * t))


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


def _surface_normal_height(x: float, y: float) -> float:
    return ((_fbm(x * 1.45 + 19.2, y * 1.45 - 41.7) - 0.5) * 0.075
            + (_fbm(x * 3.2 - 73.0, y * 3.2 + 12.0) - 0.5) * 0.018)


def _ground_sample(x, y, farmyard=None, pasture=None, worn_paths=()):
    macro = _fbm(x, y)
    grain = _fbm(x * 1.65 + 113.7, y * 1.65 - 87.2)
    brush = (math.sin(x * 0.18 + y * 0.075
                      + (_fbm(x * 0.31 - 27.0, y * 0.31 + 61.0) - 0.5) * 2.4)
             * 0.5 + 0.5)
    value = 0.72 + macro * 0.30 + (grain - 0.5) * 0.08 + (brush - 0.5) * 0.03
    lush = _smoothstep(0.35, 0.69, _fbm(x * 0.37 + 71.3, y * 0.37 - 19.7))
    ochre = _smoothstep(0.53, 0.83, _fbm(x * 0.23 - 31.4, y * 0.23 + 48.8))
    farmyard_weight = 0.0
    if farmyard:
        distance = math.hypot(x - farmyard[0], y - farmyard[1])
        farmyard_weight = 1 - _smoothstep(farmyard[2] * 0.38, farmyard[2], distance)
    pasture_weight = 0.0
    if pasture:
        distance = math.hypot(x - pasture[0], y - pasture[1])
        pasture_weight = 1 - _smoothstep(pasture[2] * 0.38, pasture[2], distance)
    worn = 0.0
    for start, end, width in worn_paths:
        distance = _distance_to_segment(x, y, start, end)
        worn = max(worn, 1 - _smoothstep(width * 0.55, width * 1.65, distance))
    traffic = min(1.0, max(0.0, worn * 0.94 + farmyard_weight * 0.68))
    local_pasture = min(1.0, max(0.0, max(lush, pasture_weight) * (1 - traffic)))
    local_earth = min(1.0, max(0.0,
        max(ochre * (1 - local_pasture), farmyard_weight * 0.72, worn)))
    return value, grain, local_pasture, local_earth


def add_ground(colour: str, size: float = 80.0, variation: bool = False,
               playable: float = 32.0, farmyard=None, pasture=None,
               worn_paths=()) -> bpy.types.Object:
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

    segments = max(1, int(round(size / 1.0)))
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=segments + 1, y_subdivisions=segments + 1,
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
        value, grain, local_pasture, local_earth = _ground_sample(
            x, y, farmyard, pasture, worn_paths)
        dry_fleck = _smoothstep(0.66, 0.86, grain) * (1 - local_pasture)
        green_red = 1 - 0.38 * local_pasture
        green_green = 1 + 0.14 * local_pasture
        green_blue = 1 - 0.37 * local_pasture
        earth_red = 1 + 0.17 * local_earth + dry_fleck * 0.035
        earth_green = 1 - 0.31 * local_earth - dry_fleck * 0.028
        earth_blue = 1 - 0.39 * local_earth - dry_fleck * 0.034
        layer.data[i].color = (value * green_red * earth_red,
                               value * green_green * earth_green,
                               value * green_blue * earth_blue, 1.0)

    # Match the runtime's texture-without-textures normal treatment. Geometry
    # remains flat inside the playable rectangle; only the light response is
    # tilted by a tiny deterministic cosmetic height field.
    epsilon = 0.32
    custom_normals = []
    for vertex in mesh.vertices:
        x, y = vertex.co.x, vertex.co.y
        dx_out = max(0.0, abs(x) - playable / 2)
        dy_out = max(0.0, abs(y) - playable / 2)
        if math.hypot(dx_out, dy_out) > 0:
            custom_normals.append((0.0, 0.0, 0.0))
            continue
        dx = (_surface_normal_height(x + epsilon, y)
              - _surface_normal_height(x - epsilon, y)) / (epsilon * 2)
        dy = (_surface_normal_height(x, y + epsilon)
              - _surface_normal_height(x, y - epsilon)) / (epsilon * 2)
        length = math.sqrt(dx * dx + dy * dy + 1)
        custom_normals.append((-dx / length, -dy / length, 1 / length))
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.normals_split_custom_set_from_vertices(custom_normals)

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
    # Blender's AUTO sensor fit resolves horizontally for this 16:9 render.
    # Make that contract explicit so vertical-FOV conversion stays stable.
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = 36.0
    data.lens = lens
    obj = bpy.data.objects.new("ReviewCam", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(location)
    direction = Vector(look_at) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = obj
    return obj


def lens_for_vertical_fov(vertical_fov_degrees: float, aspect: float) -> float:
    """Convert Three.js' vertical FOV to Blender's horizontal 36 mm sensor."""
    return 36.0 / (2 * aspect * math.tan(math.radians(vertical_fov_degrees) / 2))


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
     "SM_char_farmer", "SM_animal_chicken", "SM_animal_sheep", "SM_animal_cow", "SM_animal_dog", "SM_animal_fox"],
    ["SM_crop_clover_s1", "SM_crop_clover_s2", "SM_crop_clover_s3", "SM_crop_clover_s4"],
    ["SM_building_fence", "SM_building_road", "SM_building_irrigation",
     "SM_prop_water_trough", "SM_building_coop", "SM_building_barn"],
    ["SM_building_loading_pad", "SM_building_cold_store", "SM_building_worker_hut",
     "SM_building_well", "SM_building_mill", "SM_building_creamery",
     "SM_building_preserve_kitchen"],
    ["SM_prop_grass_tuft", "SM_prop_grass_carpet", "SM_prop_dirt_clods",
     "SM_prop_bush", "SM_prop_wildflowers", "SM_prop_scrub_patch",
     "SM_prop_rock_cluster", "SM_prop_rock"],
    ["SM_prop_eucalyptus_tall", "SM_prop_eucalyptus_wide",
     "SM_tool_watering_can", "SM_tool_sickle", "SM_tool_trowel"],
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
    add_camera((0, centre_y - 52.0, 28.0), (0, centre_y, 1.0), lens=62)
    return render_to("contact_sheet.png")


# ==========================================================================
# Focus sheets - the three asset groups graded in the production audit
# ==========================================================================

BUILDING_ROWS = [
    ["SM_building_barn", "SM_building_coop", "SM_building_irrigation", "SM_building_loading_pad"],
    ["SM_building_cold_store", "SM_building_worker_hut", "SM_building_well", "SM_building_mill"],
    ["SM_building_creamery", "SM_building_preserve_kitchen", "SM_building_fence", "SM_building_road"],
]


def _building_parts(name: str, x: float, y: float) -> None:
    if name == "SM_building_mill":
        link_asset("SM_building_mill_wheel", (x + 1.92, y, 1.04))
    elif name == "SM_building_cold_store":
        link_asset("SM_building_vent_fan", (x + 1.08, y - 1.95, 0.64))
    elif name == "SM_building_creamery":
        link_asset("SM_building_vent_fan", (x + 0.78, y - 1.91, 0.58))
    elif name == "SM_building_well":
        link_asset("SM_building_well_crank", (x + 0.74, y, 1.30))


def buildings_focus() -> str:
    clear()
    setup_render(1800, 1300, samples=64)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground("ground_scrub", 70, variation=True)
    spacing, row_gap = 5.2, 5.2
    for row_index, row in enumerate(BUILDING_ROWS):
        y = -row_index * row_gap
        offset = (len(row) - 1) * spacing / 2
        for col, name in enumerate(row):
            x = col * spacing - offset
            link_asset(name, (x, y, 0))
            _building_parts(name, x, y)
    centre_y = -(len(BUILDING_ROWS) - 1) * row_gap / 2
    add_camera((0, centre_y - 38.0, 23.0), (0, centre_y, 1.0), lens=50)
    return render_to("buildings_focus.png")


def buildings_detail_close() -> str:
    """Close enough to judge shingles, siding, hardware and window construction."""
    clear()
    setup_render(1400, 1200, samples=96)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground("ground_scrub", 24, variation=True)
    link_asset("SM_building_barn", (0, 0, 0), rotation_z=math.radians(-5))
    add_camera((0, -8.8, 3.4), (0, 0, 1.25), lens=68)
    return render_to("buildings_detail_close.png")


def cold_store_detail_close() -> str:
    clear()
    setup_render(1400, 1200, samples=96)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground("ground_scrub", 24, variation=True)
    link_asset("SM_building_cold_store", (0, 0, 0), rotation_z=math.radians(-4))
    _building_parts("SM_building_cold_store", 0, 0)
    add_camera((0, -8.3, 3.0), (0, 0, 1.12), lens=70)
    return render_to("building_cold_store_detail.png")


def worker_hut_detail_close() -> str:
    clear()
    setup_render(1400, 1200, samples=96)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground("ground_scrub", 24, variation=True)
    link_asset("SM_building_worker_hut", (0, 0, 0), rotation_z=math.radians(-5))
    add_camera((0, -8.5, 3.2), (0, 0, 1.16), lens=70)
    return render_to("building_worker_hut_detail.png")


def crop_focus_sheet(filename: str, crops) -> str:
    clear()
    setup_render(1600, 1150, samples=64)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground("ground_scrub", 55, variation=True)
    spacing, row_gap = 3.4, 3.5
    for row_index, crop in enumerate(crops):
        y = -row_index * row_gap
        for stage in (1, 2, 3, 4):
            x = (stage - 2.5) * spacing
            link_asset("SM_ground_plot", (x, y, 0))
            link_asset(f"SM_crop_{crop}_s{stage}", (x, y, 0.10))
    centre_y = -(len(crops) - 1) * row_gap / 2
    add_camera((0, centre_y - 24.0, 15.0), (0, centre_y, 0.48), lens=58)
    return render_to(filename)


def crops_focus() -> str:
    return crop_focus_sheet("crops_focus.png", ("wheat", "corn", "pumpkin", "clover"))


def seasonal_crops_focus(season: str, crops) -> str:
    return crop_focus_sheet(f"crops_{season}_focus.png", crops)


def trees_focus() -> str:
    clear()
    setup_render(1600, 1000, samples=64)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground("ground_scrub", 50, variation=True)
    names = ["SM_prop_eucalyptus", "SM_prop_eucalyptus_tall",
             "SM_prop_eucalyptus_wide", "SM_prop_dead_tree"]
    for index, name in enumerate(names):
        link_asset(name, ((index - 1.5) * 4.2, 0, 0),
                   rotation_z=math.radians(-18 + index * 9))
    add_camera((0, -24.0, 12.0), (0, 0, 1.25), lens=50)
    return render_to("trees_focus.png")


def terrain_focus() -> str:
    """Ground, bed, road and dressing hierarchy at a terrain-review distance."""
    clear()
    setup_render(1600, 1000, samples=64)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground(
        "ground_scrub", 54, variation=True, playable=32.0,
        farmyard=(-2.5, -1.0, 8.8), pasture=(7.0, 2.0, 8.4),
        worn_paths=[((-9.0, 6.0), (-2.0, -1.0), 1.45),
                    ((-2.0, -1.0), (7.0, 2.0), 1.25)],
    )
    for index, (x, y) in enumerate([
        (-6.0, -3.0), (-3.8, -3.0), (-1.6, -3.0),
        (-6.0, -0.8), (-3.8, -0.8), (-1.6, -0.8),
    ]):
        link_asset("SM_ground_plot", (x, y, 0), rotation_z=(index % 3 - 1) * 0.018)
    for index, (x, y, rotation) in enumerate([
        (2.2, -4.5, 0), (2.2, -2.55, 0), (2.2, -0.60, 0),
        (3.9, 0.78, math.radians(90)), (5.85, 0.78, math.radians(90)),
    ]):
        link_asset("SM_building_road", (x, y, 0), rotation_z=rotation,
                   scale=0.98 + (index % 2) * 0.025)
    for index, (x, y) in enumerate([
        (-9.0, 5.4), (-6.8, 5.9), (-4.7, 4.9), (-1.8, 5.7),
        (1.1, 5.1), (4.4, 4.8), (7.0, 4.0), (8.6, 2.1),
        (-9.4, 1.0), (-8.2, -4.8), (7.7, -4.2), (9.0, -1.2),
    ]):
        name = ["SM_prop_grass_tuft", "SM_prop_grass_carpet",
                "SM_prop_dirt_clods", "SM_prop_scrub_patch",
                "SM_prop_wildflowers", "SM_prop_bush"][index % 6]
        link_asset(name, (x, y, 0), rotation_z=index * 0.57,
                   scale=0.88 + (index % 5) * 0.08)
    add_camera((2.5, -23.5, 15.0), (-0.5, 0.0, 0.15), lens=52)
    return render_to("terrain_focus.png")


def trees_detail_close() -> str:
    """Close bark/branch/leaf review beside the dead-bark comparison."""
    clear()
    setup_render(1600, 1200, samples=96)
    world_colour("sand_path", 0.58)
    add_sun()
    add_ground("ground_scrub", 28, variation=True)
    link_asset("SM_prop_eucalyptus", (-1.55, 0, 0), rotation_z=math.radians(-14), scale=1.28)
    link_asset("SM_prop_dead_tree", (1.70, 0.10, 0), rotation_z=math.radians(12), scale=1.35)
    add_camera((0, -9.7, 4.8), (0, 0, 1.42), lens=68)
    return render_to("trees_detail_close.png")


# ==========================================================================
# Pass 2 - gameplay distance (the view that decides)
# ==========================================================================

def gameplay_scene() -> None:
    """
    The real starter-farm composition at canonical world coordinates, with
    representative crop stages substituted onto its six beds for art review.

    Coordinate source: packages/shared/src/domain/parcels.ts and
    packages/shared/src/rules/newCareer.ts. Keeping this scene on the same
    axes as TileGrid.tileToWorld() matters: a mirrored mock can appear balanced
    while the shipping follow camera crops the shelter or the beds.
    """
    clear()
    setup_render(1600, 900, samples=64)
    world_colour("water_teal", 0.35)
    add_sun()
    # 96 m of visible land around a 32 m playable grid - the same 3x extent the
    # engine builds, so the relief ramps in at the same place it does in game.
    add_ground(
        "ground_scrub", 96, variation=True, playable=32.0,
        farmyard=(-1.0, -2.2, 8.8), pasture=(7.0, 1.0, 8.4),
        worn_paths=[((-1.0, 3.0), (-1.0, -3.0), 1.45),
                    ((-1.0, -3.0), (7.0, 1.0), 1.25)],
    )

    # The shipped starter farm has six plots. Earlier versions put all twelve
    # crop-stage meshes here, which turned the decisive gameplay pass into a
    # beauty scene the real follow camera could never frame. The contact sheet
    # owns exhaustive stage coverage; this pass owns the actual six-plot read.
    layout = [
        ("SM_crop_wheat_s4", -5.0, -5.0),
        ("SM_crop_corn_s2", -1.0, -5.0),
        ("SM_crop_pumpkin_s4", 3.0, -5.0),
        ("SM_crop_wheat_s1", -5.0, -1.0),
        ("SM_crop_corn_s4", -1.0, -1.0),
        ("SM_crop_pumpkin_s2", 3.0, -1.0),
    ]
    for name, x, y in layout:
        link_asset("SM_ground_plot", (x, y, 0.0))
        link_asset(name, (x, y, 0.10))

    # The opening shelter is the coop mesh at STARTER_SHELTER (19, 16), which
    # TileGrid maps to (7, 1). The trough uses StructureView's exact offset.
    link_asset("SM_building_coop", (7.0, 1.0, 0))
    link_asset("SM_prop_water_trough", (5.1, -0.44, 0), rotation_z=-0.28)
    link_asset("SM_prop_rock_cluster", (11.0, 11.0, 0), rotation_z=0.4)
    link_asset("SM_prop_rock", (-13.0, -13.0, 0))
    # Scatter dressing. Large flat areas of scrub read as empty rather than
    # as land, and these are the cheapest possible fix.
    for i, (gx, gy) in enumerate([
        (-9.2, -2.0), (-6.2, -4.5), (-2.5, -5.5), (2.2, -4.2), (6.0, -2.5),
        (8.6, 0.5), (7.5, 9.0), (-4.0, 11.0), (3.0, 11.0), (-9.8, 6.0),
        (9.4, 5.5), (0.0, -6.5), (-7.0, 1.0), (4.5, 2.5), (-5.0, -1.5),
        (2.5, 2.8), (7.0, -4.5), (-8.4, 9.0),
    ]):
        grass_name = "SM_prop_grass_carpet" if i % 3 == 0 else "SM_prop_grass_tuft"
        link_asset(grass_name, (gx, gy, 0), rotation_z=i * 0.7,
                   scale=0.92 + (i % 4) * 0.06)
    for i, (bx, by) in enumerate([(-9.5, -0.5), (9.0, 8.0), (-5.5, 12.0), (5.5, -5.5)]):
        link_asset("SM_prop_bush", (bx, by, 0), rotation_z=i * 1.1)

    for i, (px, py, scale) in enumerate([
        (-7.4, -2.2, 1.25), (-4.8, -4.6, 0.95), (3.4, -4.7, 1.1),
        (7.0, -2.7, 1.25), (-8.2, 6.0, 1.05), (8.4, 8.8, 1.15),
        (-1.0, 10.8, 1.2),
    ]):
        link_asset("SM_prop_scrub_patch", (px, py, 0.006),
                   rotation_z=i * 0.67, scale=scale)
    for i, (dx, dy) in enumerate([(-6.8, 3.4), (-2.0, 6.8), (4.2, 7.4), (8.2, -0.8)]):
        link_asset("SM_prop_dirt_clods", (dx, dy, 0.004),
                   rotation_z=i * 0.91, scale=0.88 + i * 0.06)
    for i, (fx, fy) in enumerate([
        (-6.6, -2.5), (-3.7, -4.1), (3.0, -3.6), (6.8, 1.8),
        (-8.0, 7.6), (8.2, 7.2),
    ]):
        link_asset("SM_prop_wildflowers", (fx, fy, 0), rotation_z=i * 0.81)

    # Tree crowns frame the playable farm without turning the centre into a
    # forest. Separate lance leaves and visible twigs preserve negative space
    # while still combining into a readable canopy at gameplay distance.
    for i, (tx, ty, scale) in enumerate([
        (-9.4, 4.2, 1.10), (-8.7, 8.7, 1.25), (-6.8, 11.8, 1.0),
        (6.7, 10.8, 1.10), (9.0, 6.6, 1.25), (9.4, 1.9, 0.95),
    ]):
        tree_name = ["SM_prop_eucalyptus", "SM_prop_eucalyptus_tall",
                     "SM_prop_eucalyptus_wide"][i % 3]
        link_asset(tree_name, (tx, ty, 0), rotation_z=i * 0.83,
                   scale=scale)
    link_asset("SM_prop_dead_tree", (-8.7, -0.5, 0), rotation_z=-0.5, scale=1.05)

    player = link_asset("SM_char_farmer", (-1.0, 3.0, 0), rotation_z=math.radians(155))
    if player:
        add_player_outline(player)
    link_asset("SM_animal_chicken", (6.4, 1.8, 0), rotation_z=math.radians(-60))
    link_asset("SM_animal_chicken", (7.8, 0.8, 0), rotation_z=math.radians(20))
    link_asset("SM_animal_sheep", (5.2, 0.1, 0), rotation_z=math.radians(-18))
    link_asset("SM_animal_dog", (7.0, 3.0, 0), rotation_z=math.radians(35))
    link_asset("SM_animal_fox", (9.3, 3.4, 0), rotation_z=math.radians(-130))

    # Every component comes from the shared camera constants. Azimuth matters
    # as much as pitch: a 45-degree runtime default cropped the shelter while
    # this review used an undocumented 18-degree beauty composition.
    distance = GAMEPLAY_REVIEW_DISTANCE
    pitch = math.radians(GAMEPLAY_REVIEW_PITCH_DEGREES)
    yaw = math.radians(GAMEPLAY_REVIEW_YAW_DEGREES)
    # FollowController looks at the player, not at an art-directed point in the
    # field. Keeping the review target on the farmer prevents a beauty-shot
    # offset from hiding runtime edge crops and shelter occlusion.
    target = Vector((-1.0, 3.0, 1.0))
    cam_pos = target + Vector((
        math.sin(yaw) * math.cos(pitch) * distance,
        math.cos(yaw) * math.cos(pitch) * distance,
        math.sin(pitch) * distance,
    ))
    scene = bpy.context.scene
    aspect = scene.render.resolution_x / scene.render.resolution_y
    lens = lens_for_vertical_fov(GAMEPLAY_REVIEW_FOV_DEGREES, aspect)
    add_camera(cam_pos, target, lens=lens)


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

    Added because "how good is the face?" cannot be answered from the
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


def character_gameplay_read() -> str:
    """Front three-quarter avatar proof at the shipping distance and FOV."""
    clear()
    setup_render(1600, 900, samples=64)
    world_colour("sky_haze", 0.48)
    add_sun()
    add_ground("ground_scrub", 40, variation=True)
    player = link_asset("SM_char_farmer", (0, 0, 0))
    if player:
        add_player_outline(player)

    # Keep the real pitch, distance and vertical FOV, but turn the isolated
    # review around to the face. The decisive farm scene often sees the player
    # from behind, which is useful for silhouette and useless for validating
    # eyes, hands and boot direction at their actual on-screen size.
    distance = GAMEPLAY_REVIEW_DISTANCE
    pitch = math.radians(GAMEPLAY_REVIEW_PITCH_DEGREES)
    bearing = math.radians(27.0)
    target = Vector((0, 0, 0.80))
    cam_pos = target + Vector((
        math.sin(bearing) * math.cos(pitch) * distance,
        -math.cos(bearing) * math.cos(pitch) * distance,
        math.sin(pitch) * distance,
    ))
    scene = bpy.context.scene
    aspect = scene.render.resolution_x / scene.render.resolution_y
    lens = lens_for_vertical_fov(GAMEPLAY_REVIEW_FOV_DEGREES, aspect)
    add_camera(cam_pos, target, lens=lens)
    return render_to("character_gameplay_read.png")


def character_gameplay_context_no_outline() -> str:
    """Native shipping-camera proof among crops and structures, without the rim."""
    clear()
    setup_render(1600, 900, samples=64)
    world_colour("sky_haze", 0.48)
    add_sun()
    add_ground("ground_scrub", 40, variation=True)

    # The character must survive the same visual competition as the Dinkum
    # references without relying on the player-only accessibility outline.
    link_asset("SM_char_farmer", (0, 0, 0))
    for name, x, y in (("SM_crop_wheat_s4", -1.15, 1.65),
                       ("SM_crop_corn_s4", 1.10, 1.90)):
        link_asset("SM_ground_plot", (x, y, 0))
        link_asset(name, (x, y, 0.10))
    link_asset("SM_building_road", (0, 3.55, 0), rotation_z=math.pi / 2)
    link_asset("SM_building_fence", (0, 4.55, 0), rotation_z=math.pi / 2)
    link_asset("SM_prop_grass_tuft", (-1.75, 0.30, 0), rotation_z=0.5)
    link_asset("SM_prop_wildflowers", (1.65, 0.45, 0), rotation_z=-0.4)

    distance = GAMEPLAY_REVIEW_DISTANCE
    pitch = math.radians(GAMEPLAY_REVIEW_PITCH_DEGREES)
    bearing = math.radians(27.0)
    target = Vector((0, 0, 0.80))
    cam_pos = target + Vector((
        math.sin(bearing) * math.cos(pitch) * distance,
        -math.cos(bearing) * math.cos(pitch) * distance,
        math.sin(pitch) * distance,
    ))
    scene = bpy.context.scene
    aspect = scene.render.resolution_x / scene.render.resolution_y
    lens = lens_for_vertical_fov(GAMEPLAY_REVIEW_FOV_DEGREES, aspect)
    add_camera(cam_pos, target, lens=lens)
    return render_to("character_gameplay_context_no_outline.png")


def character_side_profile() -> str:
    """Side proof for boot direction, heel shape, wrist taper and head ratio."""
    clear()
    setup_render(1000, 1000, samples=64)
    world_colour("sand_path", 0.68)
    add_sun()
    add_ground("ground_scrub", 30)
    link_asset("SM_char_farmer", (0, 0, 0))
    add_camera((4.20, -0.02, 1.20), (0, 0, 0.80), lens=82)
    return render_to("character_side_profile.png")


def actors_focus() -> str:
    """Player and every current animal at a close but scale-honest review distance."""
    clear()
    setup_render(1600, 900, samples=64)
    world_colour("sky_haze", 0.48)
    add_sun()
    add_ground("ground_scrub", 45)

    link_asset("SM_char_farmer", (-3.15, 0, 0), rotation_z=math.radians(12))
    link_asset("SM_animal_chicken", (-1.35, 0, 0), rotation_z=math.radians(-18), scale=1.35)
    link_asset("SM_animal_sheep", (0.05, 0, 0), rotation_z=math.radians(16), scale=1.10)
    link_asset("SM_animal_cow", (1.55, 0, 0), rotation_z=math.radians(-22))
    link_asset("SM_animal_dog", (3.05, 0, 0), rotation_z=math.radians(-8), scale=1.08)
    link_asset("SM_animal_fox", (4.35, 0, 0), rotation_z=math.radians(18), scale=1.18)

    add_camera((7.0, -13.0, 4.5), (0.5, 0, 0.72), lens=70)
    return render_to("actors_focus.png")


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
    paths["buildings_focus"] = buildings_focus()
    assert_sources_unpainted("buildings_focus")
    paths["buildings_detail_close"] = buildings_detail_close()
    assert_sources_unpainted("buildings_detail_close")
    paths["cold_store_detail_close"] = cold_store_detail_close()
    assert_sources_unpainted("cold_store_detail_close")
    paths["worker_hut_detail_close"] = worker_hut_detail_close()
    assert_sources_unpainted("worker_hut_detail_close")
    paths["crops_focus"] = crops_focus()
    assert_sources_unpainted("crops_focus")
    for season, crops in {
        "spring": ("radish", "pea", "strawberry"),
        "summer": ("sunflower", "tomato", "avocado"),
        "autumn": ("beetroot", "cranberry", "grape"),
        "winter": ("carrot", "cabbage", "garlic"),
    }.items():
        key = f"crops_{season}_focus"
        paths[key] = seasonal_crops_focus(season, crops)
        assert_sources_unpainted(key)
    paths["trees_focus"] = trees_focus()
    assert_sources_unpainted("trees_focus")
    paths["terrain_focus"] = terrain_focus()
    assert_sources_unpainted("terrain_focus")
    paths["trees_detail_close"] = trees_detail_close()
    assert_sources_unpainted("trees_detail_close")
    paths["silhouette"] = silhouette()
    assert_sources_unpainted("silhouette")
    paths["character_portrait"] = character_portrait()
    assert_sources_unpainted("character_portrait")
    paths["character_gameplay_read"] = character_gameplay_read()
    assert_sources_unpainted("character_gameplay_read")
    paths["character_gameplay_context_no_outline"] = character_gameplay_context_no_outline()
    assert_sources_unpainted("character_gameplay_context_no_outline")
    paths["character_side_profile"] = character_side_profile()
    assert_sources_unpainted("character_side_profile")
    paths["actors_focus"] = actors_focus()
    assert_sources_unpainted("actors_focus")
    paths.update({f"accessibility_{name}": path
                  for name, path in accessibility_variants(gameplay_path).items()})
    paths["assets_captured"] = str(len(SOURCES))
    return paths


if __name__ == "__main__":
    main()
