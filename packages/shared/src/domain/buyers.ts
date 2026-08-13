/**
 * Who buys the farm's output.
 *
 * A second buyer only earns its place if it behaves differently from the first
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §27.4), so each buyer here trades a
 * different pair of virtues:
 *
 *   grocer     - small, frequent, forgiving. Always there, never lucrative.
 *   cannery    - large volume at a discount, but wants one item in bulk and
 *                punishes a missed delivery hard.
 *   restaurant - the best price in the game for small quantities, gated behind
 *                trust and fussy about quality.
 *   cooperative- pays late and modestly but takes anything, which is what makes
 *                it the recovery buyer after a bad season.
 *
 * Trust is earned by delivering and lost by failing. It is stored per buyer in
 * the career save and validated by the server.
 */
import { cents, type Cents } from './ids.js';
import type { UnlockId } from './milestones.js';
import { secondsToTicks, type Ticks } from './time.js';

export type BuyerId =
  'millbrook_grocers' | 'valley_cannery' | 'thornwood_restaurant' | 'growers_co_op';

export const DEFAULT_BUYER_ID: BuyerId = 'millbrook_grocers';

export interface BuyerDefinition {
  readonly id: BuyerId;
  readonly displayName: string;
  /** Career stage at which this buyer becomes contactable. */
  readonly unlocksAtStage: number;
  /** Introduction earned from a milestone, if this is not the opening buyer. */
  readonly requiresUnlock: UnlockId | null;
  /** Trust needed before this buyer offers its contracts, 0..100. */
  readonly minimumTrust: number;
  /** Multiplier on spot price for contracts from this buyer. */
  readonly priceMultiplier: number;
  /** Typical contract size in item units. */
  readonly orderSize: { readonly min: number; readonly max: number };
  /** How long its contracts stay open. */
  readonly deadlineTicks: Ticks;
  /** Trust gained by completing one contract. */
  readonly trustPerDelivery: number;
  /** Trust lost by letting one expire. */
  readonly trustPerFailure: number;
  /** Minimum quality grade accepted, 0..1. */
  readonly minimumQuality: number;
  /** Flat penalty charged when a contract from this buyer expires unfulfilled. */
  readonly failurePenalty: Cents;
  readonly itemPreference: readonly string[];
  readonly description: string;
}

export const BUYER_DEFINITIONS: Readonly<Record<BuyerId, BuyerDefinition>> = Object.freeze({
  millbrook_grocers: {
    id: 'millbrook_grocers',
    displayName: 'Millbrook Grocers',
    unlocksAtStage: 0,
    requiresUnlock: null,
    minimumTrust: 0,
    priceMultiplier: 1.25,
    orderSize: { min: 6, max: 18 },
    deadlineTicks: secondsToTicks(300),
    trustPerDelivery: 4,
    trustPerFailure: -3,
    minimumQuality: 0,
    failurePenalty: cents(0),
    itemPreference: [
      'wheat',
      'corn',
      'pumpkin',
      'radish',
      'pea',
      'strawberry',
      'sunflower',
      'tomato',
      'avocado',
      'beetroot',
      'cranberry',
      'grape',
      'carrot',
      'cabbage',
      'garlic',
      'eggs',
    ],
    description: 'The village shop. Small orders, quick money, no ambition.',
  },
  valley_cannery: {
    id: 'valley_cannery',
    displayName: 'Valley Cannery',
    unlocksAtStage: 1,
    requiresUnlock: 'buyer_cannery',
    minimumTrust: 0,
    priceMultiplier: 1.1,
    orderSize: { min: 40, max: 90 },
    deadlineTicks: secondsToTicks(900),
    trustPerDelivery: 6,
    trustPerFailure: -12,
    minimumQuality: 0,
    failurePenalty: cents(2500),
    itemPreference: [
      'corn',
      'pumpkin',
      'tomato',
      'strawberry',
      'cranberry',
      'grape',
      'beetroot',
      'cabbage',
      'wheat',
    ],
    description:
      'Buys in bulk at a thin margin and charges you for a missed delivery. Volume is the whole point.',
  },
  thornwood_restaurant: {
    id: 'thornwood_restaurant',
    displayName: 'Thornwood Restaurant',
    unlocksAtStage: 3,
    requiresUnlock: 'buyer_restaurant',
    minimumTrust: 0,
    priceMultiplier: 2.1,
    orderSize: { min: 4, max: 12 },
    deadlineTicks: secondsToTicks(420),
    trustPerDelivery: 8,
    trustPerFailure: -18,
    minimumQuality: 0.7,
    failurePenalty: cents(1200),
    itemPreference: [
      'pumpkin',
      'strawberry',
      'tomato',
      'avocado',
      'cranberry',
      'grape',
      'garlic',
      'eggs',
      'cheese',
      'preserves',
    ],
    description:
      'Pays extraordinarily well for small quantities of high-grade produce, and notices when it slips.',
  },
  growers_co_op: {
    id: 'growers_co_op',
    displayName: "Growers' Co-op",
    unlocksAtStage: 1,
    requiresUnlock: 'buyer_co_op',
    minimumTrust: 0,
    priceMultiplier: 0.95,
    orderSize: { min: 15, max: 40 },
    deadlineTicks: secondsToTicks(1200),
    trustPerDelivery: 2,
    trustPerFailure: -1,
    minimumQuality: 0,
    failurePenalty: cents(0),
    itemPreference: [
      'wheat',
      'corn',
      'pumpkin',
      'clover',
      'radish',
      'pea',
      'strawberry',
      'sunflower',
      'tomato',
      'avocado',
      'beetroot',
      'cranberry',
      'grape',
      'carrot',
      'cabbage',
      'garlic',
      'eggs',
      'flour',
      'cheese',
      'preserves',
    ],
    description:
      'Takes anything at slightly under spot and forgives almost everything. The buyer you fall back on.',
  },
});

export const BUYER_IDS = Object.keys(BUYER_DEFINITIONS) as readonly BuyerId[];

export function getBuyer(id: string): BuyerDefinition | undefined {
  return (BUYER_DEFINITIONS as Record<string, BuyerDefinition>)[id];
}

export function isBuyerId(id: string): id is BuyerId {
  return Object.hasOwn(BUYER_DEFINITIONS, id);
}

/** Trust bands, used for both presentation and contract gating. */
export type TrustTier = 'unknown' | 'trying_you' | 'reliable' | 'preferred';

export const TRUST_TIERS: readonly { tier: TrustTier; min: number; label: string }[] =
  Object.freeze([
    { tier: 'unknown', min: 0, label: 'New supplier' },
    { tier: 'trying_you', min: 20, label: 'Trying you out' },
    { tier: 'reliable', min: 50, label: 'Reliable supplier' },
    { tier: 'preferred', min: 80, label: 'Preferred supplier' },
  ]);

export const MAX_TRUST = 100;
