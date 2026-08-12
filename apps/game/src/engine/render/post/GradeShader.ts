/**
 * Display-referred colour grading and vignette, in one pass.
 *
 * This pass exists to settle an old argument. The project banned tone mapping
 * because ACES rolls the gold of ready wheat towards white and the orange of a
 * ripe pumpkin towards brown, and those two hues are *gameplay signals* - a
 * player reads "harvest me" from colour at twenty metres. That objection was
 * correct about ACES and wrong about tone mapping: the fix is not to skip the
 * transform, it is to put a grade after it that pays the chroma back.
 *
 * So: AgX (or ACES) compresses the range, and this pass re-saturates, with the
 * gain weighted towards the hues the design depends on. Two weights, both
 * cheap and both readable:
 *
 *   warmth = r - max(g, b)   -> gold, orange, red soil, terracotta
 *   growth = g - max(r, b)   -> young crop green, pasture
 *
 * A ready wheat plot gets a large `warmth`, so it gets most of the boost. Sky,
 * shadow and grey timber have neither weight, so they keep their tone-mapped
 * neutrality and the image does not turn into a postcard.
 *
 * Everything happens after decoding back to linear and is re-encoded at the
 * end, because saturation arithmetic on gamma-encoded values darkens as it
 * saturates and that error is exactly what makes cheap grades look muddy.
 */
import * as THREE from 'three';

export const GradeShader = {
  name: 'FarmRiseGradeShader',

  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    // Tuned against a side-by-side of the two tiers at the gameplay camera.
    // The first pass under-corrected: AgX plus an image-based ambient term
    // returned correct *lighting* but a visibly muddier *image* than the flat
    // path it replaced - the pasture band went olive and the scatter props went
    // teal, which is the warm/cool split the art direction is built on. These
    // values restore the low tier's vibrancy without the fluorescent result
    // that a naive saturation push produces on this palette.
    /** Global saturation, applied to everything. 1 is a no-op. */
    saturation: { value: 1.1 },
    /** Extra saturation for warm hues, scaled by how warm the pixel is. */
    warmGain: { value: 0.62 },
    /** Extra saturation for foliage greens. */
    growthGain: { value: 0.46 },
    /** S-curve strength around the pivot. 0 is a no-op. */
    contrast: { value: 0.19 },
    /** Pivot for the contrast curve, in linear light. */
    pivot: { value: 0.2 },
    /** Multiplicative white balance, linear. */
    gain: { value: new THREE.Vector3(1.015, 1.0, 0.975) },
    /** Additive shadow lift, linear. Keeps AO and shadow from crushing to black. */
    lift: { value: new THREE.Vector3(0.006, 0.0075, 0.011) },
    /** 0 disables the vignette. */
    vignette: { value: 0.28 },
    /** Radius at which the vignette starts, in normalised screen units. */
    vignetteStart: { value: 0.52 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float warmGain;
    uniform float growthGain;
    uniform float contrast;
    uniform float pivot;
    uniform vec3 gain;
    uniform vec3 lift;
    uniform float vignette;
    uniform float vignetteStart;
    varying vec2 vUv;

    const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

    vec3 srgbToLinear( vec3 c ) {
      return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), c ) );
    }

    vec3 linearToSrgb( vec3 c ) {
      c = max( c, vec3( 0.0 ) );
      return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
    }

    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec3 color = srgbToLinear( texel.rgb );

      // Balance and shadow lift first: both are affine, so doing them before
      // the non-linear steps keeps the curve behaving predictably.
      color = color * gain + lift;

      // Contrast as a power curve about a linear-light pivot, not about 0.5 in
      // display space - otherwise mid-greens swing far harder than mid-reds.
      float k = 1.0 + contrast;
      color = pivot * pow( max( color / pivot, vec3( 1e-5 ) ), vec3( k ) );

      float luma = dot( color, LUMA );
      float peak = max( color.r, max( color.g, color.b ) );
      float inv = 1.0 / max( peak, 1e-4 );
      float warmth = clamp( ( color.r - max( color.g, color.b ) ) * inv, 0.0, 1.0 );
      float growth = clamp( ( color.g - max( color.r, color.b ) ) * inv, 0.0, 1.0 );

      float sat = saturation + warmGain * warmth + growthGain * growth;
      color = mix( vec3( luma ), color, sat );

      if ( vignette > 0.0 ) {
        vec2 offset = vUv - 0.5;
        // Corrected for aspect so a wide window does not get a letterbox of
        // darkness instead of a circular falloff.
        float radius = length( offset * vec2( 1.0, 0.82 ) ) * 1.4142;
        float falloff = smoothstep( vignetteStart, 1.02, radius );
        color *= 1.0 - vignette * falloff;
      }

      gl_FragColor = vec4( linearToSrgb( color ), texel.a );
    }
  `,
};
