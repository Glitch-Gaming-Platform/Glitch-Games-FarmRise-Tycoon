/**
 * Market order rules.
 *
 * The server generates orders from a private seed and stores them; the client
 * only ever receives the resulting order rows. These functions describe what a
 * *valid fulfilment* looks like, and both sides run them - the client to grey
 * out an impossible button, the server to actually decide.
 */
import { cents, type Cents, type OrderId } from '../domain/ids.js';
import { spotPriceFor } from '../domain/items.js';
import type { Ticks } from '../domain/time.js';
import { ok, ruleViolation, type Result } from './result.js';
import type { Inventory } from './storage.js';

export type OrderStatus = 'open' | 'fulfilled' | 'expired' | 'cancelled';

/**
 * Extra pay for committing stock to a quantity and deadline.
 *
 * Buyer, trust and market rules calculate the underlying offer first. This
 * bonus then makes the commitment itself worth another 15-30% without erasing
 * the differences between buyers.
 */
export const MIN_CONTRACT_COMMITMENT_BONUS = 0.15;
export const MAX_CONTRACT_COMMITMENT_BONUS = 0.3;

export function applyContractCommitmentBonus(currentUnitPrice: Cents, randomUnit: number): Cents {
  const sample = Number.isFinite(randomUnit) ? Math.min(1, Math.max(0, randomUnit)) : 0;
  const bonus =
    MIN_CONTRACT_COMMITMENT_BONUS +
    sample * (MAX_CONTRACT_COMMITMENT_BONUS - MIN_CONTRACT_COMMITMENT_BONUS);
  return cents(currentUnitPrice * (1 + bonus));
}

export interface MarketOrder {
  readonly id: OrderId;
  readonly buyerId: string;
  readonly itemId: string;
  readonly quantity: number;
  /** Price per unit for this contract. Usually above spot; that is the incentive. */
  readonly unitPrice: Cents;
  /** Simulation tick after which the order can no longer be fulfilled. */
  readonly deadlineTick: Ticks;
  readonly status: OrderStatus;
}

/**
 * Buyers now live in domain/buyers.ts, because a buyer is a relationship with
 * trust, quality standards and a failure penalty rather than a display name.
 */
export { BUYER_DEFINITIONS as BUYERS, DEFAULT_BUYER_ID } from '../domain/buyers.js';

/** Total payout if the order is completed. */
export function orderPayout(order: MarketOrder): Cents {
  return cents(order.quantity * order.unitPrice);
}

/** What the same goods would fetch with no contract. Drives the "is it worth it?" UI. */
export function spotValue(itemId: string, quantity: number): Cents {
  return cents(quantity * spotPriceFor(itemId));
}

/** Premium the contract pays over spot, as a ratio. 0.25 means 25% better. */
export function orderPremium(order: MarketOrder): number {
  const spot = spotValue(order.itemId, order.quantity);
  if (spot <= 0) return 0;
  return (orderPayout(order) - spot) / spot;
}

export function isExpired(order: MarketOrder, nowTick: Ticks): boolean {
  return nowTick > order.deadlineTick;
}

/**
 * The authoritative check. Everything that could make a fulfilment illegal is
 * listed here exactly once.
 */
export function validateFulfilment(
  order: MarketOrder,
  inventory: Inventory,
  nowTick: Ticks,
): Result<{ payout: Cents; inventory: Inventory }> {
  if (order.status !== 'open') return ruleViolation(`Order is ${order.status}, not open.`);
  if (isExpired(order, nowTick)) return ruleViolation('Order deadline has passed.');

  const held = inventory[order.itemId] ?? 0;
  if (held < order.quantity) {
    return ruleViolation(`Need ${order.quantity} ${order.itemId}, holding ${held}.`);
  }

  return ok({
    payout: orderPayout(order),
    inventory: { ...inventory, [order.itemId]: held - order.quantity },
  });
}

/** Immediate sale at spot price. Always legal if the goods exist. */
export function validateSpotSale(
  itemId: string,
  quantity: number,
  inventory: Inventory,
): Result<{ payout: Cents; inventory: Inventory }> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return ruleViolation('Quantity must be a positive whole number.');
  }
  const held = inventory[itemId] ?? 0;
  if (held < quantity) return ruleViolation(`Need ${quantity} ${itemId}, holding ${held}.`);
  return ok({
    payout: spotValue(itemId, quantity),
    inventory: { ...inventory, [itemId]: held - quantity },
  });
}
