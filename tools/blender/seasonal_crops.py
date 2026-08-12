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
    # One broad star survives the gameplay camera better than five tiny petal
    # spheres, while reclaiming geometry for fruit and stage silhouettes.
    b.lobed_leaf(
        "flower_white",
        radius * 2.15,
        loc=(x, y, z),
        yaw=yaw,
        tilt=0.08,
        lobes=5,
        inner=0.42,
    )
    b.sphere(
        "flower_yellow",
        radius * 0.48,
        loc=(x, y, z + radius * 0.10),
        u=5,
        v=3,
    )


def _fruit(
    b: MeshBuilder,
    colour: str,
    loc,
    radius: float,
    scale=(1.0, 1.0, 1.0),
    rot=(0.0, 0.0, 0.0),
    *,
    u: int = 6,
    v: int = 4,
) -> None:
    b.sphere(colour, radius, loc=loc, scale=scale, rot=rot, u=u, v=v)


def _root_bulb(
    b: MeshBuilder,
    colour: str,
    loc,
    radius: float,
    height: float,
    *,
    shoulder: float,
    belly: float,
) -> None:
    """A faceted harvest root whose outline is authored rather than spherical."""
    segments = 6
    points = [(0.0, 0.0, height * 0.45)]
    points.extend(
        (
            math.cos(index * TAU / segments) * radius * shoulder,
            math.sin(index * TAU / segments) * radius * shoulder,
            height * 0.20,
        )
        for index in range(segments)
    )
    points.extend(
        (
            math.cos(index * TAU / segments) * radius * belly,
            math.sin(index * TAU / segments) * radius * belly,
            -height * 0.05,
        )
        for index in range(segments)
    )
    points.append((0.0, 0.0, -height * 0.55))
    bottom = len(points) - 1
    faces = []
    for index in range(segments):
        following = (index + 1) % segments
        faces.append((0, index + 1, following + 1))
        faces.append((index + 1, segments + index + 1, segments + following + 1, following + 1))
        faces.append((bottom, segments + following + 1, segments + index + 1))
    b.polyhedron(colour, points, faces, loc=loc)


def _pea_trellis(b: MeshBuilder, stage: int) -> float:
    """Support grows from two nursery stakes into a tied A-frame."""
    width = 0.66
    depth = 0.24
    height = {1: 0.40, 2: 0.62, 3: 0.76, 4: 0.78}[stage]
    if stage == 1:
        for x in (-width, width):
            b.cylinder_between(
                "orchard_stem",
                (x, 0.06, 0.0),
                (x, 0.0, height),
                0.020,
                segments=4,
                radius_top=0.014,
            )
        b.cylinder_between(
            "orchard_stem",
            (-width, 0.0, height),
            (width * 0.24, 0.0, height),
            0.014,
            segments=4,
            radius_top=0.011,
        )
        return height

    for x in (-width, width):
        for side in (-1, 1):
            b.cylinder_between(
                "orchard_stem",
                (x, side * depth, 0.0),
                (x, 0.0, height),
                0.020,
                segments=4,
                radius_top=0.013,
            )
    b.cylinder_between(
        "orchard_stem",
        (-width, 0.0, height),
        (width, 0.0, height),
        0.018,
        segments=4,
        radius_top=0.015,
    )
    for z in ([0.46] if stage == 3 else [0.44, 0.61] if stage == 4 else []):
        for y in (-depth * 0.56, depth * 0.56):
            b.cylinder_between(
                "orchard_stem",
                (-width, y, z),
                (width, y, z),
                0.010,
                segments=4,
                radius_top=0.008,
            )
    return height


def _grape_trellis(b: MeshBuilder, stage: int) -> float:
    """A nursery stake row gains its centre post and training wires by stage."""
    width = 0.68
    height = {1: 0.42, 2: 0.62, 3: 0.82, 4: 0.82}[stage]
    posts = (-width, width) if stage == 1 else (-width, 0.0, width)
    for x in posts:
        b.cylinder(
            "orchard_stem",
            0.024,
            height,
            loc=(x, 0.0, height * 0.5),
            segments=4,
            radius_top=0.018,
        )
    wires = {
        1: ((0.38, -width, width * 0.24),),
        2: ((0.52, -width, width),),
        3: ((0.50, -width, width), (0.78, -width, width)),
        4: ((0.34, -width, width), (0.50, -width, width), (0.78, -width, width)),
    }[stage]
    for z, start_x, end_x in wires:
        b.cylinder_between(
            "orchard_stem",
            (start_x, 0.0, z),
            (end_x, 0.0, z),
            0.014,
            segments=4,
            radius_top=0.012,
        )
    return height


def _grape_bunch(
    b: MeshBuilder,
    stem_colour: str,
    fruit_colour: str,
    anchor,
    ready: bool,
) -> None:
    """A short immature bunch becomes a longer triangular harvest mass."""
    top = (anchor[0], anchor[1], anchor[2] - (0.065 if ready else 0.045))
    b.cylinder_between(
        stem_colour,
        anchor,
        top,
        0.009,
        segments=4,
        radius_top=0.004,
    )
    offsets = (
        [(-0.030, 0.0, 0.0), (0.030, 0.0, 0.0),
         (-0.040, 0.0, -0.052), (0.040, 0.0, -0.052), (0.0, 0.0, -0.105)]
        if ready
        else [(0.0, 0.0, 0.0), (-0.026, 0.0, -0.042), (0.026, 0.0, -0.042)]
    )
    for dx, dy, dz in offsets:
        _fruit(
            b,
            fruit_colour,
            (top[0] + dx, top[1] + dy, top[2] + dz),
            0.052 if ready else 0.034,
            u=5,
            v=3,
        )


def crop_radish(stage: int):
    """Spring radish: low pinwheel rosettes reveal round tapered roots."""
    b = MeshBuilder(f"SM_crop_radish_s{stage}", budget="crop")
    count = {1: 5, 2: 7, 3: 8, 4: 8}[stage]
    height = {1: 0.17, 2: 0.25, 3: 0.33, 4: 0.37}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    leaf_count = {1: 3, 2: 4, 3: 4, 4: 5}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 13 + 1)):
        for leaf in range(leaf_count):
            angle = yaw + leaf * TAU / leaf_count
            b.lance_leaf(
                colour,
                length=height * (0.90 + (leaf % 2) * 0.12),
                width=0.060 + stage * 0.011,
                loc=(x, y, 0.055 + leaf * 0.004),
                rot=(0.12 + (leaf % 2) * 0.08, -0.74, angle),
                curl=0.16,
            )
        if stage >= 3:
            ready = stage == 4
            radius = 0.105 if ready else 0.065
            _root_bulb(
                b,
                "radish_body" if ready else "pumpkin_green",
                (x, y, 0.115 if ready else 0.070),
                radius,
                0.21 if ready else 0.13,
                shoulder=0.72,
                belly=1.0,
            )
    return b.build(collection("CROPS_SPRING"), smooth=False)


def crop_pea(stage: int):
    """Spring peas climb an A-frame before hanging paired harvest pods."""
    b = MeshBuilder(f"SM_crop_pea_s{stage}", budget="crop")
    frame_height = _pea_trellis(b, stage)
    height = {1: 0.22, 2: 0.46, 3: 0.72, 4: 0.78}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    vines = [(-0.48, -0.12), (-0.16, 0.12), (0.16, -0.12), (0.48, 0.12)]
    for index, (x, y) in enumerate(vines):
        yaw = -0.42 + index * 0.31
        if stage == 1:
            b.cylinder_between(
                colour,
                (x, y, 0.04),
                (x + math.sin(yaw) * 0.02, y * 0.55, height),
                0.018,
                segments=4,
                radius_top=0.010,
            )
        else:
            wrap = -1 if index % 2 else 1
            mid = (x + wrap * 0.035, y * 0.58, height * 0.52)
            top = (x - wrap * 0.025, -y * 0.08, height)
            b.cylinder_between(
                colour, (x, y, 0.04), mid, 0.022,
                segments=4, radius_top=0.015,
            )
            b.cylinder_between(
                colour, mid, top, 0.015,
                segments=4, radius_top=0.009,
            )
            b.cylinder_between(
                colour,
                top,
                (x + wrap * 0.035, 0.0, min(frame_height, height + 0.12)),
                0.009,
                segments=3,
                radius_top=0.003,
            )
        nodes = 1 if stage == 1 else 2 if stage == 2 else 3
        for node in range(nodes):
            t = (node + 1) / (nodes + 1)
            z = 0.07 + (height - 0.07) * t
            py = y * (1.0 - t)
            for side in (-1, 1):
                angle = yaw + side * (0.62 + node * 0.10)
                b.lobed_leaf(
                    colour,
                    0.078 + stage * 0.013,
                    loc=(x + math.cos(angle) * 0.060, py + math.sin(angle) * 0.050, z),
                    yaw=angle,
                    tilt=0.34,
                    lobes=3,
                    inner=0.58,
                )
        if stage >= 3:
            for pod in range(1 if stage == 3 else 2):
                angle = yaw + 0.55 + pod * 2.1
                pod_y = -0.16 if stage == 3 else -0.23
                pod_z = height * (0.54 if stage == 3 else 0.38 + pod * 0.17)
                _fruit(
                    b,
                    "crop_mature" if stage == 3 else "pea_pod",
                    (x + math.cos(angle) * 0.095,
                     pod_y + math.sin(angle) * 0.035, pod_z),
                    0.078 if stage == 4 else 0.048,
                    scale=(0.42, 1.62, 0.38),
                    rot=(0.35, 0.0, angle),
                    u=5,
                    v=3,
                )
    return b.build(collection("CROPS_SPRING"), smooth=False)


def crop_strawberry(stage: int):
    """Spring strawberries: white flowers become low, readable red fruit."""
    b = MeshBuilder(f"SM_crop_strawberry_s{stage}", budget="crop")
    count = {1: 4, 2: 5, 3: 6, 4: 6}[stage]
    radius = {1: 0.09, 2: 0.115, 3: 0.145, 4: 0.16}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    leaf_count = {1: 3, 2: 4, 3: 5, 4: 5}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 19 + 3)):
        for leaf in range(leaf_count):
            angle = yaw + leaf * TAU / leaf_count
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
            fruit_count = 1 if stage == 3 else 1 + (index % 2 == 0)
            for fruit_index in range(fruit_count):
                angle = yaw + 0.7 + fruit_index * 2.4
                fx = x + math.cos(angle) * (0.10 + fruit_index * 0.025)
                fy = y + math.sin(angle) * (0.10 + fruit_index * 0.025)
                _fruit(
                    b,
                    "pumpkin_green" if stage == 3 else "strawberry_body",
                    (fx, fy, 0.085),
                    0.078 if stage == 4 else 0.055,
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
        branches = 2 if stage == 1 else 3
        for branch in range(branches):
            angle = yaw + branch * TAU / branches
            start = (x, y, height * (0.30 + branch * 0.10))
            end = (x + math.cos(angle) * (0.12 + stage * 0.025), y + math.sin(angle) * (0.12 + stage * 0.025), height * (0.47 + branch * 0.10))
            b.cylinder_between(colour, start, end, 0.014, segments=4, radius_top=0.007)
            b.lobed_leaf(
                colour,
                0.105 + stage * 0.014,
                loc=end,
                yaw=angle,
                tilt=0.28,
                lobes=5,
                inner=0.55,
            )
        if stage >= 3:
            fruit_count = 2 if stage == 3 else 2 + (index % 2 == 0)
            for fruit_index in range(fruit_count):
                angle = yaw + 0.4 + fruit_index * TAU / 3
                _fruit(
                    b,
                    "pumpkin_green" if stage == 3 else "tomato_body",
                    (x + math.cos(angle) * 0.12, y + math.sin(angle) * 0.12, height * (0.40 + fruit_index * 0.08)),
                    0.078 if stage == 4 else 0.050,
                    scale=(1.0, 1.0, 0.9),
                    u=5,
                    v=3,
                )
    return b.build(collection("CROPS_SUMMER"), smooth=False)


def crop_avocado(stage: int):
    """Summer avocado: two orchard saplings mature into a rare fruit canopy."""
    b = MeshBuilder(f"SM_crop_avocado_s{stage}", budget="crop")
    count = 2
    height = {1: 0.38, 2: 0.72, 3: 1.10, 4: 1.22}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 31 + 6, inset=0.62)):
        trunk_colour = "crop_young" if stage == 1 else "orchard_stem"
        b.cylinder(
            trunk_colour,
            0.030 + stage * 0.010,
            height * 0.72,
            loc=(x, y, height * 0.36),
            segments=6,
            radius_top=0.018,
        )
        if stage == 1:
            # Seedlings are upright shoots with three broad leaves, not a
            # miniature version of the mature orchard crown.
            for leaf in range(3):
                angle = yaw + leaf * TAU / 3
                b.lance_leaf(
                    "crop_seedling",
                    length=0.22 + leaf * 0.018,
                    width=0.105,
                    loc=(x, y, height * (0.60 + leaf * 0.07)),
                    rot=(0.20 + leaf * 0.08, -0.48, angle),
                    curl=0.16,
                )
            continue

        branch_count = 2 if stage == 2 else 3
        for branch in range(branch_count):
            angle = yaw + branch * TAU / branch_count
            start = (x, y, height * (0.42 + branch * 0.045))
            end = (x + math.cos(angle) * (0.16 + stage * 0.035), y + math.sin(angle) * (0.16 + stage * 0.035), height * (0.67 + (branch % 2) * 0.12))
            b.cylinder_between(trunk_colour, start, end, 0.018 + stage * 0.004, segments=5, radius_top=0.009)
            b.foliage_cluster(
                "crop_seedling" if stage == 1 else "crop_young" if stage == 2 else "crop_mature" if stage == 3 else "crop_leaf_light",
                0.17 + stage * 0.038,
                loc=end,
                rot=(0.12, 0.18, angle),
                scale=(1.0, 0.78, 0.65),
                lobes=5,
            )
        if stage == 3:
            _fruit(
                b,
                "crop_mature",
                (x - 0.03, y - 0.24, height * 0.49),
                0.072,
                scale=(0.72, 0.72, 1.18),
                rot=(0.16, 0.0, yaw),
                u=5,
                v=3,
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
                    b,
                    "avocado_body",
                    (fx, fy, z),
                    0.105,
                    scale=(0.74, 0.74, 1.28),
                    rot=(0.18, 0, yaw + fruit_index * 0.22),
                )
    return b.build(collection("CROPS_SUMMER"), smooth=False)


def crop_beetroot(stage: int):
    """Autumn beetroot: paired upright leaves reveal broad heart roots."""
    b = MeshBuilder(f"SM_crop_beetroot_s{stage}", budget="crop")
    count = {1: 5, 2: 7, 3: 8, 4: 8}[stage]
    height = {1: 0.14, 2: 0.25, 3: 0.40, 4: 0.46}[stage]
    colour = {1: "crop_seedling", 2: "crop_young", 3: "crop_mature", 4: "crop_leaf_light"}[stage]
    leaf_count = {1: 3, 2: 4, 3: 5, 4: 5}[stage]
    for index, (x, y, yaw) in enumerate(_positions(count, stage * 37 + 7)):
        for leaf in range(leaf_count):
            angle = yaw + (leaf % 2) * math.pi + (leaf // 2 - 1) * 0.42
            b.lance_leaf(
                colour,
                height * (0.76 + (leaf % 3) * 0.08),
                0.068 + stage * 0.014,
                loc=(x, y, 0.075 + leaf * 0.004),
                rot=(0.10 + (leaf % 2) * 0.06, -1.02, angle),
                curl=0.24,
            )
        if stage >= 3:
            ready = stage == 4
            _root_bulb(
                b,
                "beetroot_body" if ready else "pumpkin_green",
                (x, y, 0.125 if ready else 0.075),
                0.125 if ready else 0.070,
                0.23 if ready else 0.14,
                shoulder=1.0,
                belly=0.88,
            )
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
            fruit_count = 2 if stage == 3 else 4
            for fruit_index in range(fruit_count):
                angle = yaw + 0.5 + fruit_index * TAU / fruit_count
                _fruit(
                    b,
                    "pumpkin_green" if stage == 3 else "cranberry_body",
                    (x + math.cos(angle) * (0.10 + fruit_index * 0.025), y + math.sin(angle) * (0.10 + fruit_index * 0.025), 0.07),
                    0.050 if stage == 4 else 0.032,
                    u=5,
                    v=3,
                )
    return b.build(collection("CROPS_AUTUMN"), smooth=False)


def crop_grape(stage: int):
    """Autumn grapes train along wires before bunches lengthen below them."""
    b = MeshBuilder(f"SM_crop_grape_s{stage}", budget="crop")
    _grape_trellis(b, stage)
    height = {1: 0.24, 2: 0.52, 3: 0.75, 4: 0.79}[stage]
    for index, x in enumerate((-0.28, 0.28)):
        yaw = -0.28 + index * 0.56
        stem_colour = "crop_young" if stage == 1 else "orchard_stem"
        lean = -1 if index == 0 else 1
        top = (x + lean * (0.035 + stage * 0.006), 0.02, height)
        if stage == 1:
            b.cylinder_between(
                stem_colour,
                (x, 0.0, 0.0),
                top,
                0.030 + stage * 0.006,
                segments=5,
                radius_top=0.015,
            )
        else:
            mid = (x - lean * 0.030, -0.035, height * 0.52)
            b.cylinder_between(
                stem_colour,
                (x, 0.0, 0.0),
                mid,
                0.030 + stage * 0.006,
                segments=5,
                radius_top=0.023,
            )
            b.cylinder_between(
                stem_colour,
                mid,
                top,
                0.023,
                segments=5,
                radius_top=0.015,
            )
        if stage == 1:
            for leaf in range(2):
                angle = yaw + (leaf * 2 - 1) * 0.72
                b.lobed_leaf(
                    "crop_seedling",
                    0.115,
                    loc=(top[0] + math.cos(angle) * 0.060,
                         math.sin(angle) * 0.055, height * 0.68),
                    yaw=angle,
                    tilt=0.36,
                    lobes=5,
                    inner=0.48,
                )
            continue

        arm_z = 0.49 if stage == 2 else 0.70
        arm_length = 0.18 if stage == 2 else 0.24
        leaf_colour = "crop_young" if stage == 2 else "crop_mature" if stage == 3 else "crop_leaf_light"
        for side in (-1, 1):
            end = (top[0] + side * arm_length, 0.0, arm_z)
            b.cylinder_between(
                stem_colour,
                (top[0], top[1], min(height * 0.90, arm_z)),
                end,
                0.017 + stage * 0.002,
                segments=4,
                radius_top=0.008,
            )
            leaf_count = 1 if stage == 2 else 2
            for leaf in range(leaf_count):
                t = (leaf + 1) / leaf_count
                angle = yaw + side * (0.72 + leaf * 0.38)
                b.lobed_leaf(
                    leaf_colour,
                    0.14 + stage * 0.016,
                    loc=(top[0] + side * arm_length * t,
                         side * 0.035, arm_z + leaf * 0.045),
                    yaw=angle,
                    tilt=0.30 + leaf * 0.08,
                    lobes=5,
                    inner=0.48,
                )
        if stage >= 3:
            ready = stage == 4
            bunch_colour = "grape_body" if ready else "pumpkin_green"
            anchors = (
                [(top[0] - 0.13, -0.13, 0.64),
                 (top[0] + 0.13, -0.13, 0.60)]
                if ready
                else [(top[0], -0.13, 0.60)]
            )
            for anchor in anchors:
                _grape_bunch(b, stem_colour, bunch_colour, anchor, ready)
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
        leaves = {1: 4, 2: 5, 3: 6, 4: 4}[stage]
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
        if stage == 4:
            b.foliage_cluster(
                "cabbage_ready",
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
