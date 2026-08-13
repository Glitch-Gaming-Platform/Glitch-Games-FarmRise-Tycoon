"""
FarmRise Tycoon master palette and style constants.

This is the single source of truth for colour in the game. Nothing else -
not a material, not a Three.js constant, not a hex literal in a view class -
may invent a colour. If a colour is not in this file it is not in the game.

Direction: warm hand-painted low-poly, red-ochre outback biome, derived from
the Dinkum-style references. See docs/ART_DIRECTION.md.

The organising principle is a WARM GROUND against COOL STRUCTURE:
  - the earth, the scrub and the crops occupy red -> orange -> gold -> green
  - every player-built structure occupies teal -> blue-grey
That opposition is what makes a building readable the instant it appears on
a field of red soil, without outlines, rim lights or any per-pixel work.
"""

from __future__ import annotations

# --------------------------------------------------------------------------
# Colour
# --------------------------------------------------------------------------

PALETTE: dict[str, str] = {
    # --- Sky ---------------------------------------------------------------
    "sky_blue": "#65BDE7",
    "sky_haze": "#A7D7E8",

    # --- Ground: warm, low chroma, low value spread ------------------------
    # Tilled soil is the single largest surface in frame. It is kept darker
    # and less saturated than every crop so that crops always win the eye.
    "soil_tilled": "#A34A2B",
    "soil_wet": "#7E3620",
    "soil_dry": "#B9603A",
    "soil_edge": "#8F3E25",
    "ground_scrub": "#C9A227",
    "ground_scrub_dark": "#BE9828",
    "ground_scrub_pale": "#D9B84A",
    "ground_scrub_sun": "#E6C85D",
    "rock": "#8A8378",
    "rock_shadow": "#6B655C",
    "sand_path": "#C9B896",
    "sand_stone": "#B0A083",

    # --- Crops: high chroma greens and golds -------------------------------
    # Growth reads as a HUE JOURNEY, not a size journey: bright yellow-green
    # when young, deep green when mature, gold or orange when ready. A player
    # can tell a ready plot from an unready one on colour alone, at any
    # distance, with any level of colour vision.
    "crop_seedling": "#8FD154",
    "crop_leaf_light": "#79C74D",
    "crop_young": "#63AC3E",
    "crop_mature": "#3E8A2E",
    "crop_leaf_dark": "#2F6B24",
    "wheat_ready": "#E8C34A",
    "wheat_head": "#D9A93A",
    "corn_ready": "#F2D24B",
    "corn_husk": "#B7C24A",
    "corn_tassel": "#D6A63A",
    "pumpkin_body": "#FF9440",
    "pumpkin_rib": "#E07826",
    "pumpkin_green": "#4C7A2C",
    "pumpkin_stem": "#4A7C2F",
    "radish_body": "#F05A67",
    "root_tip": "#F3E4CF",
    "pea_pod": "#C9D84C",
    "strawberry_body": "#F15D4D",
    "tomato_body": "#F06443",
    "sunflower_petal": "#F4C845",
    "sunflower_centre": "#68482C",
    "avocado_body": "#B8CF4B",
    "avocado_shadow": "#486B2B",
    "beetroot_body": "#EA7898",
    "cranberry_body": "#EF5B57",
    "grape_body": "#C29ADD",
    "carrot_body": "#F28A38",
    "cabbage_ready": "#C4DB72",
    "garlic_body": "#F0E2C2",
    "orchard_stem": "#76523A",
    "flower_yellow": "#F5D341",
    "diseased": "#8A7B4A",

    # --- Structures: cool, to oppose the warm ground -----------------------
    "wall_teal": "#3F7A82",
    "wall_teal_light": "#5D9399",
    "wall_teal_dark": "#2E5C63",
    "trim_white": "#EDE7DA",
    "roof_grey": "#8C9BA5",
    "roof_grey_light": "#AEBAC1",
    "roof_grey_dark": "#6E7C86",
    "window_blue": "#83C4D1",
    "timber_light": "#B88450",
    "timber_warm": "#9C6B3F",
    "timber_dark": "#6E4A2A",
    "metal_galv": "#A9B4BA",
    "metal_dark": "#7C878D",
    "water_teal": "#4FB3C4",
    "water_deep": "#2E8C9C",

    # --- Character ---------------------------------------------------------
    "skin": "#F2C9A0",
    "skin_shadow": "#D9A87E",
    "skin_blush": "#E69E83",
    "hair_brown": "#5A3C28",
    "hair_highlight": "#765039",
    "eye_dark": "#2A2420",
    "eye_white": "#F7F3EA",
    "brow_brown": "#4A3020",
    "mouth_dark": "#8A4A44",
    "blush": "#E8A98F",
    "shirt_blue": "#6FA3D4",
    "shirt_blue_dark": "#4C78A7",
    "shirt_stripe": "#EDE7DA",
    "scarf_red": "#D45C42",
    "pants_denim": "#3B4A6B",
    "boot_leather": "#6E4A2A",
    "straw_hat": "#E0BC6A",
    "straw_hat_band": "#9C6B3F",

    # --- Animals -----------------------------------------------------------
    "chicken_body": "#F5EFE3",
    "chicken_wing": "#E2D8C6",
    "chicken_comb": "#D9422E",
    "chicken_beak": "#F0A83C",
    "fox_body": "#D0602A",
    "fox_belly": "#F5EBDC",
    "fox_dark": "#8A4A22",
    "cow_hide": "#E7DFD1",
    "cow_patch": "#51463E",
    "cow_muzzle": "#D9A39A",
    "cow_udder": "#E7AAA5",
    "cow_hoof": "#44372F",
    "cow_horn": "#D8C7A2",
    "sheep_wool": "#F1E8D6",
    "sheep_wool_shadow": "#D2C5AE",
    "sheep_face": "#5B5149",
    "sheep_inner_ear": "#C78F88",
    "sheep_hoof": "#3D342F",

    # --- Environment dressing --------------------------------------------
    # Trees and flowers are still built from broad colour masses rather than
    # surface detail. The three foliage values let a single convex crown read
    # as hand-painted volume under the same one-key light as the rest of the
    # farm, without textures or a second material.
    "tree_trunk": "#806044",
    "tree_trunk_light": "#A57A55",
    "tree_dead_bark": "#8E806F",
    "tree_dead_bark_light": "#B3A38D",
    "tree_leaf_dark": "#386A31",
    "tree_leaf_mid": "#5E8F3A",
    "tree_leaf_light": "#86AE43",
    "flower_white": "#F5F1E5",
    "flower_blue": "#64B5D2",
}

# Colours that may legally appear on a crop. Used by the palette audit to
# catch a crop that has drifted into structure colours (or vice versa).
CROP_COLOURS = {
    "crop_seedling", "crop_leaf_light", "crop_young", "crop_mature", "crop_leaf_dark",
    "wheat_ready", "wheat_head", "corn_ready", "corn_husk",
    "corn_tassel", "pumpkin_body", "pumpkin_rib", "pumpkin_green", "pumpkin_stem",
    "radish_body", "root_tip", "pea_pod", "strawberry_body", "tomato_body",
    "sunflower_petal", "sunflower_centre", "avocado_body", "avocado_shadow",
    "beetroot_body", "cranberry_body", "grape_body", "carrot_body",
    "cabbage_ready", "garlic_body", "orchard_stem", "flower_yellow", "diseased",
}
STRUCTURE_COLOURS = {
    "wall_teal", "wall_teal_light", "wall_teal_dark", "trim_white",
    "roof_grey", "roof_grey_light", "roof_grey_dark", "window_blue",
    "timber_light", "timber_warm", "timber_dark", "metal_galv", "metal_dark",
    "water_teal", "water_deep", "sand_path", "sand_stone",
}

# --------------------------------------------------------------------------
# Scale
# --------------------------------------------------------------------------
# One tile is 2 metres, matching TileGrid's tileSize in the engine. Every
# asset is authored at true world scale in metres so that nothing is ever
# scaled at runtime - a runtime scale is how a game ends up with inconsistent
# normals and a character who is subtly the wrong size next to a doorway.

TILE_SIZE = 2.0
PLOT_FOOTPRINT = TILE_SIZE * 0.9          # crops must not overhang the plot
PLAYER_HEIGHT = 1.6                        # chibi, 4 heads
PLAYER_HEAD = PLAYER_HEIGHT / 4.0
DOOR_HEIGHT = 1.9                          # a 1.6 m character must fit through

# The framing the art is judged from, and the only view that decides whether
# it works. These MUST match GAMEPLAY_CAMERA in
# apps/game/src/game/rules/sessionRules.ts - otherwise the review renders
# judge a shot the engine never shows. A unit test on the TypeScript side
# parses this file and fails if the two drift apart.
GAMEPLAY_REVIEW_DISTANCE = 13.25
GAMEPLAY_REVIEW_PITCH_DEGREES = 34.0
GAMEPLAY_REVIEW_FOV_DEGREES = 42.0
GAMEPLAY_REVIEW_YAW_DEGREES = -42.0

# --------------------------------------------------------------------------
# Form language
# --------------------------------------------------------------------------

BEVEL_WIDTH = 0.02        # metres. Nothing in this game has a razor edge.
BEVEL_SEGMENTS = 2
SMOOTH_ANGLE = 0.610865   # 35 degrees, in radians

# Triangle budgets, enforced by the build script. These are deliberately
# tight: the farm draws six plots, several buildings, a character and up to
# three foxes simultaneously on a mid-range phone.
TRI_BUDGET = {
    # A crop asset is a WHOLE PLOT BED - every plant on a 1.8 m tile in one
    # mesh - not a single plant. Raised from 320 after the first silhouette
    # review showed a lone plant on a 1.8 m bed reading as a few scratches at
    # gameplay distance. One bed mesh also replaces what would otherwise be
    # 6-24 separate plant draws, so this is cheaper overall, not costlier.
    "crop": 900,
    "building": 900,
    # The ULTRA player is the only always-visible hero mesh. The final
    # 3,500-triangle ceiling funds dialogue-grade face, hand, boot and joint
    # ceiling funds readable face, hand and boot construction at the shipping
    # camera while remaining one skinned draw call. Low quality continues to
    # use the immutable legacy character pack.
    "character": 3500,
    "animal": 700,
    "prop": 300,
}

# --------------------------------------------------------------------------
# Colour conversion
# --------------------------------------------------------------------------


def hex_to_srgb(value: str) -> tuple[float, float, float]:
    """'#RRGGBB' -> 0..1 sRGB floats."""
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def srgb_to_linear(channel: float) -> float:
    """
    sRGB -> linear.

    glTF stores COLOR_0 in LINEAR space, and Blender's FLOAT_COLOR attributes
    are linear too. Authoring in hex (which is sRGB) and writing it straight
    into a float colour attribute is the single most common way to end up
    with washed-out, milky vertex colours in the engine.
    """
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def linear_rgba(name: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Palette name -> linear RGBA, ready for a Blender colour attribute."""
    if name not in PALETTE:
        raise KeyError(
            f"'{name}' is not in the FarmRise palette. "
            f"Add it to tools/blender/palette.py rather than inlining a hex value."
        )
    r, g, b = hex_to_srgb(PALETTE[name])
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def relative_luminance(name: str) -> float:
    """WCAG relative luminance, used by the value-separation audit."""
    r, g, b = (srgb_to_linear(c) for c in hex_to_srgb(PALETTE[name]))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def value_contrast(a: str, b: str) -> float:
    """
    WCAG contrast ratio between two palette entries, 1.0 (identical) to 21.0.

    Used to prove that a ready crop separates from the soil it stands on
    even for a player with monochromacy - the rubric requires >= 1.6 for any
    gameplay-critical foreground/background pair.
    """
    la, lb = relative_luminance(a), relative_luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)
