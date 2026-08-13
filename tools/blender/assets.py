"""
Every FarmRise Tycoon asset, as code.

Read this alongside docs/ART_IMPLEMENTATION_GUIDE.md. The comments here
explain the ART decision behind each shape; the guide explains the rules
those decisions follow.

The governing constraint throughout: the follow camera sits 13.25 metres out
at 34 degrees. Nothing below about 4 cm survives that framing,
so detail is spent exclusively on SILHOUETTE and COLOUR, never on surface.

Revision note (silhouette review 1): crops were originally one plant per
plot and read as scattered scratches on a 1.8 m bed. They are now whole
plot beds. The road was the largest silhouette mass in the scene - larger
than the barn - and has been narrowed and darkened.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from buildlib import MeshBuilder, collection  # noqa: E402
from palette import PLOT_FOOTPRINT, TILE_SIZE  # noqa: E402
from seasonal_crops import (  # noqa: E402
    crop_avocado,
    crop_beetroot,
    crop_cabbage,
    crop_carrot,
    crop_cranberry,
    crop_garlic,
    crop_grape,
    crop_pea,
    crop_radish,
    crop_strawberry,
    crop_sunflower,
    crop_tomato,
)

TAU = math.pi * 2


def plot_positions(count: int, seed: int, inset: float = 0.80):
    """
    Deterministic jittered layout across a plot bed.

    Real farms plant in rows, and rows are what make a tilled bed read as
    cultivated rather than as weeds. Positions therefore start on a grid and
    are jittered just enough to avoid a mechanical look - never enough to
    lose the row structure. No RNG, so builds stay byte-identical.
    """
    half = PLOT_FOOTPRINT * 0.5 * inset
    cols = max(1, int(round(math.sqrt(count))))
    rows = max(1, math.ceil(count / cols))
    out = []
    for index in range(count):
        col, row = index % cols, index // cols
        u = (col + 0.5) / cols * 2 - 1
        v = (row + 0.5) / rows * 2 - 1
        jx = ((seed * 37 + index * 101) % 100 / 100.0 - 0.5) * (1.4 / cols)
        jy = ((seed * 53 + index * 197) % 100 / 100.0 - 0.5) * (1.4 / rows)
        yaw = ((seed * 71 + index * 149) % 100 / 100.0) * TAU
        out.append((u * half + jx * half, v * half + jy * half, yaw))
    return out


# ==========================================================================
# Crops
# ==========================================================================
#
# Growth reads as a HUE JOURNEY, not a size journey:
#
#   stage 1  bright yellow-green, sparse    "something is planted"
#   stage 2  mid green, knee height         "it is coming along"
#   stage 3  deep green, full height        "nearly - do not harvest yet"
#   stage 4  GOLD or ORANGE, full mass      "harvest me"
#
# The stage-3 to stage-4 transition is deliberately the largest colour jump
# in the entire game. A player scanning six plots from across the farm must
# never have to squint to find the ready one.
#
# One asset is one whole plot bed, not one plant. That is both the readable
# choice and the cheap one: a bed is a single draw where nine plants would
# be nine.


def crop_wheat(stage: int):
    """Wheat: sparse shoots become a tillered, headed and finally bowed bed."""
    b = MeshBuilder(f"SM_crop_wheat_s{stage}", budget="crop")
    ready = stage == 4
    clumps = {1: 9, 2: 12, 3: 11, 4: 9}[stage]
    per_clump = {1: 1, 2: 3, 3: 3, 4: 4}[stage]
    height = {1: 0.28, 2: 0.56, 3: 0.86, 4: 0.94}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature",
              4: "wheat_ready"}[stage]

    for ci, (px, py, base_yaw) in enumerate(plot_positions(clumps, seed=stage * 3 + 1)):
        for j in range(per_clump):
            angle = base_yaw + (j - (per_clump - 1) * 0.5) * (0.42 if stage == 2 else TAU / per_clump)
            jitter = 0.84 + 0.24 * (((ci * 7 + j * 3) % 5) / 4.0)
            spread = 0.018 if stage == 1 else 0.038
            ox, oy = math.cos(angle) * spread, math.sin(angle) * spread
            b.blade(colour, height * jitter,
                    0.082 if stage == 1 else 0.052, 0.010,
                    loc=(px + ox, py + oy, 0.0), yaw=angle,
                    droop={1: 0.04, 2: 0.10, 3: 0.14, 4: 0.38}[stage])
            if stage >= 3:
                head_h = 0.19 if ready else 0.12
                head_r = 0.034 if ready else 0.020
                lean = 0.38 if ready else 0.12
                b.cylinder(
                    "wheat_head" if ready else "crop_mature",
                    head_r, head_h,
                    loc=(px + ox + math.cos(angle) * (0.055 if ready else 0.012),
                         py + oy + math.sin(angle) * (0.055 if ready else 0.012),
                         height * jitter - head_h * 0.28),
                    rot=(math.sin(angle) * lean, math.cos(angle) * lean, angle),
                    segments=4, radius_top=head_r * 0.3,
                )
    return b.build(collection("CROPS"), smooth=False)


def crop_corn(stage: int):
    """Corn: the thirsty mid crop. Six tall stalks with broad arcing leaves."""
    b = MeshBuilder(f"SM_crop_corn_s{stage}", budget="crop")
    height = {1: 0.38, 2: 0.76, 3: 1.18, 4: 1.34}[stage]
    leaves = {1: 3, 2: 4, 3: 5, 4: 5}[stage]
    colour = {1: "crop_seedling", 2: "crop_leaf_light", 3: "crop_mature",
              4: "corn_husk"}[stage]

    plant_count = 4 if stage == 1 else 6
    for ci, (px, py, base_yaw) in enumerate(plot_positions(plant_count, seed=stage * 5 + 2)):
        h = height * (0.9 + 0.2 * ((ci % 3) / 2.0))
        b.cylinder(colour, 0.030 if stage == 1 else 0.036, h,
                   loc=(px, py, h / 2), segments=5,
                   radius_top=0.017 if stage == 1 else 0.022)
        for i in range(leaves):
            t = (i + 1) / (leaves + 1)
            angle = base_yaw + i * (TAU / leaves)
            b.blade(
                colour,
                0.46 * (1.0 - 0.22 * t) * (0.68 if stage == 1 else 1.0),
                0.15 if stage == 1 else 0.115, 0.020,
                loc=(px, py, h * (0.20 + 0.62 * t)),
                yaw=angle,
                # A strong droop is what makes corn read as corn. Without it
                # the plant becomes a bundle of spikes and loses the species.
                droop=0.95,
            )
        if stage >= 3 and (stage == 4 or ci % 2 == 0):
            ready = stage == 4
            angle = base_yaw + 0.5
            cx, cy = px + math.cos(angle) * 0.08, py + math.sin(angle) * 0.08
            ear_colour = "corn_ready" if ready else "crop_mature"
            husk_colour = "corn_husk" if ready else "crop_mature"
            ear_height = 0.27 if ready else 0.17
            b.cylinder(ear_colour, 0.055 if ready else 0.038, ear_height,
                       loc=(cx, cy, h * 0.55), rot=(0.16, 0.22, 0),
                       segments=5, radius_top=0.028 if ready else 0.018)
            for side in ((-1, 1) if ready else (1,)):
                b.blade(husk_colour, 0.24 if ready else 0.15,
                        0.070 if ready else 0.052, 0.014,
                        loc=(cx, cy, h * 0.43), yaw=angle + side * 0.42,
                        droop=0.62)
            for i in range(3 if ready else 2):
                b.blade("corn_tassel" if ready else "crop_mature",
                        0.17 if ready else 0.10, 0.020, 0.006,
                        loc=(px, py, h), yaw=base_yaw + i * TAU / 3,
                        droop=0.72 if ready else 0.38, segments=3)
    return b.build(collection("CROPS"), smooth=False)


def crop_pumpkin(stage: int):
    """Pumpkin: slow, expensive, best margin. Three sprawling vines per bed."""
    b = MeshBuilder(f"SM_crop_pumpkin_s{stage}", budget="crop")
    leaf_colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature",
                   4: "crop_mature"}[stage]
    leaves = {1: 3, 2: 4, 3: 5, 4: 5}[stage]
    leaf_radius = {1: 0.125, 2: 0.15, 3: 0.16, 4: 0.17}[stage]

    for ci, (px, py, base_yaw) in enumerate(plot_positions(3, seed=stage * 7 + 3)):
        vine_end = (
            px + math.cos(base_yaw) * (0.30 + 0.04 * stage),
            py + math.sin(base_yaw) * (0.30 + 0.04 * stage),
            0.045,
        )
        b.cylinder_between(
            "pumpkin_stem",
            (px, py, 0.045),
            vine_end,
            0.014 if stage < 3 else 0.020,
            segments=4,
            radius_top=0.008,
        )
        for i in range(leaves):
            angle = base_yaw + i * (TAU / leaves)
            lift = {1: 0.11, 2: 0.13, 3: 0.10, 4: 0.10}[stage]
            b.lobed_leaf(
                leaf_colour,
                leaf_radius * (0.88 + 0.16 * ((ci + i) % 3) / 2),
                loc=(px + math.cos(angle) * 0.14,
                     py + math.sin(angle) * 0.14, lift),
                yaw=angle,
                # Young leaves stand up and announce the seedling in
                # silhouette; mature leaves settle around the fruit.
                tilt=(0.48 if stage == 1 else 0.28 if stage == 2 else 0.12)
                * (0.55 + 0.45 * math.sin(angle)),
                lobes=5,
            )
        if stage == 2:
            flower_angle = base_yaw + 0.7
            fx = px + math.cos(flower_angle) * 0.18
            fy = py + math.sin(flower_angle) * 0.18
            for petal in range(5):
                angle = petal * TAU / 5
                b.sphere("flower_yellow", 0.035,
                         loc=(fx + math.cos(angle) * 0.035,
                              fy + math.sin(angle) * 0.035, 0.105),
                         scale=(1.0, 0.72, 0.38), u=5, v=3)
        if stage == 3:
            b.ribbed_sphere("pumpkin_green", "crop_leaf_dark", 0.165, lobes=7,
                            loc=(px, py, 0.135), scale=(1.0, 1.0, 0.76))
            b.cylinder("pumpkin_stem", 0.022, 0.065, loc=(px, py, 0.26),
                       segments=4, radius_top=0.014)
        if stage == 4:
            # The hero. The only large orange mass in the game, so it wins
            # the eye from anywhere on the farm.
            b.ribbed_sphere("pumpkin_body", "pumpkin_rib", 0.255, lobes=7,
                            loc=(px, py, 0.195), scale=(1.0, 1.0, 0.74))
            b.cylinder("pumpkin_stem", 0.034, 0.10, loc=(px, py, 0.385),
                       rot=(0.15, 0.1, 0), segments=4, radius_top=0.024)
    return b.build(collection("CROPS"), smooth=False)


def crop_clover(stage: int):
    """Clover: a low restorative crop that flowers white when it is ready."""
    b = MeshBuilder(f"SM_crop_clover_s{stage}", budget="crop")
    clumps = {1: 5, 2: 7, 3: 9, 4: 8}[stage]
    radius = {1: 0.075, 2: 0.105, 3: 0.13, 4: 0.14}[stage]
    height = {1: 0.08, 2: 0.13, 3: 0.18, 4: 0.22}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]

    for ci, (px, py, base_yaw) in enumerate(plot_positions(clumps, seed=stage * 11 + 5)):
        b.cylinder(colour, 0.012, height, loc=(px, py, height / 2),
                   segments=4, radius_top=0.007)
        for leaf in range(3):
            angle = base_yaw + leaf * TAU / 3
            b.lobed_leaf(
                colour,
                radius * (0.9 + 0.1 * ((ci + leaf) % 2)),
                loc=(px + math.cos(angle) * radius * 0.38,
                     py + math.sin(angle) * radius * 0.38,
                     height * (0.76 + leaf * 0.06)),
                yaw=angle,
                tilt=0.2,
                lobes=3,
                inner=0.52,
            )
        if stage == 3 and ci % 3 == 0:
            b.cylinder(
                "crop_mature",
                0.034,
                0.16,
                loc=(px, py, height + 0.065),
                segments=4,
                radius_top=0.006,
            )
        if stage == 4 and ci % 2 == 0:
            for petal in range(4):
                angle = base_yaw + petal * TAU / 4
                b.lobed_leaf(
                    "flower_white",
                    0.040,
                    loc=(px + math.cos(angle) * 0.022,
                         py + math.sin(angle) * 0.022,
                         height + 0.025),
                    yaw=angle,
                    tilt=0.12,
                    lobes=3,
                    inner=0.55,
                )
            b.sphere("flower_yellow", 0.020, loc=(px, py, height + 0.035), u=5, v=3)
    return b.build(collection("CROPS"), smooth=False)


def ground_plot():
    """
    The tilled bed a crop sits on.

    Added after the first review: the plots were rendered as one flat soil
    rectangle, so six separate plots read as a single field and the player
    could not tell where one plot ended and the next began. Raised edges and
    furrow ridges give each plot its own footprint and its own contact
    shadow, which is what makes the grid legible.
    """
    b = MeshBuilder("SM_ground_plot", budget="prop")
    outline = [
        (-0.82, -0.91), (-0.28, -0.94), (0.35, -0.90), (0.87, -0.76),
        (0.92, -0.12), (0.88, 0.58), (0.70, 0.89), (0.06, 0.94),
        (-0.54, 0.88), (-0.90, 0.66), (-0.94, 0.02), (-0.89, -0.56),
    ]
    lower = [(x, y, 0.0) for x, y in outline]
    upper = [(x * 0.96, y * 0.96, 0.095) for x, y in outline]
    points = lower + upper + [(0, 0, 0.105), (0, 0, 0.0)]
    count = len(outline)
    top_centre, bottom_centre = count * 2, count * 2 + 1
    faces = []
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
        faces.append((top_centre, count + index, count + following))
        faces.append((bottom_centre, following, index))
    b.polyhedron("soil_edge", points, faces)

    # An irregular inset top softens the bed into the land instead of placing
    # a perfect second rectangle on it.
    inset = [(0, 0, 0.108)] + [(x * 0.88, y * 0.88, 0.106) for x, y in outline]
    inset_faces = [
        (0, index + 1, ((index + 1) % count) + 1)
        for index in range(count)
    ]
    b.polyhedron("soil_tilled", inset, inset_faces)
    # Bevel the bed mass before adding small furrows and clods. Beveling those
    # details multiplies their topology without changing their camera read.
    b.bevel(segments=1, width=0.008)

    # Four imperfect furrows and a few clods provide readable soil texture at
    # the real camera while keeping every feature larger than the 4 cm limit.
    furrows = [
        (-0.52, 1.46, -0.018, -0.025),
        (-0.17, 1.58, 0.020, 0.012),
        (0.18, 1.52, -0.012, -0.008),
        (0.53, 1.39, 0.024, 0.022),
    ]
    for y, length, x, yaw in furrows:
        b.box("soil_wet", size=(length, 0.09, 0.032),
              loc=(x, y, 0.123), rot=(0, 0, yaw))
    for index, (x, y, radius) in enumerate([
        (-0.68, -0.72, 0.065), (0.69, -0.63, 0.052),
        (-0.73, 0.62, 0.055), (0.67, 0.70, 0.062), (0.10, -0.80, 0.045),
    ]):
        b.sphere("soil_dry" if index % 2 else "soil_edge", radius,
                 loc=(x, y, 0.12), rot=(0, 0, index * 0.61),
                 scale=(1.0, 0.78, 0.56), u=5, v=3)
    return b.build(collection("GROUND"), smooth=False)


# ==========================================================================
# Buildings
# ==========================================================================
#
# Every structure is COOL (teal, blue-grey, galvanised metal) against a WARM
# ground. That single rule does more for readability than any amount of
# modelling detail, and it is why a player never loses a fence in the scrub.


def _front_door_knob(b, x, front_y, z):
    b.box("metal_dark", size=(0.075, 0.065, 0.075), loc=(x, front_y, z),
          surface="metal_panels")


def _sliding_door_handle(b, x, front_y, z):
    b.box(
        "metal_dark", size=(0.075, 0.065, 0.30), loc=(x, front_y, z),
        surface="metal_panels")


def _roof_end_volume(b, colour, profile, depth, surface="auto", rot=(0, 0, 0)):
    """Fill an authored gable/gambrel profile so roofs assemble as buildings."""
    count = len(profile)
    vertices = [(x, -depth / 2, z) for x, z in profile]
    vertices += [(x, depth / 2, z) for x, z in profile]
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    b.polyhedron(colour, vertices, faces, rot=rot, surface=surface)


def _roof_shell_x(b, colour, profile, depth, thickness=0.13, rot=(0, 0, 0)):
    """Extrude one continuous roof band with straight eaves and ridge lines."""
    shell = list(profile)
    shell.extend((x, z - thickness) for x, z in reversed(profile))
    _roof_end_volume(
        b, colour, shell, depth, surface="metal_panels", rot=rot)


def building_barn():
    """
    Barn: 2x2 tiles, the largest silhouette on the farm.

    The roof is a true gambrel - four sloped planes, two steep and two
    shallow. The first version stacked three flat boxes, which read as a
    brutalist ziggurat rather than a barn. The double slope is the single
    most recognisable barn cue and costs about sixty triangles.
    """
    b = MeshBuilder("SM_building_barn", budget="building")
    w = TILE_SIZE * 1.85
    d = TILE_SIZE * 1.85
    wall_h = 2.05

    b.box("wall_teal", size=(w, d, wall_h), loc=(0, 0, wall_h / 2))
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box("trim_white", size=(0.16, 0.16, wall_h),
                  loc=(sx * (w / 2 - 0.06), sy * (d / 2 - 0.06), wall_h / 2))

    # The ridge now runs away from the doors, putting the iconic gambrel end
    # over the working facade instead of hanging a hay loft in an eave wall.
    _roof_end_volume(
        b,
        "wall_teal",
        [(-w / 2, wall_h), (w / 2, wall_h),
         (w * 0.27, wall_h + 0.57), (0, wall_h + 0.93),
         (-w * 0.27, wall_h + 0.57)],
        d,
    )
    _roof_shell_x(
        b,
        "roof_grey",
        [(-w / 2 - 0.08, wall_h + 0.02),
         (-w * 0.27, wall_h + 0.60),
         (0, wall_h + 0.97),
         (w * 0.27, wall_h + 0.60),
         (w / 2 + 0.08, wall_h + 0.02)],
        d * 1.06,
    )

    door_w, door_h = 1.34, 1.90
    b.box("timber_warm", size=(door_w, 0.10, door_h),
          loc=(0, -d / 2 - 0.02, door_h / 2))
    for angle in (-0.62, 0.62):
        b.box("timber_light", size=(door_w * 0.92, 0.08, 0.075),
              loc=(0, -d / 2 - 0.09, door_h * 0.51), rot=(0, angle, 0))

    # Cool glass set into pale chunky trim. These broad rectangles survive
    # the gameplay camera; thin mullions would not.
    for sx in (-1, 1):
        b.box("trim_white", size=(0.62, 0.075, 0.54),
              loc=(sx * 1.12, -d / 2 - 0.045, 1.30))
        b.box("window_blue", size=(0.48, 0.082, 0.40),
              loc=(sx * 1.12, -d / 2 - 0.087, 1.30))

    # A loft hatch makes the front read as a barn rather than a teal shed.
    b.box("trim_white", size=(0.62, 0.075, 0.58),
          loc=(0, -d / 2 - 0.04, wall_h + 0.31))
    b.box("timber_warm", size=(0.48, 0.082, 0.44),
          loc=(0, -d / 2 - 0.085, wall_h + 0.31))
    # One bevel segment, not two. Bevel segments scale inversely with asset
    # size: the barn's edges are metres long, so a single chamfer already
    # reads as a rim highlight at any distance, and the second segment cost
    # 640 triangles for something no player can resolve.
    b.bevel(segments=1)
    _sliding_door_handle(b, 0.42, -d / 2 - 0.15, 0.96)
    return b.build(collection("BUILDINGS"))


def building_irrigation():
    """
    Irrigation: a galvanised tank on timber legs with an open trough.

    Reads as "water" in one glance because it is the only teal-and-metal
    vertical on the farm, and the trough gives it a visible open water
    surface even when the tank itself is in shadow.
    """
    b = MeshBuilder("SM_building_irrigation", budget="building")
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box("timber_dark", size=(0.10, 0.10, 0.85),
                  loc=(sx * 0.34, sy * 0.34, 0.425))
    b.cylinder("metal_galv", 0.48, 0.82, loc=(0, 0, 1.26), segments=8)
    b.cylinder("roof_grey_light", 0.49, 0.12, loc=(0, 0, 1.73),
               segments=8, radius_top=0.38, surface="metal_panels")
    for z in (1.03, 1.40):
        b.cylinder("metal_dark", 0.49, 0.038, loc=(0, 0, z), segments=8)
    b.cylinder_between("metal_dark", (0.30, -0.18, 1.02),
                       (0.30, -0.62, 0.30), 0.045, segments=5,
                       radius_top=0.035)
    b.box("timber_light", size=(0.92, 0.40, 0.22), loc=(0.25, -0.72, 0.11))
    b.box("water_teal", size=(0.80, 0.29, 0.055), loc=(0.25, -0.72, 0.22))
    # Two broad braces make the elevated tank read as a load-bearing frame,
    # not a cylinder floating over four unrelated sticks.
    for angle in (-0.72, 0.72):
        b.box("timber_light", size=(0.78, 0.055, 0.070),
              loc=(0, -0.35, 0.43), rot=(0, angle, 0))
    b.cylinder("metal_dark", 0.10, 0.06, loc=(0.30, -0.56, 0.48),
               rot=(math.pi / 2, 0, 0), segments=6,
               surface="metal_panels")
    b.bevel(segments=1, width=0.015)
    return b.build(collection("BUILDINGS"))


def building_road():
    """
    Road tile: a narrow packed-earth path with sunken stepping stones.

    Revised after the first silhouette review, where the original full-tile
    pale slab was the LARGEST silhouette mass in the scene - bigger than the
    barn. A path is the least important object on the farm and must not read
    as the most important. It is now 62% of a tile wide and uses the darker
    sand_stone as its base so it recedes.
    """
    b = MeshBuilder("SM_building_road", budget="prop")
    outline = [
        (-0.48, -0.98), (0.43, -0.96), (0.59, -0.64), (0.51, -0.23),
        (0.60, 0.19), (0.46, 0.61), (0.50, 0.96), (-0.42, 0.98),
        (-0.57, 0.63), (-0.49, 0.24), (-0.59, -0.20), (-0.52, -0.62),
    ]
    lower = [(x, y, 0.0) for x, y in outline]
    upper = [(x * 0.96, y * 0.985, 0.042) for x, y in outline]
    points = lower + upper + [(0, 0, 0.044), (0, 0, 0.0)]
    count = len(outline)
    top_centre, bottom_centre = count * 2, count * 2 + 1
    faces = []
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
        faces.append((top_centre, count + index, count + following))
        faces.append((bottom_centre, following, index))
    b.polyhedron("sand_stone", points, faces)

    # Broad worn patches, not repeated paving stones. The runtime generates
    # adjacency-aware variants from the same two palette colours.
    for x, y, sx, sy, yaw in [
        (-0.12, -0.55, 0.43, 0.30, -0.08),
        (0.13, -0.03, 0.36, 0.27, 0.11),
        (-0.10, 0.52, 0.40, 0.31, -0.05),
    ]:
        b.cylinder("sand_path", 0.18, 0.018, loc=(x, y, 0.050),
                   rot=(0, 0, yaw), segments=7, scale=(sx / 0.36, sy / 0.36, 1.0))
    for index, (x, y, radius) in enumerate([
        (0.25, -0.48, 0.075), (-0.21, 0.06, 0.064), (0.18, 0.58, 0.058),
    ]):
        b.cylinder("rock" if index == 1 else "sand_path", radius, 0.018,
                   loc=(x, y, 0.058 + index * 0.002), segments=6,
                   scale=(1.0, 0.76, 1.0))
    return b.build(collection("BUILDINGS"))


def building_fence():
    """
    Fence: two posts and three rails. The classic pasture read.

    Classed as a building rather than a prop despite its size: it is
    player-placed and load-bearing for the fox-raid mechanic, so it earns a
    structure budget. It is also the most instanced structure in the game,
    which is why the rails are simple unbevelled boxes.
    """
    b = MeshBuilder("SM_building_fence", budget="building")
    span = TILE_SIZE * 0.96
    for sx in (-1, 1):
        b.box("timber_dark", size=(0.13, 0.13, 1.05),
              loc=(sx * span / 2, 0, 0.525))
        b.cylinder("timber_light", 0.105, 0.15,
                   loc=(sx * span / 2, 0, 1.10), segments=4,
                   radius_top=0.015)
    for z in (0.34, 0.86):
        b.box("timber_warm", size=(span, 0.07, 0.11), loc=(0, 0, z))
    # The crossed braces are the pasture-fence icon in the references and
    # remain readable when several tiles join into a long run.
    for angle in (-0.43, 0.43):
        b.box("timber_light", size=(span * 0.92, 0.065, 0.085),
              loc=(0, -0.015, 0.60), rot=(0, angle, 0))
    # Hinges and a receiver turn the repeated X-brace into a believable gate
    # leaf when ParcelView swings it, while remaining quiet on fence runs.
    for z in (0.36, 0.84):
        b.box("metal_dark", size=(0.30, 0.055, 0.075),
              loc=(-span / 2 + 0.12, -0.07, z), surface="metal_panels")
    b.box("metal_dark", size=(0.18, 0.060, 0.10),
          loc=(span / 2 - 0.08, -0.07, 0.64), surface="metal_panels")
    b.bevel(segments=1, width=0.015)
    return b.build(collection("BUILDINGS"))


def building_coop():
    """
    Animal shelter. Same cool palette as the barn but a simple gable and a
    lower mass, so it never competes with the barn for attention.
    """
    b = MeshBuilder("SM_building_coop", budget="building")
    w, d, h = TILE_SIZE * 1.35, TILE_SIZE * 1.15, 1.02
    body_top = h + 0.24
    ridge_z = h + 0.76
    # Broad skids overlap the body and stay readable from the starter camera;
    # four tiny stilts previously disappeared and left the coop floating.
    for sy in (-1, 1):
        b.box("timber_warm", size=(w * 0.82, 0.14, 0.16),
              loc=(0, sy * d * 0.31, 0.18))
    b.box("wall_teal", size=(w, d, h), loc=(0, 0, h / 2 + 0.24))
    _roof_end_volume(
        b, "wall_teal",
        [(-d / 2, body_top), (d / 2, body_top), (0, ridge_z)],
        w,
        rot=(0, 0, math.pi / 2),
    )
    _roof_shell_x(
        b,
        "roof_grey",
        [(-d / 2 - 0.08, body_top + 0.02),
         (0, ridge_z + 0.05),
         (d / 2 + 0.08, body_top + 0.02)],
        w * 1.10,
        rot=(0, 0, math.pi / 2),
    )
    b.box("trim_white", size=(0.60, 0.075, 0.68),
          loc=(0, -d / 2 - 0.015, 0.60))
    b.box("timber_warm", size=(0.46, 0.08, 0.56),
          loc=(0, -d / 2 - 0.06, 0.58))
    for angle in (-0.52, 0.52):
        b.box("timber_light", size=(0.40, 0.065, 0.055),
              loc=(0, -d / 2 - 0.105, 0.58), rot=(0, angle, 0))
    b.box("trim_white", size=(w * 0.9, 0.07, 0.09),
          loc=(0, -d / 2 - 0.01, h + 0.18))
    b.box("trim_white", size=(0.48, 0.075, 0.42),
          loc=(w * 0.29, -d / 2 - 0.02, 0.84))
    b.box("window_blue", size=(0.36, 0.082, 0.30),
          loc=(w * 0.29, -d / 2 - 0.065, 0.84))
    # A short ramp: it tells the player animals go IN, without a UI label.
    b.box("timber_warm", size=(0.42, 0.55, 0.06),
          loc=(0, -d / 2 - 0.26, 0.16), rot=(-0.42, 0, 0))
    # Side nesting box gives the coop an asymmetrical, toy-like silhouette.
    b.box("wall_teal_light", size=(0.48, 0.62, 0.44),
          loc=(-w / 2 - 0.18, 0.10, 0.66))
    b.box("roof_grey_light", size=(0.58, 0.72, 0.09),
          loc=(-w / 2 - 0.18, 0.10, 0.91), rot=(0, -0.12, 0))
    b.bevel(segments=1, width=0.015)

    # The shipping camera sees the north-west service side, so one broad
    # covered feed dock carries the building identity there: open bay, deck,
    # canopy and approach ramp read as one functional unit rather than trim.
    service_y = d / 2
    service_x = -0.48
    b.box("trim_white", size=(1.10, 0.075, 0.84),
          loc=(service_x, service_y + 0.035, 0.73))
    b.box("timber_dark", size=(0.86, 0.085, 0.62),
          loc=(service_x, service_y + 0.080, 0.71))
    b.box("timber_warm", size=(1.48, 0.74, 0.12),
          loc=(service_x, service_y + 0.34, 0.24))
    for sx in (-1, 1):
        b.box("timber_dark", size=(0.11, 0.11, 1.14),
              loc=(service_x + sx * 0.60, service_y + 0.62, 0.82))
    b.box("roof_grey_light", size=(1.66, 0.86, 0.10),
          loc=(service_x, service_y + 0.34, 1.38), rot=(-0.12, 0, 0),
          surface="metal_panels")
    b.box("timber_warm", size=(0.82, 0.72, 0.08),
          loc=(service_x, service_y + 0.86, 0.14), rot=(-0.18, 0, 0))
    _front_door_knob(b, 0.15, -d / 2 - 0.13, 0.58)
    return b.build(collection("BUILDINGS"))


def building_loading_pad():
    """Two-tile transfer deck whose ramp, crates and post read as logistics."""
    b = MeshBuilder("SM_building_loading_pad", budget="building")
    w, d = TILE_SIZE * 1.86, TILE_SIZE * 0.86
    b.box("timber_dark", size=(w, d, 0.16), loc=(0, 0, 0.08))
    for index in range(5):
        x = -w * 0.40 + index * (w * 0.80 / 4)
        b.box("timber_light", size=(w * 0.16, d * 0.90, 0.10), loc=(x, 0, 0.20))
    b.box("metal_dark", size=(w * 0.96, 0.10, 0.16), loc=(0, d * 0.44, 0.22))
    b.box("timber_warm", size=(w * 0.42, 0.58, 0.09),
          loc=(0, -d * 0.62, 0.13), rot=(-0.18, 0, 0))
    for sx in (-1, 1):
        b.box("metal_galv", size=(0.12, 0.12, 0.34),
              loc=(sx * w * 0.46, -d * 0.40, 0.20))
    b.box("wall_teal_dark", size=(0.62, 0.52, 0.46), loc=(-1.18, 0.24, 0.49))
    b.box("wall_teal", size=(0.46, 0.42, 0.34), loc=(-0.72, 0.27, 0.40))
    b.box("timber_dark", size=(0.11, 0.11, 1.18), loc=(1.35, 0.46, 0.66))
    b.box("trim_white", size=(0.78, 0.08, 0.42), loc=(1.05, 0.43, 1.04))
    b.box("wall_teal", size=(0.66, 0.09, 0.30), loc=(1.05, 0.38, 1.04))
    b.bevel(segments=1, width=0.015)
    return b.build(collection("BUILDINGS"))


def building_cold_store():
    """Low insulated store with an unmistakable sliding door and cooling fan."""
    b = MeshBuilder("SM_building_cold_store", budget="building")
    w, d, h = TILE_SIZE * 1.82, TILE_SIZE * 1.78, 2.18
    b.box("metal_dark", size=(w * 0.98, d * 0.98, 0.18), loc=(0, 0, 0.09),
          surface="metal_panels")
    b.box("wall_teal_light", size=(w, d, h), loc=(0, 0, h / 2))
    b.box("roof_grey_light", size=(w * 1.06, d * 1.06, 0.20),
          loc=(0, 0, h + 0.10), surface="metal_panels")
    b.box("roof_grey_dark", size=(w * 1.02, 0.15, 0.15),
          loc=(0, -d * 0.49, h + 0.04), surface="metal_panels")
    b.box("trim_white", size=(2.05, 0.09, 1.88), loc=(-0.45, -d / 2 - 0.03, 1.02))
    for sx in (-0.92, 0.02):
        b.box("metal_galv", size=(0.82, 0.10, 1.68), loc=(sx, -d / 2 - 0.08, 1.02))
        b.box("metal_dark", size=(0.07, 0.12, 1.56), loc=(sx + 0.34, -d / 2 - 0.14, 1.02))
    b.box("window_blue", size=(0.58, 0.11, 0.46), loc=(1.10, -d / 2 - 0.08, 1.34))
    # The stepped condenser breaks the anonymous flat-roof silhouette and
    # makes refrigeration legible even when the animated front fan is hidden.
    b.box("roof_grey_dark", size=(w * 0.94, 0.12, 0.22),
          loc=(0, d * 0.48, h + 0.21), surface="metal_panels")
    b.box("metal_galv", size=(1.06, 0.76, 0.42),
          loc=(0.82, 0.54, h + 0.35), surface="metal_panels")
    b.box("roof_grey_dark", size=(1.16, 0.86, 0.10),
          loc=(0.82, 0.54, h + 0.61), surface="metal_panels")
    for x in (0.62, 1.02):
        b.box("metal_dark", size=(0.11, 0.055, 0.24),
              loc=(x, 0.145, h + 0.35), surface="metal_panels")
    for sx in (-1, 1):
        b.box("metal_dark", size=(0.12, d * 0.92, 0.18),
              loc=(sx * w * 0.46, 0, 0.09))
    b.bevel(segments=1, width=0.015)
    for sx in (-0.64, 0.30):
        _sliding_door_handle(b, sx, -d / 2 - 0.18, 1.02)
    b.cylinder("metal_dark", 0.42, 0.10, loc=(1.08, -d / 2 - 0.10, 0.64),
               rot=(math.pi / 2, 0, 0), segments=10)
    b.cylinder("wall_teal_dark", 0.31, 0.12, loc=(1.08, -d / 2 - 0.17, 0.64),
               rot=(math.pi / 2, 0, 0), segments=10)
    return b.build(collection("BUILDINGS"))


def building_worker_hut():
    """Raised cottage with a veranda and chimney: shelter, not another shed."""
    b = MeshBuilder("SM_building_worker_hut", budget="building")
    w, d, h = TILE_SIZE * 1.66, TILE_SIZE * 1.58, 1.72
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box("timber_dark", size=(0.13, 0.13, 0.34),
                  loc=(sx * w * 0.42, sy * d * 0.40, 0.17))
    b.box("wall_teal_light", size=(w, d, h), loc=(0, 0, h / 2 + 0.26))
    for sy in (-1, 1):
        b.box("roof_grey", size=(w * 1.10, d * 0.58, 0.15),
              loc=(0, sy * d * 0.25, h + 0.54), rot=(sy * -0.48, 0, 0))
    b.box("timber_warm", size=(w * 0.82, 0.78, 0.11), loc=(0, -d * 0.66, 0.30))
    for sx in (-1, 1):
        b.box("timber_dark", size=(0.10, 0.10, 1.28),
              loc=(sx * w * 0.34, -d * 0.72, 0.86))
    b.box("roof_grey_light", size=(w * 0.88, 0.92, 0.10),
          loc=(0, -d * 0.70, 1.55), rot=(-0.15, 0, 0))
    # One broad step and two porch rails make the raised floor believable at
    # gameplay distance without spending geometry on balusters that vanish.
    b.box("timber_light", size=(w * 0.54, 0.34, 0.14),
          loc=(0, -d * 0.93, 0.14))
    # The entry side stays open; a broad rail and brace protect the window
    # side and read front-on instead of becoming two end-on wooden handles.
    b.box("timber_light", size=(w * 0.25, 0.09, 0.10),
          loc=(w * 0.235, -d * 0.72, 0.72))
    b.box("timber_light", size=(w * 0.25, 0.08, 0.075),
          loc=(w * 0.235, -d * 0.72, 0.52), rot=(0, -0.42, 0))
    b.box("trim_white", size=(0.72, 0.08, 1.54), loc=(-0.66, -d / 2 - 0.04, 1.00))
    b.box("timber_warm", size=(0.58, 0.09, 1.40), loc=(-0.66, -d / 2 - 0.09, 0.98))
    b.box("trim_white", size=(0.78, 0.08, 0.70), loc=(0.72, -d / 2 - 0.04, 1.20))
    b.box("window_blue", size=(0.62, 0.09, 0.54), loc=(0.72, -d / 2 - 0.09, 1.20))
    b.box("roof_grey_dark", size=(0.30, 0.30, 0.92), loc=(1.05, 0.45, 2.02))
    b.bevel(segments=1, width=0.015)
    _front_door_knob(b, -0.47, -d / 2 - 0.16, 0.98)
    return b.build(collection("BUILDINGS"))


def building_well():
    """Deep well with an open water ring, timber gantry and animated crank."""
    b = MeshBuilder("SM_building_well", budget="building")
    for sx in (-1, 1):
        b.box("timber_dark", size=(0.13, 0.13, 1.52), loc=(sx * 0.62, 0, 0.94))
    for sy in (-1, 1):
        b.box("roof_grey", size=(1.62, 0.74, 0.11),
              loc=(0, sy * 0.31, 1.90), rot=(sy * -0.42, 0, 0))
    b.bevel(segments=1, width=0.015)
    # Individual ring stones leave a dark opening around recessed water. The
    # former solid cylinder read as a painted barrel with water on its lid.
    b.cylinder("rock_shadow", 0.50, 0.26, loc=(0, 0, 0.13),
               segments=10, surface="stone")
    for index in range(10):
        angle = index * TAU / 10
        b.box("sand_stone" if index % 3 else "rock",
              size=(0.24, 0.34, 0.36),
              loc=(math.cos(angle) * 0.55, math.sin(angle) * 0.55, 0.18),
              rot=(0, 0, angle), surface="stone")
    b.cylinder("water_deep", 0.44, 0.035, loc=(0, 0, 0.30), segments=10)
    b.cylinder_between("timber_light", (-0.70, 0, 1.64), (0.70, 0, 1.64),
                       0.075, segments=6, radius_top=0.065)
    b.cylinder("metal_dark", 0.09, 1.46, loc=(0, 0, 1.30),
               rot=(0, math.pi / 2, 0), segments=7)
    b.cylinder("timber_dark", 0.018, 0.58, loc=(0, 0, 1.29), segments=5)
    b.cylinder("timber_warm", 0.14, 0.22, loc=(0, 0, 0.89),
               segments=7, radius_top=0.11)
    b.cylinder("metal_dark", 0.145, 0.035, loc=(0, 0, 0.99), segments=7)
    return b.build(collection("BUILDINGS"))


def building_mill():
    """Compact stone mill whose exposed wheel makes processing readable."""
    b = MeshBuilder("SM_building_mill", budget="building")
    w, d, h = TILE_SIZE * 1.78, TILE_SIZE * 1.72, 2.12
    b.box("wall_teal", size=(w, d, h), loc=(0, 0, h / 2))
    _roof_end_volume(
        b, "wall_teal",
        [(-w / 2, h), (w / 2, h), (0, h + 0.67)], d,
    )
    _roof_shell_x(
        b,
        "roof_grey",
        [(-w / 2 - 0.08, h + 0.02),
         (0, h + 0.72),
         (w / 2 + 0.08, h + 0.02)],
        d * 1.08,
        thickness=0.15,
    )
    b.box("trim_white", size=(1.20, 0.08, 1.72), loc=(-0.55, -d / 2 - 0.04, 0.94))
    b.box("timber_warm", size=(1.04, 0.09, 1.58), loc=(-0.55, -d / 2 - 0.09, 0.92))
    for angle in (-0.62, 0.62):
        b.box("timber_light", size=(0.94, 0.07, 0.08),
              loc=(-0.55, -d / 2 - 0.14, 0.92), rot=(0, angle, 0))
    b.box("trim_white", size=(0.72, 0.08, 0.64), loc=(0.76, -d / 2 - 0.04, 1.34))
    b.box("window_blue", size=(0.56, 0.09, 0.48), loc=(0.76, -d / 2 - 0.09, 1.34))
    b.cylinder("trim_white", 0.31, 0.08,
               loc=(0, -d / 2 - 0.04, h + 0.20),
               rot=(math.pi / 2, 0, 0), segments=8)
    b.cylinder("window_blue", 0.22, 0.10,
               loc=(0, -d / 2 - 0.09, h + 0.20),
               rot=(math.pi / 2, 0, 0), segments=8)
    b.cylinder("metal_dark", 0.16, 0.30, loc=(w / 2 + 0.05, 0, 1.04),
               rot=(0, math.pi / 2, 0), segments=8)
    b.box("timber_light", size=(0.56, 0.72, 0.60), loc=(0.72, 0.58, 0.58))
    b.box("roof_grey_light", size=(0.68, 0.82, 0.10), loc=(0.72, 0.58, 0.92))
    b.box("roof_grey_dark", size=(0.28, 0.28, 0.72), loc=(-1.12, 0.35, 2.38))
    b.bevel(segments=1, width=0.015)
    # Stone is the deliberate hard-edge exception, so the grounding plinth
    # stays faceted and does not spend the mill's budget on invisible chamfers.
    b.box("sand_stone", size=(w * 0.98, d * 0.98, 0.24), loc=(0, 0, 0.12),
          surface="stone")
    _front_door_knob(b, -0.21, -d / 2 - 0.16, 0.92)
    return b.build(collection("BUILDINGS"))


def building_creamery():
    """Clean dairy building with a cooling tank and front refrigeration fan."""
    b = MeshBuilder("SM_building_creamery", budget="building")
    w, d, h = TILE_SIZE * 1.80, TILE_SIZE * 1.74, 1.96
    b.box("wall_teal_light", size=(w, d, h), loc=(0, 0, h / 2))
    b.box("roof_grey_light", size=(w * 1.06, d * 1.05, 0.18),
          loc=(0, 0, h + 0.09), surface="metal_panels")
    b.box("trim_white", size=(1.14, 0.08, 1.62), loc=(-0.72, -d / 2 - 0.04, 0.92))
    b.box("wall_teal_dark", size=(0.98, 0.09, 1.46), loc=(-0.72, -d / 2 - 0.09, 0.90))
    b.box("trim_white", size=(0.74, 0.08, 0.62), loc=(0.72, -d / 2 - 0.04, 1.28))
    b.box("window_blue", size=(0.58, 0.09, 0.46), loc=(0.72, -d / 2 - 0.09, 1.28))
    b.bevel(segments=1, width=0.015)
    _front_door_knob(b, -0.39, -d / 2 - 0.16, 0.90)
    b.cylinder("metal_galv", 0.58, 1.55, loc=(1.42, 0.62, 0.78), segments=10)
    b.cylinder("roof_grey_light", 0.59, 0.12, loc=(1.42, 0.62, 1.62),
               segments=10, radius_top=0.42, surface="metal_panels")
    b.cylinder("metal_dark", 0.41, 0.10, loc=(0.78, -d / 2 - 0.10, 0.58),
               rot=(math.pi / 2, 0, 0), segments=10)
    b.cylinder("wall_teal_dark", 0.30, 0.12, loc=(0.78, -d / 2 - 0.17, 0.58),
               rot=(math.pi / 2, 0, 0), segments=10)
    return b.build(collection("BUILDINGS"))


def building_preserve_kitchen():
    """Two-tile kitchen with awning, chimney and a warm jar display."""
    b = MeshBuilder("SM_building_preserve_kitchen", budget="building")
    w, d, h = TILE_SIZE * 1.82, TILE_SIZE * 0.84, 1.62
    b.box("wall_teal", size=(w, d, h), loc=(0, 0, h / 2))
    for sy in (-1, 1):
        b.box("roof_grey", size=(w * 1.08, d * 0.60, 0.13),
              loc=(0, sy * d * 0.25, h + 0.38), rot=(sy * -0.46, 0, 0))
    b.box("trim_white", size=(0.74, 0.08, 1.42), loc=(-1.08, -d / 2 - 0.04, 0.80))
    b.box("timber_warm", size=(0.60, 0.09, 1.28), loc=(-1.08, -d / 2 - 0.09, 0.78))
    b.box("roof_grey_light", size=(1.52, 0.74, 0.10),
          loc=(0.54, -d * 0.66, 1.52), rot=(-0.18, 0, 0))
    b.box("timber_dark", size=(1.34, 0.10, 0.12), loc=(0.54, -d / 2 - 0.14, 0.60))
    b.box("roof_grey_dark", size=(0.30, 0.30, 0.86), loc=(1.18, 0.16, 2.00))
    b.bevel(segments=1, width=0.015)
    _front_door_knob(b, -0.85, -d / 2 - 0.16, 0.78)
    for index in range(3):
        x = 0.12 + index * 0.42
        b.cylinder("pumpkin_body", 0.10, 0.24, loc=(x, -d / 2 - 0.17, 0.78),
                   segments=7, radius_top=0.085)
        b.cylinder("trim_white", 0.085, 0.04, loc=(x, -d / 2 - 0.17, 0.92), segments=7)
    return b.build(collection("BUILDINGS"))


def building_mill_wheel():
    """Separate wheel so the mill can rotate only while its queue is active."""
    b = MeshBuilder("SM_building_mill_wheel", budget="building")
    radius = 0.88
    for index in range(10):
        angle = index * TAU / 10
        b.box("timber_warm", size=(0.13, 0.16, 0.54),
              loc=(0, math.cos(angle) * radius, math.sin(angle) * radius),
              rot=(angle, 0, 0))
    for index in range(5):
        angle = index * TAU / 5
        b.cylinder_between("timber_light", (0, 0, 0),
                           (0, math.cos(angle) * radius, math.sin(angle) * radius),
                           0.045, segments=5, radius_top=0.032)
    b.cylinder("metal_dark", 0.15, 0.26, rot=(0, math.pi / 2, 0), segments=8)
    return b.build(collection("BUILDINGS"), origin_to_base=False)


def building_vent_fan():
    """Shared front-mounted refrigeration fan for cold store and creamery."""
    b = MeshBuilder("SM_building_vent_fan", budget="building")
    for index in range(6):
        angle = index * TAU / 6
        b.cylinder_between("metal_galv", (0, 0, 0),
                           (math.cos(angle) * 0.29, 0, math.sin(angle) * 0.29),
                           0.042, segments=5, radius_top=0.024)
    b.cylinder("metal_dark", 0.09, 0.12, rot=(math.pi / 2, 0, 0), segments=8)
    return b.build(collection("BUILDINGS"), origin_to_base=False, ambient_occlusion=False)


def building_well_crank():
    """Four-spoke crank and hanging handle for the deep well."""
    b = MeshBuilder("SM_building_well_crank", budget="building")
    for index in range(4):
        angle = index * TAU / 4
        b.cylinder_between("timber_light", (0, 0, 0),
                           (0, math.cos(angle) * 0.34, math.sin(angle) * 0.34),
                           0.035, segments=5, radius_top=0.024)
    b.cylinder("metal_dark", 0.08, 0.14, rot=(0, math.pi / 2, 0), segments=7)
    b.cylinder_between("timber_warm", (0, 0.34, 0), (0, 0.48, -0.12),
                       0.038, segments=5, radius_top=0.032)
    return b.build(collection("BUILDINGS"), origin_to_base=False, ambient_occlusion=False)


def building_steam_puff():
    """Opaque toy-like steam cluster reused by active processor chimneys."""
    b = MeshBuilder("SM_building_steam_puff", budget="prop")
    b.sphere("trim_white", 0.14, loc=(-0.10, 0, 0), scale=(1.0, 0.8, 0.8), u=6, v=3)
    b.sphere("roof_grey_light", 0.11, loc=(0.09, 0.02, 0.07),
             scale=(1.0, 0.86, 0.86), u=6, v=3, surface="plain")
    return b.build(collection("BUILDINGS"), origin_to_base=False, ambient_occlusion=False)


def building_dust_puff():
    """Warm completion dust, pooled around a structure's contact footprint."""
    b = MeshBuilder("SM_building_dust_puff", budget="prop")
    b.sphere("sand_path", 0.13, loc=(-0.10, 0, 0), scale=(1.15, 0.85, 0.70), u=6, v=3)
    b.sphere("ground_scrub_pale", 0.10, loc=(0.10, 0.01, 0.04),
             scale=(1.05, 0.82, 0.70), u=6, v=3)
    return b.build(collection("BUILDINGS"), origin_to_base=False, ambient_occlusion=False)


# ==========================================================================
# Character
# ==========================================================================


def character_farmer():
    """
    The player: chibi, four heads tall, 1.60 m.

    Revised in the quality pass. The previous version had two flat dots for a
    face, which is correct at gameplay distance and lifeless anywhere closer - and the
    character is the one asset a player looks at constantly.

    What a face needs at this scale, in order of how much it buys:
      1. WHITES. A dark dot on skin reads as a hole; a dark iris on a white
         sclera reads as an eye. This is the single biggest change.
      2. BROWS. They carry more expression than eyes do, and they are two
         boxes.
      3. A mouth, small and low-contrast, so it suggests rather than grins.
    Everything else here is silhouette and grounding: a collar, a belt, a
    boot sole, and hands with thumbs.
    """
    b = MeshBuilder("SM_char_farmer", budget="character")
    chest, neck = 0.72, 1.08

    def front_prism(colour, outline, depth, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
        """A thin authored face mark that follows the head instead of floating."""
        vertices = [(x, y, z) for y in (-depth * 0.5, depth * 0.5)
                    for x, z in outline]
        count = len(outline)
        faces = [tuple(range(count)),
                 tuple(range(count * 2 - 1, count - 1, -1))]
        for index in range(count):
            following = (index + 1) % count
            faces.append((index, following,
                          count + following, count + index))
        b.polyhedron(colour, vertices, faces, loc=loc, rot=rot, scale=scale)

    def ring_loft(colour, rings, segments=8, caps=True):
        """Join authored cross-sections into one continuous deforming volume."""
        vertices = []
        for x, y, z, radius_x, radius_y in rings:
            for index in range(segments):
                angle = index * TAU / segments
                vertices.append((x + math.cos(angle) * radius_x,
                                 y + math.sin(angle) * radius_y, z))
        faces = []
        for ring in range(len(rings) - 1):
            start = ring * segments
            following_ring = (ring + 1) * segments
            for index in range(segments):
                following = (index + 1) % segments
                faces.append((start + index, start + following,
                              following_ring + following,
                              following_ring + index))
        if caps:
            faces.append(tuple(range(segments - 1, -1, -1)))
            top_start = (len(rings) - 1) * segments
            faces.append(tuple(top_start + index for index in range(segments)))
        b.polyhedron(colour, vertices, faces)

    def mirrored_outline(outline, side):
        """Mirror a front-facing outline while preserving polygon winding."""
        if side > 0:
            return outline
        return [(-x, z) for x, z in reversed(outline)]

    # --- legs and boots ---------------------------------------------------
    # Separate tapered thigh/shin volumes and a rounded knee give the virtual
    # rig enough silhouette to sell a step. The previous single vertical tube
    # could swing, but always looked like a peg rotating from the hip.
    # The pelvis is deliberately broader than the two legs beneath it. The
    # narrower version made the whole body read as two parallel posts with a
    # shirt balanced on top; this compact shorts mass gives the chibi body a
    # stable centre without moving any of the runtime rig's joints.
    b.cylinder("pants_denim", 0.20, 0.27, loc=(0, 0, 0.56), segments=8,
               radius_top=0.182, scale=(1.08, 0.74, 1.0))
    for sx in (-1, 1):
        hip = (sx * 0.09, 0.0, 0.56)
        knee = (sx * 0.105, -0.014, 0.36)
        ankle = (sx * 0.105, 0.012, 0.16)
        # One continuous six-ring leg gives the capsule skinning actual
        # support sections above and below the knee. The previous thigh,
        # knee-ball and shin islands bent in the right direction but exposed a
        # hard toy hinge in side review.
        ring_loft(
            "pants_denim",
            ((hip[0], hip[1], hip[2], 0.096, 0.086),
             (sx * 0.102, -0.011, 0.405, 0.087, 0.079),
             (knee[0], knee[1], knee[2], 0.085, 0.079),
             (sx * 0.105, -0.008, 0.315, 0.087, 0.080),
             (sx * 0.105, 0.002, 0.245, 0.091, 0.084),
             (ankle[0], ankle[1], ankle[2], 0.078, 0.072)),
            segments=8,
        )
        # Cuff, heel, rounded toe and sole create one readable boot profile.
        # Keeping those jobs in separate broad forms is what prevents the shoe
        # from collapsing into a featureless square at gameplay distance.
        #
        # The boot MUST overlap the shin. It previously topped out at 0.161
        # while the shin ended at 0.18, leaving a two-centimetre gap that was
        # invisible in a static render and glaringly obvious the moment the leg
        # was rigged: the boot became a free-floating island with no vertex
        # continuity to the shin, so it read as a detached block hovering under
        # the trouser. Overlapping geometry is not sloppy here, it is what makes
        # a hard-surface limb survive being posed.
        b.cylinder("boot_leather", 0.076, 0.075,
                   loc=(sx * 0.105, 0.006, 0.137), segments=9,
                   radius_top=0.070, scale=(1.0, 0.88, 1.0), caps=False)
        b.sphere("boot_leather", 0.092, loc=(sx * 0.105, -0.073, 0.078),
                 scale=(0.92, 0.98, 0.60), u=10, v=6)
        b.sphere("boot_leather", 0.060,
                 loc=(sx * 0.105, 0.045, 0.059),
                 scale=(0.90, 0.74, 0.68), u=7, v=5)
        sole_outline = [(-0.078, -0.088), (-0.052, -0.105),
                        (0.052, -0.105), (0.078, -0.088),
                        (0.067, 0.065), (-0.067, 0.065)]
        sole_vertices = [(x, y, z) for z in (-0.006, 0.006)
                         for x, y in sole_outline]
        sole_faces = [
            (0, 1, 2, 3, 4, 5), (11, 10, 9, 8, 7, 6),
            (0, 6, 7, 1), (1, 7, 8, 2), (2, 8, 9, 3),
            (3, 9, 10, 4), (4, 10, 11, 5), (5, 11, 6, 0),
        ]
        b.polyhedron("timber_dark", sole_vertices, sole_faces,
                     loc=(sx * 0.105, -0.020, 0.014))

    # --- torso ------------------------------------------------------------
    # A four-ring loft creates an authored chest-to-belly curve instead of a
    # straight-sided cone. It remains open at top and bottom because the collar
    # and pelvis overlap those hidden boundaries; the triangle budget is spent
    # on the visible silhouette rather than sealed interior faces.
    torso_rings = ((0.60, 0.220, 0.158),
                   (0.68, 0.245, 0.174),
                   (0.92, 0.246, 0.168),
                   (1.05, 0.212, 0.146))
    torso_segments = 12
    torso_vertices = []
    for z, radius_x, radius_y in torso_rings:
        for index in range(torso_segments):
            angle = index * TAU / torso_segments
            torso_vertices.append((math.cos(angle) * radius_x,
                                   math.sin(angle) * radius_y, z))
    torso_faces = []
    for ring in range(len(torso_rings) - 1):
        start = ring * torso_segments
        following = (ring + 1) * torso_segments
        for index in range(torso_segments):
            next_index = (index + 1) % torso_segments
            torso_faces.append((start + index, start + next_index,
                                following + next_index, following + index))
    b.polyhedron("shirt_blue", torso_vertices, torso_faces)
    # Each stripe follows the shirt taper. Equal-radius rings protruded as
    # white fins in deep work poses and advertised the primitive construction.
    stripe_rings = (
        (0.66, (0.238, 0.166), (0.247, 0.176)),
        (0.80, (0.249, 0.172), (0.248, 0.171)),
        (0.94, (0.243, 0.167), (0.237, 0.163)),
    )
    for z, lower_radii, upper_radii in stripe_rings:
        stripe_vertices = []
        for ring_z, (radius_x, radius_y) in (
                (z - 0.019, lower_radii), (z + 0.019, upper_radii)):
            for index in range(torso_segments):
                angle = index * TAU / torso_segments
                stripe_vertices.append((math.cos(angle) * radius_x,
                                        math.sin(angle) * radius_y, ring_z))
        stripe_faces = []
        for index in range(torso_segments):
            following = (index + 1) % torso_segments
            stripe_faces.append((index, following,
                                 torso_segments + following,
                                 torso_segments + index))
        b.polyhedron("shirt_stripe", stripe_vertices, stripe_faces)
    # A belt breaks the torso into two masses so it is not one slab.
    b.cylinder("timber_dark", 0.224, 0.055, loc=(0, 0, 0.665),
               segments=8, scale=(1.0, 0.64, 1.0), caps=False)
    b.box("straw_hat_band", size=(0.075, 0.27, 0.075), loc=(0, -0.005, 0.665))

    # A bright kerchief and diagonal satchel strap restore the asymmetry that
    # gave the earlier farmer an instantly recognisable silhouette. Both are
    # broad enough to read at the gameplay camera and useful in menu art.
    b.polyhedron(
        "scarf_red",
        [(-0.13, -0.145, 0.0), (0.13, -0.145, 0.0), (0.0, -0.175, -0.17),
         (-0.11, -0.115, -0.01), (0.11, -0.115, -0.01), (0.0, -0.145, -0.15)],
        [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)],
        loc=(0, 0, 1.07),
    )
    # Two overlapping strap pieces approximate the chest curve instead of one
    # rigid diagonal bar. Both remain inside the dedicated strap bone capsule.
    b.box("timber_dark", size=(0.050, 0.024, 0.320),
          loc=(-0.055, -0.148, 1.000), rot=(0, -0.42, 0))
    b.box("timber_dark", size=(0.052, 0.026, 0.380),
          loc=(0.125, -0.148, 0.755), rot=(0, -0.56, 0))
    # Chamfered pouch: broad enough to remain iconic, but no longer a cuboid
    # plank in the side silhouette.
    # A compressed rounded pouch gives the side view a gusseted silhouette;
    # the previous extruded hexagon still read as a timber board from the
    # gameplay-facing side camera.
    ring_loft(
        "timber_warm",
        ((0.270, 0.080, 0.710, 0.070, 0.030),
         (0.270, 0.080, 0.665, 0.108, 0.046),
         (0.270, 0.080, 0.565, 0.114, 0.050),
         (0.270, 0.080, 0.495, 0.096, 0.043),
         (0.270, 0.080, 0.470, 0.052, 0.028)),
        segments=8,
    )
    b.box("timber_light", size=(0.19, 0.014, 0.072),
          loc=(0.270, 0.026, 0.670))
    b.cylinder("straw_hat_band", 0.021, 0.018,
               loc=(0.270, 0.016, 0.650),
               rot=(math.pi / 2, 0, 0), segments=5)
    # Collar as a ring around the neck, not a plate across the chest.
    #
    # Three versions were needed here. A wide slab read as a plinth with a bust
    # standing on it. Adding angled points made it a bow tie. Narrowing it and
    # cutting a placket notch made it a shirt-and-tie. All three failed the
    # same way: any horizontal rectangle spanning the chest at neck height is
    # read as a separate object resting on the torso, because that is what
    # rectangles at that angle do. A short cylinder hugging the neck is read as
    # part of the garment, because it follows the form underneath it.
    b.cylinder("trim_white", 0.108, 0.046, loc=(0, 0, chest + 0.350),
               segments=12, caps=False)

    # --- arms and hands ---------------------------------------------------
    # Elbows are authored into the resting silhouette. Runtime animation then
    # rotates upper/lower regions from an already-human pose instead of trying
    # to make a straight cylinder resemble a working arm.
    for sx in (-1, 1):
        shoulder = (sx * 0.168, 0.0, 1.018)
        elbow = (sx * 0.275, -0.014 + sx * 0.006, 0.88)
        wrist = (sx * 0.295, -0.055 + sx * 0.012, 0.73)
        # A rounded sleeve cap joins arm to torso. It preserves the exact
        # shoulder pivot while removing the visibly capped-cylinder seam that
        # made the arms look assembled from spare parts.
        b.sphere("shirt_blue", 0.084, loc=shoulder,
                 scale=(0.98, 0.88, 0.82), u=10, v=6)
        b.cylinder_between("shirt_blue", shoulder, elbow, 0.070,
                           segments=8, radius_top=0.058, caps=False)
        # A rolled cuff creates a readable elbow hinge. The old uninterrupted
        # blue-to-skin tube stayed visually straight even when the rig bent it.
        b.cylinder_between("shirt_blue_dark",
                           (sx * 0.255, -0.010, 0.922), elbow, 0.064,
                           segments=6, radius_top=0.058, caps=False)
        b.cylinder_between("skin", elbow, wrist, 0.056,
                           segments=8, radius_top=0.041, caps=False)
        # A vertical palm with a lower finger pad reads as a relaxed hand,
        # rather than the old spherical mitten. The thumb sits on the inward
        # edge where its separation remains visible in both three-quarter and
        # gameplay views.
        hand_rings = ((0.744, 0.038, 0.032),
                      (0.710, 0.053, 0.041),
                      (0.670, 0.054, 0.042),
                      (0.638, 0.033, 0.031))
        hand_segments = 10
        hand_center_y = -0.074 + sx * 0.012
        hand_vertices = []
        for z, radius_x, radius_y in hand_rings:
            for index in range(hand_segments):
                angle = index * TAU / hand_segments
                x = sx * 0.302 + math.cos(angle) * radius_x
                y = hand_center_y + math.sin(angle) * radius_y
                if z in (0.710, 0.670) and math.cos(angle) * sx < -0.30:
                    x -= sx * 0.010
                    y -= 0.003
                hand_vertices.append((x, y, z))
        hand_faces = []
        for ring in range(len(hand_rings) - 1):
            start = ring * hand_segments
            following_ring = (ring + 1) * hand_segments
            for index in range(hand_segments):
                following = (index + 1) % hand_segments
                hand_faces.append((start + index, start + following,
                                   following_ring + following,
                                   following_ring + index))
        hand_faces.append(tuple(range(hand_segments - 1, -1, -1)))
        top_start = (len(hand_rings) - 1) * hand_segments
        hand_faces.append(tuple(top_start + index
                                for index in range(hand_segments)))
        b.polyhedron("skin", hand_vertices, hand_faces)
        b.sphere("skin", 0.033,
                 loc=(sx * 0.262, hand_center_y - 0.033, 0.696),
                 rot=(0.0, sx * -0.52, 0.0),
                 scale=(0.95, 1.20, 0.75), u=6, v=4)

    # --- head -------------------------------------------------------------
    # Short neck. Eight centimetres of bare neck on a four-heads-tall chibi
    # reads as a giraffe; the collar above now closes most of that gap.
    b.cylinder("skin", 0.090, 0.07, loc=(0, 0, neck + 0.01),
               segments=8, caps=False)
    _, head_vertices = b.sphere(
        "skin", 0.235, loc=(0, 0, neck + 0.24),
        scale=(1.02, 0.92, 1.00), u=22, v=11,
    )
    # Shape the lower face directly in the head topology. A separate muzzle
    # produced an obvious lip/chin island; this subtle 14 mm projection creates
    # profile rhythm while retaining one continuous facial surface.
    lower_face_z = neck + 0.155
    nose_face_z = neck + 0.214
    for vertex in head_vertices:
        if vertex.co.y > 0.04:
            rear = max(0.0, min(1.0, (vertex.co.y - 0.04) / 0.18))
            vertex.co.y -= 0.010 * rear
            continue
        if vertex.co.y >= -0.04:
            continue
        vertical = max(0.0, 1.0 - abs(vertex.co.z - lower_face_z) / 0.115)
        lateral = max(0.0, 1.0 - abs(vertex.co.x) / 0.180)
        nose = max(0.0, 1.0 - abs(vertex.co.z - nose_face_z) / 0.055)
        vertex.co.y -= (0.018 * vertical + 0.006 * nose) * lateral

    # The larger chibi head pushes its front surface farther toward -Y. Keep
    # every facial island just proud of that surface so the expression does
    # not disappear into the cheeks after the proportion pass.
    eye_y, eye_z = -0.190, neck + 0.252
    for sx in (-1, 1):
        # Sclera, then iris in front of it. Depth-sorted by position rather
        # than by transparency, so it is one opaque mesh like everything else.
        #
        # The iris is deliberately large relative to the sclera. The first
        # version used a small dark disc floating in the middle of a white
        # oval, which is the anatomy of a googly eye: white all the way round
        # the pupil reads as alarm or vacancy, never as calm. Filling the eye
        # vertically and leaving white only as slivers at the corners is what
        # makes a stylised eye look like it is looking at something.
        # Horizontal sclera plus a clean iris. The deleted intermediate brown
        # globe used to leave a dark ring around every eye, which read as a
        # deep empty socket in the gameplay camera. White now survives at the
        # corners while the tall iris still gives an unambiguous gaze.
        eye_outline = [(-0.046, 0.000), (-0.042, 0.014),
                       (-0.032, 0.025), (-0.016, 0.032),
                       (0.004, 0.033), (0.023, 0.029),
                       (0.039, 0.018), (0.047, 0.004),
                       (0.043, -0.012), (0.030, -0.024),
                       (0.010, -0.030), (-0.012, -0.029),
                       (-0.031, -0.021), (-0.044, -0.009)]
        eye_outline = mirrored_outline(eye_outline, sx)
        front_prism("eye_white", eye_outline, 0.001,
                    (sx * 0.078, eye_y - 0.017, eye_z),
                    scale=(0.90, 1.0, 0.90))
        gaze_x = sx * 0.077 + 0.004
        b.cylinder("eye_dark", 0.025, 0.004,
                   loc=(gaze_x, eye_y - 0.021, eye_z - 0.001),
                   rot=(math.pi / 2, 0, 0), segments=12,
                   scale=(0.92, 1.02, 1.0))
        # A skin-coloured upper lid overlaps the sclera rather than outlining
        # it. Besides softening the stare, this produces a directional eye
        # aperture that still reads after the face is reduced to gameplay size.
        lid_outline = [(-0.046, 0.020), (-0.039, 0.028),
                       (-0.025, 0.034), (-0.008, 0.037),
                       (0.010, 0.036), (0.028, 0.031),
                       (0.042, 0.022), (0.046, 0.016),
                       (0.028, 0.020), (0.008, 0.024),
                       (-0.014, 0.024), (-0.034, 0.018)]
        lid_outline = mirrored_outline(lid_outline, sx)
        front_prism("skin", lid_outline, 0.001,
                    (sx * 0.078, eye_y - 0.019, eye_z),
                    scale=(0.91, 1.0, 0.91))
        # A catchlight, high and inboard. Small enough to read as wet, not as
        # a second pupil - the previous 8 mm ball at v=3 was a visible facet.
        b.sphere("trim_white", 0.0075,
                 loc=(gaze_x - 0.006, eye_y - 0.024, eye_z + 0.012),
                 scale=(1.0, 0.6, 1.0), u=6, v=4)
        # Brow, angled slightly inward for a friendly, alert read. It now sits
        # BELOW the hairline (see the fringe note) instead of behind it.
        brow_lift = 0.0
        brow_angle = sx * -0.04
        brow_outline = [(-0.041, -0.004), (-0.031, 0.002),
                        (-0.015, 0.006), (0.004, 0.008),
                        (0.023, 0.006), (0.040, 0.001),
                        (0.034, -0.004), (0.014, 0.001),
                        (-0.011, 0.001), (-0.034, -0.006)]
        brow_outline = mirrored_outline(brow_outline, sx)
        front_prism("brow_brown", brow_outline, 0.008,
                    (sx * 0.080, eye_y - 0.015,
                     eye_z + 0.058 + brow_lift),
                    rot=(0, 0, brow_angle), scale=(1.0, 1.0, 1.15))
        # Blush: flatter, smaller and further down the cheek. The first pass
        # sat proud of the face and read as a graze rather than as warmth.
        blush_outline = [
            (math.cos(index * TAU / 12) * 0.024,
             math.sin(index * TAU / 12) * 0.010)
            for index in range(12)
        ]
        front_prism("blush", blush_outline, 0.002,
                    (sx * 0.135, -0.174, eye_z - 0.064))

    # One shallow curved prism reads as a continuous expression mark. The old
    # three cubes had visible joins and square ends in the portrait.
    mouth_z = eye_z - 0.086
    mouth_outline = [(-0.040, 0.006), (-0.030, 0.000),
                     (-0.016, -0.004), (0.000, -0.005),
                     (0.016, -0.004), (0.030, 0.000),
                     (0.040, 0.006), (0.032, 0.011),
                     (0.016, 0.007), (0.000, 0.005),
                     (-0.016, 0.007), (-0.032, 0.011)]
    front_prism("mouth_dark", mouth_outline, 0.002,
                (0, -0.220, mouth_z), scale=(1.0, 1.0, 1.15))
    # Nose as a soft shadowed wedge rather than a protruding ball. A skin-toned
    # sphere sticking out of the face catches the key light and renders almost
    # white, which is why the first version looked like a beak.
    b.sphere("skin_shadow", 0.019, loc=(0, -0.228, eye_z - 0.038),
             scale=(0.72, 0.45, 0.50), u=9, v=5)

    # A compact knot keeps the kerchief identity hook visible through torso
    # twists and makes it feel tied rather than printed onto the shirt.
    b.sphere("scarf_red", 0.027, loc=(0, -0.162, 1.052),
             scale=(0.86, 0.48, 0.72), u=6, v=3)

    # --- hair -------------------------------------------------------------
    # The crown is pushed back so the forehead is skin, not hair. Previously
    # the sphere reached y = -0.204, in front of the face surface at -0.193,
    # so it swallowed the forehead and the brows with it.
    b.sphere("hair_brown", 0.225, loc=(0, 0.040, neck + 0.275),
             scale=(0.98, 0.96, 0.86), u=16, v=9)
    # Fringe: five overlapping flattened lobes, not boxes.
    #
    # Two earlier attempts failed here for the same underlying reason. A single
    # 0.40 x 0.14 plank cut straight through the eyebrows and deleted the most
    # expressive feature on the head. Replacing it with three boxes fixed the
    # brows but read as a floating dark bar: flat front faces take the key
    # light uniformly, so the fringe lit differently from the rounded temple
    # masses beside it and visibly detached from them. Lobes solve both - they
    # shade like the rest of the hair, and staggering their heights scallops
    # the hairline instead of ruling a horizontal line across the forehead.
    #
    # The lowest lobe bottoms out at 1.509; the brow tops are at 1.494.
    for x, y, z_off in ((-0.155, -0.115, -0.003), (-0.078, -0.145, 0.005),
                        (0.0, -0.148, -0.007), (0.078, -0.145, 0.005),
                        (0.155, -0.115, -0.003)):
        b.sphere("hair_brown", 0.075, loc=(x, y, neck + 0.375 + z_off),
                 scale=(1.15, 0.75, 0.62), u=7, v=4)
    # Sideburns/volume at the temples so the hair is a shape, not a cap.
    for sx in (-1, 1):
        # Keep the clumps behind the cheek surface. At negative Y their front
        # pole pierced the smoother head and rendered as a dark triangle on
        # each cheek, defeating the intended integrated hairline.
        b.sphere("hair_brown", 0.070, loc=(sx * 0.183, 0.080, neck + 0.230),
                 scale=(0.88, 0.95, 1.18), u=8, v=5)
    # One side ponytail provides a memorable profile and visible secondary
    # motion when the whole upper region lags during locomotion.
    b.sphere("hair_brown", 0.090, loc=(0.205, 0.105, neck + 0.205),
             rot=(0.12, 0.0, -0.22), scale=(0.72, 0.88, 1.25), u=8, v=5)
    b.sphere("hair_highlight", 0.060, loc=(0.225, 0.135, neck + 0.125),
             rot=(0.18, 0.0, -0.28), scale=(0.62, 0.78, 1.18), u=7, v=5)

    # Low-poly ears complete the profile without competing with the face at
    # gameplay distance. They sit behind the temple masses, so only a warm rim
    # remains visible instead of two pasted-on discs.
    for sx in (-1, 1):
        b.sphere("skin_shadow", 0.050,
                 loc=(sx * 0.198, -0.010, neck + 0.245),
                 scale=(0.48, 0.42, 0.82), u=5, v=3)

    # --- straw hat, last so it sits proud of the hair ---------------------
    b.cylinder("straw_hat", 0.365, 0.030, loc=(0, 0, neck + 0.40), segments=19,
               radius_top=0.355)
    b.cylinder("straw_hat", 0.190, 0.17, loc=(0, 0, neck + 0.49), segments=19,
               radius_top=0.170)
    b.cylinder("straw_hat_band", 0.195, 0.042, loc=(0, 0, neck + 0.435),
               segments=19, caps=False)
    return b.build(collection("CHARACTERS"), smooth=True)


# ==========================================================================
# Animals
# ==========================================================================


def animal_chicken():
    """
    Chicken: blob-toy language. A body, a head, and three signal colours.

    Deliberately legless-looking from a distance, following reference #2 -
    the rounded mass is what makes it read as friendly rather than fussy.
    """
    b = MeshBuilder("SM_animal_chicken", budget="animal")
    b.sphere("chicken_body", 0.165, loc=(0, 0.01, 0.18),
             scale=(1.0, 1.24, 0.95), u=10, v=6)
    # A proud breast interrupts the bean profile and gives the neck a clean
    # transition into the body without introducing close-up-only feather noise.
    b.sphere("chicken_body", 0.100, loc=(0, -0.105, 0.225),
             scale=(0.80, 0.72, 0.92), u=8, v=5)
    for sx in (-1, 1):
        b.sphere("chicken_wing", 0.083, loc=(sx * 0.125, 0.02, 0.20),
                 scale=(0.42, 1.25, 0.95), u=6, v=4)
    b.sphere("chicken_body", 0.102, loc=(0, -0.165, 0.315), u=8, v=5)
    b.cylinder("chicken_beak", 0.032, 0.075, loc=(0, -0.235, 0.295),
               rot=(-1.57, 0, 0), segments=5, radius_top=0.004)
    for sx in (-1, 1):
        b.sphere("eye_dark", 0.018, loc=(sx * 0.043, -0.244, 0.335),
                 scale=(0.78, 0.42, 1.0), u=5, v=3)
    for x, z in ((0, 0.385), (-0.045, 0.372), (0.045, 0.372)):
        b.sphere("chicken_comb", 0.032, loc=(x, -0.13, z),
                 scale=(0.72, 0.72, 1.05), u=5, v=3)
    b.sphere("chicken_comb", 0.030, loc=(0, -0.185, 0.245),
             scale=(0.7, 0.5, 1.1), u=5, v=3)
    # Three unequal feathers form a tapered fan. The previous four identical
    # blades read as a rectangular broom in profile.
    for yaw, height, width in ((-0.42, 0.145, 0.058), (0.0, 0.205, 0.070),
                               (0.36, 0.165, 0.060)):
        b.blade("chicken_wing", height, width, 0.016,
                loc=(0, 0.145, 0.215), yaw=yaw, droop=-0.78, segments=3)
    for sx in (-1, 1):
        b.cylinder("chicken_beak", 0.018, 0.10,
                   loc=(sx * 0.055, -0.01, 0.055), segments=4)
        for toe in (-0.035, 0.0, 0.035):
            b.cylinder_between("chicken_beak", (sx * 0.055, -0.03, 0.015),
                               (sx * 0.055 + toe, -0.115, 0.012),
                               0.008, segments=4, radius_top=0.004)
    # Small shoulder feathers break the smooth bean silhouette and catch the
    # wing-flutter deformation in the runtime animal material.
    for sx in (-1, 1):
        for offset in (-0.03, 0.03):
            b.blade("chicken_wing", 0.105, 0.052, 0.012,
                    loc=(sx * 0.12, offset, 0.19),
                    yaw=(0.15 + offset * 2.0) * sx, droop=0.48, segments=2)
    return b.build(collection("ANIMALS"), smooth=True)


def animal_cow():
    """Friendly dairy cow: pale hide, dark patches and a low, broad silhouette.

    The first pass reused timber colours and placed one huge side patch behind
    the head. Front-on it read as a lion's mane; side-on it read as a brown
    rectangular animal. This version spends the same low-poly budget on the
    identifiers a dairy cow actually needs: a pale flank, irregular patches,
    a broad muzzle, outward ears, four grounded hooves and a visible udder.
    """
    b = MeshBuilder("SM_animal_cow", budget="animal")
    b.sphere("cow_hide", 0.35, loc=(0, 0.02, 0.50),
             scale=(1.24, 1.52, 0.90), u=8, v=5)
    # Shoulder and haunch masses break the body into readable anatomy instead
    # of one extruded capsule.
    b.sphere("cow_hide", 0.27, loc=(0, -0.31, 0.55),
             scale=(1.18, 1.00, 1.05), u=6, v=3)
    b.sphere("cow_hide", 0.28, loc=(0, 0.32, 0.52),
             scale=(1.18, 1.02, 1.05), u=6, v=3)

    # Irregular flank patches sit proud of the body by only a few millimetres.
    # Their asymmetry keeps repeated cows from reading as painted toys even
    # though every instance shares one mesh.
    b.sphere("cow_patch", 0.20, loc=(0.405, 0.04, 0.57),
             scale=(0.17, 0.92, 0.72), rot=(0.08, 0.18, -0.16), u=5, v=4)
    b.sphere("cow_patch", 0.16, loc=(-0.407, 0.20, 0.46),
             scale=(0.15, 0.82, 0.72), rot=(-0.12, -0.12, 0.22), u=5, v=4)

    # Neck, head and muzzle form a gentle downward line that remains clear
    # when the grazing shader rotates only the front mass.
    b.sphere("cow_hide", 0.22, loc=(0, -0.47, 0.65),
             scale=(0.98, 0.90, 1.12), u=7, v=4)
    b.sphere("cow_hide", 0.22, loc=(0, -0.68, 0.69),
             scale=(1.12, 0.92, 0.88), u=8, v=5)
    b.sphere("cow_patch", 0.105, loc=(-0.095, -0.715, 0.77),
             scale=(1.05, 0.36, 0.72), rot=(0, 0.10, -0.18), u=5, v=3)
    b.sphere("cow_muzzle", 0.15, loc=(0, -0.85, 0.59),
             scale=(1.22, 0.76, 0.62), u=7, v=4)

    # Ears and short horns widen the head silhouette. Horns are deliberately
    # modest: this is a dairy cow, not a bull or a buffalo.
    for sx in (-1, 1):
        b.sphere("cow_patch", 0.095, loc=(sx * 0.245, -0.65, 0.77),
                 scale=(1.35, 0.48, 0.38), rot=(0.0, sx * 0.20, sx * 0.18),
                 u=5, v=3)
        b.cylinder_between("cow_horn", (sx * 0.11, -0.64, 0.85),
                           (sx * 0.175, -0.665, 0.94), 0.024,
                           segments=4, radius_top=0.008)
        b.sphere("eye_dark", 0.020, loc=(sx * 0.115, -0.845, 0.715),
                 scale=(0.9, 0.55, 1.0), u=5, v=3)

    # Tapered legs overlap the body and end in broad hooves, so the animal is
    # grounded from both the gameplay camera and the side silhouette pass.
    for sx in (-1, 1):
        for fy in (-0.27, 0.28):
            colour = "cow_patch" if (sx > 0) == (fy > 0) else "cow_hide"
            hoof_y = fy - 0.045 if fy < 0 else fy + 0.045
            leg_x = sx * 0.225
            hoof_x = sx * 0.235
            b.cylinder_between(colour, (leg_x, fy, 0.40),
                               (hoof_x, hoof_y, 0.09), 0.078,
                               segments=5, radius_top=0.060)
            for cleft in (-1, 1):
                b.box("cow_hoof", size=(0.072, 0.20, 0.085),
                      loc=(hoof_x + cleft * 0.043, hoof_y - 0.020, 0.0425),
                      rot=(0, 0, cleft * 0.05))

    # One broad udder carries the dairy read at gameplay distance; separate
    # teat geometry was too small to survive the shipping camera.
    b.sphere("cow_udder", 0.12, loc=(0, 0.11, 0.265),
             scale=(1.25, 0.86, 0.52), u=7, v=4)

    b.cylinder_between("cow_patch", (0, 0.50, 0.58), (0.060, 0.77, 0.44),
                       0.024, segments=4, radius_top=0.013)
    b.sphere("cow_patch", 0.080, loc=(0.075, 0.80, 0.40),
             scale=(0.74, 0.96, 1.16), rot=(0.2, 0, 0.28), u=5, v=3)
    return b.build(collection("ANIMALS"), smooth=True)


def animal_sheep():
    """Merino-inspired sheep with a cloud silhouette and grounded dark face.

    The wool is built as overlapping broad masses rather than surface noise:
    at gameplay distance the scalloped outline reads as fleece, while the long
    face, lateral ears, four planted legs and short lifted tail keep it from
    collapsing into a white cow or an anonymous sphere.
    """
    b = MeshBuilder("SM_animal_sheep", budget="animal")
    b.sphere("sheep_wool", 0.34, loc=(0, 0.03, 0.49),
             scale=(1.18, 1.48, 0.92), u=8, v=5)
    b.sphere("sheep_wool", 0.25, loc=(0, -0.27, 0.54),
             scale=(1.17, 1.02, 1.04), u=6, v=4)
    b.sphere("sheep_wool_shadow", 0.26, loc=(0, 0.30, 0.51),
             scale=(1.17, 1.02, 1.00), u=6, v=4)

    # Seven large fleece rosettes create an irregular wool edge without
    # spending triangles on close-up curls the shipping camera cannot resolve.
    for x, y, z, scale in (
        (-0.27, -0.12, 0.65, 1.00), (0.27, -0.08, 0.63, 0.96),
        (-0.29, 0.18, 0.55, 0.92), (0.29, 0.20, 0.57, 0.95),
        (-0.16, 0.28, 0.70, 0.82), (0.12, 0.05, 0.78, 0.86),
        (0.0, -0.25, 0.74, 0.80),
    ):
        b.sphere("sheep_wool", 0.145, loc=(x, y, z),
                 scale=(scale, scale * 1.06, scale * 0.92), u=5, v=3)

    b.sphere("sheep_wool_shadow", 0.19, loc=(0, -0.42, 0.62),
             scale=(1.02, 0.90, 1.12), u=7, v=4)
    b.sphere("sheep_face", 0.18, loc=(0, -0.64, 0.63),
             scale=(0.86, 1.16, 0.94), u=7, v=4)
    b.sphere("sheep_face", 0.105, loc=(0, -0.81, 0.54),
             scale=(1.00, 0.78, 0.62), u=6, v=3)

    for sx in (-1, 1):
        b.sphere("sheep_face", 0.090, loc=(sx * 0.195, -0.62, 0.70),
                 scale=(1.30, 0.46, 0.34), rot=(0, sx * 0.16, sx * 0.12),
                 u=5, v=3)
        b.sphere("sheep_inner_ear", 0.052, loc=(sx * 0.218, -0.637, 0.703),
                 scale=(1.18, 0.32, 0.22), rot=(0, sx * 0.16, sx * 0.12),
                 u=5, v=3)
        b.sphere("eye_dark", 0.019, loc=(sx * 0.087, -0.785, 0.665),
                 scale=(0.88, 0.52, 1.0), u=5, v=3)

    # Dark tapered legs remain visually separate from the pale fleece and end
    # in broad split hooves, so the animal feels planted instead of floating.
    for sx in (-1, 1):
        for fy in (-0.24, 0.27):
            leg_x = sx * 0.19
            hoof_y = fy - 0.035 if fy < 0 else fy + 0.035
            b.cylinder_between("sheep_face", (leg_x, fy, 0.38),
                               (sx * 0.205, hoof_y, 0.085), 0.056,
                               segments=5, radius_top=0.043)
            b.box("sheep_hoof", size=(0.13, 0.18, 0.070),
                  loc=(sx * 0.205, hoof_y - 0.018, 0.035),
                  rot=(0, 0, sx * 0.035))

    b.sphere("sheep_wool", 0.095, loc=(0, 0.54, 0.64),
             rot=(0.34, 0, 0), scale=(0.72, 1.18, 0.82), u=5, v=3)
    obj = b.build(collection("ANIMALS"), smooth=True)
    # The low-quality model pack is intentionally frozen so established
    # chicken/cow geometry cannot drift during Ultra rebuilds. Link only the
    # new sheep into a small supplementary collection that low can load beside
    # that immutable pack.
    collection("ANIMALS_SHEEP").objects.link(obj)
    return obj


def animal_fox():
    """
    Fox: the only threat in the game, so it must read as a threat instantly.

    The tail does that job. It is nearly as large as the body and tipped in
    white, which makes an approaching fox legible from across the farm even
    when the body is hidden behind a crop row. The white belly and tail tip
    also carry the contrast burden, because a mid orange cannot clear the
    findability threshold against BOTH the red soil and the gold scrub.
    """
    b = MeshBuilder("SM_animal_fox", budget="animal")
    b.sphere("fox_body", 0.16, loc=(0, 0.015, 0.20),
             scale=(1.02, 1.12, 0.95), u=9, v=5)
    b.sphere("fox_belly", 0.112, loc=(0, -0.045, 0.145),
             scale=(1.10, 1.12, 0.58), u=7, v=4)
    # Shoulder and haunch masses keep the side view from collapsing into one
    # orange sausage, while preserving the toy-like convex language.
    b.sphere("fox_body", 0.125, loc=(0, -0.115, 0.235),
             scale=(1.34, 1.02, 1.12), u=6, v=4)
    b.sphere("fox_body", 0.14, loc=(0, 0.13, 0.22),
             scale=(1.26, 1.05, 1.08), u=6, v=4)
    b.sphere("fox_body", 0.112, loc=(0, -0.25, 0.285),
             scale=(1.08, 1.00, 0.96), u=8, v=5)
    b.cylinder("fox_belly", 0.055, 0.11, loc=(0, -0.345, 0.235),
               rot=(-1.57, 0, 0), segments=5, radius_top=0.022)
    b.sphere("fox_dark", 0.024, loc=(0, -0.405, 0.232), u=5, v=3)
    for sx in (-1, 1):
        b.cylinder("fox_body", 0.060, 0.14,
                   loc=(sx * 0.075, -0.215, 0.395),
                   rot=(0, sx * 0.32, sx * 0.08), segments=4,
                   radius_top=0.004)
        b.sphere("fox_dark", 0.021, loc=(sx * 0.060, -0.322, 0.302),
                 scale=(0.9, 0.6, 1.0), u=5, v=3)
    # One continuous plume replaces the old bead-chain tail. Its lateral sweep
    # opens the front silhouette while the pale tip still carries contrast on
    # both soil and scrub.
    b.sphere("fox_body", 0.145, loc=(0.045, 0.39, 0.30),
             rot=(0.47, 0, -0.18), scale=(1.00, 1.85, 1.02), u=9, v=5)
    b.sphere("fox_belly", 0.105, loc=(0.13, 0.66, 0.43),
             rot=(0.63, 0, -0.32), scale=(0.88, 1.30, 0.86), u=7, v=4)
    for sx in (-1, 1):
        for fy in (-0.15, 0.17):
            paw_x = sx * (0.115 if fy < 0 else 0.105)
            foot_y = fy - 0.045 if fy < 0 else fy + 0.045
            b.cylinder_between("fox_dark", (paw_x * 0.94, fy, 0.16),
                               (paw_x, foot_y, 0.060), 0.039,
                               segments=5, radius_top=0.031)
            b.box("fox_dark", size=(0.086, 0.145, 0.045),
                  loc=(paw_x, foot_y - 0.030, 0.0225),
                  rot=(0, 0, sx * 0.05))
    # Pale cheek points keep the face readable without relying on the orange
    # body colour alone; the former brow strips were close-up-only geometry.
    for sx in (-1, 1):
        b.sphere("fox_belly", 0.048, loc=(sx * 0.065, -0.330, 0.252),
                 scale=(0.82, 0.50, 0.66), u=6, v=3)
    return b.build(collection("ANIMALS"), smooth=True)


# ==========================================================================
# Props
# ==========================================================================


def prop_rock():
    """Scenery blocker. Faceted and flat-shaded - the one asset in the game
    allowed a hard edge, because rock is the only non-organic,
    non-manufactured material in the palette."""
    b = MeshBuilder("SM_prop_rock", budget="prop")
    b.sphere("rock", 0.42, loc=(-0.04, 0, 0.30),
             rot=(0.08, -0.10, 0.18), scale=(1.08, 0.80, 0.74), u=7, v=4)
    b.sphere("rock_shadow", 0.22, loc=(0.27, 0.15, 0.14),
             rot=(-0.06, 0.12, -0.28), scale=(1.0, 0.88, 0.76), u=6, v=3)
    # A low shard breaks the two-sphere snowman outline while remaining broad
    # enough to survive the gameplay camera.
    b.polyhedron(
        "rock_shadow",
        [(-0.19, -0.12, 0), (0.18, -0.10, 0), (0.14, 0.14, 0),
         (-0.16, 0.12, 0), (-0.11, -0.07, 0.22),
         (0.10, -0.06, 0.18), (0.06, 0.08, 0.16), (-0.09, 0.07, 0.20)],
        [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
        loc=(-0.28, -0.12, 0), rot=(0, 0, -0.18), surface="stone",
    )
    return b.build(collection("PROPS"), smooth=False)


def prop_grass_tuft():
    """
    Scatter dressing for the scrub.

    Added after the first review, where large areas of flat gold read as
    empty rather than as land. These break the plane at almost no cost and
    are the cheapest possible fix for a bare-looking field.
    """
    b = MeshBuilder("SM_prop_grass_tuft", budget="prop")
    blades = [
        (-0.09, -0.03, 0.36, -0.20, 0.54),
        (-0.03, 0.04, 0.31, -0.02, 0.46),
        (0.03, -0.04, 0.34, 0.16, 0.50),
        (0.08, 0.03, 0.28, 0.31, 0.44),
        (0.26, 0.12, 0.25, 0.12, 0.40),
        (0.32, 0.17, 0.21, 0.34, 0.36),
        (0.36, 0.09, 0.18, 0.52, 0.32),
    ]
    for x, y, height, yaw, droop in blades:
        b.blade(
            "ground_scrub_pale",
            height,
            0.035,
            0.008,
            loc=(x, y, 0.0),
            yaw=yaw,
            droop=droop,
        )
    return b.build(collection("PROPS"), smooth=False)


def prop_grass_carpet():
    """A low meadow patch: colour mass at ground level plus short wind blades.

    Single tufts break a silhouette but do not make a green area feel like a
    surface. This patch supplies the missing middle scale between the vertex-
    coloured land and the taller dressing, while remaining sparse enough that
    crops retain the strongest green silhouette in the frame.
    """
    b = MeshBuilder("SM_prop_grass_carpet", budget="prop")

    def island(radius, offset, points, phase, colour):
        vertices = [(0, 0, 0.008)]
        for index in range(points):
            angle = index / points * TAU
            wobble = 0.72 + 0.28 * (((index * 29 + phase) % 9) / 8)
            vertices.append((math.cos(angle) * radius * wobble,
                             math.sin(angle) * radius * wobble, 0.0))
        faces = [(0, index + 1, ((index + 1) % points) + 1)
                 for index in range(points)]
        b.polyhedron(colour, vertices, faces, loc=offset)

    island(0.44, (-0.17, 0.03, 0), 10, 2, "tree_leaf_mid")
    island(0.35, (0.21, -0.04, 0.002), 9, 5, "tree_leaf_light")
    island(0.22, (0.03, 0.23, 0.004), 8, 1, "ground_scrub_pale")

    for index in range(24):
        angle = index * 2.39996
        radius = 0.08 + ((index * 37) % 13) / 13 * 0.34
        height = 0.075 + ((index * 17) % 11) / 11 * 0.12
        b.blade(
            ("tree_leaf_mid" if index % 4 else
             "tree_leaf_light" if index % 3 else "ground_scrub_sun"),
            height, 0.020, 0.005,
            loc=(math.cos(angle) * radius, math.sin(angle) * radius, 0.008),
            yaw=angle + 0.35, droop=0.40, segments=2,
        )
    return b.build(collection("PROPS"), smooth=False)


def prop_dirt_clods():
    """Loose clay, pebbles and dry chips for otherwise empty bare-earth zones."""
    b = MeshBuilder("SM_prop_dirt_clods", budget="prop")

    def patch(colour, radius, offset, points, phase):
        vertices = [(0, 0, 0.006)]
        for index in range(points):
            angle = index / points * TAU
            wobble = 0.68 + 0.32 * (((index * 31 + phase) % 8) / 7)
            vertices.append((math.cos(angle) * radius * wobble,
                             math.sin(angle) * radius * wobble, 0.0))
        faces = [(0, index + 1, ((index + 1) % points) + 1)
                 for index in range(points)]
        b.polyhedron(colour, vertices, faces, loc=offset)

    patch("soil_dry", 0.34, (-0.13, 0.02, 0), 9, 3)
    patch("soil_edge", 0.22, (0.22, -0.08, 0.002), 8, 6)
    patch("soil_tilled", 0.16, (0.02, 0.20, 0.004), 7, 1)
    clods = [
        (-0.24, -0.14, 0.065, "soil_edge"),
        (0.10, 0.07, 0.054, "soil_dry"),
        (0.27, 0.14, 0.046, "rock_shadow"),
        (-0.03, 0.24, 0.040, "soil_edge"),
        (0.31, -0.20, 0.036, "rock"),
        (-0.33, 0.17, 0.037, "soil_dry"),
        (0.02, -0.25, 0.032, "soil_edge"),
        (0.20, 0.26, 0.030, "rock_shadow"),
    ]
    for index, (x, y, radius, colour) in enumerate(clods):
        b.sphere(colour, radius, loc=(x, y, radius * 0.38),
                 rot=(0, 0, index * 0.71), scale=(1.0, 0.78, 0.52), u=5, v=3)

    # Fine dry scrape marks supply a third detail scale between the colour
    # field and the raised clods. They are flat double-sided quads, so six
    # visible scratches cost only twelve triangles.
    for index in range(6):
        yaw = 0.32 + index * 0.43
        length = 0.12 + (index % 3) * 0.035
        width = 0.010 + (index % 2) * 0.004
        x = -0.22 + (index * 0.097) % 0.44
        y = -0.18 + ((index * 0.137) % 0.34)
        points = [
            (-length * 0.5, -width * 0.5, 0.0),
            (length * 0.5, -width * 0.28, 0.0),
            (length * 0.46, width * 0.28, 0.0),
            (-length * 0.5, width * 0.5, 0.0),
        ]
        b.polyhedron(
            "soil_edge" if index % 2 else "soil_dry",
            points,
            [(0, 1, 2, 3)],
            loc=(x, y, 0.012),
            rot=(0, 0, yaw),
        )
    return b.build(collection("PROPS"), smooth=False)


def prop_bush():
    """A low scrub bush with visible forks and a broken, wind-shaped crown."""
    b = MeshBuilder("SM_prop_bush", budget="prop")
    b.cylinder("tree_trunk", 0.055, 0.34, loc=(0, 0, 0.17),
               rot=(0.08, -0.10, 0), segments=5, radius_top=0.035)
    branches = [
        ((0, 0, 0.16), (-0.30, 0.06, 0.42)),
        ((0, 0, 0.20), (0.29, -0.10, 0.46)),
        ((0, 0, 0.24), (0.02, 0.25, 0.50)),
    ]
    for start, end in branches:
        b.cylinder_between("tree_trunk_light", start, end, 0.030,
                           segments=5, radius_top=0.014)
    clusters = [
        (-0.31, 0.07, 0.45, 0.30, -0.18, 0.18, "crop_leaf_dark"),
        (0.30, -0.10, 0.49, 0.32, 0.24, 0.56, "crop_mature"),
        (0.03, 0.26, 0.52, 0.28, -0.34, 0.92, "crop_leaf_dark"),
        (-0.02, -0.04, 0.39, 0.33, 0.08, 0.36, "crop_mature"),
        (-0.10, -0.13, 0.55, 0.25, 0.74, 1.08, "crop_leaf_dark"),
    ]
    for x, y, z, radius, yaw, tilt, colour in clusters:
        b.foliage_cluster(colour, radius, loc=(x, y, z),
                          rot=(tilt, -0.12, yaw), scale=(1.0, 0.82, 0.92),
                          lobes=5, inner=0.64, depth=0.10)
    return b.build(collection("PROPS"), smooth=False)


def _tree_buttress(b, colour, radius, height, roots, variant=0,
                   surface="auto"):
    """An uneven trunk foot with one or two partly buried exposed roots."""
    lower_profile = (1.00, 0.72, 0.88, 0.64, 0.82)
    upper_profile = (0.62, 0.52, 0.58, 0.48, 0.56)
    phase = variant * 0.31
    lower = []
    upper = []
    for index in range(5):
        angle = phase + index * TAU / 5
        lower_scale = lower_profile[(index + variant) % 5]
        upper_scale = upper_profile[(index * 2 + variant) % 5]
        lower.append((
            math.cos(angle) * radius * lower_scale,
            math.sin(angle) * radius * lower_scale,
            -0.035,
        ))
        upper_angle = angle + 0.10
        upper.append((
            math.cos(upper_angle) * radius * upper_scale,
            math.sin(upper_angle) * radius * upper_scale,
            height,
        ))
    faces = [
        (index, (index + 1) % 5, 5 + (index + 1) % 5, 5 + index)
        for index in range(5)
    ]
    faces.append((5, 6, 7, 8, 9))
    b.polyhedron(colour, lower + upper, faces, surface=surface)

    root_points = [
        (0.0, -0.50, -0.10),
        (0.0, 0.50, -0.10),
        (0.0, -0.22, 1.0),
        (0.0, 0.22, 1.0),
        (1.0, -0.12, -0.08),
        (1.0, 0.12, -0.08),
    ]
    root_faces = [(0, 1, 3, 2), (2, 3, 5, 4), (0, 2, 4), (1, 5, 3)]
    for yaw, length, width, root_height in roots:
        b.polyhedron(
            colour,
            root_points,
            root_faces,
            rot=(0.0, 0.0, yaw),
            scale=(length, width, root_height),
            surface=surface,
        )


def _tree_chain(b, colours, points, radii, segments=5, surface="auto"):
    """One tapered tube follows an entire limb without capped segment seams."""
    palette = (colours,) if isinstance(colours, str) else colours
    if len(points) != len(radii) or len(points) < 2:
        raise ValueError("tree chains need matching point/radius paths")

    def subtract(a, c):
        return (a[0] - c[0], a[1] - c[1], a[2] - c[2])

    def cross(a, c):
        return (
            a[1] * c[2] - a[2] * c[1],
            a[2] * c[0] - a[0] * c[2],
            a[0] * c[1] - a[1] * c[0],
        )

    def normalize(vector):
        length = math.sqrt(sum(component * component for component in vector))
        return tuple(component / max(length, 1e-6) for component in vector)

    vertices = []
    for index, (point, radius) in enumerate(zip(points, radii)):
        if index == 0:
            tangent = subtract(points[1], point)
        elif index == len(points) - 1:
            tangent = subtract(point, points[index - 1])
        else:
            tangent = subtract(points[index + 1], points[index - 1])
        tangent = normalize(tangent)
        reference = (0.0, 0.0, 1.0) if abs(tangent[2]) < 0.92 else (0.0, 1.0, 0.0)
        side = normalize(cross(tangent, reference))
        up = normalize(cross(side, tangent))
        for segment in range(segments):
            angle = segment * TAU / segments
            vertices.append((
                point[0] + radius * (math.cos(angle) * side[0] + math.sin(angle) * up[0]),
                point[1] + radius * (math.cos(angle) * side[1] + math.sin(angle) * up[1]),
                point[2] + radius * (math.cos(angle) * side[2] + math.sin(angle) * up[2]),
            ))

    faces = []
    for ring in range(len(points) - 1):
        for segment in range(segments):
            following = (segment + 1) % segments
            lower = ring * segments
            upper = (ring + 1) * segments
            faces.append((
                lower + segment,
                lower + following,
                upper + following,
                upper + segment,
            ))
    faces.append(tuple(reversed(range(segments))))
    final_ring = (len(points) - 1) * segments
    faces.append(tuple(final_ring + segment for segment in range(segments)))
    b.polyhedron(palette[0], vertices, faces, surface=surface)


def _eucalyptus_crown(b, centre, radius, rotation, scale, colour_offset):
    """A rounded faceted clump restores crown volume without card-like leaves."""
    colours = ["tree_leaf_dark", "tree_leaf_mid", "tree_leaf_light"]
    colour = colours[colour_offset % len(colours)]
    b.sphere(
        colour,
        radius,
        loc=centre,
        rot=rotation,
        scale=scale,
        u=5,
        v=3,
        surface="leaf",
    )


def _broken_splinters(b, colour, base, tips, radius, surface="dead_bark"):
    """Triangular taper spikes replace the perfectly sawn ends of dead limbs."""
    colours = (colour, "tree_dead_bark_light")
    for index, tip in enumerate(tips):
        b.cylinder_between(
            colours[index % len(colours)],
            base,
            tip,
            radius * (1.0 - index * 0.18),
            segments=3,
            radius_top=radius * 0.08,
            caps=False,
            surface=surface,
        )


def prop_eucalyptus():
    """
    Balanced eucalyptus with a visible fork and rounded separated crown clumps.
    """
    b = MeshBuilder("SM_prop_eucalyptus", budget="prop")
    _tree_buttress(
        b, "tree_trunk", 0.27, 0.20,
        [(3.82, 0.43, 0.28, 0.18)], variant=0,
    )
    _tree_chain(
        b,
        "tree_trunk",
        [(0, 0, 0.02), (0.025, -0.01, 0.68), (0.01, 0.02, 1.16), (0.11, 0.10, 1.79)],
        [0.205, 0.158, 0.098, 0.034],
        segments=6,
    )
    _tree_chain(
        b, "tree_trunk",
        [(0.01, 0.0, 0.70), (-0.08, 0.01, 0.88),
         (-0.22, 0.02, 1.14), (-0.64, 0.05, 1.68)],
        [0.16, 0.13, 0.09, 0.032],
    )
    _tree_chain(
        b, "tree_trunk",
        [(0.02, -0.01, 0.80), (0.10, -0.03, 0.96),
         (0.25, -0.06, 1.28), (0.60, -0.16, 1.78)],
        [0.145, 0.115, 0.075, 0.030],
    )
    _tree_chain(b, "tree_trunk",
                [(0.02, 0.02, 1.02), (0.10, 0.34, 1.82)], [0.085, 0.028])
    _tree_chain(b, "tree_trunk_light",
                [(0.11, 0.10, 1.79), (0.13, 0.12, 2.10)],
                [0.026, 0.011], segments=4)
    crowns = [
        ((-0.68, 0.04, 1.74), 0.39, (0.36, -0.18, -0.20), (1.18, 0.68, 0.78)),
        ((-0.36, -0.14, 1.98), 0.32, (0.62, 0.12, 0.34), (1.06, 0.72, 0.86)),
        ((0.13, 0.12, 2.10), 0.36, (0.52, -0.26, -0.08), (1.02, 0.72, 0.92)),
        ((0.10, 0.40, 1.92), 0.34, (0.78, 0.18, -0.44), (1.10, 0.66, 0.86)),
        ((0.66, -0.15, 1.84), 0.40, (0.44, 0.22, 0.24), (1.20, 0.68, 0.78)),
    ]
    for index, (centre, radius, rotation, scale) in enumerate(crowns):
        _eucalyptus_crown(b, centre, radius, rotation, scale, index)
    return b.build(collection("PROPS"), smooth=True)


def prop_eucalyptus_tall():
    """Narrow eucalyptus whose crown steps upward around a long exposed trunk."""
    b = MeshBuilder("SM_prop_eucalyptus_tall", budget="prop")
    _tree_buttress(
        b, "tree_trunk", 0.22, 0.17,
        [(2.60, 0.35, 0.24, 0.15)], variant=1,
    )
    _tree_chain(
        b,
        "tree_trunk",
        [(0, 0, 0.02), (0.03, -0.01, 0.82), (-0.03, 0.02, 1.53), (0.07, 0.03, 2.36)],
        [0.16, 0.12, 0.075, 0.028],
        segments=6,
    )
    _tree_chain(
        b, "tree_trunk",
        [(0.0, 0.0, 1.18), (-0.08, 0.01, 1.34),
         (-0.19, 0.02, 1.55), (-0.43, 0.04, 1.91)],
        [0.105, 0.085, 0.058, 0.025],
    )
    _tree_chain(
        b, "tree_trunk",
        [(-0.01, 0.02, 1.48), (0.07, -0.01, 1.62),
         (0.17, -0.04, 1.78), (0.39, -0.10, 2.16)],
        [0.095, 0.075, 0.050, 0.022],
    )
    _tree_chain(b, "tree_trunk",
                [(0.03, 0.03, 1.83), (0.10, 0.27, 2.38)], [0.055, 0.020])
    _tree_chain(b, "tree_trunk_light",
                [(0.07, 0.03, 2.36), (0.08, 0.04, 2.62)],
                [0.023, 0.009], segments=4)
    crowns = [
        ((-0.47, 0.04, 1.96), 0.32, (0.70, -0.14, -0.22), (1.05, 0.62, 0.92)),
        ((-0.18, -0.08, 2.22), 0.27, (0.92, 0.18, 0.30), (0.92, 0.62, 1.02)),
        ((0.42, -0.10, 2.20), 0.34, (0.62, -0.20, -0.34), (1.05, 0.64, 0.92)),
        ((0.10, 0.30, 2.43), 0.29, (0.88, 0.22, 0.42), (0.96, 0.60, 1.04)),
        ((0.08, 0.04, 2.62), 0.27, (0.56, -0.28, -0.06), (0.90, 0.62, 1.08)),
    ]
    for index, (centre, radius, rotation, scale) in enumerate(crowns):
        _eucalyptus_crown(b, centre, radius, rotation, scale, index + 1)
    return b.build(collection("PROPS"), smooth=True)


def prop_eucalyptus_wide():
    """Low forked eucalyptus with a broad, broken umbrella silhouette."""
    b = MeshBuilder("SM_prop_eucalyptus_wide", budget="prop")
    _tree_buttress(
        b, "tree_trunk", 0.31, 0.21,
        [(5.18, 0.44, 0.30, 0.18)], variant=2,
    )
    _tree_chain(b, "tree_trunk", [(0, 0, 0.02), (0.01, 0.01, 0.74)],
                [0.22, 0.15], segments=6)
    _tree_chain(
        b, "tree_trunk",
        [(0.0, 0.01, 0.68), (-0.10, 0.02, 0.85),
         (-0.25, 0.03, 1.05), (-0.88, 0.05, 1.47)],
        [0.18, 0.145, 0.100, 0.038],
    )
    _tree_chain(
        b, "tree_trunk",
        [(0.02, 0.0, 0.68), (0.12, -0.01, 0.84),
         (0.27, -0.02, 1.04), (0.88, -0.05, 1.48)],
        [0.18, 0.145, 0.100, 0.038],
    )
    _tree_chain(b, "tree_trunk",
                [(-0.23, 0.03, 1.03), (-0.47, 0.39, 1.61)], [0.075, 0.028])
    _tree_chain(b, "tree_trunk",
                [(0.24, -0.02, 1.02), (0.51, 0.36, 1.62)], [0.075, 0.028])
    _tree_chain(b, "tree_trunk",
                [(0.01, 0.02, 0.78), (0.02, -0.43, 1.48)], [0.085, 0.030])
    _tree_chain(b, "tree_trunk_light",
                [(0.88, -0.05, 1.48), (1.02, -0.04, 1.59)],
                [0.030, 0.011], segments=4)
    crowns = [
        ((-0.95, 0.04, 1.53), 0.42, (0.38, -0.18, -0.24), (1.24, 0.66, 0.76)),
        ((-0.53, 0.40, 1.66), 0.36, (0.70, 0.20, 0.34), (1.12, 0.64, 0.84)),
        ((-0.38, -0.16, 1.56), 0.32, (0.84, -0.18, -0.42), (1.08, 0.62, 0.88)),
        ((0.35, -0.20, 1.55), 0.32, (0.76, 0.22, 0.46), (1.08, 0.62, 0.88)),
        ((0.55, 0.38, 1.67), 0.37, (0.66, -0.16, -0.36), (1.12, 0.64, 0.84)),
        ((0.95, -0.04, 1.54), 0.43, (0.40, 0.20, 0.22), (1.24, 0.66, 0.76)),
    ]
    for index, (centre, radius, rotation, scale) in enumerate(crowns):
        _eucalyptus_crown(b, centre, radius, rotation, scale, index + 2)
    return b.build(collection("PROPS"), smooth=True)


def prop_dead_tree():
    """Twisted snag with exposed roots, split crown and uneven broken limbs."""
    b = MeshBuilder("SM_prop_dead_tree", budget="prop")
    _tree_buttress(
        b, "tree_dead_bark", 0.27, 0.20,
        [(0.26, 0.48, 0.31, 0.20), (3.62, 0.43, 0.29, 0.18)],
        variant=3, surface="dead_bark",
    )
    _tree_chain(
        b,
        "tree_dead_bark",
        [(0, 0, 0.02), (0.05, -0.03, 0.62), (-0.025, 0.045, 1.10), (0.07, -0.015, 1.52)],
        [0.185, 0.15, 0.108, 0.068],
        segments=6,
        surface="dead_bark",
    )
    _tree_chain(
        b, "tree_dead_bark",
        [(-0.01, 0.02, 0.80), (-0.10, 0.025, 0.95),
         (-0.22, 0.03, 1.14), (-0.52, 0.08, 1.38),
         (-0.68, 0.10, 1.49)],
        [0.145, 0.12, 0.09, 0.055, 0.034], surface="dead_bark",
    )
    _broken_splinters(
        b, "tree_dead_bark", (-0.68, 0.10, 1.49),
        [(-0.79, 0.10, 1.55), (-0.73, 0.17, 1.59)], 0.032,
    )
    _tree_chain(
        b, "tree_dead_bark",
        [(-0.01, 0.02, 1.00), (0.10, -0.02, 1.15),
         (0.31, -0.09, 1.40), (0.50, -0.15, 1.60)],
        [0.12, 0.095, 0.060, 0.034], surface="dead_bark",
    )
    _broken_splinters(
        b, "tree_dead_bark", (0.50, -0.15, 1.60),
        [(0.60, -0.20, 1.72), (0.54, -0.09, 1.68)], 0.032,
    )
    _tree_chain(
        b, "tree_dead_bark",
        [(0.015, 0.02, 1.20), (-0.06, 0.30, 1.50),
         (0.02, 0.40, 1.68)],
        [0.078, 0.050, 0.032], surface="dead_bark",
    )
    _broken_splinters(
        b, "tree_dead_bark", (0.02, 0.40, 1.68),
        [(0.06, 0.45, 1.80), (-0.08, 0.43, 1.75)], 0.030,
    )
    _tree_chain(b, "tree_dead_bark_light",
                [(0.03, -0.015, 0.69), (0.27, 0.13, 0.91)],
                [0.065, 0.004], segments=4, surface="dead_bark")
    _broken_splinters(
        b, "tree_dead_bark", (0.07, -0.015, 1.52),
        [(0.02, 0.02, 1.77), (-0.05, 0.09, 1.67)], 0.052,
    )
    b.cylinder_between(
        "tree_dead_bark", (0.07, -0.015, 1.52), (0.17, -0.08, 1.66),
        0.046, segments=3, radius_top=0.003, surface="dead_bark",
    )
    return b.build(collection("PROPS"), smooth=False)


def prop_rock_cluster():
    """Several faceted stones sharing one footprint, breaking clone repetition."""
    b = MeshBuilder("SM_prop_rock_cluster", budget="prop")
    stones = [
        (-0.24, 0.03, 0.27, 0.35, "rock"),
        (0.18, 0.12, 0.20, 0.27, "rock_shadow"),
        (0.02, -0.25, 0.13, 0.22, "rock"),
        (0.37, -0.18, 0.09, 0.16, "rock_shadow"),
    ]
    for index, (x, y, z, radius, colour) in enumerate(stones):
        b.sphere(colour, radius, loc=(x, y, z),
                 rot=(index * 0.06, -index * 0.08, index * 0.43),
                 scale=(1.0 + index * 0.06, 0.82 - index * 0.04,
                        0.72 - index * 0.06), u=6, v=3)
    return b.build(collection("PROPS"), smooth=False)


def prop_wildflowers():
    """Tiny colour notes grouped into a patch large enough to read in gameplay."""
    b = MeshBuilder("SM_prop_wildflowers", budget="prop")
    flowers = [
        (-0.12, -0.04, 0.30, "flower_white", -0.025, 0.010, 0.060),
        (-0.02, 0.03, 0.25, "flower_blue", 0.015, -0.012, 0.052),
        (0.08, -0.02, 0.22, "flower_yellow", 0.020, 0.006, 0.050),
        (0.36, 0.17, 0.20, "flower_blue", -0.015, 0.014, 0.048),
        (0.43, 0.22, 0.26, "flower_white", 0.018, -0.010, 0.056),
    ]
    for index, (x, y, height, colour, lean_x, lean_y, radius) in enumerate(flowers):
        tip = (x + lean_x, y + lean_y, height)
        b.cylinder_between("crop_leaf_dark", (x, y, 0), tip, 0.010,
                           segments=4, radius_top=0.007)
        b.lobed_leaf(colour, radius, loc=tip,
                     yaw=index * 0.73, tilt=0.08, lobes=5, inner=0.46)
        b.sphere("flower_yellow", 0.018, loc=(tip[0], tip[1], height + 0.008),
                 scale=(1.0, 1.0, 0.55), u=5, v=3)
    return b.build(collection("PROPS"), smooth=False)


def prop_scrub_patch():
    """Two irregular colour islands that break the large flat ground plane."""
    b = MeshBuilder("SM_prop_scrub_patch", budget="prop")

    def patch(colour, radius, offset, points, phase):
        vertices = [(0, 0, 0.010)]
        for index in range(points):
            angle = index / points * TAU
            wobble = 0.78 + 0.22 * (((index * 37 + phase) % 7) / 6)
            vertices.append((math.cos(angle) * radius * wobble,
                             math.sin(angle) * radius * wobble, 0.0))
        faces = [(0, index + 1, ((index + 1) % points) + 1)
                 for index in range(points)]
        b.polyhedron(colour, vertices, faces, loc=offset)

    patch("ground_scrub_dark", 0.50, (-0.25, 0.06, 0), 9, 2)
    patch("ground_scrub_dark", 0.54, (0.22, 0.03, 0.001), 10, 5)
    patch("ground_scrub_dark", 0.34, (0.0, -0.28, 0.002), 8, 1)
    return b.build(collection("PROPS"), smooth=False)


def prop_water_trough():
    """Open, braced timber trough with water visibly recessed inside its rim."""
    b = MeshBuilder("SM_prop_water_trough", budget="prop")
    b.box("timber_dark", size=(1.02, 0.30, 0.10), loc=(0, 0, 0.10))
    for sy in (-1, 1):
        b.box("timber_light", size=(1.18, 0.10, 0.30),
              loc=(0, sy * 0.19, 0.23), rot=(sy * -0.08, 0, 0))
    for sx in (-1, 1):
        b.box("timber_light", size=(0.10, 0.48, 0.30),
              loc=(sx * 0.54, 0, 0.23), rot=(0, sx * 0.08, 0))
    b.bevel(width=0.012, segments=1)
    b.box("water_deep", size=(0.92, 0.24, 0.035), loc=(0, 0, 0.30))
    for sx in (-1, 1):
        b.box("timber_dark", size=(0.16, 0.56, 0.12),
              loc=(sx * 0.42, 0, 0.06))
    return b.build(collection("PROPS"), smooth=False)


def tool_watering_can():
    """Chunky teal watering can, authored to read clearly during the pour."""
    b = MeshBuilder("SM_tool_watering_can", budget="prop")
    b.cylinder("wall_teal", 0.17, 0.24, loc=(0, 0, 0.18), segments=8,
               radius_top=0.15, scale=(1.16, 0.90, 1.0))
    b.cylinder("wall_teal_light", 0.13, 0.035, loc=(0, 0, 0.32), segments=8,
               scale=(1.16, 0.90, 1.0))
    b.cylinder_between("metal_galv", (0.14, 0, 0.23), (0.42, 0, 0.34),
                       0.045, segments=6, radius_top=0.032)
    b.cylinder_between("metal_galv", (0.42, 0, 0.34), (0.58, 0, 0.38),
                       0.032, segments=6, radius_top=0.024)
    b.cylinder("metal_galv", 0.070, 0.042, loc=(0.60, 0, 0.39),
               rot=(0, math.pi / 2, 0), segments=8, radius_top=0.058)
    handle = [(-0.14, 0, 0.26), (-0.18, 0, 0.43), (-0.08, 0, 0.54),
              (0.08, 0, 0.54), (0.18, 0, 0.43), (0.14, 0, 0.26)]
    for start, end in zip(handle, handle[1:]):
        b.cylinder_between("timber_dark", start, end, 0.025,
                           segments=5, radius_top=0.022)
    return b.build(collection("PROPS"), smooth=True)


def tool_sickle():
    """Harvest sickle with a broad silver crescent visible at gameplay range."""
    b = MeshBuilder("SM_tool_sickle", budget="prop")
    b.cylinder("timber_warm", 0.035, 0.42, loc=(0, 0, 0.22),
               segments=7, radius_top=0.029)
    b.cylinder("timber_dark", 0.044, 0.075, loc=(0, 0, 0.07), segments=7)
    b.blade("metal_galv", 0.43, 0.125, 0.022,
            loc=(0, 0, 0.40), yaw=0, droop=1.55, segments=5, thickness=0.012)
    b.cylinder("metal_dark", 0.047, 0.045, loc=(0, 0, 0.43), segments=6)
    return b.build(collection("PROPS"), smooth=False)


def tool_trowel():
    """Short planting trowel with a broad warm handle and cool steel blade."""
    b = MeshBuilder("SM_tool_trowel", budget="prop")
    b.cylinder("timber_warm", 0.040, 0.27, loc=(0, 0, 0.37),
               segments=7, radius_top=0.034)
    b.cylinder("timber_dark", 0.052, 0.055, loc=(0, 0, 0.50), segments=7)
    b.cylinder_between("metal_dark", (0, 0, 0.235), (0, 0, 0.17),
                       0.022, segments=5, radius_top=0.018)
    b.polyhedron(
        "metal_galv",
        [(-0.095, -0.018, 0.17), (0.095, -0.018, 0.17),
         (0.055, -0.018, -0.02), (0, -0.018, -0.10), (-0.055, -0.018, -0.02),
         (-0.095, 0.018, 0.17), (0.095, 0.018, 0.17),
         (0.055, 0.018, -0.02), (0, 0.018, -0.10), (-0.055, 0.018, -0.02)],
        [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5), (0, 5, 6, 1),
         (1, 6, 7, 2), (2, 7, 8, 3), (3, 8, 9, 4), (4, 9, 5, 0)],
    )
    return b.build(collection("PROPS"), smooth=False)


# ==========================================================================
# Registry
# ==========================================================================

CROPS = [
    "wheat", "corn", "pumpkin", "clover",
    "radish", "pea", "strawberry",
    "sunflower", "tomato", "avocado",
    "beetroot", "cranberry", "grape",
    "carrot", "cabbage", "garlic",
]

BUILD_ORDER = (
    [(f"crop_wheat_s{s}", lambda s=s: crop_wheat(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_corn_s{s}", lambda s=s: crop_corn(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_pumpkin_s{s}", lambda s=s: crop_pumpkin(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_clover_s{s}", lambda s=s: crop_clover(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_radish_s{s}", lambda s=s: crop_radish(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_pea_s{s}", lambda s=s: crop_pea(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_strawberry_s{s}", lambda s=s: crop_strawberry(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_sunflower_s{s}", lambda s=s: crop_sunflower(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_tomato_s{s}", lambda s=s: crop_tomato(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_avocado_s{s}", lambda s=s: crop_avocado(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_beetroot_s{s}", lambda s=s: crop_beetroot(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_cranberry_s{s}", lambda s=s: crop_cranberry(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_grape_s{s}", lambda s=s: crop_grape(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_carrot_s{s}", lambda s=s: crop_carrot(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_cabbage_s{s}", lambda s=s: crop_cabbage(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_garlic_s{s}", lambda s=s: crop_garlic(s)) for s in (1, 2, 3, 4)]
    + [
        ("ground_plot", ground_plot),
        ("building_barn", building_barn),
        ("building_irrigation", building_irrigation),
        ("building_road", building_road),
        ("building_fence", building_fence),
        ("building_coop", building_coop),
        ("building_loading_pad", building_loading_pad),
        ("building_cold_store", building_cold_store),
        ("building_worker_hut", building_worker_hut),
        ("building_well", building_well),
        ("building_mill", building_mill),
        ("building_creamery", building_creamery),
        ("building_preserve_kitchen", building_preserve_kitchen),
        ("building_mill_wheel", building_mill_wheel),
        ("building_vent_fan", building_vent_fan),
        ("building_well_crank", building_well_crank),
        ("building_steam_puff", building_steam_puff),
        ("building_dust_puff", building_dust_puff),
        ("char_farmer", character_farmer),
        ("animal_chicken", animal_chicken),
        ("animal_cow", animal_cow),
        ("animal_sheep", animal_sheep),
        ("animal_fox", animal_fox),
        ("prop_rock", prop_rock),
        ("prop_grass_tuft", prop_grass_tuft),
        ("prop_grass_carpet", prop_grass_carpet),
        ("prop_dirt_clods", prop_dirt_clods),
        ("prop_bush", prop_bush),
        ("prop_eucalyptus", prop_eucalyptus),
        ("prop_eucalyptus_tall", prop_eucalyptus_tall),
        ("prop_eucalyptus_wide", prop_eucalyptus_wide),
        ("prop_dead_tree", prop_dead_tree),
        ("prop_rock_cluster", prop_rock_cluster),
        ("prop_wildflowers", prop_wildflowers),
        ("prop_scrub_patch", prop_scrub_patch),
        ("prop_water_trough", prop_water_trough),
        ("tool_watering_can", tool_watering_can),
        ("tool_sickle", tool_sickle),
        ("tool_trowel", tool_trowel),
    ]
)
