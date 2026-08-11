"""
Procedural mesh construction helpers for FarmRise Tycoon.

Why the art is built by script rather than by hand:

  1. It is deterministic and diffable. `git diff` on an asset is readable,
     which is not true of a .blend.
  2. It cannot drift from the style guide, because the style guide IS this
     code - palette names, bevel widths and triangle budgets are enforced at
     build time rather than checked in review.
  3. It regenerates in seconds, so a palette change propagates to every
     asset in one command instead of nineteen manual edits.

The trade is real and worth stating: procedural construction cannot produce
sculpted, hand-crafted forms. Anything that needs genuine artistry - facial
appeal, cloth folds, hand-painted texture - is out of scope here and is
flagged in the improvement plan as needing a human artist.
"""

from __future__ import annotations

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from palette import (  # noqa: E402
    BEVEL_SEGMENTS,
    BEVEL_WIDTH,
    SMOOTH_ANGLE,
    TRI_BUDGET,
    linear_rgba,
)

COLOUR_ATTR = "Col"
MATERIAL_NAME = "M_FarmRise_VertexColour"
UV_ATTR = "UVMap"
SURFACE_ATLAS_NAME = "FarmRiseSurfaceDetail"
SURFACE_ATLAS_SIZE = 256
SURFACE_ATLAS_COLS = 4
SURFACE_ATLAS_ROWS = 4
SURFACE_TYPES = (
    "plain",
    "wall_boards",
    "roof_shingles",
    "timber_grain",
    "metal_panels",
    "glass",
    "live_bark",
    "dead_bark",
    "leaf",
    "stone",
    "woven",
    "water",
)
SURFACE_SCALE = {
    "plain": 0.5,
    "wall_boards": 2.00,
    "roof_shingles": 3.20,
    "timber_grain": 1.25,
    "metal_panels": 1.25,
    "glass": 0.5,
    "live_bark": 1.8,
    "dead_bark": 1.7,
    "leaf": 1.0,
    "stone": 1.3,
    "woven": 2.0,
    "water": 0.8,
}


# ==========================================================================
# Builder
# ==========================================================================


class MeshBuilder:
    """
    Accumulates primitives into a single mesh, remembering which faces get
    which palette colour, then bakes those into a corner colour attribute.

    One mesh per asset, one material for the entire game. That combination
    is what keeps the draw call count flat as content grows.
    """

    def __init__(self, name: str, budget: str = "prop") -> None:
        self.name = name
        self.budget = budget
        self.bm = bmesh.new()
        # Colour is stored in a FACE CUSTOM DATA LAYER, not in a dict keyed by
        # BMFace. bmesh.ops.bevel destroys and recreates faces, which
        # invalidates every key in such a dict and silently repaints an entire
        # building with the fallback colour. A custom data layer is copied to
        # new geometry by the bevel operator, so it survives topology changes.
        # Index 0 is reserved to mean "never painted" so the build can report
        # unpainted faces instead of hiding them.
        self.colour_layer = self.bm.faces.layers.int.new("farmrise_colour")
        self.surface_layer = self.bm.faces.layers.int.new("farmrise_surface")
        self.palette_names: list[str] = []
        self.surface_names: list[str] = []

    # -- internals ---------------------------------------------------------

    def _colour_index(self, colour: str) -> int:
        if colour not in self.palette_names:
            linear_rgba(colour)          # fails fast on a typo'd palette name
            self.palette_names.append(colour)
        return self.palette_names.index(colour) + 1

    def _surface_index(self, surface: str) -> int:
        if surface not in SURFACE_TYPES:
            raise ValueError(f"Unknown FarmRise surface type: {surface}")
        if surface not in self.surface_names:
            self.surface_names.append(surface)
        return self.surface_names.index(surface) + 1

    def _paint(self, faces, colour: str, surface: str = "auto") -> None:
        if surface == "auto":
            if colour.startswith("wall_teal"):
                surface = "wall_boards"
            elif colour.startswith("roof_grey"):
                surface = "roof_shingles"
            elif colour.startswith("timber"):
                surface = "timber_grain"
            elif colour.startswith("metal"):
                surface = "metal_panels"
            elif colour == "window_blue":
                surface = "glass"
            elif colour.startswith("water"):
                surface = "water"
            elif colour.startswith("tree_trunk"):
                surface = "live_bark"
            elif colour.startswith("rock") or colour.startswith("sand_stone"):
                surface = "stone"
            else:
                surface = "plain"
        index = self._colour_index(colour)
        surface_index = self._surface_index(surface)
        for face in faces:
            face[self.colour_layer] = index
            face[self.surface_layer] = surface_index

    def _emit(self, colour: str, fn, surface: str = "auto"):
        before = set(self.bm.faces)
        result = fn()
        new_faces = [f for f in self.bm.faces if f not in before]
        self._paint(new_faces, colour, surface)
        verts = result.get("verts", []) if isinstance(result, dict) else []
        return new_faces, verts

    def _place(self, verts, loc, rot, scale) -> None:
        matrix = (
            Matrix.Translation(Vector(loc))
            @ Euler(rot, "XYZ").to_matrix().to_4x4()
            @ Matrix.Diagonal(Vector(scale).to_4d())
        )
        if verts:
            bmesh.ops.transform(self.bm, matrix=matrix, verts=verts)

    # -- primitives --------------------------------------------------------

    def box(self, colour, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0),
            surface="auto"):
        faces, verts = self._emit(
            colour, lambda: bmesh.ops.create_cube(self.bm, size=1.0), surface)
        self._place(verts, loc, rot, size)
        return faces

    def cylinder(self, colour, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0),
                 segments=8, radius_top=None, scale=(1, 1, 1), caps=True,
                 surface="auto"):
        """Cone axis is +Z. radius_top=0 gives a cone, None gives a cylinder."""
        top = radius if radius_top is None else radius_top

        def make():
            try:
                return bmesh.ops.create_cone(
                    self.bm, cap_ends=caps, cap_tris=False, segments=segments,
                    radius1=radius, radius2=top, depth=depth,
                )
            except TypeError:  # pre-3.0 naming
                return bmesh.ops.create_cone(
                    self.bm, cap_ends=caps, cap_tris=False, segments=segments,
                    diameter1=radius * 2, diameter2=top * 2, depth=depth,
                )

        faces, verts = self._emit(colour, make, surface)
        self._place(verts, loc, rot, scale)
        return faces

    def cylinder_between(self, colour, start, end, radius, segments=6,
                         radius_top=None, caps=True, surface="auto"):
        """A tapered branch, limb or pipe whose local Z axis follows two points."""
        a, b = Vector(start), Vector(end)
        direction = b - a
        depth = direction.length
        if depth <= 1e-6:
            return []
        rotation = direction.to_track_quat("Z", "Y").to_euler()
        centre = (a + b) * 0.5
        return self.cylinder(
            colour,
            radius,
            depth,
            loc=tuple(centre),
            rot=tuple(rotation),
            segments=segments,
            radius_top=radius_top,
            caps=caps,
            surface=surface,
        )

    def polyhedron(self, colour, vertices, faces, loc=(0, 0, 0),
                   rot=(0, 0, 0), scale=(1, 1, 1), surface="auto"):
        """Emit a small authored convex form without creating a separate object."""
        before = set(self.bm.faces)
        verts = [self.bm.verts.new(tuple(vertex)) for vertex in vertices]
        for indices in faces:
            self.bm.faces.new(tuple(verts[index] for index in indices))
        new_faces = [face for face in self.bm.faces if face not in before]
        self._paint(new_faces, colour, surface)
        self._place(verts, loc, rot, scale)
        return new_faces

    def sphere(self, colour, radius, loc=(0, 0, 0), rot=(0, 0, 0),
               scale=(1, 1, 1), u=10, v=6, surface="auto"):
        def make():
            try:
                return bmesh.ops.create_uvsphere(
                    self.bm, u_segments=u, v_segments=v, radius=radius)
            except TypeError:
                return bmesh.ops.create_uvsphere(
                    self.bm, u_segments=u, v_segments=v, diameter=radius * 2)

        faces, verts = self._emit(colour, make, surface)
        self._place(verts, loc, rot, scale)
        return faces, verts

    def ribbed_sphere(self, colour, rib_colour, radius, lobes=8, rib_depth=0.12,
                      loc=(0, 0, 0), scale=(1, 1, 1)):
        """
        A pumpkin. Built by radially modulating a UV sphere so the ribs are
        real geometry in the silhouette rather than a texture - in gameplay the
        rim is the only part of a rib a player can actually see.
        """
        faces, verts = self.sphere(colour, radius, u=lobes * 2, v=6)
        for vert in verts:
            x, y, z = vert.co
            angle = math.atan2(y, x)
            radial = math.hypot(x, y)
            if radial < 1e-5:
                continue
            factor = 1.0 - rib_depth * (0.5 + 0.5 * math.cos(angle * lobes))
            vert.co.x = x * factor
            vert.co.y = y * factor
        # Recolour the recessed meridians so the ribs read even head-on.
        rib_index = self._colour_index(rib_colour)
        for face in faces:
            centre = face.calc_center_median()
            angle = math.atan2(centre.y, centre.x)
            if math.cos(angle * lobes) > 0.35:
                face[self.colour_layer] = rib_index
        self._place(verts, loc, (0, 0, 0), scale)
        return faces

    def lobed_leaf(self, colour, radius, loc=(0, 0, 0), yaw=0.0,
                   tilt=0.0, lobes=5, inner=0.58):
        """
        A broad icon-shaped leaf made from a shallow star fan.

        Pumpkin foliage needs broad lobes in the outline; a tapered strip is
        correct for wheat and corn but makes a pumpkin patch look like grass.
        The leaf remains one-sided because the shared material is double-sided.
        """
        points = [(0.0, 0.0, radius * 0.08)]
        ring = lobes * 2
        for index in range(ring):
            angle = index / ring * math.tau
            length = radius if index % 2 == 0 else radius * inner
            points.append((math.cos(angle) * length, math.sin(angle) * length, 0.0))
        faces = []
        for index in range(ring):
            faces.append((0, index + 1, ((index + 1) % ring) + 1))
        return self.polyhedron(
            colour,
            points,
            faces,
            loc=loc,
            rot=(tilt, 0.0, yaw),
        )

    def foliage_cluster(self, colour, radius, loc=(0, 0, 0), rot=(0, 0, 0),
                        scale=(1, 1, 1), lobes=5, inner=0.68, depth=0.14,
                        surface="leaf"):
        """
        A shallow, convex spray of foliage with a broken lobed outline.

        Overlapping UV spheres produce the familiar procedural "broccoli"
        canopy: volume without branch structure or negative space. A spray is
        still a broad gameplay-readable colour mass, but its pointed rim and
        shallow depth let several clusters overlap like layered eucalyptus
        leaves while the gaps between them keep the branch architecture clear.
        """
        ring = lobes * 2
        points = [(0.0, 0.0, depth), (0.0, 0.0, -depth)]
        for index in range(ring):
            angle = index / ring * math.tau
            length = radius if index % 2 == 0 else radius * inner
            points.append((
                math.cos(angle) * length,
                math.sin(angle) * length,
                math.sin(angle * 3.0) * depth * 0.18,
            ))
        faces = []
        for index in range(ring):
            current = index + 2
            following = ((index + 1) % ring) + 2
            faces.append((0, current, following))
            faces.append((1, following, current))
        return self.polyhedron(
            colour, points, faces, loc=loc, rot=rot, scale=scale, surface=surface)

    def lance_leaf(self, colour, length, width, loc=(0, 0, 0), rot=(0, 0, 0),
                   curl=0.10):
        """One eucalyptus leaf with a pointed tip and a shallow centre fold."""
        points = [
            (-length * 0.5, 0.0, 0.0),
            (-length * 0.18, width * 0.5, curl * width),
            (length * 0.18, width * 0.38, curl * width * 0.55),
            (length * 0.5, 0.0, 0.0),
            (length * 0.18, -width * 0.38, -curl * width * 0.55),
            (-length * 0.18, -width * 0.5, -curl * width),
        ]
        return self.polyhedron(
            colour,
            points,
            [(0, 1, 2, 3, 4, 5)],
            loc=loc,
            rot=rot,
            surface="leaf",
        )

    def blade(self, colour, length, width_base, width_tip, loc=(0, 0, 0),
              yaw=0.0, droop=0.0, segments=4, thickness=0.0):
        """
        A leaf or grass blade: a tapered strip that curves over as it rises.

        `droop` is the total bend in radians from base to tip. Corn leaves
        need a strong droop or the plant reads as a bundle of spikes; wheat
        needs almost none or it stops reading as a cereal.
        """
        bm = self.bm
        before = set(bm.faces)
        rows = []
        x = 0.0
        z = 0.0
        angle = 0.0
        step = length / segments
        for i in range(segments + 1):
            t = i / segments
            half = (width_base * (1 - t) + width_tip * t) * 0.5
            rows.append((
                bm.verts.new((x, -half, z)),
                bm.verts.new((x, half, z)),
            ))
            angle += droop / segments
            x += math.sin(angle) * step
            z += math.cos(angle) * step
        for i in range(segments):
            a, b = rows[i]
            c, d = rows[i + 1]
            bm.faces.new((a, b, d, c))
        new_faces = [f for f in bm.faces if f not in before]
        self._paint(new_faces, colour)
        verts = [v for row in rows for v in row]
        if thickness:
            bmesh.ops.solidify(bm, geom=new_faces, thickness=thickness)
            new_faces = [f for f in bm.faces if f not in before]
            for face in new_faces:
                if face[self.colour_layer] == 0:
                    face[self.colour_layer] = self._colour_index(colour)
            verts = list({v for f in new_faces for v in f.verts})
        self._place(verts, loc, (0, 0, yaw), (1, 1, 1))
        return new_faces

    # -- finishing ---------------------------------------------------------

    def bevel(self, width=BEVEL_WIDTH, segments=BEVEL_SEGMENTS, only_sharp=True):
        """
        Rounds every hard edge. This is the single highest-leverage operation
        in the whole style: an unbevelled cube catches no light along its
        edges and reads as a flat silhouette, while a 2 cm bevel gives every
        edge a bright rim for free under any lighting.

        Bevel segment count scales INVERSELY with asset size - see the note
        in assets.building_barn.

        Colour survives this because it lives in a face custom data layer
        that bmesh copies onto the new geometry. Any face the operator
        cannot attribute is left at 0 and repaired below from a neighbour,
        so a bevel can never introduce an unpainted sliver.
        """
        edges = [e for e in self.bm.edges
                 if not only_sharp or e.calc_face_angle(0.0) > 0.35]
        if not edges:
            return
        bmesh.ops.bevel(
            self.bm, geom=edges, offset=width, offset_type="OFFSET",
            segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True,
        )
        for face in self.bm.faces:
            if face[self.colour_layer] != 0:
                if face[self.surface_layer] != 0:
                    continue
            for edge in face.edges:
                neighbour = next(
                    (f for f in edge.link_faces
                     if f is not face and f[self.colour_layer] != 0), None)
                if neighbour:
                    if face[self.colour_layer] == 0:
                        face[self.colour_layer] = neighbour[self.colour_layer]
                    if face[self.surface_layer] == 0:
                        face[self.surface_layer] = neighbour[self.surface_layer]
                    break

    def build(self, collection: bpy.types.Collection, smooth: bool = False,
              origin_to_base: bool = True,
              ambient_occlusion: bool = True) -> bpy.types.Object:
        """Bakes the bmesh into a real object with a corner colour attribute."""
        bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))

        mesh = bpy.data.meshes.new(self.name)
        unpainted = 0
        colour_names = []
        surface_names = []
        for face in self.bm.faces:
            index = face[self.colour_layer]
            surface_index = face[self.surface_layer]
            if index == 0:
                unpainted += 1
                colour_names.append("rock")
            else:
                colour_names.append(self.palette_names[index - 1])
            if surface_index == 0:
                unpainted += 1
                surface_names.append("plain")
            else:
                surface_names.append(self.surface_names[surface_index - 1])
        if unpainted:
            raise ValueError(
                f"{self.name}: {unpainted} of {len(colour_names)} faces carry no "
                f"palette colour and would render as grey. This usually means a "
                f"topology operator ran before the faces were painted."
            )
        self.bm.to_mesh(mesh)
        self.bm.free()

        layer = mesh.color_attributes.new(
            name=COLOUR_ATTR, type="FLOAT_COLOR", domain="CORNER")
        for poly, name in zip(mesh.polygons, colour_names):
            rgba = linear_rgba(name)
            for loop_index in poly.loop_indices:
                layer.data[loop_index].color = rgba

        uv_layer = mesh.uv_layers.new(name=UV_ATTR)
        atlas_padding = 0.035
        for poly, surface in zip(mesh.polygons, surface_names):
            surface_index = SURFACE_TYPES.index(surface)
            cell_x = surface_index % SURFACE_ATLAS_COLS
            cell_y = surface_index // SURFACE_ATLAS_COLS
            vertices = [mesh.vertices[mesh.loops[i].vertex_index].co for i in poly.loop_indices]
            normal = poly.normal
            if abs(normal.z) >= abs(normal.x) and abs(normal.z) >= abs(normal.y):
                projected = [(co.x, co.y) for co in vertices]
            elif abs(normal.y) >= abs(normal.x):
                projected = [(co.x, co.z) for co in vertices]
            else:
                projected = [(co.y, co.z) for co in vertices]

            if surface in {"leaf", "glass"}:
                min_u = min(value[0] for value in projected)
                max_u = max(value[0] for value in projected)
                min_v = min(value[1] for value in projected)
                max_v = max(value[1] for value in projected)
                span_u = max(max_u - min_u, 1e-5)
                span_v = max(max_v - min_v, 1e-5)
                local_uvs = [((u - min_u) / span_u, (v - min_v) / span_v)
                             for u, v in projected]
            else:
                scale = SURFACE_SCALE[surface]
                local_uvs = [((u * scale) % 1.0, (v * scale) % 1.0)
                             for u, v in projected]

            for loop_index, (local_u, local_v) in zip(poly.loop_indices, local_uvs):
                usable = 1.0 - atlas_padding * 2.0
                uv_layer.data[loop_index].uv = (
                    (cell_x + atlas_padding + local_u * usable) / SURFACE_ATLAS_COLS,
                    1.0 - (cell_y + atlas_padding + local_v * usable) / SURFACE_ATLAS_ROWS,
                )

        mesh.materials.append(shared_material())
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)

        if origin_to_base:
            lowest = min((v.co.z for v in mesh.vertices), default=0.0)
            if abs(lowest) > 1e-6:
                for vert in mesh.vertices:
                    vert.co.z -= lowest

        if smooth:
            for poly in mesh.polygons:
                poly.use_smooth = True
            mesh.set_sharp_from_angle(angle=SMOOTH_ANGLE) if hasattr(
                mesh, "set_sharp_from_angle") else None

        if ambient_occlusion:
            apply_vertex_ao(obj)

        assert_budget(obj, self.budget)
        return obj


# ==========================================================================
# Shared material
# ==========================================================================


def shared_material() -> bpy.types.Material:
    """
    One material for every asset in the game.

    Base colour comes from COLOR_0 and is multiplied by one shared greyscale
    surface-detail atlas. The atlas gives siding, shingles, grain, bark, leaf
    veins and panel seams close-range definition without creating additional
    materials or draw calls.
    """
    existing = bpy.data.materials.get(MATERIAL_NAME)
    if existing:
        return existing

    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    # Foliage is single-sided geometry (a leaf is one quad strip, not a solid),
    # which halves the triangle count on every crop. That only works if the
    # material renders both faces, so backface culling stays off game-wide and
    # exports as glTF doubleSided: true.
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.25

    attr = nodes.new("ShaderNodeVertexColor")
    attr.location = (-360, 80)
    attr.layer_name = COLOUR_ATTR

    texture = nodes.new("ShaderNodeTexImage")
    texture.location = (-360, -120)
    texture.image = surface_atlas_image()
    texture.interpolation = "Linear"
    texture.extension = "CLIP"

    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.location = (-80, 20)
    multiply.blend_type = "MULTIPLY"
    multiply.inputs["Fac"].default_value = 1.0

    links.new(attr.outputs["Color"], multiply.inputs[1])
    links.new(texture.outputs["Color"], multiply.inputs[2])
    links.new(multiply.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def surface_atlas_image() -> bpy.types.Image:
    existing = bpy.data.images.get(SURFACE_ATLAS_NAME)
    if existing:
        return existing

    size = SURFACE_ATLAS_SIZE
    image = bpy.data.images.new(SURFACE_ATLAS_NAME, width=size, height=size, alpha=False)
    pixels = [1.0] * (size * size * 4)
    cell_w = size // SURFACE_ATLAS_COLS
    cell_h = size // SURFACE_ATLAS_ROWS

    def noise(x: int, y: int, seed: int = 0) -> float:
        value = (x * 374761393 + y * 668265263 + seed * 69069) & 0xFFFFFFFF
        value = (value ^ (value >> 13)) * 1274126177 & 0xFFFFFFFF
        return ((value ^ (value >> 16)) & 0xFFFF) / 65535.0

    def detail(surface: str, x: int, y: int) -> float:
        u = x / max(cell_w - 1, 1)
        v = y / max(cell_h - 1, 1)
        grain = (noise(x, y, SURFACE_TYPES.index(surface)) - 0.5) * 0.055
        if surface == "plain":
            return 1.0
        if surface == "wall_boards":
            groove = min(y % 10, 10 - (y % 10))
            return (0.64 if groove < 1.5 else 0.97) + grain
        if surface == "roof_shingles":
            row = y // 10
            horizontal = 0.64 if y % 10 < 2 else 0.98
            joint = (x + (row % 2) * 9) % 18
            vertical = 0.72 if joint < 2 and y % 10 < 8 else 1.0
            return min(horizontal, vertical) + grain
        if surface == "timber_grain":
            wave = math.sin(u * 38.0 + math.sin(v * 13.0) * 2.2)
            knot = math.hypot(u - 0.68, (v - 0.38) * 1.8)
            knot_line = 0.76 if 0.10 < knot < 0.15 else 1.0
            return min(0.91 + wave * 0.055, knot_line) + grain
        if surface == "metal_panels":
            seam = min(x % 22, 22 - (x % 22))
            rivet = math.hypot((x % 22) - 2.5, (y % 22) - 3.0)
            return (0.74 if seam < 1.5 else 0.97) if rivet > 1.8 else 0.68
        if surface == "glass":
            mullion = min(abs(u - 0.5), abs(v - 0.5))
            if mullion < 0.026:
                return 0.70
            diagonal = abs((u + v * 0.58) - 0.72)
            return 1.0 if diagonal > 0.08 else 1.16
        if surface == "live_bark":
            crack = abs(math.sin(u * 31.0 + math.sin(v * 17.0) * 1.9))
            peel = noise(x // 7, y // 9, 21)
            return 0.72 + crack * 0.24 + peel * 0.06
        if surface == "dead_bark":
            vertical = abs(math.sin(u * 24.0 + math.sin(v * 8.0) * 2.8))
            cross = abs(math.sin(v * 27.0 + u * 5.0))
            return 0.66 + min(vertical, cross) * 0.30 + grain
        if surface == "leaf":
            midrib = abs(v - 0.5)
            edge_fade = min(u, 1.0 - u)
            if midrib < 0.018 and edge_fade > 0.05:
                return 0.80
            return 1.0 + grain
        if surface == "stone":
            return 0.84 + noise(x // 3, y // 3, 8) * 0.16
        if surface == "woven":
            return 0.78 if x % 8 < 2 or y % 8 < 2 else 0.98
        if surface == "water":
            return 0.90 + math.sin(u * 28.0 + math.sin(v * 11.0)) * 0.07
        return 1.0

    for surface_index, surface in enumerate(SURFACE_TYPES):
        cell_x = surface_index % SURFACE_ATLAS_COLS
        cell_y = surface_index // SURFACE_ATLAS_COLS
        for y in range(cell_h):
            for x in range(cell_w):
                atlas_x = cell_x * cell_w + x
                atlas_y = size - 1 - (cell_y * cell_h + y)
                value = max(0.48, min(1.18, detail(surface, x, y)))
                offset = (atlas_y * size + atlas_x) * 4
                pixels[offset:offset + 4] = [value, value, value, 1.0]

    image.pixels = pixels
    image.pack()
    return image


# ==========================================================================
# Budgets
# ==========================================================================


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def assert_budget(obj: bpy.types.Object, budget: str) -> None:
    """
    Hard-fails the build when an asset exceeds its class budget.

    A budget that is merely documented is a budget that gets exceeded. This
    one stops the build.
    """
    limit = TRI_BUDGET[budget]
    tris = triangle_count(obj)
    if tris > limit:
        raise ValueError(
            f"{obj.name}: {tris} triangles exceeds the '{budget}' budget of {limit}. "
            f"Reduce segment counts or drop a detail element - do not raise the budget "
            f"without updating docs/ART_IMPLEMENTATION_GUIDE.md and saying why."
        )


def apply_vertex_ao(
    obj: bpy.types.Object,
    samples: int = 12,
    max_distance: float = 0.55,
    strength: float = 0.62,
    floor_bias: float = 0.35,
) -> None:
    """
    Bakes ambient occlusion into the vertex colours.

    This is the single highest-value grounding upgrade available to a
    flat-shaded, one-material game. Without it every surface is lit purely by
    its normal, so crevices, undersides, contact points and interiors are
    exactly as bright as exposed faces - which is the specific reason
    low-poly reads as "cheap" rather than "stylised". Real games in this style
    bake occlusion; they just usually bake it into a colour texture.

    Occlusion stays in the vertices rather than the generated detail atlas so
    it remains asset-specific. Cost at runtime is zero - it is the same COLOR_0
    attribute the shared material already reads.

    Two occlusion terms are combined:
      - self-occlusion, by casting rays over the hemisphere around each
        vertex normal and counting hits against the object's own geometry
      - a ground term, darkening geometry close to y=0 so objects sit in the
        world instead of hovering on it
    """
    mesh = obj.data
    layer = mesh.color_attributes.get(COLOUR_ATTR)
    if layer is None:
        return

    # Deterministic hemisphere directions via a Fibonacci sphere. No RNG, so
    # a rebuild produces byte-identical output.
    directions = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(samples):
        y = 1.0 - (i / max(1, samples - 1)) * 2.0
        radius = math.sqrt(max(0.0, 1.0 - y * y))
        theta = golden * i
        directions.append(Vector((math.cos(theta) * radius, y, math.sin(theta) * radius)))

    highest = max((v.co.z for v in mesh.vertices), default=1.0) or 1.0
    occlusion: list[float] = []

    for vert in mesh.vertices:
        normal = vert.normal
        origin = vert.co + normal * 0.004  # lift off the surface to avoid self-hits
        hits = 0
        used = 0
        for direction in directions:
            # Keep only directions in the upper hemisphere of the normal.
            if direction.dot(normal) <= 0.0:
                continue
            used += 1
            # ray_cast lives on Object, not Mesh, and works in local space.
            hit, _loc, _nrm, _idx = obj.ray_cast(origin, direction, distance=max_distance)
            if hit:
                hits += 1
        self_ao = 1.0 - (hits / used if used else 0.0)

        # Ground contact: darken the lowest geometry, easing off with height.
        height = max(0.0, min(1.0, vert.co.z / highest))
        ground_ao = floor_bias + (1.0 - floor_bias) * (height ** 0.55)

        combined = self_ao * ground_ao
        occlusion.append(1.0 - strength * (1.0 - combined))

    for poly in mesh.polygons:
        for loop_index, vertex_index in zip(poly.loop_indices, poly.vertices):
            factor = occlusion[vertex_index]
            colour = layer.data[loop_index].color
            layer.data[loop_index].color = (
                colour[0] * factor,
                colour[1] * factor,
                colour[2] * factor,
                colour[3],
            )


def collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing:
        return existing
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col
