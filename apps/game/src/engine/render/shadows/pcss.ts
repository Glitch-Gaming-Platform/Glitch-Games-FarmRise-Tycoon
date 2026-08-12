/**
 * Percentage-closer soft shadows.
 *
 * Why this is a global shader-chunk override rather than a per-material
 * `onBeforeCompile`: shadow reception lives in `shadowmap_pars_fragment`, which
 * every lit material includes. Patching it once at pipeline construction gives
 * every current and future material the same shadow behaviour, including the
 * ones other agents have not written yet. Patching per material would mean the
 * first mesh someone forgets to register renders with a visibly different
 * shadow, which is exactly the class of bug that is impossible to find.
 *
 * Why it is safe with respect to the `low` tier: this function is only called
 * from `RenderPipeline.init()`, and the pipeline is only constructed on `ultra`.
 * A `low` boot never imports a patched chunk, so its shader source is byte-for-
 * byte what it was before this file existed. `restorePcssShadows()` puts the
 * original string back, which matters for tests that boot both tiers in one
 * process.
 *
 * Why `BasicShadowMap` and not `PCFShadowMap`: the PCF path binds the shadow map
 * as a `sampler2DShadow`, which in WebGL2 can only be read through a hardware
 * depth comparison. A blocker search needs the raw depth value, and only the
 * basic path exposes it as a plain `sampler2D`. So the pipeline sets
 * `renderer.shadowMap.type = THREE.BasicShadowMap` and replaces what "basic"
 * means. Three's own PCSS example takes the same route.
 *
 * The penumbra model, for a directional light:
 *
 *   worldSeparation = (receiverDepth - blockerDepth) * shadowFrustumDepth
 *   penumbraRadius  = worldSeparation * tan(sunAngularSize)
 *   penumbraUV      = penumbraRadius / shadowFrustumWidth
 *
 * All three constants are fixed by the shadow camera, so their product folds
 * into a single number carried in the otherwise-unused `shadowRadius` uniform -
 * see `pcssShadowRadius()`. Nothing is hard-coded in the GLSL, which is what
 * lets `shadowExtent` change in a quality profile without editing a shader.
 */
import * as THREE from 'three';

const PCSS_GET_SHADOW = /* glsl */ `
		#define FR_PCSS_BLOCKER_SAMPLES 16
		#define FR_PCSS_FILTER_SAMPLES 16
		// Blocker search radius, in texels. Wide enough to find the caster that
		// is about to soften this pixel, narrow enough not to drag in a caster
		// from the next object over.
		#define FR_PCSS_SEARCH_TEXELS 9.0
		// A contact point must still read as a contact point: never blur below
		// most of a texel, never smear beyond this many.
		#define FR_PCSS_MIN_TEXELS 0.75
		#define FR_PCSS_MAX_TEXELS 22.0

		float frPcssBlockerDepth( sampler2D shadowMap, vec2 uv, float receiver, float searchRadius, float phi ) {
			float total = 0.0;
			float found = 0.0;
			for ( int i = 0; i < FR_PCSS_BLOCKER_SAMPLES; i ++ ) {
				vec2 offset = vogelDiskSample( i, FR_PCSS_BLOCKER_SAMPLES, phi ) * searchRadius;
				float depth = texture2D( shadowMap, uv + offset ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float blocked = step( receiver, depth );
				#else
					float blocked = step( depth, receiver );
				#endif
				total += depth * blocked;
				found += blocked;
			}
			return found > 0.0 ? total / found : -1.0;
		}

		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;

				float blocker = frPcssBlockerDepth( shadowMap, shadowCoord.xy, shadowCoord.z, FR_PCSS_SEARCH_TEXELS * texelSize.x, phi );
				if ( blocker < 0.0 ) return 1.0;

				#ifdef USE_REVERSED_DEPTH_BUFFER
					float separation = max( 0.0, blocker - shadowCoord.z );
				#else
					float separation = max( 0.0, shadowCoord.z - blocker );
				#endif

				// shadowRadius carries frustumDepth * tan(sunAngularSize) / frustumWidth.
				float penumbra = clamp( separation * shadowRadius, FR_PCSS_MIN_TEXELS * texelSize.x, FR_PCSS_MAX_TEXELS * texelSize.x );

				float sum = 0.0;
				for ( int i = 0; i < FR_PCSS_FILTER_SAMPLES; i ++ ) {
					vec2 offset = vogelDiskSample( i, FR_PCSS_FILTER_SAMPLES, phi ) * penumbra;
					float depth = texture2D( shadowMap, shadowCoord.xy + offset ).r;
					#ifdef USE_REVERSED_DEPTH_BUFFER
						sum += step( depth, shadowCoord.z );
					#else
						sum += step( shadowCoord.z, depth );
					#endif
				}
				shadow = sum / float( FR_PCSS_FILTER_SAMPLES );
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
`;

/**
 * The blocker search and the variable filter both use `vogelDiskSample` and
 * `interleavedGradientNoise`, which upstream only declares inside
 * `#if defined( SHADOWMAP_TYPE_PCF )`. This makes them unconditional.
 */
const HELPER_GUARD_ORIGINAL = `	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {`;
const HELPER_GUARD_PATCHED = `	#if 1
		float interleavedGradientNoise( vec2 position ) {`;

const BASIC_BRANCH_MARKER = `	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {`;

let original: string | null = null;

export class PcssPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PcssPatchError';
  }
}

/**
 * Swaps the basic shadow branch for a PCSS one.
 *
 * Returns false and leaves the chunk untouched if the upstream source has
 * drifted far enough that the anchors no longer match. That is a deliberate
 * fail-soft: a three.js upgrade should downgrade shadow quality and log, not
 * produce a scene of black shader-compile failures.
 */
export function installPcssShadows(): boolean {
  if (original !== null) return true;
  const source = THREE.ShaderChunk.shadowmap_pars_fragment;

  const helperIndex = source.indexOf(HELPER_GUARD_ORIGINAL);
  const branchIndex = source.indexOf(BASIC_BRANCH_MARKER);
  if (helperIndex < 0 || branchIndex < 0) {
    console.warn(
      '[pcss] three.js shadowmap_pars_fragment no longer matches the expected shape; ' +
        'falling back to the stock basic shadow filter.',
    );
    return false;
  }

  // The basic branch runs from `#else` to the `#endif` that closes the
  // PCF/VSM/basic selection - the first `\t#endif` after the marker.
  const endIndex = source.indexOf('\n\t#endif', branchIndex);
  if (endIndex < 0) {
    console.warn('[pcss] could not locate the end of the basic shadow branch; skipping patch.');
    return false;
  }

  original = source;
  const patched =
    source.slice(0, helperIndex) +
    HELPER_GUARD_PATCHED +
    source.slice(helperIndex + HELPER_GUARD_ORIGINAL.length, branchIndex) +
    '\t#else\n' +
    PCSS_GET_SHADOW +
    source.slice(endIndex);
  THREE.ShaderChunk.shadowmap_pars_fragment = patched;
  return true;
}

export function restorePcssShadows(): void {
  if (original === null) return;
  THREE.ShaderChunk.shadowmap_pars_fragment = original;
  original = null;
}

export function isPcssInstalled(): boolean {
  return original !== null;
}

/**
 * The value to write into `light.shadow.radius` so the GLSL above produces a
 * physically-shaped penumbra.
 *
 * `shadowRadius` is dead weight in the basic path, which is what makes it a
 * legitimate carrier: no uniform plumbing, no custom material, and it travels
 * with the light it describes.
 *
 * @param frustumDepth far - near of the shadow camera, in world units
 * @param frustumWidth full width of the ortho shadow camera, in world units
 * @param sunAngularSize apparent angular diameter of the light, in radians
 */
export function pcssShadowRadius(
  frustumDepth: number,
  frustumWidth: number,
  sunAngularSize: number,
): number {
  return (frustumDepth * Math.tan(sunAngularSize)) / frustumWidth;
}
