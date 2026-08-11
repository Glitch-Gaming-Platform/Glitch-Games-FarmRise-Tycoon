/**
 * Farm identity.
 *
 * The specialization choice is the first decision that makes two players'
 * farms genuinely different (docs/PROGRESSION_GAMEPLAY_PLAN.md §9). It must
 * therefore be a trade, never an upgrade: each one is strictly better at its
 * own chain and strictly worse at somebody else's.
 *
 * It is chosen once, at stage 2, and stored in the career save. It can be
 * changed, but at a real cost, so that a wrong early guess is recoverable
 * without making the choice meaningless.
 */
import { cents, type Cents } from './ids.js';
import type { ProcessorKind } from './processing.js';

export type SpecializationId = 'arable' | 'livestock' | 'market_garden';

export interface SpecializationDefinition {
  readonly id: SpecializationId;
  readonly displayName: string;
  /** Processor this identity is built around. */
  readonly primaryProcessor: ProcessorKind;
  /** Multiplier on batch time at the favoured processor (lower is faster). */
  readonly processingSpeed: number;
  /** Multiplier on build cost for the favoured processor. */
  readonly processorCostMultiplier: number;
  /** Yield multiplier for the crops this identity favours. */
  readonly favouredYield: number;
  readonly favouredItems: readonly string[];
  /** Yield multiplier for everything else. Below 1: this is a trade. */
  readonly unfavouredYield: number;
  /** Multiplier on soil depletion, so each identity strains the land differently. */
  readonly soilStrain: number;
  /** One-off cost to switch away from this identity later. */
  readonly switchCost: Cents;
  readonly description: string;
  readonly tradeoff: string;
}

export const SPECIALIZATIONS: Readonly<Record<SpecializationId, SpecializationDefinition>> =
  Object.freeze({
    arable: {
      id: 'arable',
      displayName: 'Arable',
      primaryProcessor: 'mill',
      processingSpeed: 0.7,
      processorCostMultiplier: 0.75,
      favouredYield: 1.3,
      favouredItems: ['wheat', 'corn'],
      unfavouredYield: 0.85,
      soilStrain: 1.35,
      switchCost: cents(12_000),
      description: 'Grain at volume, milled into flour that keeps through the winter.',
      tradeoff: 'Highest throughput and the hardest on your soil.',
    },
    livestock: {
      id: 'livestock',
      displayName: 'Livestock',
      primaryProcessor: 'creamery',
      processingSpeed: 0.75,
      processorCostMultiplier: 0.75,
      favouredYield: 0.9,
      favouredItems: ['corn'],
      unfavouredYield: 0.95,
      soilStrain: 0.7,
      switchCost: cents(14_000),
      description:
        'Animals first: milk and eggs, turned into cheese that a restaurant will pay for.',
      tradeoff: 'Steady income through every season, but it eats the feed you could have sold.',
    },
    market_garden: {
      id: 'market_garden',
      displayName: 'Market Garden',
      primaryProcessor: 'preserve_kitchen',
      processingSpeed: 0.8,
      processorCostMultiplier: 0.7,
      favouredYield: 1.45,
      favouredItems: ['pumpkin'],
      unfavouredYield: 0.75,
      soilStrain: 0.95,
      switchCost: cents(10_000),
      description: 'Few beds, fussy crops, the best price per unit if you can keep the quality up.',
      tradeoff: 'Small volumes and the most exposed to a single bad event.',
    },
  });

export const SPECIALIZATION_IDS = Object.keys(SPECIALIZATIONS) as readonly SpecializationId[];

export function getSpecialization(id: string): SpecializationDefinition | undefined {
  return (SPECIALIZATIONS as Record<string, SpecializationDefinition>)[id];
}

export function isSpecializationId(id: string): id is SpecializationId {
  return Object.hasOwn(SPECIALIZATIONS, id);
}
