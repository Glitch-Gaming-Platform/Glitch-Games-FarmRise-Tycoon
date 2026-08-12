/**
 * The FarmRise procedural PBR surface library.
 *
 * Each entry is a pure function of (u, v) in the unit square returning the
 * five things a PBR surface needs:
 *
 *   band   which palette ramp this pixel belongs to (0..3)
 *   t      position along that ramp, 0 = dark end, 1 = light end
 *   height a scalar field the generator differentiates into a normal map
 *   rough  perceptual roughness
 *   metal  metalness (per-pixel, so rust can stop being metal)
 *
 * Albedo is authored as *ramps between palette anchors* rather than free RGB.
 * That is a deliberate constraint: docs/ART_DIRECTION.md says no colour may be
 * invented outside tools/blender/palette.py, and moving to realism is not a
 * reason to abandon the one rule that keeps ground, crop and structure
 * readable. Realism arrives through relief, roughness and spatial frequency;
 * hue stays where the art direction put it.
 *
 * `tile` is the physical size of one repeat in metres. It is the number that
 * decides whether a texture reads as ground or as wallpaper, so it lives here
 * next to the pattern rather than being guessed at the call site.
 */
import {
  band,
  clamp01,
  fbm,
  hash2,
  mix,
  ridged,
  smoothstep,
  streak,
  valueNoise,
  warp,
  worley,
} from './noise.mjs';

// Palette anchors, copied from tools/blender/palette.py. Duplicated rather
// than parsed because this is a Node script and that is a Python module; the
// generator asserts nothing about them, but check_palette.py is the authority
// if they ever disagree.
const P = {
  soil_tilled: '#A34A2B',
  soil_wet: '#7E3620',
  soil_dry: '#B9603A',
  soil_edge: '#8F3E25',
  ground_scrub: '#C9A227',
  ground_scrub_dark: '#BE9828',
  ground_scrub_pale: '#D9B84A',
  ground_scrub_sun: '#E6C85D',
  rock: '#8A8378',
  rock_shadow: '#6B655C',
  sand_path: '#C9B896',
  sand_stone: '#B0A083',
  tree_leaf_dark: '#386A31',
  tree_leaf_light: '#86AE43',
  tree_dead_bark: '#8E806F',
  tree_dead_bark_light: '#B3A38D',
  timber_light: '#B88450',
  timber_warm: '#9C6B3F',
  timber_dark: '#6E4A2A',
  wall_teal: '#3F7A82',
  wall_teal_light: '#5D9399',
  wall_teal_dark: '#2E5C63',
  roof_grey: '#8C9BA5',
  roof_grey_light: '#AEBAC1',
  roof_grey_dark: '#6E7C86',
  metal_galv: '#A9B4BA',
  metal_dark: '#7C878D',
  trim_white: '#EDE7DA',
  shirt_blue: '#6FA3D4',
  shirt_blue_dark: '#4C78A7',
  fox_body: '#D0602A',
  fox_dark: '#8A4A22',
  chicken_body: '#F5EFE3',
  cow_patch: '#51463E',
  straw_hat: '#E0BC6A',
};

/**
 * The library.
 *
 * `roles` maps onto RenderPipeline.registerMaterial roles so a consumer does
 * not have to guess whether bark is foliage or structure.
 */
export const MATERIALS = [
  {
    id: 'soil_dry_cracked',
    role: 'terrain',
    size: 256,
    tile: 2.0,
    relief: 0.05,
    bands: [
      [P.soil_edge, P.soil_dry],
      [P.soil_wet, P.soil_tilled],
      // Pebbles stay in the warm family. The first version used the cool rock
      // ramp and the contact sheet showed why that was wrong: against red clay
      // a grey-blue speck reads as dirt on the lens, not as a stone.
      [P.soil_edge, P.sand_stone],
    ],
    summary: 'Baked outback clay broken into plates. The default ground under everything.',
    sample(u, v) {
      const [wu, wv] = warp(u, v, 3, 0.09, 4001);
      // Plates from a cellular field: f2 - f1 is near zero exactly on a cell
      // boundary, which is where a drying clay pan cracks.
      //
      // Ten cells over 2.0 m, not seven over 2.4 m. In frame the first version
      // produced plates most of a metre across with cracks a hand's width
      // wide, which reads as a stylised motif rather than as ground - the
      // single loudest error in the first terrain capture.
      const cells = worley(wu, wv, 10, 4002, 0.9);
      const seam = clamp01((cells.f2 - cells.f1) * 10);
      const crack = 1 - smoothstep(0.0, 0.1, seam);
      const deepCrack = 1 - smoothstep(0.0, 0.045, seam);

      const dome = smoothstep(0.0, 0.09, cells.f1);
      const grit = fbm(u, v, 24, 3, 4003);
      const dust = fbm(u, v, 5, 3, 4004);
      const pebble = worley(u, v, 22, 4005, 0.95);
      // Only about a fifth of the cells hold a stone. Making every cell a
      // pebble is what turns a gravel field into confetti.
      const pebbleMask = pebble.id > 0.78 ? 1 - smoothstep(0.008, 0.016, pebble.f1) : 0;

      let height = 0.52 + dome * 0.3 + (grit - 0.5) * 0.1 + (dust - 0.5) * 0.22;
      height -= crack * 0.2 + deepCrack * 0.24;
      height += pebbleMask * 0.16;

      // Plate identity: each plate gets its own dryness so the pan reads as
      // many pieces rather than one noisy surface.
      const plateTone = cells.id;
      let t = 0.34 + dust * 0.42 + plateTone * 0.24 + (grit - 0.5) * 0.16;
      // Cracks are a shadow, not a paint colour. Darkening them by 0.45 of the
      // whole ramp turned a soil texture into a black web at gameplay
      // distance; the cavity AO the generator bakes in is already doing most
      // of this job, and doing it with the right falloff.
      t -= crack * 0.18;

      let bandIndex = 0;
      if (deepCrack > 0.62) bandIndex = 1;
      if (pebbleMask > 0.5) bandIndex = 2;

      const rough = 0.94 - pebbleMask * 0.16 - crack * 0.05;
      return { band: bandIndex, t: clamp01(t), height: clamp01(height), rough, metal: 0 };
    },
  },

  {
    id: 'soil_tilled',
    role: 'terrain',
    size: 256,
    tile: 1.6,
    relief: 0.085,
    bands: [
      [P.soil_wet, P.soil_tilled],
      [P.soil_tilled, P.soil_dry],
      [P.soil_edge, P.timber_warm],
    ],
    summary: 'Worked bed soil: hoe furrows, broken clods, damp in the trough and dry on the crest.',
    sample(u, v) {
      // Furrows run along +u. The sine phase is warped so the rows wander the
      // way hand-hoed rows do; a perfectly straight row reads as corduroy.
      const wobble = (fbm(u, v, 3, 3, 5001) - 0.5) * 0.16 + (fbm(u, v, 9, 2, 5002) - 0.5) * 0.05;
      const furrow = band(v + wobble, 5);
      const crest = smoothstep(0.25, 0.95, furrow);

      const clods = worley(u, v, 16, 5003, 0.95);
      const clodMask = 1 - smoothstep(0.01, 0.03, clods.f1);
      const clumps = ridged(u, v, 10, 3, 5004);
      const grit = fbm(u, v, 30, 2, 5005);

      let height = crest * 0.52 + clodMask * 0.24 + clumps * 0.18 + (grit - 0.5) * 0.1;

      // Damp soil sits in the trough where water collects; the crest is where
      // the sun gets to it. That correlation is what makes tilled soil legible.
      let t = 0.22 + crest * 0.5 + clods.id * 0.2 + (grit - 0.5) * 0.14 + clumps * 0.12;
      const bandIndex = crest > 0.45 ? 1 : clodMask > 0.6 ? 2 : 0;

      const rough = 0.97 - crest * 0.07;
      return { band: bandIndex, t: clamp01(t), height: clamp01(height), rough, metal: 0 };
    },
  },

  {
    id: 'grass_dry',
    role: 'foliage',
    size: 256,
    tile: 1.9,
    relief: 0.05,
    bands: [
      [P.timber_dark, P.ground_scrub_dark],
      [P.ground_scrub, P.ground_scrub_sun],
      [P.tree_leaf_dark, P.tree_leaf_light],
    ],
    summary: 'Sun-cured tussock over leaf litter, with the few blades that stayed green.',
    sample(u, v) {
      // Two crossed streak fields so the sward is not a single combed
      // direction; clumps choose which one dominates locally.
      const clump = fbm(u, v, 3, 3, 6001);
      // Sharpened: `streak` returns a smooth 0..1 field, and a smooth field of
      // grass reads as a yellow blur. Pushing it through a contrast curve is
      // what turns it into individual blades that survive the mip chain.
      const sharpen = (n) => clamp01((n - 0.5) * 2.1 + 0.5);
      const bladesA = sharpen(streak(u, v, 110, 24, 6002, 3));
      const bladesB = sharpen(streak(v, u, 96, 22, 6003, 3));
      const blades = mix(bladesA, bladesB, smoothstep(0.35, 0.7, clump));
      const litter = fbm(u, v, 12, 3, 6004);
      const tuft = smoothstep(0.35, 0.82, clump * 0.6 + blades * 0.55);

      const height = clamp01(0.16 + blades * 0.6 + tuft * 0.32 + (litter - 0.5) * 0.16);

      // Live green survives only in the densest, most shaded tuft cores. That
      // is both true of a dry paddock and the cheapest way to keep the green
      // sparse enough not to fight the crops for the eye.
      const green = smoothstep(0.66, 0.82, clump) * smoothstep(0.4, 0.7, blades);
      const bare = 1 - smoothstep(0.14, 0.36, blades * 0.55 + clump * 0.55);

      let bandIndex = 1;
      if (green > 0.42) bandIndex = 2;
      else if (bare > 0.5) bandIndex = 0;

      const t = clamp01(0.1 + blades * 0.82 + (litter - 0.5) * 0.34 + tuft * 0.16);
      const rough = 0.88 - green * 0.1;
      return { band: bandIndex, t, height, rough, metal: 0 };
    },
  },

  {
    id: 'scrub_gravel',
    role: 'terrain',
    size: 256,
    tile: 2.2,
    relief: 0.06,
    bands: [
      [P.ground_scrub_dark, P.ground_scrub_sun],
      // Gibber stone, weathered warm rather than the cool `rock` ramp: this is
      // desert-varnished quartzite lying on gold dust, not granite scree.
      [P.sand_stone, P.sand_path],
      [P.soil_edge, P.soil_dry],
      [P.timber_dark, P.timber_warm],
    ],
    summary: 'Stony scrub floor: dust, gibber pebbles, exposed clay and dropped twigs.',
    sample(u, v) {
      const dust = fbm(u, v, 6, 4, 7001);
      const grit = fbm(u, v, 32, 2, 7002);

      // Both stone scales are sparse. The first pass made every cell a pebble
      // at two frequencies at once, which covered the ground in speckle and
      // destroyed the broad dust masses the terrain blend depends on.
      const small = worley(u, v, 18, 7003, 0.95);
      const smallMask = small.id > 0.7 ? 1 - smoothstep(0.01, 0.019, small.f1) : 0;
      const large = worley(u, v, 8, 7004, 0.9);
      const largeMask = large.id > 0.78 ? 1 - smoothstep(0.02, 0.038, large.f1) : 0;
      const stone = clamp01(smallMask * 0.85 + largeMask);

      const twig = smoothstep(0.86, 0.95, streak(u, v, 6, 90, 7005, 2));
      const clay = smoothstep(0.62, 0.8, fbm(u, v, 3, 3, 7006)) * (1 - stone);

      const height = clamp01(
        0.42 + (dust - 0.5) * 0.3 + stone * 0.34 + twig * 0.12 + (grit - 0.5) * 0.12,
      );

      let bandIndex = 0;
      if (stone > 0.45) bandIndex = 1;
      else if (twig > 0.5) bandIndex = 3;
      else if (clay > 0.5) bandIndex = 2;

      const t = clamp01(
        0.3 +
          dust * 0.45 +
          (grit - 0.5) * 0.2 +
          (stone > 0.45 ? large.id * 0.35 + small.id * 0.2 : 0),
      );
      const rough = 0.93 - stone * 0.22;
      return { band: bandIndex, t, height, rough, metal: 0 };
    },
  },

  {
    id: 'bark_eucalyptus',
    role: 'foliage',
    size: 256,
    tile: 1.1,
    relief: 0.09,
    bands: [
      [P.tree_dead_bark, P.tree_dead_bark_light],
      [P.timber_dark, P.timber_warm],
      [P.soil_edge, P.soil_dry],
    ],
    summary: 'Smooth eucalypt trunk with ribbons of bark peeling off orange fresh wood.',
    sample(u, v) {
      // Vertical everything: the strands run along v, so the along-period is
      // small and the across-period large.
      const strands = streak(u, v, 4, 46, 8001, 3);
      const ribbonField = streak(u, v, 3, 14, 8002, 2);
      const tear = fbm(u, v, 7, 3, 8003);

      // A ribbon is a vertical strip that has peeled away below a torn edge.
      const ribbon = smoothstep(0.52, 0.62, ribbonField);
      const peelEdge = smoothstep(0.46, 0.56, tear) * ribbon;
      const fresh = ribbon * smoothstep(0.5, 0.75, tear);

      const height = clamp01(
        0.5 + (strands - 0.5) * 0.5 + ribbon * 0.22 - peelEdge * 0.3 + (tear - 0.5) * 0.16,
      );

      let bandIndex = 0;
      if (fresh > 0.4) bandIndex = 2;
      else if (ribbon > 0.5) bandIndex = 1;

      const t = clamp01(0.24 + strands * 0.6 + (tear - 0.5) * 0.32);
      const rough = 0.9 - fresh * 0.18;
      return { band: bandIndex, t, height, rough, metal: 0 };
    },
  },

  {
    id: 'timber_painted',
    role: 'structure',
    size: 256,
    tile: 1.0,
    relief: 0.05,
    bands: [
      [P.wall_teal_dark, P.wall_teal_light],
      [P.timber_dark, P.timber_light],
      [P.trim_white, P.trim_white],
    ],
    summary: 'Painted weatherboard: board grooves, brush grain, and paint chipped back to timber.',
    sample(u, v) {
      const drift = (fbm(u, v, 3, 2, 9001) - 0.5) * 0.025;
      // Three boards per metre: real weatherboard is 30-35 cm to the weather.
      // Four read as narrow slats and made the wall look knitted.
      const boards = band(v + drift, 3);
      const groove = 1 - smoothstep(0.0, 0.1, Math.abs(boards - 0.5) * 2 - 0.86);
      const boardId = valueNoise(0.5, v + drift, 3, 9002);

      const grain = streak(u, v, 5, 120, 9003, 3);
      const brush = streak(u, v, 3, 60, 9004, 2);

      const wear = fbm(u, v, 5, 4, 9005);
      // Chipping is an accent. At the previous threshold roughly a third of the
      // wall was bare timber, which read as orange dashes on teal rather than
      // as paint that has failed in a few places.
      const chip = smoothstep(0.78, 0.86, wear * 0.8 + (1 - boards) * 0.22);

      const height = clamp01(
        0.62 - groove * 0.55 + (grain - 0.5) * 0.14 - chip * 0.1 + (brush - 0.5) * 0.06,
      );

      const bandIndex = chip > 0.5 ? 1 : 0;
      const t = clamp01(
        0.35 + boardId * 0.18 + (brush - 0.5) * 0.34 + (grain - 0.5) * 0.3 - groove * 0.4,
      );
      const rough = mix(0.58, 0.88, chip) + groove * 0.06;
      return { band: bandIndex, t, height, rough, metal: 0 };
    },
  },

  {
    id: 'metal_corrugated',
    role: 'metal',
    size: 256,
    tile: 1.0,
    relief: 0.11,
    bands: [
      [P.metal_dark, P.metal_galv],
      [P.soil_edge, P.timber_warm],
      [P.rock_shadow, P.trim_white],
    ],
    summary: 'Galvanised corrugated iron with sheet seams, rivets, scratches and rust bloom.',
    sample(u, v) {
      // Corrugations run along v: 8 ribs per metre is real roofing pitch.
      const rib = band(u, 8);
      const ribProfile = rib * rib * (3 - 2 * rib);
      const seam = 1 - smoothstep(0.0, 0.05, Math.abs(((v * 2) % 1) - 0.5) * 2 - 0.88);

      const rivetU = ((u * 8) % 1) - 0.5;
      const rivetV = ((v * 12) % 1) - 0.5;
      const onRibCrest = smoothstep(0.75, 0.95, rib);
      const rivet = (1 - smoothstep(0.06, 0.13, Math.hypot(rivetU, rivetV))) * onRibCrest;

      const scratches = smoothstep(0.88, 0.97, streak(u, v, 8, 150, 10001, 2));
      const rustField = fbm(u, v, 5, 4, 10002);
      // Rust starts at the sheet seams and in the corrugation troughs, because
      // that is where the water sits. The threshold is high on purpose: the
      // first pass put rust over most of the sheet, and a farm shed that is
      // three-quarters rust reads as derelict rather than as working galvanised
      // iron. It is now a bloom in the laps, not the base material.
      const rust = smoothstep(0.82, 0.93, rustField * 0.78 + seam * 0.2 + (1 - ribProfile) * 0.12);
      const speck = smoothstep(0.72, 0.9, fbm(u, v, 40, 2, 10003)) * rust;

      const height = clamp01(
        0.2 + ribProfile * 0.66 + rivet * 0.2 - seam * 0.1 + rust * 0.06 - scratches * 0.04,
      );

      let bandIndex = 0;
      if (rust > 0.45) bandIndex = 1;
      else if (scratches > 0.5) bandIndex = 2;

      // The rib itself carries most of the value range. Galvanised iron is
      // almost featureless in albedo; what makes it read is the corrugation
      // catching the sky at a different angle every 12 centimetres.
      const t = clamp01(
        0.16 + ribProfile * 0.62 + scratches * 0.24 + speck * 0.26 - seam * 0.18 + rivet * 0.1,
      );
      // Metalness is per-pixel precisely so rust can stop being metal. A single
      // scalar would either make the rust look chrome or the iron look chalk.
      const metal = mix(0.92, 0.06, rust);
      const rough = mix(0.34, 0.86, rust) + scratches * 0.12;
      return { band: bandIndex, t, height, rough, metal };
    },
  },

  {
    id: 'roof_shingle',
    role: 'structure',
    size: 256,
    tile: 1.2,
    relief: 0.075,
    bands: [
      [P.roof_grey_dark, P.roof_grey_light],
      [P.cow_patch, P.roof_grey],
      [P.tree_leaf_dark, P.ground_scrub_dark],
    ],
    summary:
      'Staggered shingle courses with per-tile weathering, granule tooth and moss in the laps.',
    sample(u, v) {
      // Wider than tall, which is what separates a shingle from a brick. The
      // first pass was 5 across by 6 down and read unmistakably as brickwork.
      const courses = 8;
      const row = Math.floor(v * courses);
      const inRow = v * courses - row;
      const stagger = (row % 2) * 0.5;
      const perRow = 4;
      const shifted = u * perRow + stagger;
      const col = Math.floor(shifted);
      const inCol = shifted - col;

      // Hashed directly on the wrapped cell index. Sampling a noise field whose
      // lattice period did not match the course count was the one genuine
      // tiling bug the analytic wrap test found.
      const id = hash2(
        ((col % perRow) + perRow) % perRow,
        ((row % courses) + courses) % courses,
        11001,
      );
      const lap = 1 - smoothstep(0.0, 0.14, inRow);
      const gap = 1 - smoothstep(0.0, 0.03, Math.min(inCol, 1 - inCol));

      const granule = fbm(u, v, 46, 2, 11002);
      const weather = fbm(u, v, 6, 3, 11003);
      // Moss only where two laps meet and only in the wettest sixth of the
      // roof. At the first threshold it lined every joint and turned the whole
      // thing into grey brickwork with green grout.
      const moss = smoothstep(0.9, 0.97, weather * 0.55 + lap * gap * 0.55);

      const height = clamp01(
        0.28 + inRow * 0.44 - lap * 0.42 - gap * 0.44 + (granule - 0.5) * 0.16 + id * 0.1,
      );

      let bandIndex = 0;
      if (moss > 0.5) bandIndex = 2;
      else if (lap > 0.5 || gap > 0.5) bandIndex = 1;

      const t = clamp01(
        0.2 +
          id * 0.46 +
          inRow * 0.26 +
          (granule - 0.5) * 0.3 -
          lap * 0.34 -
          gap * 0.38 -
          weather * 0.1,
      );
      const rough = 0.9 + (granule - 0.5) * 0.08 - moss * 0.05;
      return { band: bandIndex, t, height, rough, metal: 0 };
    },
  },

  {
    id: 'cloth_canvas',
    role: 'cloth',
    size: 128,
    tile: 0.45,
    relief: 0.02,
    bands: [
      [P.sand_stone, P.trim_white],
      [P.shirt_blue_dark, P.shirt_blue],
      [P.timber_dark, P.sand_stone],
    ],
    summary: 'Plain-weave canvas: warp over weft, fibre fuzz, a woven stripe and worn grime.',
    sample(u, v) {
      const threads = 22;
      const warpPhase = band(u, threads);
      const weftPhase = band(v, threads);
      // Over-under: whichever thread is on top at this pixel catches the light.
      const over = warpPhase > weftPhase ? 1 : 0;
      const crossing = over ? warpPhase : weftPhase;
      const fuzz = fbm(u, v, 60, 2, 12001);
      const soil = fbm(u, v, 4, 3, 12002);
      // One narrow woven stripe per repeat. Three broad ones read as a beach
      // towel, which is a strong identity for a texture meant to be reused for
      // sacks, awnings and shirts.
      const stripe = smoothstep(0.985, 0.997, band(v, 1));

      const height = clamp01(0.4 + crossing * 0.42 + (fuzz - 0.5) * 0.2);
      // Grime darkens the ramp; it is no longer its own band. As a band it
      // produced brown blobs that read as stains on a bedsheet, because a band
      // switch is a hard edge and dirt does not have hard edges.
      const bandIndex = stripe > 0.5 ? 1 : 0;

      const t = clamp01(0.34 + crossing * 0.46 + (fuzz - 0.5) * 0.26 - (1 - soil) * 0.22);
      const rough = 0.92 - crossing * 0.06;
      return { band: bandIndex, t, height, rough, metal: 0 };
    },
  },

  {
    id: 'fur_short',
    role: 'skin',
    size: 128,
    tile: 0.3,
    relief: 0.03,
    bands: [
      [P.fox_dark, P.fox_body],
      [P.timber_dark, P.chicken_body],
      [P.cow_patch, P.straw_hat],
    ],
    summary: 'Short animal coat: clumped strands over a darker undercoat, plus a pale-belly ramp.',
    sample(u, v) {
      // Two clump scales. The pale marking follows the coarse one, so a belly
      // patch is a region; the fine one only breaks up the coat. Driving the
      // pale band from the fine field made the fox look flecked with paint.
      const patch = fbm(u, v, 2, 2, 13004);
      const clump = fbm(u, v, 5, 3, 13001);
      // Strands lie along v and clump into locks; the lock boundaries are what
      // reads as fur rather than as brushed metal.
      const strands = streak(u, v, 20, 90, 13002, 3);
      const locks = streak(u, v, 6, 22, 13003, 2);
      const tip = smoothstep(0.55, 0.9, strands * 0.7 + locks * 0.45);

      const height = clamp01(0.34 + strands * 0.4 + locks * 0.3 + (clump - 0.5) * 0.2);
      const pale = smoothstep(0.6, 0.72, patch);
      const bandIndex = pale > 0.5 ? 1 : 0;
      const t = clamp01(0.18 + strands * 0.5 + tip * 0.34 + (clump - 0.5) * 0.3);
      const rough = 0.82 + (1 - tip) * 0.1;
      return { band: bandIndex, t, height, rough, metal: 0 };
    },
  },
];
