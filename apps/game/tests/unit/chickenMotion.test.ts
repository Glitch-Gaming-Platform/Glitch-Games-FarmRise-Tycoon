import { describe, expect, it } from 'vitest';
import { TICK_SECONDS, ticksToSeconds } from '@farmrise/shared';
import {
  CHICKEN_COLLISION_RADIUS,
  chickenPose,
  createChickenPose,
} from '@game/animals/chickenMotion.js';
import { makeCareer } from '../helpers/career.js';

describe('chicken motion', () => {
  it('is deterministic and advances with simulation time', () => {
    const shelter = { x: 9, z: 1 };
    const first = chickenPose(shelter, 1, 4, 2.5);
    const repeated = chickenPose(shelter, 1, 4, 2.5);
    const later = chickenPose(shelter, 1, 4, 3.5);

    expect(repeated).toEqual(first);
    expect(later.x).not.toBeCloseTo(first.x);
    expect(later.z).not.toBeCloseTo(first.z);
    expect(first.motion).toBe(1);
    expect(first.gaitPhase).toBeGreaterThanOrEqual(0);
    expect(first.gaitPhase).toBeLessThan(1);
  });

  it('holds the gait phase while resting so the shader cannot trot in place', () => {
    const shelter = { x: 9, z: 1 };
    const first = chickenPose(shelter, 1, 4, 7.0);
    const later = chickenPose(shelter, 1, 4, 8.0);

    expect(first.motion).toBe(0);
    expect(later.motion).toBe(0);
    expect(later.gaitPhase).toBeCloseTo(first.gaitPhase, 6);
  });

  it('aims the authored +Z beak along the actual walking path', () => {
    const shelter = { x: 9, z: 1 };

    for (let index = 0; index < 64; index += 1) {
      for (let seconds = 0; seconds < 30; seconds += 0.25) {
        const pose = chickenPose(shelter, index, 64, seconds);
        const next = chickenPose(shelter, index, 64, seconds + TICK_SECONDS);
        if (pose.motion === 0 || next.motion === 0) continue;

        const dx = next.x - pose.x;
        const dz = next.z - pose.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1e-6) continue;

        // Three.js yaw maps local +Z to (sin(yaw), cos(yaw)). The chicken's
        // head and beak are authored on +Z, so this dot product must be near 1.
        const alignment = (Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz) / distance;
        expect(alignment).toBeGreaterThan(0.98);
      }
    }
  });

  it('keeps every supported flock lane clear of static shelter props', () => {
    const world = makeCareer({}, 'chicken-motion').world;
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
