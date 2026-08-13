import { describe, expect, it } from 'vitest';
import { ANIMALS, getItem, purchasableAnimals, spotPriceFor } from '../src/index.js';

describe('sheep progression and economy', () => {
  it('unlocks sheep with the Stage 1 animal-shelter capability', () => {
    expect(purchasableAnimals([]).map((animal) => animal.id)).not.toContain('sheep');
    expect(purchasableAnimals(['animal_shelters']).map((animal) => animal.id)).toContain('sheep');
  });

  it('feeds sheep corn and gives wool a deliberately slow, non-spoiling cycle', () => {
    const sheep = ANIMALS.sheep;
    expect(sheep.feedItemId).toBe('corn');
    expect(sheep.cycleTicks).toBeGreaterThan(ANIMALS.chicken.cycleTicks);
    expect(sheep.cycleTicks).toBeGreaterThan(ANIMALS.cow.cycleTicks);
    expect(sheep.producesItemId).toBe('wool');
    expect(getItem('wool')?.freshnessDecayPerDay).toBe(0);
  });

  it('prices one wool unit at exactly twice one egg unit', () => {
    expect(spotPriceFor('wool')).toBe(spotPriceFor('eggs') * 2);
  });
});
