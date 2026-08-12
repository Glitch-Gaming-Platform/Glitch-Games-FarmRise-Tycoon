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
import {
  createGroundGeometry,
  outsideDistance,
  sampleGroundSurface,
} from '@game/world/view/groundGeometry.js';

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
    expect(min).toBeGreaterThan(0.38);
    expect(max).toBeLessThan(1.3);
    // And it must actually vary. A previous pass shipped a range so narrow it
    // was invisible at the gameplay camera, which is the same as flat.
    expect(max - min).toBeGreaterThan(0.25);
    geometry.dispose();
  });

  it('adds lighting texture without displacing the playable land', () => {
    const geometry = createGroundGeometry(OPTIONS);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;

    let variedNormals = 0;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      if (outsideDistance(x, z, OPTIONS.playableWidth, OPTIONS.playableDepth) > 0) continue;
      expect(position.getY(index)).toBe(0);
      if (Math.abs(normal.getX(index)) > 0.002 || Math.abs(normal.getZ(index)) > 0.002) {
        variedNormals += 1;
      }
    }

    expect(variedNormals).toBeGreaterThan(500);
    geometry.dispose();
  });

  it('suppresses grass where a worn route crosses otherwise lush ground', () => {
    let point = { x: 0, z: 0 };
    let base = sampleGroundSurface(point.x, point.z, OPTIONS);
    for (let z = -14; z <= 14; z += 1) {
      for (let x = -14; x <= 14; x += 1) {
        const candidate = sampleGroundSurface(x, z, OPTIONS);
        if (candidate.localPasture > base.localPasture) {
          point = { x, z };
          base = candidate;
        }
      }
    }
    const worn = sampleGroundSurface(point.x, point.z, {
      ...OPTIONS,
      wornPaths: [
        {
          from: { x: point.x - 4, z: point.z },
          to: { x: point.x + 4, z: point.z },
          width: 1.4,
        },
      ],
    });

    expect(base.localPasture).toBeGreaterThan(0.4);
    expect(worn.worn).toBeGreaterThan(0.95);
    expect(worn.localPasture).toBeLessThan(base.localPasture);
    expect(worn.localEarth).toBeGreaterThan(0.95);
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

  /**
   * The tier guarantee, as a test rather than as a promise.
   *
   * The Ultra terrain material blends its textures from a per-vertex
   * `aTerrain` attribute. `low` must not carry it: not because a spare
   * float3 would hurt, but because "the low tier is unchanged" should be
   * something a test can fail on, not something a reviewer has to take on
   * trust while reading a diff.
   */
  it('emits no surface-weight attribute unless it is asked for', () => {
    const plain = createGroundGeometry(OPTIONS);
    expect(plain.getAttribute('aTerrain')).toBeUndefined();
    expect(Object.keys(plain.attributes).sort()).toEqual(['color', 'normal', 'position', 'uv']);
    plain.dispose();
  });

  it('emits surface weights that agree with the sampled fields', () => {
    const geometry = createGroundGeometry({ ...OPTIONS, surfaceWeights: true });
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const terrain = geometry.getAttribute('aTerrain') as THREE.BufferAttribute;
    expect(terrain).toBeDefined();
    expect(terrain.count).toBe(position.count);

    for (let i = 0; i < position.count; i += 631) {
      const sample = sampleGroundSurface(position.getX(i), position.getZ(i), OPTIONS);
      expect(terrain.getX(i)).toBeCloseTo(sample.localPasture, 6);
      expect(terrain.getY(i)).toBeCloseTo(sample.localEarth, 6);
      expect(terrain.getZ(i)).toBeCloseTo(sample.worn, 6);
    }
    geometry.dispose();
  });

  it('leaves colour and position identical whether or not weights are emitted', () => {
    const plain = createGroundGeometry(OPTIONS);
    const weighted = createGroundGeometry({ ...OPTIONS, surfaceWeights: true });
    expect(Array.from(weighted.getAttribute('color').array)).toEqual(
      Array.from(plain.getAttribute('color').array),
    );
    expect(Array.from(weighted.getAttribute('position').array)).toEqual(
      Array.from(plain.getAttribute('position').array),
    );
    plain.dispose();
    weighted.dispose();
  });
});
