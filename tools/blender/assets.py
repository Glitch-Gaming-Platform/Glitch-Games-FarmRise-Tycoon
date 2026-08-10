"""
Every FarmRise Tycoon asset, as code.

Read this alongside docs/ART_IMPLEMENTATION_GUIDE.md. The comments here
explain the ART decision behind each shape; the guide explains the rules
those decisions follow.

The governing constraint throughout: the follow camera sits about 20 metres
out at roughly 38 degrees. Nothing below about 4 cm survives that distance,
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
    """Wheat: the safety net crop. A dense bed of thin upright cereal."""
    b = MeshBuilder(f"SM_crop_wheat_s{stage}", budget="crop")
    ready = stage == 4
    clumps = {1: 12, 2: 12, 3: 12, 4: 12}[stage]
    per_clump = {1: 1, 2: 2, 3: 3, 4: 3}[stage]
    height = {1: 0.23, 2: 0.52, 3: 0.86, 4: 0.94}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature",
              4: "wheat_ready"}[stage]

    for ci, (px, py, base_yaw) in enumerate(plot_positions(clumps, seed=stage * 3 + 1)):
        for j in range(per_clump):
            angle = base_yaw + j * (TAU / per_clump)
            jitter = 0.84 + 0.24 * (((ci * 7 + j * 3) % 5) / 4.0)
            ox, oy = math.cos(angle) * 0.038, math.sin(angle) * 0.038
            b.blade(colour, height * jitter, 0.060 if stage == 1 else 0.050, 0.010,
                    loc=(px + ox, py + oy, 0.0), yaw=angle,
                    droop=0.10 if not ready else 0.32)
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
    height = {1: 0.31, 2: 0.72, 3: 1.18, 4: 1.34}[stage]
    leaves = {1: 2, 2: 4, 3: 5, 4: 6}[stage]
    colour = {1: "crop_seedling", 2: "crop_leaf_light", 3: "crop_mature",
              4: "crop_mature"}[stage]

    for ci, (px, py, base_yaw) in enumerate(plot_positions(6, seed=stage * 5 + 2)):
        h = height * (0.9 + 0.2 * ((ci % 3) / 2.0))
        if stage >= 2:
            b.cylinder(colour, 0.036, h, loc=(px, py, h / 2), segments=5,
                       radius_top=0.022)
        for i in range(leaves):
            t = (i + 1) / (leaves + 1)
            angle = base_yaw + i * (TAU / leaves)
            b.blade(
                colour,
                0.46 * (1.0 - 0.22 * t) * (0.52 if stage == 1 else 1.0),
                0.14 if stage == 1 else 0.115, 0.020,
                loc=(px, py, h * (0.25 + 0.6 * t) if stage >= 2 else 0.02),
                yaw=angle,
                # A strong droop is what makes corn read as corn. Without it
                # the plant becomes a bundle of spikes and loses the species.
                droop=0.95,
            )
        if stage == 4:
            angle = base_yaw + 0.5
            cx, cy = px + math.cos(angle) * 0.08, py + math.sin(angle) * 0.08
            b.cylinder("corn_ready", 0.055, 0.27, loc=(cx, cy, h * 0.55),
                       rot=(0.16, 0.22, 0), segments=5, radius_top=0.028)
            for side in (-1, 1):
                b.blade("corn_husk", 0.24, 0.070, 0.014,
                        loc=(cx, cy, h * 0.43), yaw=angle + side * 0.42,
                        droop=0.62)
            for i in range(3):
                b.blade("corn_tassel", 0.17, 0.020, 0.006,
                        loc=(px, py, h), yaw=base_yaw + i * TAU / 3,
                        droop=0.72, segments=3)
    return b.build(collection("CROPS"), smooth=False)


def crop_pumpkin(stage: int):
    """Pumpkin: slow, expensive, best margin. Three sprawling vines per bed."""
    b = MeshBuilder(f"SM_crop_pumpkin_s{stage}", budget="crop")
    leaf_colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature",
                   4: "crop_mature"}[stage]
    leaves = {1: 2, 2: 4, 3: 5, 4: 5}[stage]
    leaf_radius = {1: 0.10, 2: 0.14, 3: 0.16, 4: 0.17}[stage]

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
            b.lobed_leaf(
                leaf_colour,
                leaf_radius * (0.88 + 0.16 * ((ci + i) % 3) / 2),
                loc=(px + math.cos(angle) * 0.14,
                     py + math.sin(angle) * 0.14, 0.075),
                yaw=angle,
                tilt=0.10 * math.sin(angle),
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
    size = TILE_SIZE * 0.94
    b.box("soil_edge", size=(size, size, 0.10), loc=(0, 0, 0.05))
    b.box("soil_tilled", size=(size * 0.93, size * 0.93, 0.055),
          loc=(0, 0, 0.105))
    for i in range(3):
        y = (i - 1.0) * (size / 3.4)
        b.box("soil_wet", size=(size * 0.84, size * 0.10, 0.045),
              loc=(0, y, 0.145))
    b.bevel(segments=1, width=0.015)
    return b.build(collection("GROUND"), smooth=False)


# ==========================================================================
# Buildings
# ==========================================================================
#
# Every structure is COOL (teal, blue-grey, galvanised metal) against a WARM
# ground. That single rule does more for readability than any amount of
# modelling detail, and it is why a player never loses a fence in the scrub.


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

    # Lower (steep) roof planes.
    for sy in (-1, 1):
        b.box("roof_grey", size=(w * 1.06, d * 0.50, 0.14),
              loc=(0, sy * d * 0.29, wall_h + 0.30),
              rot=(sy * -0.85, 0, 0))
    # Upper (shallow) roof planes.
    for sy in (-1, 1):
        b.box("roof_grey_dark", size=(w * 1.02, d * 0.34, 0.13),
              loc=(0, sy * d * 0.11, wall_h + 0.78),
              rot=(sy * -0.36, 0, 0))
    b.box("roof_grey", size=(w * 1.04, 0.14, 0.10), loc=(0, 0, wall_h + 0.92))

    door_w, door_h = 1.34, 1.90
    b.box("timber_warm", size=(door_w, 0.10, door_h),
          loc=(0, -d / 2 - 0.02, door_h / 2))
    b.box("timber_dark", size=(0.09, 0.12, door_h * 0.98),
          loc=(0, -d / 2 - 0.05, door_h / 2))
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
          loc=(0, -d / 2 - 0.04, wall_h + 0.18))
    b.box("timber_warm", size=(0.48, 0.082, 0.44),
          loc=(0, -d / 2 - 0.085, wall_h + 0.18))
    # One bevel segment, not two. Bevel segments scale inversely with asset
    # size: the barn's edges are metres long, so a single chamfer already
    # reads as a rim highlight at any distance, and the second segment cost
    # 640 triangles for something no player can resolve.
    b.bevel(segments=1)
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
               segments=8, radius_top=0.38)
    for z in (1.03, 1.40):
        b.cylinder("metal_dark", 0.49, 0.038, loc=(0, 0, z), segments=8)
    b.cylinder_between("metal_dark", (0.30, -0.18, 1.02),
                       (0.30, -0.62, 0.30), 0.045, segments=5,
                       radius_top=0.035)
    b.box("timber_light", size=(0.92, 0.40, 0.22), loc=(0.25, -0.72, 0.11))
    b.box("water_teal", size=(0.80, 0.29, 0.055), loc=(0.25, -0.72, 0.22))
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
    width = TILE_SIZE * 0.62
    b.box("sand_stone", size=(width, TILE_SIZE * 0.99, 0.05), loc=(0, 0, 0.025))
    placements = [(-0.20, -0.62, 0.20), (0.17, -0.22, 0.17),
                  (-0.15, 0.20, 0.19), (0.19, 0.62, 0.16)]
    for x, y, r in placements:
        b.cylinder("sand_path", r, 0.04, loc=(x, y, 0.048), segments=7,
                   scale=(1.0, 0.78, 1.0))
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
    b.bevel(segments=1, width=0.015)
    return b.build(collection("BUILDINGS"))


def building_coop():
    """
    Animal shelter. Same cool palette as the barn but a simple gable and a
    lower mass, so it never competes with the barn for attention.
    """
    b = MeshBuilder("SM_building_coop", budget="building")
    w, d, h = TILE_SIZE * 1.35, TILE_SIZE * 1.15, 1.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box("timber_dark", size=(0.12, 0.12, 0.30),
                  loc=(sx * w * 0.38, sy * d * 0.34, 0.15))
    b.box("wall_teal_dark", size=(w, d, h), loc=(0, 0, h / 2 + 0.24))
    b.box("roof_grey", size=(w * 1.10, d * 0.62, 0.16),
          loc=(0, -d * 0.26, h + 0.44), rot=(-0.42, 0, 0))
    b.box("roof_grey", size=(w * 1.10, d * 0.62, 0.16),
          loc=(0, d * 0.26, h + 0.44), rot=(0.42, 0, 0))
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
          loc=(-w / 2 - 0.18, 0.10, 0.91), rot=(0, 0.12, 0))
    b.bevel(segments=1, width=0.015)
    return b.build(collection("BUILDINGS"))


# ==========================================================================
# Character
# ==========================================================================


def character_farmer():
    """
    The player: chibi, four heads tall, 1.60 m.

    Revised in the quality pass. The previous version had two flat dots for a
    face, which is correct at 20 m and lifeless anywhere closer - and the
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
    chest, neck = 0.78, 1.18

    # --- legs and boots ---------------------------------------------------
    # Separate tapered thigh/shin volumes and a rounded knee give the virtual
    # rig enough silhouette to sell a step. The previous single vertical tube
    # could swing, but always looked like a peg rotating from the hip.
    b.cylinder("pants_denim", 0.17, 0.25, loc=(0, 0, 0.56), segments=8,
               radius_top=0.15, scale=(1.08, 0.66, 1.0))
    for sx in (-1, 1):
        hip = (sx * 0.09, 0.0, 0.56)
        knee = (sx * 0.105, -0.014, 0.36)
        ankle = (sx * 0.105, 0.012, 0.18)
        b.cylinder_between("pants_denim", hip, knee, 0.084,
                           segments=7, radius_top=0.076)
        b.sphere("pants_denim", 0.078, loc=knee,
                 scale=(0.90, 0.82, 0.78), u=6, v=4)
        b.cylinder_between("pants_denim", knee, ankle, 0.073,
                           segments=7, radius_top=0.063)
        # A rounded toe and separate sole create a real foot profile instead
        # of another cuboid stacked under the leg.
        b.sphere("boot_leather", 0.10, loc=(sx * 0.105, -0.065, 0.095),
                 scale=(0.80, 1.30, 0.66), u=7, v=4)
        b.box("timber_dark", size=(0.17, 0.25, 0.035),
              loc=(sx * 0.105, -0.055, 0.025))

    # --- torso ------------------------------------------------------------
    # An eight-sided tapered volume catches broad light bands and removes the
    # rectangular toy-block torso that made the old farmer look unfinished in
    # close-up. It remains simple enough to deform cleanly in the virtual rig.
    b.cylinder("shirt_blue", 0.22, 0.46, loc=(0, 0, chest + 0.10),
               segments=8, radius_top=0.19, scale=(1.0, 0.62, 1.0))
    for z in (0.72, 0.86, 1.00):
        b.cylinder("shirt_stripe", 0.222, 0.045, loc=(0, 0, z),
                   segments=8, scale=(1.0, 0.63, 1.0))
    # A belt breaks the torso into two masses so it is not one slab.
    b.cylinder("timber_dark", 0.224, 0.055, loc=(0, 0, 0.665),
               segments=8, scale=(1.0, 0.64, 1.0))
    b.box("straw_hat_band", size=(0.075, 0.27, 0.075), loc=(0, -0.005, 0.665))

    # A bright kerchief and diagonal satchel strap restore the asymmetry that
    # gave the earlier farmer an instantly recognisable silhouette. Both are
    # broad enough to read at the gameplay camera and useful in menu art.
    b.polyhedron(
        "scarf_red",
        [(-0.13, -0.145, 0.0), (0.13, -0.145, 0.0), (0.0, -0.175, -0.17),
         (-0.11, -0.115, -0.01), (0.11, -0.115, -0.01), (0.0, -0.145, -0.15)],
        [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)],
        loc=(0, 0, 1.13),
    )
    b.box("timber_dark", size=(0.055, 0.032, 0.62),
          loc=(0.055, -0.151, 0.89), rot=(0, -0.48, 0))
    b.box("timber_warm", size=(0.23, 0.13, 0.30),
          loc=(0.255, 0.045, 0.59), rot=(0, 0.08, -0.04))
    b.box("timber_light", size=(0.18, 0.018, 0.055),
          loc=(0.255, -0.026, 0.65))
    # Collar as a ring around the neck, not a plate across the chest.
    #
    # Three versions were needed here. A wide slab read as a plinth with a bust
    # standing on it. Adding angled points made it a bow tie. Narrowing it and
    # cutting a placket notch made it a shirt-and-tie. All three failed the
    # same way: any horizontal rectangle spanning the chest at neck height is
    # read as a separate object resting on the torso, because that is what
    # rectangles at that angle do. A short cylinder hugging the neck is read as
    # part of the garment, because it follows the form underneath it.
    b.cylinder("trim_white", 0.104, 0.055, loc=(0, 0, chest + 0.355), segments=10)

    # --- arms and hands ---------------------------------------------------
    # Elbows are authored into the resting silhouette. Runtime animation then
    # rotates upper/lower regions from an already-human pose instead of trying
    # to make a straight cylinder resemble a working arm.
    for sx in (-1, 1):
        shoulder = (sx * 0.19, 0.0, 1.06)
        elbow = (sx * 0.275, -0.014, 0.88)
        wrist = (sx * 0.295, -0.055, 0.73)
        b.cylinder_between("shirt_blue", shoulder, elbow, 0.070,
                           segments=7, radius_top=0.058)
        b.cylinder_between("skin", elbow, wrist, 0.052,
                           segments=7, radius_top=0.044)
        b.sphere("skin", 0.060, loc=(sx * 0.30, -0.064, 0.695), u=8, v=5)
        # A thumb. One extra primitive, and the hand stops being a ball.
        b.sphere("skin", 0.026, loc=(sx * 0.30, -0.112, 0.72),
                 scale=(0.8, 1.2, 0.8), u=5, v=3)

    # --- head -------------------------------------------------------------
    # Short neck. Eight centimetres of bare neck on a four-heads-tall chibi
    # reads as a giraffe; the collar above now closes most of that gap.
    b.cylinder("skin", 0.072, 0.07, loc=(0, 0, neck + 0.01), segments=8)
    b.sphere("skin", 0.205, loc=(0, 0, neck + 0.24), scale=(1.0, 0.94, 1.02), u=16, v=10)

    eye_y, eye_z = -0.162, neck + 0.252
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
        b.sphere("eye_white", 0.040, loc=(sx * 0.080, eye_y, eye_z),
                 scale=(1.0, 0.42, 1.12), u=8, v=5)
        b.sphere("brow_brown", 0.031, loc=(sx * 0.082, eye_y - 0.016, eye_z),
                 scale=(0.88, 0.55, 1.18), u=8, v=5)
        b.sphere("eye_dark", 0.0215, loc=(sx * 0.082, eye_y - 0.032, eye_z - 0.002),
                 scale=(0.88, 0.55, 1.22), u=7, v=4)
        # A catchlight, high and inboard. Small enough to read as wet, not as
        # a second pupil - the previous 8 mm ball at v=3 was a visible facet.
        b.sphere("trim_white", 0.0075, loc=(sx * 0.072, eye_y - 0.030, eye_z + 0.017),
                 scale=(1.0, 0.6, 1.0), u=6, v=4)
        # Brow, angled slightly inward for a friendly, alert read. It now sits
        # BELOW the hairline (see the fringe note) instead of behind it.
        b.box("brow_brown", size=(0.074, 0.020, 0.016),
              loc=(sx * 0.082, eye_y - 0.014, eye_z + 0.050), rot=(0, 0, sx * -0.16))
        # Blush: flatter, smaller and further down the cheek. The first pass
        # sat proud of the face and read as a graze rather than as warmth.
        b.sphere("blush", 0.026, loc=(sx * 0.132, -0.132, eye_z - 0.062),
                 scale=(1.0, 0.26, 0.55), u=6, v=4)

    # Mouth: three small pieces curving upward at the corners. A single wide
    # box in this colour read as an open gash; the curve is what turns it into
    # a closed, faintly pleased expression.
    mouth_z = eye_z - 0.086
    b.box("mouth_dark", size=(0.024, 0.016, 0.012), loc=(0, -0.186, mouth_z))
    for sx in (-1, 1):
        b.box("mouth_dark", size=(0.020, 0.016, 0.011),
              loc=(sx * 0.019, -0.183, mouth_z + 0.005), rot=(0, sx * -0.40, 0))
    # Nose as a soft shadowed wedge rather than a protruding ball. A skin-toned
    # sphere sticking out of the face catches the key light and renders almost
    # white, which is why the first version looked like a beak.
    b.sphere("skin_shadow", 0.023, loc=(0, -0.188, eye_z - 0.038),
             scale=(0.85, 0.55, 0.62), u=7, v=4)

    # --- hair -------------------------------------------------------------
    # The crown is pushed back so the forehead is skin, not hair. Previously
    # the sphere reached y = -0.204, in front of the face surface at -0.193,
    # so it swallowed the forehead and the brows with it.
    b.sphere("hair_brown", 0.212, loc=(0, 0.030, neck + 0.275),
             scale=(1.0, 0.98, 0.88), u=14, v=8)
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
        b.sphere("hair_brown", 0.070, loc=(sx * 0.175, -0.045, neck + 0.235),
                 scale=(0.7, 1.05, 1.2), u=6, v=4)
    # One side ponytail provides a memorable profile and visible secondary
    # motion when the whole upper region lags during locomotion.
    b.sphere("hair_brown", 0.090, loc=(0.205, 0.105, neck + 0.205),
             rot=(0.12, 0.0, -0.22), scale=(0.72, 0.88, 1.25), u=7, v=4)
    b.sphere("hair_highlight", 0.060, loc=(0.225, 0.135, neck + 0.125),
             rot=(0.18, 0.0, -0.28), scale=(0.62, 0.78, 1.18), u=6, v=4)

    # --- straw hat, last so it sits proud of the hair ---------------------
    b.cylinder("straw_hat", 0.40, 0.035, loc=(0, 0, neck + 0.40), segments=16,
               radius_top=0.385)
    b.cylinder("straw_hat", 0.20, 0.17, loc=(0, 0, neck + 0.49), segments=16,
               radius_top=0.175)
    b.cylinder("straw_hat_band", 0.205, 0.045, loc=(0, 0, neck + 0.435), segments=16)
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
    for i in range(4):
        b.blade("chicken_wing", 0.18, 0.078, 0.018,
                loc=(0, 0.15, 0.23), yaw=(i - 1.5) * 0.34, droop=-0.60,
                segments=3)
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
    b.sphere("fox_body", 0.155, loc=(0, 0, 0.21),
             scale=(1.0, 1.55, 0.90), u=9, v=5)
    b.sphere("fox_belly", 0.108, loc=(0, -0.03, 0.145),
             scale=(0.95, 1.45, 0.55), u=7, v=4)
    b.sphere("fox_body", 0.105, loc=(0, -0.245, 0.275),
             scale=(1.0, 0.96, 0.94), u=8, v=5)
    b.cylinder("fox_belly", 0.055, 0.11, loc=(0, -0.345, 0.235),
               rot=(-1.57, 0, 0), segments=5, radius_top=0.022)
    b.sphere("fox_dark", 0.024, loc=(0, -0.405, 0.232), u=5, v=3)
    for sx in (-1, 1):
        b.cylinder("fox_body", 0.060, 0.14,
                   loc=(sx * 0.060, -0.215, 0.385),
                   rot=(0, sx * 0.25, 0), segments=4, radius_top=0.004)
        b.sphere("fox_dark", 0.021, loc=(sx * 0.052, -0.315, 0.292),
                 scale=(0.9, 0.6, 1.0), u=5, v=3)
    # A three-lobed plume gives the fox a species-specific outline even when
    # its body is hidden by crops. The pale tip carries contrast on both soil
    # and scrub, as required by the palette audit exception.
    b.sphere("fox_body", 0.125, loc=(0, 0.29, 0.25),
             rot=(0.34, 0, 0), scale=(0.90, 1.45, 0.92), u=8, v=5)
    b.sphere("fox_body", 0.115, loc=(0, 0.48, 0.32),
             rot=(0.48, 0, 0), scale=(0.86, 1.35, 0.88), u=7, v=4)
    b.sphere("fox_belly", 0.090, loc=(0, 0.65, 0.39),
             rot=(0.56, 0, 0), scale=(0.78, 1.20, 0.80), u=7, v=4)
    for sx in (-1, 1):
        for fy in (-0.10, 0.13):
            b.cylinder("fox_dark", 0.032, 0.15, loc=(sx * 0.088, fy, 0.075),
                       segments=5, radius_top=0.027)
    # Pale cheek points and dark brow wedges make the face readable without
    # relying on the orange body colour alone.
    for sx in (-1, 1):
        b.sphere("fox_belly", 0.052, loc=(sx * 0.066, -0.315, 0.255),
                 scale=(0.8, 0.52, 0.72), u=6, v=3)
        b.box("fox_dark", size=(0.055, 0.018, 0.016),
              loc=(sx * 0.052, -0.326, 0.318), rot=(0, 0, sx * -0.18))
    return b.build(collection("ANIMALS"), smooth=True)


# ==========================================================================
# Props
# ==========================================================================


def prop_rock():
    """Scenery blocker. Faceted and flat-shaded - the one asset in the game
    allowed a hard edge, because rock is the only non-organic,
    non-manufactured material in the palette."""
    b = MeshBuilder("SM_prop_rock", budget="prop")
    b.sphere("rock", 0.42, loc=(0, 0, 0.30), scale=(1.0, 0.86, 0.72), u=7, v=4)
    b.sphere("rock_shadow", 0.22, loc=(0.26, 0.16, 0.14),
             scale=(1.0, 0.9, 0.8), u=6, v=3)
    return b.build(collection("PROPS"), smooth=False)


def prop_grass_tuft():
    """
    Scatter dressing for the scrub.

    Added after the first review, where large areas of flat gold read as
    empty rather than as land. These break the plane at almost no cost and
    are the cheapest possible fix for a bare-looking field.
    """
    b = MeshBuilder("SM_prop_grass_tuft", budget="prop")
    for i in range(7):
        angle = i * (TAU / 7) + 0.4
        b.blade("ground_scrub_pale", 0.26 + 0.10 * ((i % 3) / 2.0), 0.035, 0.008,
                loc=(math.cos(angle) * 0.06, math.sin(angle) * 0.06, 0.0),
                yaw=angle, droop=0.45)
    return b.build(collection("PROPS"), smooth=False)


def prop_bush():
    """A low scrub bush. Mid-height mass between grass tufts and rocks."""
    b = MeshBuilder("SM_prop_bush", budget="prop")
    b.sphere("crop_leaf_dark", 0.34, loc=(0, 0, 0.24),
             scale=(1.0, 0.92, 0.62), u=8, v=4)
    b.sphere("crop_mature", 0.22, loc=(0.18, -0.10, 0.30),
             scale=(1.0, 0.95, 0.70), u=7, v=4)
    b.sphere("crop_mature", 0.18, loc=(-0.19, 0.09, 0.26),
             scale=(1.0, 0.95, 0.70), u=6, v=3)
    return b.build(collection("PROPS"), smooth=True)


def prop_eucalyptus():
    """
    Rounded outback tree built as a few broad crown masses.

    The references get much of their richness from a readable tree layer, not
    from per-blade grass. This keeps the same effect under the prop budget:
    one tapered trunk, three branches and six convex foliage clusters.
    """
    b = MeshBuilder("SM_prop_eucalyptus", budget="prop")
    b.cylinder("tree_trunk", 0.16, 1.65, loc=(0, 0, 0.825),
               segments=6, radius_top=0.095)
    branches = [
        ((0.0, 0.0, 1.05), (-0.54, 0.08, 1.72)),
        ((0.0, 0.0, 1.18), (0.48, -0.12, 1.86)),
        ((0.0, 0.0, 1.35), (0.12, 0.40, 2.03)),
    ]
    for start, end in branches:
        b.cylinder_between("tree_trunk_light", start, end, 0.075,
                           segments=5, radius_top=0.035)
    crowns = [
        (-0.58, 0.05, 1.78, 0.47), (-0.25, -0.10, 2.05, 0.50),
        (0.18, 0.30, 2.10, 0.46), (0.52, -0.10, 1.90, 0.50),
        (0.48, 0.28, 2.18, 0.38), (-0.10, 0.28, 2.30, 0.38),
    ]
    colours = ["tree_leaf_dark", "tree_leaf_mid", "tree_leaf_light"]
    for index, (x, y, z, radius) in enumerate(crowns):
        b.sphere(colours[index % len(colours)], radius, loc=(x, y, z),
                 scale=(1.10, 0.90, 0.58), u=6, v=3)
    # Smaller edge clusters create a broken, leafy perimeter instead of six
    # equally weighted broccoli blobs.
    for index, (x, y, z) in enumerate(((-0.88, 0.04, 1.90),
                                       (0.82, -0.06, 2.04),
                                       (0.18, 0.52, 2.25))):
        b.sphere(colours[(index + 1) % len(colours)], 0.24, loc=(x, y, z),
                 scale=(1.16, 0.76, 0.48), u=5, v=3)
    return b.build(collection("PROPS"), smooth=True)


def prop_eucalyptus_tall():
    """A narrower, taller tree variant that breaks perimeter repetition."""
    b = MeshBuilder("SM_prop_eucalyptus_tall", budget="prop")
    b.cylinder("tree_trunk", 0.13, 2.05, loc=(0, 0, 1.025),
               rot=(0.035, -0.05, 0), segments=6, radius_top=0.065)
    branches = [
        ((0, 0, 1.20), (-0.42, 0.04, 1.88)),
        ((0, 0, 1.42), (0.36, -0.10, 2.15)),
        ((0, 0, 1.62), (0.08, 0.31, 2.38)),
    ]
    for start, end in branches:
        b.cylinder_between("tree_trunk_light", start, end, 0.060,
                           segments=5, radius_top=0.025)
    crowns = [
        (-0.48, 0.02, 1.98, 0.40), (-0.22, 0.0, 2.20, 0.36),
        (0.36, -0.10, 2.22, 0.43), (0.10, 0.30, 2.46, 0.38),
        (0.48, 0.15, 2.46, 0.29), (-0.20, 0.25, 2.58, 0.27),
    ]
    colours = ["tree_leaf_dark", "tree_leaf_mid", "tree_leaf_light"]
    for index, (x, y, z, radius) in enumerate(crowns):
        b.sphere(colours[index % 3], radius, loc=(x, y, z),
                 scale=(1.08, 0.78, 0.50), u=6, v=3)
    return b.build(collection("PROPS"), smooth=True)


def prop_dead_tree():
    """A sun-bleached branching silhouette for sparse outback variety."""
    b = MeshBuilder("SM_prop_dead_tree", budget="prop")
    b.cylinder("tree_trunk", 0.15, 1.45, loc=(0, 0, 0.725),
               segments=6, radius_top=0.075)
    for start, end, radius in [
        ((0, 0, 0.85), (-0.50, 0.03, 1.35), 0.065),
        ((0, 0, 1.05), (0.43, -0.05, 1.58), 0.060),
        ((0, 0, 1.20), (0.08, 0.38, 1.78), 0.050),
        ((-0.50, 0.03, 1.35), (-0.68, 0.09, 1.58), 0.035),
        ((0.43, -0.05, 1.58), (0.65, -0.10, 1.74), 0.032),
    ]:
        b.cylinder_between("tree_trunk_light", start, end, radius,
                           segments=5, radius_top=radius * 0.42)
    return b.build(collection("PROPS"), smooth=False)


def prop_rock_cluster():
    """Several faceted stones sharing one footprint, breaking clone repetition."""
    b = MeshBuilder("SM_prop_rock_cluster", budget="prop")
    stones = [
        (-0.22, 0.02, 0.25, 0.34, "rock"),
        (0.20, 0.10, 0.18, 0.27, "rock_shadow"),
        (0.05, -0.24, 0.14, 0.22, "rock"),
        (0.35, -0.17, 0.10, 0.16, "rock_shadow"),
    ]
    for index, (x, y, z, radius, colour) in enumerate(stones):
        b.sphere(colour, radius, loc=(x, y, z),
                 rot=(0, 0, index * 0.37),
                 scale=(1.0, 0.82, 0.68), u=6, v=3)
    return b.build(collection("PROPS"), smooth=False)


def prop_wildflowers():
    """Tiny colour notes grouped into a patch large enough to read at 20 m."""
    b = MeshBuilder("SM_prop_wildflowers", budget="prop")
    flowers = [
        (-0.18, -0.05, 0.24, "flower_white"),
        (0.03, 0.10, 0.30, "flower_blue"),
        (0.20, -0.02, 0.22, "flower_yellow"),
        (-0.04, -0.18, 0.20, "flower_blue"),
        (0.15, 0.18, 0.26, "flower_white"),
    ]
    for index, (x, y, height, colour) in enumerate(flowers):
        b.cylinder("crop_leaf_dark", 0.010, height, loc=(x, y, height / 2),
                   segments=4, radius_top=0.007)
        b.lobed_leaf(colour, 0.055, loc=(x, y, height),
                     yaw=index * 0.73, tilt=0.08, lobes=5, inner=0.46)
        b.sphere("flower_yellow", 0.018, loc=(x, y, height + 0.008),
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
    """A low timber trough that gives the animal area a clear focal prop."""
    b = MeshBuilder("SM_prop_water_trough", budget="prop")
    b.box("timber_dark", size=(1.10, 0.44, 0.12), loc=(0, 0, 0.14))
    b.box("timber_light", size=(1.00, 0.34, 0.14), loc=(0, 0, 0.22))
    b.box("water_deep", size=(0.88, 0.22, 0.045), loc=(0, 0, 0.31))
    for sx in (-1, 1):
        b.box("timber_dark", size=(0.12, 0.48, 0.22),
              loc=(sx * 0.49, 0, 0.13))
    b.bevel(width=0.012, segments=1)
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

CROPS = ["wheat", "corn", "pumpkin"]

BUILD_ORDER = (
    [(f"crop_wheat_s{s}", lambda s=s: crop_wheat(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_corn_s{s}", lambda s=s: crop_corn(s)) for s in (1, 2, 3, 4)]
    + [(f"crop_pumpkin_s{s}", lambda s=s: crop_pumpkin(s)) for s in (1, 2, 3, 4)]
    + [
        ("ground_plot", ground_plot),
        ("building_barn", building_barn),
        ("building_irrigation", building_irrigation),
        ("building_road", building_road),
        ("building_fence", building_fence),
        ("building_coop", building_coop),
        ("char_farmer", character_farmer),
        ("animal_chicken", animal_chicken),
        ("animal_fox", animal_fox),
        ("prop_rock", prop_rock),
        ("prop_grass_tuft", prop_grass_tuft),
        ("prop_bush", prop_bush),
        ("prop_eucalyptus", prop_eucalyptus),
        ("prop_eucalyptus_tall", prop_eucalyptus_tall),
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
