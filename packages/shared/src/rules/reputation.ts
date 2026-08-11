/**
 * Buyer trust.
 *
 * Trust is the progression resource that cannot be bought (§5). It is earned
 * one delivery at a time and lost several at a time, which is what makes an
 * accepted contract feel like a promise rather than a button.
 *
 * Asymmetry is the design: a failure costs more trust than a delivery earns, so
 * a player who over-commits to the cannery in a drought year has a real problem
 * that money alone does not solve.
 */
import {
  BUYER_DEFINITIONS,
  MAX_TRUST,
  TRUST_TIERS,
  getBuyer,
  type BuyerDefinition,
  type BuyerId,
  type TrustTier,
} from '../domain/buyers.js';
import { cents, type Cents } from '../domain/ids.js';
import { ok, ruleViolation, type Result } from './result.js';

export interface Relationship {
  readonly trust: number;
  readonly deliveries: number;
  readonly failures: number;
}

export function trustTier(trust: number): TrustTier {
  let tier: TrustTier = 'unknown';
  for (const entry of TRUST_TIERS) {
    if (trust >= entry.min) tier = entry.tier;
  }
  return tier;
}

export function trustTierLabel(trust: number): string {
  const tier = trustTier(trust);
  return TRUST_TIERS.find((entry) => entry.tier === tier)?.label ?? 'New supplier';
}

export function recordDelivery(buyerId: BuyerId, relationship: Relationship): Relationship {
  const buyer = BUYER_DEFINITIONS[buyerId];
  return {
    trust: clamp(relationship.trust + buyer.trustPerDelivery, 0, MAX_TRUST),
    deliveries: relationship.deliveries + 1,
    failures: relationship.failures,
  };
}

export function recordFailure(buyerId: BuyerId, relationship: Relationship): Relationship {
  const buyer = BUYER_DEFINITIONS[buyerId];
  return {
    trust: clamp(relationship.trust + buyer.trustPerFailure, 0, MAX_TRUST),
    deliveries: relationship.deliveries,
    failures: relationship.failures + 1,
  };
}

/**
 * Price multiplier a relationship earns.
 *
 * Capped at a fifth above the buyer's base. Trust is meant to open doors -
 * bigger contracts, fussier buyers - rather than to inflate every price, which
 * would make late-game money accelerate exactly where it should not.
 */
export function trustPriceMultiplier(trust: number): number {
  return 1 + 0.2 * clamp(trust / MAX_TRUST, 0, 1);
}

/** Contract volume a relationship earns, as a multiplier on the buyer's range. */
export function trustVolumeMultiplier(trust: number): number {
  return 1 + 0.75 * clamp(trust / MAX_TRUST, 0, 1);
}

export function unitPriceFor(buyer: BuyerDefinition, spotPrice: Cents, trust: number): Cents {
  return cents(spotPrice * buyer.priceMultiplier * trustPriceMultiplier(trust));
}

export interface BuyerAvailability {
  readonly buyer: BuyerDefinition;
  readonly available: boolean;
  readonly reason: string | null;
}

/** Whether a buyer will talk to this farm at all, and if not, why not. */
export function buyerAvailability(
  buyerId: string,
  stage: number,
  trust: number,
): Result<BuyerAvailability> {
  const buyer = getBuyer(buyerId);
  if (!buyer) return ruleViolation(`Unknown buyer: ${buyerId}.`);
  if (buyer.unlocksAtStage > stage) {
    return ok({ buyer, available: false, reason: 'You have not been introduced yet.' });
  }
  if (trust < buyer.minimumTrust) {
    return ok({
      buyer,
      available: false,
      reason: `Wants a supplier with a track record (${buyer.minimumTrust} trust).`,
    });
  }
  return ok({ buyer, available: true, reason: null });
}

/** Penalty charged when a contract expires unfulfilled. */
export function failurePenalty(buyerId: BuyerId): Cents {
  return BUYER_DEFINITIONS[buyerId].failurePenalty;
}

/** Whether goods of this grade satisfy the buyer. */
export function meetsQualityBar(buyerId: BuyerId, quality: number): boolean {
  return quality >= BUYER_DEFINITIONS[buyerId].minimumQuality;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
