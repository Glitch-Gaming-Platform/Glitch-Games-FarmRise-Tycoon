/**
 * The Ultra-tier textured ground.
 *
 * The terrain was a vertex-coloured plane: correct hue, correct large-scale
 * composition, and no surface. It occupies most of the frame at the gameplay
 * camera, so "the ground has no surface" was the single largest realism gap in
 * the game. This module is the answer, and it is built on three decisions.
 *
 * **1. It extends `MeshStandardMaterial` rather than replacing it.** A custom
 * `ShaderMaterial` would have to re-implement PCSS shadows, the PMREM
 * environment, `FogExp2` and the AgX pipeline, and it would silently drift from
 * them on the next three.js upgrade. `onBeforeCompile` keeps every one of those
 * for free and confines the new code to three chunk overrides.
 *
 * **2. Texture supplies variation, not colour.** The blended albedo is divided
 * by its own mean before being multiplied into the existing vertex colour, so
 * the mean of the multiplier is one. The palette still owns hue - which is what
 * `npm run art:check` audits, what keeps a ready crop separable from the soil it
 * stands on, and what `docs/ART_DIRECTION.md` calls the organising rule. What
 * the texture adds is the thing the audit cannot measure: spatial frequency,
 * and a normal map for the sun to rake across.
 *
 * **3. The geometry does not move.** Relief is entirely in the normal map. The
 * playable grid stays mathematically flat because collision is a 2D grid and
 * every placement preview assumes y = 0. A displaced terrain would look better
 * in a screenshot and break the game.
 *
 * Planar world-space UVs, not triplanar. Triplanar costs three times the
 * samples to solve a problem this terrain does not have: the playable area is
 * exactly flat, and the border relief tops out around eight degrees, where
 * planar stretch is smaller than the mip transition next to it.
 */
import * as THREE from 'three';
import type { SurfaceLibrary, SurfaceMaps } from '@assets/registries/SurfaceLibrary.js';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';

export interface TerrainLayerSet {
  /** Everything that is not grass or bare earth: dry gold scrub. */
  readonly base: SurfaceMaps;
  /** Pasture and lush patches. */
  readonly grass: SurfaceMaps;
  /** Exposed clay, the farmyard and worn desire lines. */
  readonly earth: SurfaceMaps;
}

/**
 * Picks the three terrain layers out of the library.
 *
 * Returns null unless all three arrived. A blend with a missing layer is not a
 * graceful degradation - it is a farm with a hole in it - and the fallback
 * (the vertex-coloured material the game already shipped) is a complete look.
 */
export function resolveTerrainLayers(surfaces: SurfaceLibrary | null): TerrainLayerSet | null {
  const base = surfaces?.get('scrub_gravel') ?? null;
  const grass = surfaces?.get('grass_dry') ?? null;
  const earth = surfaces?.get('soil_dry_cracked') ?? null;
  if (!base || !grass || !earth) return null;
  return { base, grass, earth };
}

export interface TerrainMaterialHandle {
  readonly material: THREE.MeshStandardMaterial;
  /** Runtime tuning hooks, used by the review harness. */
  setTextureAmount(value: number): void;
  setNormalStrength(value: number): void;
  dispose(): void;
}

const SRGB_TO_LINEAR = /* glsl */ `
vec3 farmSrgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
`;

/**
 * Builds the layered ground material.
 *
 * `aTerrain` carries (pasture, earth, worn) per vertex - the same three fields
 * `groundGeometry.ts` already used to choose the vertex colour. Deriving the
 * texture blend from the identical fields is what stops the classic terrain
 * failure where grass grows through a worn track that the colour underneath
 * claims is packed dirt.
 */
export function createTerrainMaterial(
  layers: TerrainLayerSet,
  pipeline: RenderPipeline | null,
  baseColour: number,
): TerrainMaterialHandle {
  const material = new THREE.MeshStandardMaterial({
    color: baseColour,
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
    // Assigning these is what makes three define USE_NORMALMAP_TANGENTSPACE and
    // USE_ROUGHNESSMAP, which in turn gives the overridden chunks below a `tbn`
    // matrix and a `roughnessFactor` to work with. The bound textures
    // themselves are never sampled through three's own UVs - every sample below
    // uses world-space coordinates instead - but the defines are load-bearing.
    normalMap: layers.base.normal,
    roughnessMap: layers.base.orm,
  });
  material.normalScale.set(1, 1);

  const uniforms = {
    tAlbedoBase: { value: layers.base.albedo },
    tNormalBase: { value: layers.base.normal },
    tOrmBase: { value: layers.base.orm },
    tAlbedoGrass: { value: layers.grass.albedo },
    tNormalGrass: { value: layers.grass.normal },
    tOrmGrass: { value: layers.grass.orm },
    tAlbedoEarth: { value: layers.earth.albedo },
    tNormalEarth: { value: layers.earth.normal },
    tOrmEarth: { value: layers.earth.orm },
    uInvTile: {
      value: new THREE.Vector3(
        1 / layers.base.tileMetres,
        1 / layers.grass.tileMetres,
        1 / layers.earth.tileMetres,
      ),
    },
    uMeanBase: { value: layers.base.meanLinear },
    uMeanGrass: { value: layers.grass.meanLinear },
    uMeanEarth: { value: layers.earth.meanLinear },
    /**
     * How much of the texture's variation reaches the albedo.
     *
     * 0.85 was too much. The first capture put a high-contrast crack network
     * across the whole farmyard and the frame went from gold to red-brown,
     * because the multiplier has a mean of one but not a mean *appearance* of
     * one: dark cracks are also hue-shifted, and enough of them shift the
     * average the eye computes. 0.55 keeps the surface and returns the hue.
     */
    uTextureAmount: { value: 0.55 },
    /** Weight of the baked cavity occlusion. */
    uAoAmount: { value: 0.42 },
    /** Weight of the texture's roughness against the material's own. */
    uRoughAmount: { value: 0.8 },
    /** Tangent-space normal strength for the macro layer. */
    uNormalStrength: { value: 1.0 },
    /** Frequency multiplier and strength of the second, finer normal sample. */
    uDetailScale: { value: 4.7 },
    uDetailStrength: { value: 0.45 },
    /**
     * Low-frequency modulation. A texture that repeats every 2.4 m repeats
     * about forty times across the frame, and the eye finds a grid long before
     * it finds a seam. One extra sample of the same texture at a ninth of the
     * frequency breaks the grid up for a cost of one lookup.
     */
    uMacroScale: { value: 0.075 },
    uMacroAmount: { value: 0.72 },
    /**
     * The second, much coarser octave, expressed as a fraction of the first.
     * At 0.11 of an already-low frequency this repeats roughly every 90 m -
     * about one and a half times across the whole visible estate - which is the
     * scale real ground varies at and the scale the foreground was missing.
     */
    uMacroBroadScale: { value: 0.11 },
    uMacroBroadAmount: { value: 0.55 },
    /**
     * Blend contrast. At 1.0 the layers cross-fade and every boundary is a
     * 3-metre-wide smear; raising it tightens the transition without producing
     * the hard cut that a hand-painted mask would.
     */
    uBlendSharpness: { value: 1.7 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aTerrain;
varying vec3 vTerrainWeights;
varying vec2 vTerrainUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTerrainWeights = aTerrain;
// vec2(x, -z) rather than vec2(x, z): PlaneGeometry rotated -90 degrees about
// X sends its +v axis to world -z, and the tangent frame three derives for the
// normal map follows that parameterisation. Matching it here means the green
// channel of every normal map is interpreted with the sign it was written
// with, instead of quietly turning every bump into a dent.
vec4 farmWorld = modelMatrix * vec4(transformed, 1.0);
vTerrainUv = vec2(farmWorld.x, -farmWorld.z);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tAlbedoBase, tNormalBase, tOrmBase;
uniform sampler2D tAlbedoGrass, tNormalGrass, tOrmGrass;
uniform sampler2D tAlbedoEarth, tNormalEarth, tOrmEarth;
uniform vec3 uInvTile, uMeanBase, uMeanGrass, uMeanEarth;
uniform float uTextureAmount, uAoAmount, uRoughAmount, uNormalStrength;
uniform float uDetailScale, uDetailStrength, uMacroScale, uMacroAmount, uBlendSharpness;
uniform float uMacroBroadScale, uMacroBroadAmount;
varying vec3 vTerrainWeights;
varying vec2 vTerrainUv;
${SRGB_TO_LINEAR}
vec3 farmWeights;
vec2 farmUvBase, farmUvGrass, farmUvEarth;
float farmRough;
float farmAo;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float grassW = vTerrainWeights.x;
  // A worn desire line is packed earth, so it feeds the earth layer rather
  // than being a fourth set of samplers for a surface that looks the same.
  // Scaled down, not used raw. localEarth reaches 0.72 across the whole
  // farmyard radius, and at full strength that made bare clay the surface of
  // the entire playable area - which is neither true of the fields it draws
  // nor what the vertex colour underneath is saying.
  float earthW = max(vTerrainWeights.y * 0.78, vTerrainWeights.z);
  vec3 raw = vec3(max(0.0, 1.0 - grassW - earthW), grassW, earthW) + 1e-4;
  raw = pow(raw, vec3(uBlendSharpness));
  farmWeights = raw / (raw.x + raw.y + raw.z);

  farmUvBase = vTerrainUv * uInvTile.x;
  farmUvGrass = vTerrainUv * uInvTile.y;
  farmUvEarth = vTerrainUv * uInvTile.z;

  vec3 aBase = farmSrgbToLinear(texture2D(tAlbedoBase, farmUvBase).rgb) / uMeanBase;
  vec3 aGrass = farmSrgbToLinear(texture2D(tAlbedoGrass, farmUvGrass).rgb) / uMeanGrass;
  vec3 aEarth = farmSrgbToLinear(texture2D(tAlbedoEarth, farmUvEarth).rgb) / uMeanEarth;
  vec3 detail = aBase * farmWeights.x + aGrass * farmWeights.y + aEarth * farmWeights.z;

  // Two macro octaves, and both keep their chroma.
  //
  // The first pass reduced this sample to luminance before applying it, which
  // is why the review shot still read as a painted plane exactly where it
  // matters most. Luminance-only modulation can lighten and darken a surface
  // but it cannot make one patch of earth a different *earth* from the next,
  // so the near field - where a single layer wins the blend outright and the
  // detail texture is too fine to resolve - had nothing left varying in it.
  //
  // Multiplying by the mean-normalised RGB restores that hue movement for the
  // same lookup: the texture's own colour variation survives, and because each
  // albedo is divided by its own mean the average is still 1.0, so the palette
  // continues to own the hue and art:check still audits what ships.
  vec3 macroRgb = farmSrgbToLinear(texture2D(tAlbedoBase, farmUvBase * uMacroScale).rgb) / uMeanBase;
  detail *= mix(vec3(1.0), macroRgb, uMacroAmount);

  // A second octave an order of magnitude coarser, sampled from the earth map
  // and rotated so the two do not beat against each other. This is the one that
  // breaks up the foreground: at roughly 90 m per repeat it puts one or two
  // broad patches across the visible estate rather than a rhythm the eye can
  // lock onto.
  vec2 macroUv = farmUvBase * uMacroScale * uMacroBroadScale;
  macroUv = vec2(macroUv.x * 0.87 - macroUv.y * 0.49, macroUv.x * 0.49 + macroUv.y * 0.87);
  vec3 broadRgb = farmSrgbToLinear(texture2D(tAlbedoEarth, macroUv).rgb) / uMeanEarth;
  detail *= mix(vec3(1.0), broadRgb, uMacroBroadAmount);

  vec4 oBase = texture2D(tOrmBase, farmUvBase);
  vec4 oGrass = texture2D(tOrmGrass, farmUvGrass);
  vec4 oEarth = texture2D(tOrmEarth, farmUvEarth);
  farmRough = dot(vec3(oBase.g, oGrass.g, oEarth.g), farmWeights);
  farmAo = dot(vec3(oBase.r, oGrass.r, oEarth.r), farmWeights);

  diffuseColor.rgb *= mix(vec3(1.0), detail, uTextureAmount);
  diffuseColor.rgb *= mix(1.0, farmAo, uAoAmount);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = mix(roughness, farmRough, uRoughAmount);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
  vec3 nBase = texture2D(tNormalBase, farmUvBase).xyz * 2.0 - 1.0;
  vec3 nGrass = texture2D(tNormalGrass, farmUvGrass).xyz * 2.0 - 1.0;
  vec3 nEarth = texture2D(tNormalEarth, farmUvEarth).xyz * 2.0 - 1.0;
  vec3 mapN = nBase * farmWeights.x + nGrass * farmWeights.y + nEarth * farmWeights.z;

  // A second sample of the dominant layer at ~5x frequency. The macro map
  // gives the ground its form at two metres; this is what stops the last two
  // metres before the camera from going smooth, and it is the difference
  // between "textured" and "made of something".
  vec3 nDetail =
    texture2D(tNormalBase, farmUvBase * uDetailScale).xyz * farmWeights.x +
    texture2D(tNormalGrass, farmUvGrass * uDetailScale).xyz * farmWeights.y +
    texture2D(tNormalEarth, farmUvEarth * uDetailScale).xyz * farmWeights.z;
  mapN.xy += (nDetail.xy * 2.0 - 1.0) * uDetailStrength;

  mapN.xy *= uNormalStrength;
  normal = normalize(tbn * normalize(mapN));
}`,
      );
  };

  // A material that changes its program needs a new cache key, or three will
  // hand it a previously compiled program that has none of the above in it.
  material.customProgramCacheKey = () => 'farmrise-terrain-v1';

  pipeline?.registerMaterial(material, 'terrain');

  return {
    material,
    setTextureAmount(value: number): void {
      uniforms.uTextureAmount.value = value;
    },
    setNormalStrength(value: number): void {
      uniforms.uNormalStrength.value = value;
    },
    dispose(): void {
      pipeline?.unregisterMaterial(material);
      material.dispose();
    },
  };
}
