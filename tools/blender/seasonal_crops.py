"""Four-stage authored meshes for the twelve season-exclusive crops.

The base crop module is already the largest art source file. Seasonal crops
live here so each new planting still follows the exact same contract without
turning ``assets.py`` into an even larger mixed-responsibility catalog:

* one mesh is one complete 1.8 m plot bed;
* stages 1-3 communicate species and growth through silhouette;
* stage 4 makes the harvest unmistakable through fruit/root mass and the
  largest colour jump;
* every shape stays under the shared 900-triangle crop budget.
"""

from __future__ import annotations

import math

from buildlib import MeshBuilder, collection
from palette import PLOT_FOOTPRINT

TAU = math.tau


def _positions(count: int, seed: int, inset: float = 0.78):
    """Deterministic planted rows with enough jitter to avoid copy-paste beds."""
    half = PLOT_FOOTPRINT * 0.5 * inset
    columns = max(1, int(round(math.sqrt(count))))
    rows = max(1, math.ceil(count / columns))
    result = []
    for index in range(count):
        column, row = index % columns, index // columns
        u = (column + 0.5) / columns * 2 - 1
        v = (row + 0.5) / rows * 2 - 1
        jx = ((seed * 41 + index * 103) % 100 / 100.0 - 0.5) * (1.25 / columns)
        jy = ((seed * 59 + index * 181) % 100 / 100.0 - 0.5) * (1.25 / rows)
        yaw = ((seed * 73 + index * 137) % 100 / 100.0) * TAU
        result.append((u * half + jx * half, v * half + jy * half, yaw))
    return result


def _flower(b: MeshBuilder, x: float, y: float, z: float, radius: float, yaw: float) -> None:
    for petal in range(5):
        angle = yaw + petal * TAU / 5
        b.sphere(
            "flower_white",
            radius,
            loc=(x + math.cos(angle) * radius, y + math.sin(angle) * radius, z),
            scale=(1.0, 0.62, 0.28),
            rot=(0, 0, angle),
            u=5,
            v=3,
        )
    b.sphere("flower_yellow", radius * 0.48, loc=(x, y, z + radius * 0.08), u=5, v=3)


def _fruit(
    b: MeshBuilder,
    colour: str,
    loc,
    radius: float,
    scale=(1.0, 1.0, 1.0),
    rot=(0.0, 0.0, 0.0),
) -> None:
    b.sphere(colour, radius, loc=loc, scale=scale, rot=rot, u=6, v=4)


def crop_radish(stage: int):
    """Spring radish: quick leafy rosettes reveal bright roots at harvest."""
    b = MeshBuilder(f"SM_crop_radish_s{stage}", budget="crop")
    count = {1: 5, 2: 7, 3: 8, 4: 8}[stage]
    height = {1: 0.10, 2: 0.18, 3: 0.27, 4: 0.31}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 13 + 1)):
        for leaf in range(3 if stage == 1 else 5):
            angle = yaw + leaf * TAU / (3 if stage == 1 else 5)
            b.lance_leaf(
                colour,
                length=height * (0.72 + (leaf % 2) * 0.12),
                width=0.055 + stage * 0.012,
                loc=(x, y, 0.08 + leaf * 0.006),
                rot=(0.18 + leaf * 0.05, 0.22, angle),
                curl=0.14,
            )
        if stage >= 3:
            ready = stage == 4
            radius = 0.105 if ready else 0.065
            _fruit(
                b,
                "radish_body" if ready else "pumpkin_green",
                (x, y, radius * 0.56),
                radius,
                scale=(0.92, 0.92, 1.12),
            )
            b.cylinder(
                "root_tip",
                0.020 if ready else 0.012,
                0.10 if ready else 0.06,
                loc=(x, y, 0.018),
                segments=4,
                radius_top=0.004,
            )
    return b.build(collection("CROPS_SPRING"), smooth=False)


def crop_pea(stage: int):
    """Spring peas: paired leaves climb into visible pale pods."""
    b = MeshBuilder(f"SM_crop_pea_s{stage}", budget="crop")
    count = {1: 4, 2: 5, 3: 5, 4: 5}[stage]
    height = {1: 0.22, 2: 0.46, 3: 0.72, 4: 0.78}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 17 + 2)):
        b.cylinder(colour, 0.018 + stage * 0.003, height, loc=(x, y, height / 2), segments=5, radius_top=0.009)
        nodes = 2 if stage == 1 else 3 if stage == 2 else 4
        for node in range(nodes):
            z = height * (0.28 + node * 0.17)
            for side in (-1, 1):
                angle = yaw + side * (0.62 + node * 0.10)
                b.lobed_leaf(
                    colour,
                    0.075 + stage * 0.012,
                    loc=(x + math.cos(angle) * 0.055, y + math.sin(angle) * 0.055, z),
                    yaw=angle,
                    tilt=0.34,
                    lobes=3,
                    inner=0.58,
                )
        if stage >= 3:
            pods = 1 if stage == 3 else 2
            for pod in range(pods):
                angle = yaw + 0.55 + pod * 2.1
                _fruit(
                    b,
                    "crop_mature" if stage == 3 else "pea_pod",
                    (x + math.cos(angle) * 0.105, y + math.sin(angle) * 0.105, height * (0.48 + pod * 0.13)),
                    0.065 if stage == 4 else 0.045,
                    scale=(0.48, 1.35, 0.42),
                    rot=(0.35, 0.0, angle),
                )
    return b.build(collection("CROPS_SPRING"), smooth=False)


def crop_strawberry(stage: int):
    """Spring strawberries: white flowers become low, readable red fruit."""
    b = MeshBuilder(f"SM_crop_strawberry_s{stage}", budget="crop")
    count = {1: 4, 2: 5, 3: 5, 4: 5}[stage]
    radius = {1: 0.09, 2: 0.12, 3: 0.15, 4: 0.16}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 19 + 3)):
        for leaf in range(3 if stage == 1 else 5):
            angle = yaw + leaf * TAU / (3 if stage == 1 else 5)
            b.lobed_leaf(
                colour,
                radius,
                loc=(x + math.cos(angle) * radius * 0.42, y + math.sin(angle) * radius * 0.42, 0.09 + stage * 0.018),
                yaw=angle,
                tilt=0.22,
                lobes=3,
                inner=0.56,
            )
        if stage == 2 and index % 2 == 0:
            _flower(b, x, y, 0.19, 0.026, yaw)
        if stage >= 3:
            fruit_count = 1 if stage == 3 else 2
            for fruit_index in range(fruit_count):
                angle = yaw + 0.7 + fruit_index * 2.4
                fx = x + math.cos(angle) * (0.10 + fruit_index * 0.025)
                fy = y + math.sin(angle) * (0.10 + fruit_index * 0.025)
                _fruit(
                    b,
                    "pumpkin_green" if stage == 3 else "strawberry_body",
                    (fx, fy, 0.085),
                    0.075 if stage == 4 else 0.05,
                    scale=(0.86, 0.86, 1.12),
                )
                b.lobed_leaf("crop_leaf_dark", 0.037, loc=(fx, fy, 0.15), yaw=angle, tilt=0.15, lobes=5)
    return b.build(collection("CROPS_SPRING"), smooth=False)


def crop_sunflower(stage: int):
    """Summer sunflower: tall drought-tolerant stems finish as gold discs."""
    b = MeshBuilder(f"SM_crop_sunflower_s{stage}", budget="crop")
    count = 5 if stage < 3 else 4
    height = {1: 0.30, 2: 0.68, 3: 1.12, 4: 1.28}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 23 + 4)):
        actual = height * (0.9 + (index % 3) * 0.055)
        b.cylinder(colour, 0.024 + stage * 0.004, actual, loc=(x, y, actual / 2), segments=5, radius_top=0.016)
        for leaf in range(2 if stage == 1 else 4):
            angle = yaw + leaf * TAU / (2 if stage == 1 else 4)
            b.lance_leaf(
                colour,
                length=0.18 + stage * 0.045,
                width=0.09 + stage * 0.014,
                loc=(x, y, actual * (0.27 + leaf * 0.14)),
                rot=(0.32, 0.18, angle),
                curl=0.18,
            )
        if stage >= 3:
            ready = stage == 4
            head_radius = 0.15 if ready else 0.09
            _fruit(
                b,
                "sunflower_centre" if ready else "crop_mature",
                (x, y, actual + 0.025),
                head_radius,
                scale=(1.0, 1.0, 0.32),
            )
            if ready:
                for petal in range(10):
                    angle = yaw + petal * TAU / 10
                    b.lance_leaf(
                        "sunflower_petal",
                        length=0.15,
                        width=0.065,
                        loc=(x + math.cos(angle) * 0.16, y + math.sin(angle) * 0.16, actual + 0.025),
                        rot=(0, 0, angle),
                        curl=0.05,
                    )
    return b.build(collection("CROPS_SUMMER"), smooth=False)


def crop_tomato(stage: int):
    """Summer tomatoes: branching thirsty bushes carry obvious red clusters."""
    b = MeshBuilder(f"SM_crop_tomato_s{stage}", budget="crop")
    count = 4
    height = {1: 0.20, 2: 0.44, 3: 0.68, 4: 0.74}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 29 + 5)):
        b.cylinder(colour, 0.022 + stage * 0.004, height, loc=(x, y, height / 2), segments=5, radius_top=0.014)
        branches = 2 if stage == 1 else 4
        for branch in range(branches):
            angle = yaw + branch * TAU / branches
            start = (x, y, height * (0.30 + branch * 0.10))
            end = (x + math.cos(angle) * (0.12 + stage * 0.025), y + math.sin(angle) * (0.12 + stage * 0.025), height * (0.47 + branch * 0.10))
            b.cylinder_between(colour, start, end, 0.014, segments=4, radius_top=0.007)
            b.lobed_leaf(colour, 0.095 + stage * 0.012, loc=end, yaw=angle, tilt=0.28, lobes=5, inner=0.55)
        if stage >= 3:
            for fruit_index in range(2 if stage == 3 else 3):
                angle = yaw + 0.4 + fruit_index * TAU / 3
                _fruit(
                    b,
                    "pumpkin_green" if stage == 3 else "tomato_body",
                    (x + math.cos(angle) * 0.12, y + math.sin(angle) * 0.12, height * (0.40 + fruit_index * 0.08)),
                    0.07 if stage == 4 else 0.045,
                    scale=(1.0, 1.0, 0.9),
                )
    return b.build(collection("CROPS_SUMMER"), smooth=False)


def crop_avocado(stage: int):
    """Summer avocado: two orchard saplings mature into a rare fruit canopy."""
    b = MeshBuilder(f"SM_crop_avocado_s{stage}", budget="crop")
    count = 3 if stage == 1 else 2
    height = {1: 0.34, 2: 0.72, 3: 1.10, 4: 1.22}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 31 + 6, inset=0.62)):
        trunk_colour = "crop_young" if stage == 1 else "orchard_stem"
        b.cylinder(trunk_colour, 0.030 + stage * 0.010, height * 0.72, loc=(x, y, height * 0.36), segments=6, radius_top=0.018)
        branch_count = 2 if stage < 3 else 4
        for branch in range(branch_count):
            angle = yaw + branch * TAU / branch_count
            start = (x, y, height * (0.42 + branch * 0.045))
            end = (x + math.cos(angle) * (0.16 + stage * 0.035), y + math.sin(angle) * (0.16 + stage * 0.035), height * (0.67 + (branch % 2) * 0.12))
            b.cylinder_between(trunk_colour, start, end, 0.018 + stage * 0.004, segments=5, radius_top=0.009)
            b.foliage_cluster(
                "crop_seedling" if stage == 1 else "crop_young" if stage == 2 else "crop_mature" if stage == 3 else "crop_leaf_light",
                0.15 + stage * 0.035,
                loc=end,
                rot=(0.12, 0.18, angle),
                scale=(1.0, 0.78, 0.65),
                lobes=5,
            )
        if stage == 4:
            # Keep the fruit below and in front of the leaf sprays. The first
            # version distributed it evenly around the crown, which was
            # botanically plausible but hid every avocado in the UI icon.
            for fruit_index, (ox, oy, oz) in enumerate((
                (-0.11, -0.30, 0.43),
                (0.10, -0.28, 0.51),
                (0.00, -0.34, 0.59),
            )):
                fx, fy, z = x + ox, y + oy, height * oz
                _fruit(
                    b, "avocado_shadow", (fx, fy, z), 0.10,
                    scale=(0.76, 0.76, 1.24), rot=(0.18, 0, yaw + fruit_index * 0.22),
                )
                _fruit(
                    b, "avocado_body", (fx, fy - 0.035, z + 0.025), 0.038,
                    scale=(0.65, 0.45, 0.82),
                )
    return b.build(collection("CROPS_SUMMER"), smooth=False)


def crop_beetroot(stage: int):
    """Autumn beetroot: upright leaves reveal broad purple roots."""
    b = MeshBuilder(f"SM_crop_beetroot_s{stage}", budget="crop")
    count = {1: 5, 2: 7, 3: 8, 4: 8}[stage]
    height = {1: 0.12, 2: 0.22, 3: 0.34, 4: 0.38}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 37 + 7)):
        for leaf in range(3 if stage == 1 else 5):
            angle = yaw + leaf * TAU / (3 if stage == 1 else 5)
            b.lance_leaf(colour, height * 0.72, 0.065 + stage * 0.015, loc=(x, y, 0.07), rot=(0.28, 0.16, angle), curl=0.22)
        if stage >= 3:
            ready = stage == 4
            _fruit(b, "beetroot_body" if ready else "pumpkin_green", (x, y, 0.07), 0.105 if ready else 0.065, scale=(0.92, 0.92, 1.05))
            b.cylinder("beetroot_body" if ready else "crop_mature", 0.015, 0.10, loc=(x, y, 0.015), segments=4, radius_top=0.003)
    return b.build(collection("CROPS_AUTUMN"), smooth=False)


def crop_cranberry(stage: int):
    """Autumn cranberry: low runners become a dense carpet of bright fruit."""
    b = MeshBuilder(f"SM_crop_cranberry_s{stage}", budget="crop")
    runners = {1: 3, 2: 4, 3: 5, 4: 4}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(runners, stage * 41 + 8)):
        length = 0.20 + stage * 0.08
        end = (x + math.cos(yaw) * length, y + math.sin(yaw) * length, 0.06)
        b.cylinder_between(colour, (x, y, 0.055), end, 0.012 + stage * 0.002, segments=4, radius_top=0.007)
        node_count = 2 + min(stage, 3)
        for node in range(node_count):
            t = (node + 1) / (node_count + 1)
            px = x + math.cos(yaw) * length * t
            py = y + math.sin(yaw) * length * t
            for side in (-1, 1):
                angle = yaw + side * 0.8
                b.lance_leaf(colour, 0.09 + stage * 0.01, 0.045, loc=(px, py, 0.075), rot=(0.10, 0.18, angle), curl=0.12)
        if stage >= 3:
            fruit_count = 2 if stage == 3 else 3
            for fruit_index in range(fruit_count):
                angle = yaw + 0.5 + fruit_index * TAU / fruit_count
                _fruit(
                    b,
                    "pumpkin_green" if stage == 3 else "cranberry_body",
                    (x + math.cos(angle) * (0.10 + fruit_index * 0.025), y + math.sin(angle) * (0.10 + fruit_index * 0.025), 0.07),
                    0.045 if stage == 4 else 0.03,
                )
    return b.build(collection("CROPS_AUTUMN"), smooth=False)


def crop_grape(stage: int):
    """Autumn grapes: woody forked vines carry hanging purple bunches."""
    b = MeshBuilder(f"SM_crop_grape_s{stage}", budget="crop")
    count = 3
    height = {1: 0.25, 2: 0.50, 3: 0.78, 4: 0.84}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 43 + 9, inset=0.68)):
        stem_colour = "crop_young" if stage == 1 else "orchard_stem"
        b.cylinder(stem_colour, 0.026 + stage * 0.006, height * 0.72, loc=(x, y, height * 0.36), segments=5, radius_top=0.014)
        arms = 2 if stage < 3 else 3
        for arm in range(arms):
            angle = yaw + arm * TAU / arms
            end = (x + math.cos(angle) * (0.18 + stage * 0.035), y + math.sin(angle) * (0.18 + stage * 0.035), height * (0.58 + (arm % 2) * 0.12))
            b.cylinder_between(stem_colour, (x, y, height * 0.45), end, 0.015 + stage * 0.003, segments=4, radius_top=0.008)
            b.lobed_leaf(
                "crop_seedling" if stage == 1 else "crop_young" if stage == 2 else "crop_mature" if stage == 3 else "crop_leaf_light",
                0.13 + stage * 0.018,
                loc=end,
                yaw=angle,
                tilt=0.28,
                lobes=5,
                inner=0.48,
            )
        if stage >= 3:
            bunch_colour = "pumpkin_green" if stage == 3 else "grape_body"
            for grape_index in range(4 if stage == 3 else 6):
                row = grape_index // 2
                side = -1 if grape_index % 2 == 0 else 1
                _fruit(
                    b,
                    bunch_colour,
                    (x + side * (0.035 + row * 0.006), y - 0.12, height * 0.50 - row * 0.052),
                    0.045 if stage == 4 else 0.032,
                )
    return b.build(collection("CROPS_AUTUMN"), smooth=False)


def crop_carrot(stage: int):
    """Winter carrot: feathery tops finish with exposed orange shoulders."""
    b = MeshBuilder(f"SM_crop_carrot_s{stage}", budget="crop")
    count = {1: 6, 2: 8, 3: 8, 4: 8}[stage]
    height = {1: 0.14, 2: 0.26, 3: 0.38, 4: 0.42}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 47 + 10)):
        for leaf in range(3 if stage == 1 else 5):
            angle = yaw + leaf * TAU / (3 if stage == 1 else 5)
            b.blade(colour, height * (0.78 + (leaf % 2) * 0.12), 0.035, 0.006, loc=(x, y, 0.04), yaw=angle, droop=0.42, segments=3)
        if stage >= 3:
            ready = stage == 4
            b.cylinder(
                "carrot_body" if ready else "pumpkin_green",
                0.075 if ready else 0.045,
                0.24 if ready else 0.13,
                loc=(x, y, 0.075),
                segments=6,
                radius_top=0.012,
            )
    return b.build(collection("CROPS_WINTER"), smooth=False)


def crop_cabbage(stage: int):
    """Winter cabbage: open rosettes close into pale, storage-friendly heads."""
    b = MeshBuilder(f"SM_crop_cabbage_s{stage}", budget="crop")
    count = 4
    radius = {1: 0.12, 2: 0.19, 3: 0.25, 4: 0.29}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "cabbage_ready"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 53 + 11)):
        leaves = 4 if stage == 1 else 6
        for leaf in range(leaves):
            angle = yaw + leaf * TAU / leaves
            b.lobed_leaf(
                colour,
                radius * (0.88 + (leaf % 2) * 0.12),
                loc=(x + math.cos(angle) * radius * 0.34, y + math.sin(angle) * radius * 0.34, 0.10 + stage * 0.025),
                yaw=angle,
                tilt=0.46 if stage < 3 else 0.72,
                lobes=5,
                inner=0.62,
            )
        if stage >= 3:
            b.foliage_cluster(
                "crop_mature" if stage == 3 else "cabbage_ready",
                radius * 0.72,
                loc=(x, y, 0.15 + stage * 0.035),
                scale=(1.0, 1.0, 0.78),
                lobes=6,
                inner=0.74,
                depth=0.12,
            )
    return b.build(collection("CROPS_WINTER"), smooth=False)


def crop_garlic(stage: int):
    """Winter garlic: narrow leaves culminate in clustered ivory bulbs."""
    b = MeshBuilder(f"SM_crop_garlic_s{stage}", budget="crop")
    count = {1: 5, 2: 6, 3: 6, 4: 5}[stage]
    height = {1: 0.18, 2: 0.34, 3: 0.50, 4: 0.54}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 59 + 12)):
        for leaf in range(3 if stage == 1 else 5):
            angle = yaw + (leaf - 2) * 0.42
            b.blade(colour, height * (0.82 + (leaf % 2) * 0.12), 0.055, 0.008, loc=(x, y, 0.05), yaw=angle, droop=0.34 + leaf * 0.05, segments=3)
        if stage >= 3:
            ready = stage == 4
            bulb_colour = "garlic_body" if ready else "pumpkin_green"
            _fruit(b, bulb_colour, (x, y, 0.075), 0.10 if ready else 0.06, scale=(1.0, 1.0, 0.82))
            if ready:
                for clove in range(2):
                    angle = yaw + clove * math.pi
                    _fruit(
                        b,
                        "root_tip",
                        (x + math.cos(angle) * 0.055, y + math.sin(angle) * 0.055, 0.065),
                        0.045,
                        scale=(0.72, 0.72, 0.95),
                    )
    return b.build(collection("CROPS_WINTER"), smooth=False)
