/**
 * Three authored one-shots for every animal in the farm-animal reference set.
 *
 * Only species implemented by the simulation are decoded at startup. The
 * remaining clips are shipped as lazy catalog assets so future animals can use
 * stable ids without making today's farm pay their memory cost.
 */
import type { AnimalSpecies } from '@farmrise/shared';
import { SOUND } from './soundIds.js';

export const FARM_ANIMAL_SOUND_VARIANTS = {
  cow: [SOUND.cow, 'animal.cow_2', 'animal.cow_3'],
  pig: ['animal.pig_1', 'animal.pig_2', 'animal.pig_3'],
  horse: ['animal.horse_1', 'animal.horse_2', 'animal.horse_3'],
  goat: ['animal.goat_1', 'animal.goat_2', 'animal.goat_3'],
  pigeon: ['animal.pigeon_1', 'animal.pigeon_2', 'animal.pigeon_3'],
  rabbit: ['animal.rabbit_1', 'animal.rabbit_2', 'animal.rabbit_3'],
  sheep: [SOUND.sheep, 'animal.sheep_2', 'animal.sheep_3'],
  deer: ['animal.deer_1', 'animal.deer_2', 'animal.deer_3'],
  hen: [SOUND.chicken, 'animal.hen_2', 'animal.hen_3'],
  rooster: ['animal.rooster_1', 'animal.rooster_2', 'animal.rooster_3'],
  turkey: ['animal.turkey_1', 'animal.turkey_2', 'animal.turkey_3'],
  dove: ['animal.dove_1', 'animal.dove_2', 'animal.dove_3'],
  bee: ['animal.bee_1', 'animal.bee_2', 'animal.bee_3'],
  duck: ['animal.duck_1', 'animal.duck_2', 'animal.duck_3'],
  duckling: ['animal.duckling_1', 'animal.duckling_2', 'animal.duckling_3'],
  dog: ['animal.dog_1', 'animal.dog_2', 'animal.dog_3'],
  cat: ['animal.cat_1', 'animal.cat_2', 'animal.cat_3'],
  donkey: ['animal.donkey_1', 'animal.donkey_2', 'animal.donkey_3'],
  parrot: ['animal.parrot_1', 'animal.parrot_2', 'animal.parrot_3'],
  chick: ['animal.chick_1', 'animal.chick_2', 'animal.chick_3'],
} as const;

export type FarmAnimalSoundName = keyof typeof FARM_ANIMAL_SOUND_VARIANTS;
export type FarmAnimalSoundId = (typeof FARM_ANIMAL_SOUND_VARIANTS)[FarmAnimalSoundName][number];

export const IMPLEMENTED_ANIMAL_SOUND_VARIANTS: Readonly<
  Record<AnimalSpecies, readonly FarmAnimalSoundId[]>
> = {
  chicken: FARM_ANIMAL_SOUND_VARIANTS.hen,
  sheep: FARM_ANIMAL_SOUND_VARIANTS.sheep,
  cow: FARM_ANIMAL_SOUND_VARIANTS.cow,
  dog: FARM_ANIMAL_SOUND_VARIANTS.dog,
};

export const ACTIVE_ANIMAL_VARIANT_IDS: readonly FarmAnimalSoundId[] = [
  ...IMPLEMENTED_ANIMAL_SOUND_VARIANTS.chicken,
  ...IMPLEMENTED_ANIMAL_SOUND_VARIANTS.sheep,
  ...IMPLEMENTED_ANIMAL_SOUND_VARIANTS.cow,
  ...IMPLEMENTED_ANIMAL_SOUND_VARIANTS.dog,
];

export const ALL_FARM_ANIMAL_SOUND_IDS: readonly FarmAnimalSoundId[] = Object.values(
  FARM_ANIMAL_SOUND_VARIANTS,
).flat();

const activeIds = new Set<string>(ACTIVE_ANIMAL_VARIANT_IDS);
export const FUTURE_ANIMAL_SOUND_IDS: readonly FarmAnimalSoundId[] =
  ALL_FARM_ANIMAL_SOUND_IDS.filter((id) => !activeIds.has(id));
