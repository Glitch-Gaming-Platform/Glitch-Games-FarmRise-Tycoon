import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '@farmrise/shared';
import { cowPose, createCowPose } from '@game/animals/cowMotion.js';

describe('cow motion', () => {
  it('is deterministic and separates walking from grazing', () => {
    const shelter = { x: 4, z: -2 };
    const walk = cowPose(shelter, 0, 2, 2, 1, createCowPose());
    const repeated = cowPose(shelter, 0, 2, 2, 1, createCowPose());
    const graze = cowPose(shelter, 0, 2, 9, 1, createCowPose());

    expect(repeated).toEqual(walk);
    expect(walk.motion).toBe(1);
    expect(walk.graze).toBe(0);
    expect(graze.motion).toBe(0);
    expect(graze.graze).toBeGreaterThan(0.8);
  });

  it('holds its world position while grazing instead of skating under the action', () => {
    const shelter = { x: 4, z: -2 };
    const first = cowPose(shelter, 0, 2, 8.4, 1, createCowPose());
    const later = cowPose(shelter, 0, 2, 9.4, 1, createCowPose());

    expect(first.motion).toBe(0);
    expect(later.motion).toBe(0);
    expect(later.x).toBeCloseTo(first.x, 6);
    expect(later.z).toBeCloseTo(first.z, 6);
    expect(later.gaitPhase).toBeCloseTo(first.gaitPhase, 6);
  });

  it('faces the elliptical path tangent instead of travelling broadside', () => {
    const shelter = { x: 4, z: -2 };
    for (let seconds = 0.4; seconds < 6.5; seconds += 0.2) {
      const pose = cowPose(shelter, 1, 3, seconds, 1, createCowPose());
      const next = cowPose(shelter, 1, 3, seconds + TICK_SECONDS, 1, createCowPose());
      if (pose.motion < 0.1 || next.motion < 0.1) continue;
      const dx = next.x - pose.x;
      const dz = next.z - pose.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1e-7) continue;
      const alignment = (Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz) / distance;
      expect(alignment).toBeGreaterThan(0.995);
    }
  });

  it('eases pasture starts, stops and the grazing head transition', () => {
    const shelter = { x: 4, z: -2 };
    const start = cowPose(shelter, 0, 2, 0.05, 1, createCowPose());
    const cruise = cowPose(shelter, 0, 2, 1.8, 1, createCowPose());
    const settle = cowPose(shelter, 0, 2, 6.94, 1, createCowPose());
    expect(start.motion).toBeLessThan(cruise.motion * 0.35);
    expect(settle.motion).toBeLessThan(cruise.motion * 0.35);

    const beforeGrazeEnd = cowPose(shelter, 0, 2, 11.42, 1, createCowPose());
    const afterGrazeEnd = cowPose(shelter, 0, 2, 11.5, 1, createCowPose());
    expect(Math.abs(afterGrazeEnd.graze - beforeGrazeEnd.graze)).toBeLessThan(0.08);
  });

  it('keeps purchase introduction scale uniform across all axes', () => {
    const pose = cowPose({ x: 0, z: 0 }, 1, 3, 3, 0.4, createCowPose());
    const maximum = Math.max(pose.scaleX, pose.scaleY, pose.scaleZ);
    const minimum = Math.min(pose.scaleX, pose.scaleY, pose.scaleZ);

    expect(maximum).toBeLessThan(0.45);
    expect(maximum - minimum).toBeLessThan(0.02);
  });
});
