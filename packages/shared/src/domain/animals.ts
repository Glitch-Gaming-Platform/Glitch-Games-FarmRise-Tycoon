/**
 * Animal definitions.
 *
 * The chicken exists to create the "sell the corn now, or feed it to something
 * that pays later" decision. The cow escalates exactly that decision: it eats
 * more, needs a fenced pasture and produces milk, which is worth little until
 * a creamery turns it into cheese - so buying one is a bet on building the
 * rest of the chain (docs/PROGRESSION_GAMEPLAY_PLAN.md §9).
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

/** The species that exist. Widened only by adding a member here. */
export type AnimalSpecies = 'chicken' | 'cow';

export interface AnimalDefinition {
  readonly id: AnimalSpecies;
  readonly displayName: string;
  readonly purchaseCost: Cents;
  /** Item id produced on each completed cycle. */
  readonly producesItemId: string;
  readonly produceDisplayName: string;
  readonly producePerCycle: number;
  readonly produceUnitPrice: Cents;
  readonly produceStorageWeight: number;
  readonly produceFreshnessDecayPerDay: number;
  readonly cycleTicks: Ticks;
  /** Crop id consumed as feed, and how many units per cycle. */
  readonly feedItemId: string;
  readonly feedPerCycle: number;
  /** Shelter slots occupied. Coop capacity is defined by buildings. */
  readonly shelterSlots: number;
  /** Chance per cycle of loss when unfenced and a predator event fires. */
  readonly predatorVulnerability: number;
  /** Career unlock required before this species can be bought, if any. */
  readonly requiresUnlock: string | null;
  /** Pasture tiles each head needs before production suffers. */
  readonly pastureTilesPerHead: number;
}

export const ANIMALS: Readonly<Record<AnimalSpecies, AnimalDefinition>> = Object.freeze({
  chicken: {
    id: 'chicken',
    displayName: 'Chicken',
    purchaseCost: cents(900),
    producesItemId: 'eggs',
    produceDisplayName: 'Eggs',
    producePerCycle: 4,
    produceUnitPrice: cents(85),
    produceStorageWeight: 1,
    produceFreshnessDecayPerDay: 0.05,
    cycleTicks: secondsToTicks(120),
    feedItemId: 'corn',
    feedPerCycle: 1,
    shelterSlots: 1,
    predatorVulnerability: 0.35,
    requiresUnlock: null,
    pastureTilesPerHead: 0.25,
  },
  cow: {
    id: 'cow',
    displayName: 'Dairy cow',
    purchaseCost: cents(11_000),
    producesItemId: 'milk',
    produceDisplayName: 'Milk',
    producePerCycle: 6,
    produceUnitPrice: cents(120),
    produceStorageWeight: 1.5,
    produceFreshnessDecayPerDay: 0.18,
    cycleTicks: secondsToTicks(200),
    feedItemId: 'clover',
    feedPerCycle: 3,
    shelterSlots: 4,
    predatorVulnerability: 0.1,
    requiresUnlock: 'specialization',
    pastureTilesPerHead: 4,
  },
});

export const ANIMAL_SPECIES = Object.keys(ANIMALS) as readonly AnimalSpecies[];

export function getAnimal(id: string): AnimalDefinition | undefined {
  return (ANIMALS as Record<string, AnimalDefinition>)[id];
}

export function isAnimalSpecies(id: string): id is AnimalSpecies {
  return Object.hasOwn(ANIMALS, id);
}

/** Species the player may buy given their unlocks. */
export function purchasableAnimals(unlocks: readonly string[]): readonly AnimalDefinition[] {
  const granted = new Set(unlocks);
  return Object.values(ANIMALS).filter(
    (animal) => animal.requiresUnlock === null || granted.has(animal.requiresUnlock),
  );
}
