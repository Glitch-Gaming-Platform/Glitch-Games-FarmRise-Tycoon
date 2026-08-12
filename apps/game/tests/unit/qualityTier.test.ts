import { afterEach, describe, expect, it } from 'vitest';
import {
  QUALITY_PROFILES,
  isQualityTier,
  persistQualityTier,
  qualityProfile,
  readStoredQuality,
  resolveQualityTier,
} from '../../src/engine/render/quality/QualityTier.js';
import { resolveRenderTuning } from '../../src/engine/render/quality/RenderTuning.js';

afterEach(() => {
  globalThis.localStorage?.removeItem('farmrise:quality');
});

describe('resolveQualityTier', () => {
  it('prefers an explicit ?quality override over everything else', () => {
    persistQualityTier('low');
    expect(resolveQualityTier({ search: '?quality=ultra', touchPrimary: true })).toBe('ultra');
    expect(resolveQualityTier({ search: '?quality=low', touchPrimary: false })).toBe('low');
  });

  it('ignores an unrecognised override rather than throwing', () => {
    expect(resolveQualityTier({ search: '?quality=potato', touchPrimary: true })).toBe('low');
  });

  it('uses the persisted preference when there is no override', () => {
    persistQualityTier('low');
    expect(resolveQualityTier({ search: '', touchPrimary: false })).toBe('low');
    expect(readStoredQuality()).toBe('low');
  });

  it('defaults touch-primary devices to low and desktops to ultra', () => {
    expect(resolveQualityTier({ search: '', touchPrimary: true, stored: null })).toBe('low');
    expect(
      resolveQualityTier({ search: '', touchPrimary: false, stored: null, hardwareConcurrency: 8 }),
    ).toBe('ultra');
  });

  it('vetoes ultra on a machine with very few threads', () => {
    expect(
      resolveQualityTier({ search: '', touchPrimary: false, stored: null, hardwareConcurrency: 2 }),
    ).toBe('low');
  });
});

describe('quality profiles', () => {
  it('leaves every Ultra feature off on the low tier', () => {
    const low = qualityProfile('low');
    for (const [name, enabled] of Object.entries(low.features)) {
      expect(enabled, `low.features.${name} must be false`).toBe(false);
    }
  });

  it('enables every feature on ultra, so nothing is silently unreachable', () => {
    for (const [name, enabled] of Object.entries(QUALITY_PROFILES.ultra.features)) {
      expect(enabled, `ultra.features.${name} must be true`).toBe(true);
    }
  });

  it('recognises only the declared tiers', () => {
    expect(isQualityTier('ultra')).toBe(true);
    expect(isQualityTier('medium')).toBe(false);
  });
});

describe('resolveRenderTuning', () => {
  it('returns nothing for an empty query, so a normal boot is unaffected', () => {
    expect(resolveRenderTuning('')).toEqual({});
    expect(resolveRenderTuning('?debug=overlay')).toEqual({});
  });

  it('parses numeric overrides', () => {
    expect(resolveRenderTuning('?render=exposure:0.5,env:0.3,ao:0.9')).toEqual({
      exposure: 0.5,
      ambientFraction: 0.3,
      aoIntensity: 0.9,
    });
  });

  it('ignores unknown keys and non-numeric values', () => {
    expect(resolveRenderTuning('?render=nonsense:1,exposure:abc,sat:1.2')).toEqual({
      saturation: 1.2,
    });
  });

  it('turns individual features off and on', () => {
    expect(resolveRenderTuning('?off=ao,bloom&on=vignette')).toEqual({
      features: { ao: false, bloom: false, vignette: true },
    });
  });
});
