/**
 * Animal definitions - first playable scope is exactly one animal.
 *
 * The chicken exists to create the "sell the corn now, or feed it to something
 * that pays later" decision. Its feed is a crop the player could otherwise sell.
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

/** The species that exist. Widened only by adding a member here. */
export type AnimalSpecies = 'chicken';

export interface AnimalDefinition {
  readonly id: AnimalSpecies;
  readonly displayName: string;
  readonly purchaseCost: Cents;
  /** Item id produced on each completed cycle. */
  readonly producesItemId: string;
  readonly producePerCycle: number;
  readonly produceUnitPrice: Cents;
  readonly cycleTicks: Ticks;
  /** Crop id consumed as feed, and how many units per cycle. */
  readonly feedItemId: string;
  readonly feedPerCycle: number;
  /** Shelter slots occupied. Coop capacity is defined by buildings. */
  readonly shelterSlots: number;
  /** Chance per cycle of loss when unfenced and a predator event fires. */
  readonly predatorVulnerability: number;
}

export const ANIMALS: Readonly<Record<AnimalSpecies, AnimalDefinition>> = Object.freeze({
  chicken: {
    id: 'chicken',
    displayName: 'Chicken',
    purchaseCost: cents(900),
    producesItemId: 'eggs',
    producePerCycle: 4,
    produceUnitPrice: cents(85),
    cycleTicks: secondsToTicks(120),
    feedItemId: 'corn',
    feedPerCycle: 1,
    shelterSlots: 1,
    predatorVulnerability: 0.35,
  },
});

export function getAnimal(id: string): AnimalDefinition | undefined {
  return (ANIMALS as Record<string, AnimalDefinition>)[id];
}

export function isAnimalSpecies(id: string): id is AnimalSpecies {
  return Object.hasOwn(ANIMALS, id);
}
