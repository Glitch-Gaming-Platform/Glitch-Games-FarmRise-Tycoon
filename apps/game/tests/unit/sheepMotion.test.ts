import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '@farmrise/shared';
import { createSheepPose, sheepPose } from '@game/animals/sheepMotion.js';

describe('sheep motion', () => {
  it('is deterministic and separates walking from grazing', () => {
    const shelter = { x: 3, z: -1 };
    const walk = sheepPose(shelter, 0, 3, 2, 1, createSheepPose());
    const repeated = sheepPose(shelter, 0, 3, 2, 1, createSheepPose());
    const graze = sheepPose(shelter, 0, 3, 10, 1, createSheepPose());

    expect(repeated).toEqual(walk);
    expect(walk.motion).toBeGreaterThan(0.9);
    expect(walk.graze).toBe(0);
    expect(graze.motion).toBe(0);
    expect(graze.graze).toBeGreaterThan(0.7);
  });

  it('holds world position while grazing and faces the path while walking', () => {
    const shelter = { x: 3, z: -1 };
    const firstGraze = sheepPose(shelter, 0, 3, 9.0, 1, createSheepPose());
    const laterGraze = sheepPose(shelter, 0, 3, 10.0, 1, createSheepPose());
    expect(firstGraze.motion).toBe(0);
    expect(laterGraze.motion).toBe(0);
    expect(laterGraze.x).toBeCloseTo(firstGraze.x, 6);
    expect(laterGraze.z).toBeCloseTo(firstGraze.z, 6);

    for (let seconds = 0.5; seconds < 6.5; seconds += 0.2) {
      const pose = sheepPose(shelter, 1, 3, seconds, 1, createSheepPose());
      const next = sheepPose(shelter, 1, 3, seconds + TICK_SECONDS, 1, createSheepPose());
      if (pose.motion < 0.1 || next.motion < 0.1) continue;
      const dx = next.x - pose.x;
      const dz = next.z - pose.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1e-7) continue;
      const alignment = (Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz) / distance;
      expect(alignment).toBeGreaterThan(0.995);
    }
  });

  it('keeps the purchase introduction nearly uniform across its wool volume', () => {
    const pose = sheepPose({ x: 0, z: 0 }, 2, 4, 3, 0.4, createSheepPose());
    const maximum = Math.max(pose.scaleX, pose.scaleY, pose.scaleZ);
    const minimum = Math.min(pose.scaleX, pose.scaleY, pose.scaleZ);
    expect(maximum).toBeLessThan(0.45);
    expect(maximum - minimum).toBeLessThan(0.02);
  });
});
