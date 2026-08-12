import { describe, expect, it } from 'vitest';
import { TileGrid } from '@engine/physics/TileGrid.js';
import { addBuildingCollision } from '@game/world/collisionProfiles.js';

describe('rotated building collision', () => {
  it('turns directional collision proxies with their building', () => {
    const horizontal = new TileGrid(8, 8, 2);
    const vertical = new TileGrid(8, 8, 2);
    const center = horizontal.tileToWorld(4, 4);

    addBuildingCollision(horizontal, 'fence', 4, 4, 0);
    addBuildingCollision(vertical, 'fence', 4, 4, 1);

    expect(horizontal.isBlockedWorld(center.x + 0.8, center.z)).toBe(true);
    expect(horizontal.isBlockedWorld(center.x, center.z + 0.8)).toBe(false);
    expect(vertical.isBlockedWorld(center.x + 0.8, center.z)).toBe(false);
    expect(vertical.isBlockedWorld(center.x, center.z + 0.8)).toBe(true);
  });
});
