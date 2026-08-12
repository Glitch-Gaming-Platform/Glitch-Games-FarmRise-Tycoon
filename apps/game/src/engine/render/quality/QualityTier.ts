/**
 * Render quality tiers.
 *
 * Two tiers exist for a reason that is not "more sliders":
 *
 * - `low` is the historical path. It is defined as *exactly what the renderer
 *   did before the pipeline existed*: no tone mapping, no environment map, no
 *   sky dome, no post-processing, PCF shadows at 512/1024. It is the default on
 *   touch-primary devices and it may never gain a draw call or a shader
 *   program. Every feature flag below is false for it, and the pipeline is not
 *   even constructed, so there is no code path to regress.
 *
 * - `ultra` is the desktop path: a linear/PBR workflow with a physical sky, an
 *   image-based ambient term, contact-hardening shadows and a post stack.
 *
 * The tier is resolved once at boot. Changing it requires a reload, which is
 * deliberate: half the decision (renderer construction flags, shadow map type,
 * global shader chunks) cannot be changed on a live context without recompiling
 * every program in the scene, and pretending otherwise produces a one-second
 * hitch and a subtly different image from a cold boot.
 */

export const QUALITY_TIERS = ['low', 'ultra'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (QUALITY_TIERS as readonly string[]).includes(value);
}

/**
 * Individually switchable effects.
 *
 * Every one of these must degrade to the pre-pipeline path when false, so a
 * bisect over a bad frame is a matter of flipping one boolean rather than
 * reverting a branch.
 */
export interface QualityFeatures {
  /** Preetham sky dome + sun disc, drawn as the scene background. */
  readonly sky: boolean;
  /** PMREM environment map generated from the sky, used as ambient IBL. */
  readonly environmentMap: boolean;
  /** Aerial-perspective fog whose colour is sampled from the sky. */
  readonly aerialFog: boolean;
  /** PCSS blocker search replacing the fixed-radius shadow filter. */
  readonly softShadows: boolean;
  /** Ground-truth ambient occlusion. */
  readonly ao: boolean;
  /** Subpixel morphological anti-aliasing. */
  readonly smaa: boolean;
  /** Restrained bloom on genuine highlights. */
  readonly bloom: boolean;
  /** Hue-aware colour grading that restores the saturated gameplay hues. */
  readonly grade: boolean;
  /** Radial exposure falloff, applied inside the grade pass. */
  readonly vignette: boolean;
}

export interface QualityProfile {
  readonly tier: QualityTier;
  readonly features: QualityFeatures;
  /** Directional shadow map resolution. */
  readonly shadowMapSize: number;
  /**
   * Half-width of the fitted directional shadow frustum, in world units. Small
   * means dense texels and crisp contact shadows; too small and the far field
   * loses its shadows entirely.
   */
  readonly shadowExtent: number;
  /** Depth range of the shadow frustum, in world units. Feeds the PCSS penumbra scale. */
  readonly shadowDepth: number;
  /** Apparent angular size of the sun, in radians. Drives penumbra growth. */
  readonly sunAngularSize: number;
  /** Cap on the render resolution. */
  readonly maxPixelRatio: number;
  /** MSAA on the default framebuffer. Meaningless once a composer is in play. */
  readonly contextAntialias: boolean | undefined;
  /** Multiplier on the composer's internal resolution. */
  readonly renderScale: number;
}

const LOW: QualityProfile = {
  tier: 'low',
  features: {
    sky: false,
    environmentMap: false,
    aerialFog: false,
    softShadows: false,
    ao: false,
    smaa: false,
    bloom: false,
    grade: false,
    vignette: false,
  },
  shadowMapSize: 512,
  shadowExtent: 0,
  shadowDepth: 0,
  sunAngularSize: 0,
  maxPixelRatio: 1.5,
  contextAntialias: false,
  renderScale: 1,
};

const ULTRA: QualityProfile = {
  tier: 'ultra',
  features: {
    sky: true,
    environmentMap: true,
    aerialFog: true,
    softShadows: true,
    ao: true,
    smaa: true,
    bloom: true,
    grade: true,
    vignette: true,
  },
  shadowMapSize: 4096,
  // 4096 texels over 96 world units is ~43 texels/metre, which is dense enough
  // that the blocker search resolves a chicken's foot rather than a blob.
  shadowExtent: 48,
  shadowDepth: 220,
  // Physically the sun subtends 0.0093 rad. That produces penumbrae too tight
  // to read at gameplay distance, so this is exaggerated ~4x - the standard
  // game trade, and the reason contact hardening is visible at all here.
  sunAngularSize: 0.038,
  maxPixelRatio: 2,
  // The composer owns anti-aliasing. Asking for an MSAA default framebuffer as
  // well pays for samples that are then thrown away.
  contextAntialias: false,
  renderScale: 1,
};

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = Object.freeze({
  low: LOW,
  ultra: ULTRA,
});

export interface QualityEnvironment {
  /** Query string, e.g. `location.search`. */
  readonly search?: string;
  /** True on phones and tablets. Supplied by the caller so this stays testable. */
  readonly touchPrimary?: boolean;
  /** Persisted preference from the settings store, if the player set one. */
  readonly stored?: string | null;
  /** Hardware thread count, used only as a weak veto on very small machines. */
  readonly hardwareConcurrency?: number;
}

const STORAGE_KEY = 'farmrise:quality';

/**
 * Resolution order, most to least authoritative:
 *   1. `?quality=ultra|low` - reviewers and bug reports need a deterministic override
 *   2. the persisted settings value
 *   3. device class: touch-primary or <= 4 threads gets `low`, everything else `ultra`
 */
export function resolveQualityTier(environment: QualityEnvironment = {}): QualityTier {
  const search = environment.search ?? (typeof location === 'undefined' ? '' : location.search);
  const requested = new URLSearchParams(search).get('quality');
  if (isQualityTier(requested)) return requested;

  const stored = environment.stored ?? readStoredQuality();
  if (isQualityTier(stored)) return stored;

  if (environment.touchPrimary) return 'low';
  const threads =
    environment.hardwareConcurrency ??
    (typeof navigator === 'undefined' ? 8 : (navigator.hardwareConcurrency ?? 8));
  return threads <= 4 ? 'low' : 'ultra';
}

export function readStoredQuality(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Private mode throws on access. A missing preference is not an error.
    return null;
  }
}

export function persistQualityTier(tier: QualityTier): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, tier);
  } catch {
    // Persistence is a convenience.
  }
}

export function qualityProfile(tier: QualityTier): QualityProfile {
  return QUALITY_PROFILES[tier];
}
