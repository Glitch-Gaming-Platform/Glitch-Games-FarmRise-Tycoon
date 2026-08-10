/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * Math.random() is banned in the rules layer. Anything random that affects
 * money - disease rolls, event targeting, order generation - must be derived
 * from a seed the server owns, so that the server can replay a session and
 * check the client's arithmetic. The algorithm is shared; the seeds are not.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Current internal state, so a save can resume the exact stream. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (minInclusive, maxExclusive) =>
      minInclusive + Math.floor(next() * Math.max(0, maxExclusive - minInclusive)),
    chance: (probability) => next() < probability,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('createRng().pick called with an empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    state: () => s,
  };
}

/** Mixes a stable string (e.g. a save id) into a numeric seed. */
export function seedFromString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
