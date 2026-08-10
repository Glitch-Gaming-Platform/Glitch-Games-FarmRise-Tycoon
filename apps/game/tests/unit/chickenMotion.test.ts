import { describe, expect, it } from 'vitest';
import { ticksToSeconds } from '@farmrise/shared';
import {
  CHICKEN_COLLISION_RADIUS,
  chickenPose,
  createChickenPose,
} from '@game/animals/chickenMotion.js';
import { FarmWorld } from '@game/world/FarmWorld.js';
import { STARTER_FARM } from '@game/world/levels/starterFarm.js';

describe('chicken motion', () => {
  it('is deterministic and advances with simulation time', () => {
    const shelter = { x: 9, z: 1 };
    const first = chickenPose(shelter, 1, 4, 2.5);
    const repeated = chickenPose(shelter, 1, 4, 2.5);
    const later = chickenPose(shelter, 1, 4, 3.5);

    expect(repeated).toEqual(first);
    expect(later.x).not.toBeCloseTo(first.x);
    expect(later.z).not.toBeCloseTo(first.z);
  });

  it('keeps every supported flock lane clear of static shelter props', () => {
    const world = new FarmWorld(STARTER_FARM, 44);
    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const pose = createChickenPose();

    for (let tick = 0; tick <= 60 * 30; tick += 15) {
      for (let index = 0; index < 64; index += 1) {
        chickenPose(shelter, index, 64, ticksToSeconds(tick), 0, 1, pose);
        expect(world.physics.isBlockedWorld(pose.x, pose.z)).toBe(false);
        // Cardinal samples match GridPhysics' inexpensive circle approximation.
        expect(world.physics.isBlockedWorld(pose.x + CHICKEN_COLLISION_RADIUS, pose.z)).toBe(false);
        expect(world.physics.isBlockedWorld(pose.x - CHICKEN_COLLISION_RADIUS, pose.z)).toBe(false);
        expect(world.physics.isBlockedWorld(pose.x, pose.z + CHICKEN_COLLISION_RADIUS)).toBe(false);
        expect(world.physics.isBlockedWorld(pose.x, pose.z - CHICKEN_COLLISION_RADIUS)).toBe(false);
      }
    }
  });
});
