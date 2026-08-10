/**
 * The ground plane's contract.
 *
 * The important assertion here is the flat one. Plot meshes, structures, the
 * placement preview and the collision grid all assume the playable rectangle
 * sits at exactly y = 0. Relief is a purely cosmetic border treatment, and if
 * a future tweak to the noise ever leaks inside the grid, the symptom would be
 * crops floating or sinking a few centimetres - subtle enough to survive a
 * visual review and confusing enough to cost an afternoon.
 */
import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { createGroundGeometry, outsideDistance } from '@game/world/view/groundGeometry.js';

const OPTIONS = { playableWidth: 32, playableDepth: 32, extentScale: 3 } as const;

describe('createGroundGeometry', () => {
  it('keeps every vertex inside the playable rectangle exactly flat', () => {
    const geometry = createGroundGeometry(OPTIONS);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;

    let inside = 0;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      if (outsideDistance(x, z, OPTIONS.playableWidth, OPTIONS.playableDepth) > 0) continue;
      inside += 1;
      expect(position.getY(i)).toBe(0);
    }

    // Guard the guard: if the sampling ever stopped finding interior vertices,
    // the loop above would pass vacuously.
    expect(inside).toBeGreaterThan(200);
    geometry.dispose();
  });

  it('does raise the ground somewhere outside the playable rectangle', () => {
    const geometry = createGroundGeometry(OPTIONS);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;

    let maxAbsHeight = 0;
    for (let i = 0; i < position.count; i += 1) {
      maxAbsHeight = Math.max(maxAbsHeight, Math.abs(position.getY(i)));
    }

    expect(maxAbsHeight).toBeGreaterThan(0.2);
    geometry.dispose();
  });

  it('writes a colour attribute that varies but never clips', () => {
    const geometry = createGroundGeometry(OPTIONS);
    const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(colour).toBeDefined();

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < colour.count * 3; i += 1) {
      const value = colour.array[i] as number;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    // Multipliers above 1 are allowed and intended - they brighten the base
    // palette colour - but anything past ~1.3 would blow the ground out to a
    // flat highlight, which is the failure this range exists to prevent.
    expect(min).toBeGreaterThan(0.4);
    expect(max).toBeLessThan(1.3);
    // And it must actually vary. A previous pass shipped a range so narrow it
    // was invisible at the gameplay camera, which is the same as flat.
    expect(max - min).toBeGreaterThan(0.25);
    geometry.dispose();
  });

  it('is deterministic across builds', () => {
    const a = createGroundGeometry(OPTIONS);
    const b = createGroundGeometry(OPTIONS);
    expect(Array.from(a.getAttribute('color').array)).toEqual(
      Array.from(b.getAttribute('color').array),
    );
    expect(Array.from(a.getAttribute('position').array)).toEqual(
      Array.from(b.getAttribute('position').array),
    );
    a.dispose();
    b.dispose();
  });
});
