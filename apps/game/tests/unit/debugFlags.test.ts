import { describe, expect, it } from 'vitest';
import { resolveDebugFlags } from '@engine/debug/DebugFlags.js';

describe('debug flags', () => {
  it('enables the deterministic player-action review spawn from the URL', () => {
    expect(resolveDebugFlags('?debug=overlay,actions')).toMatchObject({
      overlay: true,
      actionReview: true,
    });
  });

  it('keeps the action review path off by default', () => {
    expect(resolveDebugFlags('', false).actionReview).toBe(false);
  });

  it('exposes the non-persistent progression acceptance career only when requested', () => {
    expect(resolveDebugFlags('?debug=progression')).toMatchObject({ progressionReviewStage: 3 });
    expect(resolveDebugFlags('?debug=estate')).toMatchObject({ progressionReviewStage: 5 });
    expect(resolveDebugFlags('', false).progressionReviewStage).toBeNull();
  });

  it('selects one focused incident acceptance career from the URL', () => {
    expect(resolveDebugFlags('?debug=overlay,incident-cold-snap')).toMatchObject({
      incidentReviewId: 'incident-cold-snap',
    });
    expect(resolveDebugFlags('', false).incidentReviewId).toBeNull();
  });
});
