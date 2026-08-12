import { describe, expect, it } from 'vitest';
import {
  buildingFootprint,
  normalizeBuildingRotation,
  type BuildingRotation,
} from '../src/index.js';

describe('building rotation', () => {
  it('normalizes arbitrary whole turns into the persisted quarter-turn range', () => {
    const cases: Array<[number, BuildingRotation]> = [
      [0, 0],
      [1, 1],
      [4, 0],
      [5, 1],
      [-1, 3],
      [Number.NaN, 0],
    ];

    for (const [input, expected] of cases) {
      expect(normalizeBuildingRotation(input)).toBe(expected);
    }
  });

  it('swaps non-square footprints on odd quarter-turns', () => {
    expect(buildingFootprint('loading_pad', 0)).toEqual({ width: 2, depth: 1 });
    expect(buildingFootprint('loading_pad', 1)).toEqual({ width: 1, depth: 2 });
    expect(buildingFootprint('loading_pad', 2)).toEqual({ width: 2, depth: 1 });
    expect(buildingFootprint('loading_pad', 3)).toEqual({ width: 1, depth: 2 });
    expect(buildingFootprint('barn', 1)).toEqual({ width: 2, depth: 2 });
  });
});
