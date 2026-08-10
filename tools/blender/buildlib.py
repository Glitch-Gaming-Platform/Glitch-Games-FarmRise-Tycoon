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
        self.palette_names: list[str] = []

    # -- internals ---------------------------------------------------------

    def _colour_index(self, colour: str) -> int:
        if colour not in self.palette_names:
            linear_rgba(colour)          # fails fast on a typo'd palette name
            self.palette_names.append(colour)
        return self.palette_names.index(colour) + 1

    def _paint(self, faces, colour: str) -> None:
        index = self._colour_index(colour)
        for face in faces:
            face[self.colour_layer] = index

    def _emit(self, colour: str, fn):
        before = set(self.bm.faces)
        result = fn()
        new_faces = [f for f in self.bm.faces if f not in before]
        self._paint(new_faces, colour)
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

    def box(self, colour, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0)):
        faces, verts = self._emit(colour, lambda: bmesh.ops.create_cube(self.bm, size=1.0))
        self._place(verts, loc, rot, size)
        return faces

    def cylinder(self, colour, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0),
                 segments=8, radius_top=None, scale=(1, 1, 1), caps=True):
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

        faces, verts = self._emit(colour, make)
        self._place(verts, loc, rot, scale)
        return faces

    def cylinder_between(self, colour, start, end, radius, segments=6,
                         radius_top=None, caps=True):
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
        )

    def polyhedron(self, colour, vertices, faces, loc=(0, 0, 0),
                   rot=(0, 0, 0), scale=(1, 1, 1)):
        """Emit a small authored convex form without creating a separate object."""
        before = set(self.bm.faces)
        verts = [self.bm.verts.new(tuple(vertex)) for vertex in vertices]
        for indices in faces:
            self.bm.faces.new(tuple(verts[index] for index in indices))
        new_faces = [face for face in self.bm.faces if face not in before]
        self._paint(new_faces, colour)
        self._place(verts, loc, rot, scale)
        return new_faces

    def sphere(self, colour, radius, loc=(0, 0, 0), rot=(0, 0, 0),
               scale=(1, 1, 1), u=10, v=6):
        def make():
            try:
                return bmesh.ops.create_uvsphere(
                    self.bm, u_segments=u, v_segments=v, radius=radius)
            except TypeError:
                return bmesh.ops.create_uvsphere(
                    self.bm, u_segments=u, v_segments=v, diameter=radius * 2)

        faces, verts = self._emit(colour, make)
        self._place(verts, loc, rot, scale)
        return faces, verts

    def ribbed_sphere(self, colour, rib_colour, radius, lobes=8, rib_depth=0.12,
                      loc=(0, 0, 0), scale=(1, 1, 1)):
        """
        A pumpkin. Built by radially modulating a UV sphere so the ribs are
        real geometry in the silhouette rather than a texture - at 20 m the
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
                continue
            for edge in face.edges:
                neighbour = next(
                    (f[self.colour_layer] for f in edge.link_faces
                     if f is not face and f[self.colour_layer] != 0), 0)
                if neighbour:
                    face[self.colour_layer] = neighbour
                    break

    def build(self, collection: bpy.types.Collection, smooth: bool = False,
              origin_to_base: bool = True,
              ambient_occlusion: bool = True) -> bpy.types.Object:
        """Bakes the bmesh into a real object with a corner colour attribute."""
        bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))

        mesh = bpy.data.meshes.new(self.name)
        unpainted = 0
        colour_names = []
        for face in self.bm.faces:
            index = face[self.colour_layer]
            if index == 0:
                unpainted += 1
                colour_names.append("rock")
            else:
                colour_names.append(self.palette_names[index - 1])
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

    Base colour comes entirely from the COLOR_0 vertex attribute, so the
    engine needs exactly one MeshStandardMaterial and can batch aggressively.
    Roughness is high and metallic is zero everywhere: this art direction has
    no specular story, and a stray highlight reads as a rendering bug.
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
    attr.location = (-160, 0)
    attr.layer_name = COLOUR_ATTR

    links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


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

    This is the single highest-value visual upgrade available to a flat-shaded,
    untextured, one-material game. Without it every surface is lit purely by
    its normal, so crevices, undersides, contact points and interiors are
    exactly as bright as exposed faces - which is the specific reason
    untextured low-poly reads as "cheap" rather than "stylised". Real games in
    this style bake occlusion; they just usually bake it into a texture.

    We have no textures, so it goes where our colour already lives: the
    vertices. Cost at runtime is zero - it is the same COLOR_0 attribute the
    shared material already reads.

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
