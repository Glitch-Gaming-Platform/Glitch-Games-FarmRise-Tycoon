import { describe, expect, it } from 'vitest';
import { isTouchPrimaryDevice } from '@engine/render/capabilities.js';

describe('mobile capability gate', () => {
  it('requires touch and a coarse pointer or compact viewport', () => {
    expect(
      isTouchPrimaryDevice({
        maxTouchPoints: 5,
        coarsePointer: true,
        viewportWidth: 390,
        touchEvents: true,
      }),
    ).toBe(true);
    expect(
      isTouchPrimaryDevice({
        maxTouchPoints: 5,
        coarsePointer: false,
        viewportWidth: 768,
        touchEvents: true,
      }),
    ).toBe(true);
    expect(
      isTouchPrimaryDevice({
        maxTouchPoints: 0,
        coarsePointer: true,
        viewportWidth: 390,
        touchEvents: false,
      }),
    ).toBe(false);
    expect(
      isTouchPrimaryDevice({
        maxTouchPoints: 1,
        coarsePointer: false,
        viewportWidth: 1440,
        touchEvents: true,
      }),
    ).toBe(false);
    expect(
      isTouchPrimaryDevice({
        maxTouchPoints: 0,
        coarsePointer: true,
        viewportWidth: 390,
        touchEvents: true,
      }),
    ).toBe(true);
  });
});
