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

  it('eases into and out of a walk instead of starting at full path speed', () => {
    const shelter = { x: 9, z: 1 };
    const speedAt = (seconds: number): number => {
      const pose = chickenPose(shelter, 0, 4, seconds);
      const next = chickenPose(shelter, 0, 4, seconds + TICK_SECONDS);
      return Math.hypot(next.x - pose.x, next.z - pose.z) / TICK_SECONDS;
    };

    const starting = speedAt(0.04);
    const cruising = speedAt(1.2);
    const settling = speedAt(5.46);
    expect(starting).toBeLessThan(cruising * 0.35);
    expect(settling).toBeLessThan(cruising * 0.35);
    expect(chickenPose(shelter, 0, 4, 0.04).motion).toBeLessThan(0.5);
    expect(chickenPose(shelter, 0, 4, 1.2).motion).toBeGreaterThan(0.95);
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

  it('keeps peck follow-through in the chest while the shader owns the head action', () => {
    const shelter = { x: 9, z: 1 };
    let strongest = createChickenPose();
    for (let seconds = 5.8; seconds < 9.4; seconds += 0.05) {
      const pose = chickenPose(shelter, 0, 4, seconds);
      if (pose.action > strongest.action) strongest = { ...pose };
    }
    expect(strongest.action).toBeGreaterThan(0.9);
    expect(strongest.pitch).toBeLessThan(0.1);
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
