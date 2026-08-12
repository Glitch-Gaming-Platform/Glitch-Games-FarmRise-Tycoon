import { describe, expect, it } from 'vitest';
import { ANIMALS } from '@farmrise/shared';
import { OnboardingAnimalBoost } from '@game/onboarding/OnboardingAnimalBoost.js';
import { makeCareer } from '../helpers/career.js';

describe('OnboardingAnimalBoost', () => {
  it('primes a fresh or resumed hen cycle only while the egg lesson needs a clutch', () => {
    const career = makeCareer();
    const group = career.world.livestock.groups[0]!;
    group.cycleTicks = 0;
    const boost = new OnboardingAnimalBoost(career);

    boost.update(false, 0);
    expect(group.cycleTicks).toBe(0);

    boost.update(true, 0);
    expect(group.cycleTicks).toBe(ANIMALS.chicken.cycleTicks - 1);
    career.advance(1, ['eggs'], true, ['chicken']);
    expect(career.world.stores.totalOf('eggs')).toBeGreaterThan(0);

    const primed = group.cycleTicks;
    boost.update(true, 8);
    expect(group.cycleTicks).toBe(primed);
  });

  it('leaves other livestock and normal post-tutorial cycles alone', () => {
    const career = makeCareer();
    career.world.livestock.hydrate([
      {
        id: 'animals-cows',
        species: 'cow',
        count: 1,
        cycleTicks: 0,
        tileX: career.world.level.shelter.tileX,
        tileZ: career.world.level.shelter.tileZ,
        sheltered: false,
      },
    ]);

    new OnboardingAnimalBoost(career).update(true, 0);
    expect(career.world.livestock.groups[0]?.cycleTicks).toBe(0);
  });
});
