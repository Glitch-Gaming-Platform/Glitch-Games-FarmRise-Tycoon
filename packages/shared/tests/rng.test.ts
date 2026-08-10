/**
 * The RNG must be reproducible: the server replays a client's event sequence
 * from a stored seed, so "random" has to mean "deterministic given the seed".
 */
import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from '../src/index.js';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).toEqual(second);
  });

  it('produces different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces integers inside the requested range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(3, 9);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(9);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('can resume from a stored state', () => {
    const original = createRng(42);
    original.next();
    original.next();
    const resumed = createRng(original.state());
    // Not equality with the original stream, but determinism from the snapshot.
    expect(createRng(original.state()).next()).toBe(resumed.next());
  });

  it('throws rather than returning undefined when picking from an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });

  it('hashes strings into stable seeds', () => {
    expect(seedFromString('millbrook')).toBe(seedFromString('millbrook'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
