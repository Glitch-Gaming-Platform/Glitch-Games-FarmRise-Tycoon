import { describe, expect, it } from 'vitest';
import { terrainContactProfile } from '@game/player/terrainContact.js';

describe('terrain contact profiles', () => {
  it('makes loose tilled soil heavier than compacted road dust', () => {
    const road = terrainContactProfile('road');
    const soil = terrainContactProfile('tilled-soil');

    expect(soil.emissionMultiplier).toBeGreaterThan(road.emissionMultiplier);
    expect(soil.sizeMultiplier).toBeGreaterThan(road.sizeMultiplier);
    expect(soil.colour).not.toBe(road.colour);
  });

  it('keeps grass contact quieter than ordinary scrub', () => {
    expect(terrainContactProfile('grass').emissionMultiplier).toBeLessThan(
      terrainContactProfile('scrub').emissionMultiplier,
    );
  });
});
