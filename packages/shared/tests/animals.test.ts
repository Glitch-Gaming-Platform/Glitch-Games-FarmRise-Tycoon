import { describe, expect, it } from 'vitest';
import {
  ANIMALS,
  getItem,
  isGuardianAnimal,
  purchasableAnimals,
  spotPriceFor,
  unlocksUpToStage,
} from '../src/index.js';

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

describe('farm dog progression and protection', () => {
  it('unlocks at Stage 3, costs $100 and occupies one shelter slot', () => {
    expect(purchasableAnimals(unlocksUpToStage(2)).map((animal) => animal.id)).not.toContain('dog');
    expect(purchasableAnimals(unlocksUpToStage(3)).map((animal) => animal.id)).toContain('dog');
    expect(ANIMALS.dog.purchaseCost).toBe(10_000);
    expect(ANIMALS.dog.shelterSlots).toBe(1);
  });

  it('is a productless guardian that can deter ten foxes per raid', () => {
    expect(isGuardianAnimal(ANIMALS.dog)).toBe(true);
    if (!isGuardianAnimal(ANIMALS.dog)) return;
    expect(ANIMALS.dog.foxesDeterredPerRaid).toBe(10);
    expect(getItem('dog')).toBeUndefined();
  });
});
