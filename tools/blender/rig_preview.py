"""
Renders a pose sheet of the runtime walk cycle, in Blender, from the same
numbers the game ships.

Why this exists: the pose keys in apps/game/src/game/player/rig/poseClips.ts are
just arrays of radians. Reading them tells you nothing about whether the walk
looks like a walk. Previously the only way to find out was to build the whole
game, run it, and squint at a moving character - which is a slow loop and a bad
one, because a moving image hides pose problems that a still frame makes
obvious.

This builds a real armature over the exported farmer, binds it with automatic
weights, applies the sampled poses, and renders a contact sheet of the cycle.
Every number is parsed out of the TypeScript source rather than duplicated, so
the sheet cannot drift from what the game does.

Run through the Blender MCP, or:
    blender --background --python tools/blender/rig_preview.py
"""

from __future__ import annotations

import json
import math
import os
import re
import sys

import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from palette import PALETTE, linear_rgba  # noqa: E402

RIG_DIR = os.path.join(ROOT, "apps", "game", "src", "game", "player", "rig")
OUT_DIR = os.path.join(ROOT, "art", "review")


# ==========================================================================
# Parsing the TypeScript source
# ==========================================================================

def parse_bones() -> list[dict]:
    """Reads the BONES table out of skeletonDefinition.ts."""
    source = open(os.path.join(RIG_DIR, "skeletonDefinition.ts"), encoding="utf-8").read()
    body = source.split("export const BONES", 1)[1]
    body = body.split("];", 1)[0]
    pattern = re.compile(
        r"\{\s*name:\s*'([^']+)',\s*parent:\s*(-?\d+),\s*"
        r"head:\s*\[([^\]]+)\],\s*tail:\s*\[([^\]]+)\],\s*"
        r"radius:\s*([\d.]+),\s*side:\s*(-?\d+),\s*priority:\s*([\d.]+)",
    )
    bones = []
    for match in pattern.finditer(body):
        bones.append({
            "name": match.group(1),
            "parent": int(match.group(2)),
            "head": [float(v) for v in match.group(3).split(",")],
            "tail": [float(v) for v in match.group(4).split(",")],
            "radius": float(match.group(5)),
            "side": int(match.group(6)),
            "priority": float(match.group(7)),
        })
    if not bones:
        raise RuntimeError("Parsed zero bones from skeletonDefinition.ts")
    return bones


def parse_clip(name: str) -> list[dict]:
    """Reads one exported clip's keyframes out of poseClips.ts."""
    source = open(os.path.join(RIG_DIR, "poseClips.ts"), encoding="utf-8").read()
    body = source.split(f"export const {name}: Clip = {{", 1)[1]
    body = body.split("\n};", 1)[0]

    keys = []
    pattern = re.compile(
        r"t:\s*([\d.]+),\s*(?:root:\s*\[([^\]]+)\],\s*)?"
        r"pose:\s*\{(.*?)\n\s{6}\},",
        re.S,
    )
    for block in pattern.finditer(body):
        pose = {}
        for entry in re.finditer(r"'?([\w.]+)'?:\s*\[([^\]]+)\]", block.group(3)):
            pose[entry.group(1)] = [float(v) for v in entry.group(2).split(",")]
        root = [float(v) for v in block.group(2).split(",")] \
            if block.group(2) else [0.0, 0.0, 0.0]
        keys.append({"t": float(block.group(1)), "root": root, "pose": pose})
    if not keys:
        raise RuntimeError(f"Parsed zero keyframes from clip {name}")
    return sorted(keys, key=lambda k: k["t"])


def catmull_rom(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * (2 * p1 + (-p0 + p2) * t
                  + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def sample(keys: list[dict], t: float, loop: bool = True) -> dict[str, list[float]]:
    """Mirror of sampleClip() in clipSampler.ts, including the wrap behaviour."""
    t = t - math.floor(t) if loop else max(0.0, min(1.0, t))
    count = len(keys)
    i1 = 0
    for i, key in enumerate(keys):
        if key["t"] <= t:
            i1 = i
        else:
            break
    wrap = (lambda index: (index + count) % count) if loop else \
        (lambda index: max(0, min(count - 1, index)))
    i2 = wrap(i1 + 1)
    k1, k2 = keys[i1], keys[i2]
    k0, k3 = keys[wrap(i1 - 1)], keys[wrap(i2 + 1)]

    span = k2["t"] - k1["t"]
    if span <= 0:
        span = 1 - k1["t"] + k2["t"] if loop else 1
    local = max(0.0, min(1.0, (t - k1["t"]) / span if span > 0 else 0.0))

    names = set(k1["pose"]) | set(k2["pose"])
    out = {}
    for name in names:
        angles = []
        for axis in range(3):
            v1 = k1["pose"].get(name, [0, 0, 0])[axis]
            v2 = k2["pose"].get(name, [0, 0, 0])[axis]
            v0 = k0["pose"].get(name, [v1, v1, v1])[axis]
            v3 = k3["pose"].get(name, [v2, v2, v2])[axis]
            angles.append(catmull_rom(v0, v1, v2, v3, local))
        out[name] = angles
    return out


def sample_root(keys: list[dict], t: float, loop: bool = True) -> list[float]:
    """Mirror of sampleRootMotion() in clipSampler.ts."""
    t = t - math.floor(t) if loop else max(0.0, min(1.0, t))
    count = len(keys)
    i1 = 0
    for i, key in enumerate(keys):
        if key["t"] <= t:
            i1 = i
        else:
            break
    wrap = (lambda index: (index + count) % count) if loop else \
        (lambda index: max(0, min(count - 1, index)))
    i2 = wrap(i1 + 1)
    k1, k2 = keys[i1], keys[i2]
    k0, k3 = keys[wrap(i1 - 1)], keys[wrap(i2 + 1)]
    span = k2["t"] - k1["t"]
    if span <= 0:
        span = 1 - k1["t"] + k2["t"] if loop else 1
    local = max(0.0, min(1.0, (t - k1["t"]) / span if span > 0 else 0.0))
    return [
        catmull_rom(k0["root"][axis], k1["root"][axis],
                    k2["root"][axis], k3["root"][axis], local)
        for axis in range(3)
    ]


MIRROR = {
    "thigh.L": "thigh.R", "shin.L": "shin.R", "foot.L": "foot.R", "toe.L": "toe.R",
    "shoulder.L": "shoulder.R", "upperarm.L": "upperarm.R",
    "forearm.L": "forearm.R", "hand.L": "hand.R",
}


def sample_gait(keys, phase):
    """Mirror of sampleGait(): the right side reads the clip half a cycle later."""
    pose = dict(sample(keys, phase))
    other = sample(keys, phase + 0.5)
    for left, right in MIRROR.items():
        if left in other:
            x, y, z = other[left]
            pose[right] = [x, -y, -z]
    return pose


# ==========================================================================
# Building the armature
# ==========================================================================

def to_blender(vec):
    """three.js (x, y, z) -> Blender (x, -z, y). The inverse of the glTF export."""
    return Vector((vec[0], -vec[2], vec[1]))


def build_armature(bones: list[dict]):
    armature_data = bpy.data.armatures.new("RigPreview")
    armature = bpy.data.objects.new("RigPreview", armature_data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")

    created = []
    for definition in bones:
        bone = armature_data.edit_bones.new(definition["name"])
        head = to_blender(definition["head"])
        tail = to_blender(definition["tail"])
        if (tail - head).length < 1e-4:
            tail = head + Vector((0, 0, 0.05))
        bone.head = head
        bone.tail = tail
        created.append(bone)

    for definition, bone in zip(bones, created):
        if definition["parent"] >= 0:
            bone.parent = created[definition["parent"]]

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def distance_to_segment(p, a, b) -> float:
    ab = b - a
    ap = p - a
    length_sq = ab.dot(ab)
    t = 0.0 if length_sq <= 0 else max(0.0, min(1.0, ap.dot(ab) / length_sq))
    return (ap - ab * t).length


def bind_capsule_weights(farmer, armature, bones: list[dict]) -> None:
    """
    Applies the SAME capsule weighting the runtime uses, rather than Blender's
    automatic weights.

    This matters more than it looks. Blender's `ARMATURE_AUTO` uses bone heat,
    which needs a closed, connected manifold; this farmer is a pile of
    disconnected primitives, so heat weighting silently produces garbage on
    exactly the islands that matter - the first version of this sheet showed
    boots flying away from the legs, and the boots were fine. A preview that
    binds differently from the game is worse than no preview, because it
    reports failures the player will never see and hides ones they will.
    """
    for bone in bones:
        farmer.vertex_groups.new(name=bone["name"])

    colour_layer = farmer.data.color_attributes.active_color
    colours = {}
    if colour_layer:
        for loop_index, loop in enumerate(farmer.data.loops):
            colours.setdefault(loop.vertex_index, colour_layer.data[loop_index].color[:3])
    bone_index = {bone["name"]: index for index, bone in enumerate(bones)}

    def rigid_accessory(p, colour):
        if not colour:
            return None
        red, green, blue = colour
        if not (red > 0.025 and red > green * 1.7 and green > blue * 2.0):
            return None
        strap = bones[bone_index["strap"]]
        if distance_to_segment(p, Vector(strap["head"]), Vector(strap["tail"])) < 0.052:
            return bone_index["strap"]
        if (0.12 <= p.x <= 0.40 and 0.42 <= p.y <= 0.76
                and -0.13 <= p.z <= 0.04):
            return bone_index["satchel"]
        return None

    mesh = farmer.data
    for vertex in mesh.vertices:
        # The mesh is authored in Blender space; the bone table is in three.js
        # space. Convert the vertex, not the table.
        p = Vector((vertex.co.x, vertex.co.z, -vertex.co.y))
        side = -1 if p.x < 0 else 1

        rigid = rigid_accessory(p, colours.get(vertex.index))
        if rigid is not None:
            farmer.vertex_groups[bones[rigid]["name"]].add(
                [vertex.index], 1.0, "REPLACE",
            )
            continue

        candidates = []
        for index, bone in enumerate(bones):
            if bone["radius"] <= 0:
                continue
            if bone["side"] != 0 and bone["side"] != side:
                continue
            distance = distance_to_segment(
                p, Vector(bone["head"]), Vector(bone["tail"]),
            )
            if distance >= bone["radius"]:
                continue
            t = 1 - distance / bone["radius"]
            candidates.append((t * t * t * bone["priority"], index))

        if not candidates:
            best, best_distance = 1, float("inf")
            for index, bone in enumerate(bones):
                if bone["radius"] <= 0:
                    continue
                if bone["side"] != 0 and bone["side"] != side:
                    continue
                distance = distance_to_segment(
                    p, Vector(bone["head"]), Vector(bone["tail"]),
                )
                if distance < best_distance:
                    best_distance, best = distance, index
            candidates = [(1.0, best)]

        candidates.sort(reverse=True)
        candidates = candidates[:4]
        total = sum(weight for weight, _ in candidates)
        for weight, index in candidates:
            farmer.vertex_groups[bones[index]["name"]].add(
                [vertex.index], weight / total, "REPLACE",
            )

    modifier = farmer.modifiers.new(name="Armature", type="ARMATURE")
    modifier.object = armature
    farmer.parent = armature


def apply_pose(armature, pose: dict[str, list[float]]):
    # three.js bones are transform nodes with parent-aligned local axes; their
    # authored tail direction does not orient the node. Blender armature bones,
    # by contrast, derive local axes from the head-to-tail rest matrix. Convert
    # each Three Euler through the coordinate-system change, then conjugate it
    # by the Blender bone's local rest basis. A direct component shuffle only
    # happened to work for the old X-only gait and turned sideways arm raises
    # into invisible roll.
    coordinate = Matrix(((1.0, 0.0, 0.0),
                         (0.0, 0.0, -1.0),
                         (0.0, 1.0, 0.0)))
    for bone in armature.pose.bones:
        angles = pose.get(bone.name, [0.0, 0.0, 0.0])
        three_rotation = Euler(tuple(angles), "XYZ").to_matrix()
        blender_rotation = coordinate @ three_rotation @ coordinate.inverted()
        rest_world = bone.bone.matrix_local.to_3x3()
        rest_local = (
            bone.parent.bone.matrix_local.to_3x3().inverted() @ rest_world
            if bone.parent
            else rest_world
        )
        basis = rest_local.inverted() @ blender_rotation @ rest_local
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = basis.to_quaternion()


# ==========================================================================
# Rendering
# ==========================================================================

def setup_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass

    world = bpy.data.worlds.get("RigWorld") or bpy.data.worlds.new("RigWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = linear_rgba("sand_path") \
        if "sand_path" in PALETTE else (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    scene.world = world

    light = bpy.data.lights.new("Sun", type="SUN")
    light.energy = 3.4
    light.angle = math.radians(6)
    sun = bpy.data.objects.new("Sun", light)
    sun.rotation_euler = Euler((math.radians(56), 0, math.radians(34)), "XYZ")
    scene.collection.objects.link(sun)


def main(frames: int = 8, clip_name: str = "WALK") -> dict:
    bones = parse_bones()
    keys = parse_clip(clip_name)

    # Grab the mesh DATABLOCK before clearing the scene, and mark it to survive
    # that clear. Appending from art/source/farmrise_assets.blend is not an
    # option when this runs inside the session that built it: Blender refuses to
    # load a library from the file it currently has open. Reusing the datablock
    # is also more honest, because it previews exactly the mesh just built
    # rather than whatever was last saved to disk.
    source_mesh = None
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.name.startswith("SM_char_farmer"):
            source_mesh = obj.data
            break
    if source_mesh is None:
        blend = os.path.join(ROOT, "art", "source", "farmrise_assets.blend")
        if not os.path.exists(blend):
            raise RuntimeError("Run build_assets.main() in this session first.")
        with bpy.data.libraries.load(blend, link=False) as (src, dst):
            dst.objects = [n for n in src.objects if n == "SM_char_farmer"]
        loaded = bpy.data.objects.get("SM_char_farmer")
        if loaded is None:
            raise RuntimeError("SM_char_farmer not found in the master blend")
        source_mesh = loaded.data
    source_mesh.use_fake_user = True

    setup_scene()

    farmer = bpy.data.objects.new("SM_char_farmer_preview", source_mesh)
    bpy.context.scene.collection.objects.link(farmer)
    farmer.location = (0, 0, 0)
    farmer.rotation_euler = Euler((0, 0, 0), "XYZ")

    armature = build_armature(bones)

    bind_capsule_weights(farmer, armature, bones)

    camera_data = bpy.data.cameras.new("RigCam")
    # Slightly wider than the gameplay portrait so deep plant/harvest poses
    # remain fully inside each review cell instead of clipping at the edge.
    camera_data.lens = 54
    camera = bpy.data.objects.new("RigCam", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera

    os.makedirs(OUT_DIR, exist_ok=True)
    # AAA deformation review needs enough pixels to expose strap gaps, stripe
    # fins, wrist collapse and ankle separation instead of smoothing them away.
    bpy.context.scene.render.resolution_x = 480
    bpy.context.scene.render.resolution_y = 780
    written = []
    loop = clip_name in {"WALK", "RUN", "IDLE"}
    gait = clip_name in {"WALK", "RUN"}
    for index in range(frames):
        phase = index / frames if loop else index / max(1, frames - 1)
        apply_pose(armature, sample_gait(keys, phase) if gait else sample(keys, phase, loop))
        armature.location = to_blender(sample_root(keys, phase, loop))
        bpy.context.view_layer.update()

        # Side-on: a gait is judged from the side, where hip and knee angles are
        # unforeshortened. The scare gesture is the exception: its broad arm
        # silhouette opens across the frontal plane, so a three-quarter camera
        # is required to judge both hands instead of hiding them behind the body.
        camera.location = (
            Vector((3.2, -4.0, 1.35))
            if clip_name == "WAVE"
            else Vector((4.0, -1.0, 1.08))
        )
        direction = Vector((0, 0, 0.82)) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

        path = os.path.join(OUT_DIR, f"_rig_{clip_name.lower()}_{index:02d}.png")
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written.append(path)

    sheet = os.path.join(OUT_DIR, f"rig_{clip_name.lower()}_cycle.png")
    stitch(written, sheet)
    for path in written:
        try:
            os.remove(path)
        except OSError:
            pass
    return {"sheet": sheet, "frames": frames, "bones": len(bones)}


def key_pose_proof() -> dict:
    """Four enlarged poses covering the highest-risk character deformation."""
    bones = parse_bones()
    clips = {name: parse_clip(name) for name in ("WALK", "PLANT", "WAVE")}

    source_mesh = None
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.name.startswith("SM_char_farmer"):
            source_mesh = obj.data
            break
    if source_mesh is None:
        blend = os.path.join(ROOT, "art", "source", "farmrise_assets.blend")
        with bpy.data.libraries.load(blend, link=False) as (src, dst):
            dst.objects = [name for name in src.objects if name == "SM_char_farmer"]
        loaded = bpy.data.objects.get("SM_char_farmer")
        if loaded is None:
            raise RuntimeError("SM_char_farmer not found in the master blend")
        source_mesh = loaded.data
    source_mesh.use_fake_user = True

    setup_scene()
    farmer = bpy.data.objects.new("SM_char_farmer_key_pose", source_mesh)
    bpy.context.scene.collection.objects.link(farmer)
    armature = build_armature(bones)
    bind_capsule_weights(farmer, armature, bones)

    camera_data = bpy.data.cameras.new("KeyPoseCam")
    camera_data.lens = 62
    camera = bpy.data.objects.new("KeyPoseCam", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    bpy.context.scene.render.resolution_x = 480
    bpy.context.scene.render.resolution_y = 780

    specs = [
        ("plant_side", "PLANT", 0.52, Vector((5.2, -1.3, 1.18))),
        ("plant_three_quarter", "PLANT", 0.52, Vector((3.2, -4.0, 1.35))),
        ("wave_apex", "WAVE", 0.52, Vector((3.2, -4.0, 1.35))),
        ("walk_stride", "WALK", 0.25, Vector((5.2, -1.3, 1.18))),
    ]
    written = []
    for label, clip_name, phase, camera_location in specs:
        keys = clips[clip_name]
        gait = clip_name == "WALK"
        loop = gait
        apply_pose(armature, sample_gait(keys, phase) if gait else sample(keys, phase, loop))
        armature.location = to_blender(sample_root(keys, phase, loop))
        camera.location = camera_location
        direction = Vector((0, 0, 0.82)) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()

        path = os.path.join(OUT_DIR, f"_rig_key_{label}.png")
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written.append(path)

    sheet = os.path.join(OUT_DIR, "rig_key_pose_proof.png")
    stitch(written, sheet)
    for path in written:
        try:
            os.remove(path)
        except OSError:
            pass
    return {"sheet": sheet, "poses": len(specs), "bones": len(bones)}


def stitch(paths: list[str], out_path: str) -> None:
    """Lays the frames out left to right using Blender's own image API."""
    images = [bpy.data.images.load(p) for p in paths]
    width, height = images[0].size
    total = width * len(images)
    sheet = bpy.data.images.new("RigSheet", width=total, height=height, alpha=False)

    buffer = [0.0] * (total * height * 4)
    for column, image in enumerate(images):
        pixels = list(image.pixels)
        for y in range(height):
            row = y * width * 4
            target = (y * total + column * width) * 4
            buffer[target:target + width * 4] = pixels[row:row + width * 4]
    sheet.pixels = buffer
    sheet.file_format = "PNG"
    sheet.filepath_raw = out_path
    sheet.save()
    for image in images:
        bpy.data.images.remove(image)
    bpy.data.images.remove(sheet)


if __name__ == "__main__":
    main()
    key_pose_proof()
