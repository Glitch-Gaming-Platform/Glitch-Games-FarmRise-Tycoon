/**
 * Animal definitions.
 *
 * The chicken creates the first "sell the corn now, or feed it to something
 * that pays later" decision. Sheep extend that corn chain after Stage 1 with
 * slower, non-spoiling wool, while the cow escalates into clover, pasture and
 * dairy processing (docs/PROGRESSION_GAMEPLAY_PLAN.md §9).
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

/** The species that exist. Widened only by adding a member here. */
export type AnimalSpecies = 'chicken' | 'sheep' | 'cow' | 'dog';

interface AnimalDefinitionBase {
  readonly id: AnimalSpecies;
  readonly displayName: string;
  readonly purchaseCost: Cents;
  /** Whether this animal creates goods or protects its assigned shelter. */
  readonly role: 'producer' | 'guardian';
  /** Shelter slots occupied. Coop capacity is defined by buildings. */
  readonly shelterSlots: number;
  /** Career unlock required before this species can be bought, if any. */
  readonly requiresUnlock: string | null;
  /** Pasture tiles each head needs before production suffers. */
  readonly pastureTilesPerHead: number;
}

export interface ProducingAnimalDefinition extends AnimalDefinitionBase {
  readonly role: 'producer';
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
  /** Chance per cycle of loss when unfenced and a predator event fires. */
  readonly predatorVulnerability: number;
}

export interface GuardianAnimalDefinition extends AnimalDefinitionBase {
  readonly role: 'guardian';
  /** Foxes this animal can drive away from its assigned shelter during one raid. */
  readonly foxesDeterredPerRaid: number;
}

export type AnimalDefinition = ProducingAnimalDefinition | GuardianAnimalDefinition;

export const ANIMALS = Object.freeze({
  chicken: {
    id: 'chicken',
    displayName: 'Chicken',
    purchaseCost: cents(900),
    role: 'producer',
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
  sheep: {
    id: 'sheep',
    displayName: 'Sheep',
    purchaseCost: cents(3_600),
    role: 'producer',
    producesItemId: 'wool',
    produceDisplayName: 'Wool',
    producePerCycle: 4,
    // Wool is exactly twice the unit value of eggs, but takes much longer to
    // arrive. Its zero spoilage is the reason to accept the slower turnover.
    produceUnitPrice: cents(170),
    produceStorageWeight: 1.25,
    produceFreshnessDecayPerDay: 0,
    cycleTicks: secondsToTicks(300),
    feedItemId: 'corn',
    feedPerCycle: 2,
    shelterSlots: 2,
    predatorVulnerability: 0.2,
    requiresUnlock: 'animal_shelters',
    pastureTilesPerHead: 2,
  },
  cow: {
    id: 'cow',
    displayName: 'Dairy cow',
    purchaseCost: cents(11_000),
    role: 'producer',
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
  dog: {
    id: 'dog',
    displayName: 'Farm dog',
    purchaseCost: cents(10_000),
    role: 'guardian',
    shelterSlots: 1,
    requiresUnlock: 'farm_dog',
    pastureTilesPerHead: 0,
    foxesDeterredPerRaid: 10,
  },
} satisfies Readonly<Record<AnimalSpecies, AnimalDefinition>>);

export const ANIMAL_SPECIES = Object.keys(ANIMALS) as readonly AnimalSpecies[];

export function getAnimal(id: string): AnimalDefinition | undefined {
  return (ANIMALS as Record<string, AnimalDefinition>)[id];
}

export function isAnimalSpecies(id: string): id is AnimalSpecies {
  return Object.hasOwn(ANIMALS, id);
}

export function isProducingAnimal(
  definition: AnimalDefinition,
): definition is ProducingAnimalDefinition {
  return definition.role === 'producer';
}

export function isGuardianAnimal(
  definition: AnimalDefinition,
): definition is GuardianAnimalDefinition {
  return definition.role === 'guardian';
}

/** Species the player may buy given their unlocks. */
export function purchasableAnimals(unlocks: readonly string[]): readonly AnimalDefinition[] {
  const granted = new Set(unlocks);
  return Object.values(ANIMALS).filter(
    (animal) => animal.requiresUnlock === null || granted.has(animal.requiresUnlock),
  );
}
