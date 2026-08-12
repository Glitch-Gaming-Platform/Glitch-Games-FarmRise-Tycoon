/**
 * URL-driven overrides for the Ultra pipeline.
 *
 * This exists because grading a render pipeline is an iterative loop -
 * exposure, ambient weight, AO strength and saturation only make sense
 * relative to each other, and the only honest way to compare two settings is
 * two screenshots from the shipping renderer. Rebuilding between each pair
 * makes that loop slow enough that people stop doing it and start guessing.
 *
 * With this, one browser launch can capture four variants:
 *
 *   ?quality=ultra&render=exposure:0.55,env:0.5
 *   ?quality=ultra&off=ao,bloom
 *
 * Everything here is additive and defaults to "no override", so a normal boot
 * parses an empty string and changes nothing. It is safe in production for the
 * same reason the debug flags are: it can only alter presentation, and only on
 * a tier that already opted into presentation effects.
 */
import type { QualityFeatures } from './QualityTier.js';

export interface RenderTuning {
  readonly exposure?: number;
  readonly ambientFraction?: number;
  readonly aoIntensity?: number;
  readonly bloomStrength?: number;
  readonly fogDistance?: number;
  readonly saturation?: number;
  readonly warmGain?: number;
  readonly growthGain?: number;
  readonly contrast?: number;
  readonly vignette?: number;
  readonly sunElevation?: number;
  readonly sunAzimuth?: number;
  readonly turbidity?: number;
  readonly features?: Partial<QualityFeatures>;
}

/** Short query keys, because these end up typed by hand into a capture script. */
const NUMERIC_KEYS: Readonly<Record<string, keyof RenderTuning>> = {
  exposure: 'exposure',
  env: 'ambientFraction',
  ao: 'aoIntensity',
  bloom: 'bloomStrength',
  fog: 'fogDistance',
  sat: 'saturation',
  warm: 'warmGain',
  growth: 'growthGain',
  contrast: 'contrast',
  vignette: 'vignette',
  sun: 'sunElevation',
  azimuth: 'sunAzimuth',
  turbidity: 'turbidity',
};

const FEATURE_KEYS: readonly (keyof QualityFeatures)[] = [
  'sky',
  'environmentMap',
  'aerialFog',
  'softShadows',
  'ao',
  'smaa',
  'bloom',
  'grade',
  'vignette',
];

/**
 * Parses `?render=k:v,k:v` and `?off=feature,feature`.
 *
 * Unknown keys and unparseable numbers are ignored rather than thrown on: a
 * typo in a capture script should cost one wrong screenshot, not a black page.
 */
export function resolveRenderTuning(
  search: string = typeof location === 'undefined' ? '' : location.search,
): RenderTuning {
  const params = new URLSearchParams(search);
  const tuning: Record<string, unknown> = {};

  for (const entry of params.getAll('render')) {
    for (const pair of entry.split(',')) {
      const [rawKey, rawValue] = pair.split(':');
      const key = NUMERIC_KEYS[(rawKey ?? '').trim()];
      if (!key) continue;
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      tuning[key] = value;
    }
  }

  const features: { -readonly [K in keyof QualityFeatures]?: boolean } = {};
  let hasFeature = false;
  for (const [param, enabled] of [
    ['off', false],
    ['on', true],
  ] as const) {
    for (const entry of params.getAll(param)) {
      for (const raw of entry.split(',')) {
        const name = raw.trim() as keyof QualityFeatures;
        if (!FEATURE_KEYS.includes(name)) continue;
        features[name] = enabled;
        hasFeature = true;
      }
    }
  }
  if (hasFeature) tuning['features'] = features;

  return tuning as RenderTuning;
}
