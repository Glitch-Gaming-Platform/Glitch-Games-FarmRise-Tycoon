/**
 * Selling.
 *
 * Applied optimistically so the game feels instant, then reconciled: the caller
 * enqueues the equivalent server call, and the server - which owns the
 * authoritative balance - is free to disagree (docs/NETWORKING.md).
 *
 * A contract is now a promise to a specific buyer with a quality bar and a
 * penalty for breaking it, which is what makes buyer trust a resource rather
 * than a label.
 */
import {
  blendQuality,
  cents,
  getBuyer,
  meetsQualityBar,
  ok,
  projectDeliveryBonus,
  prosperityForDelivery,
  qualityPriceMultiplier,
  recordDelivery,
  recordFailure,
  requireUnlock,
  ruleViolation,
  spotPriceFor,
  townDemandMultiplier,
  trustPriceMultiplier,
  unitPriceFor,
  type BuyerId,
  type Cents,
  type Inventory,
  type Result,
} from '@farmrise/shared';
import type { Career } from '../../career/Career.js';

/** What the farm would be paid, per unit, for goods it is holding right now. */
export function spotQuote(career: Career, itemId: string): Cents {
  const quality = sellableQuality(career, itemId);
  return cents(
    spotPriceFor(itemId) *
      qualityPriceMultiplier(quality) *
      projectDeliveryBonus(career.town.completedProjectIds),
  );
}

/** Market stock: collected storage plus what the player is carrying. */
export function sellableInventory(career: Career): Inventory {
  const inventory = { ...career.world.storedInventory };
  for (const [itemId, quantity] of Object.entries(career.world.carry.items)) {
    inventory[itemId] = (inventory[itemId] ?? 0) + quantity;
  }
  return inventory;
}

export function sellableQuantity(career: Career, itemId: string): number {
  return career.world.stores.storedTotalOf(itemId) + (career.world.carry.items[itemId] ?? 0);
}

function sellableQuality(career: Career, itemId: string): number {
  const carried = career.world.carry.items[itemId] ?? 0;
  const stored = career.world.stores.storedTotalOf(itemId);
  const total = carried + stored;
  if (total <= 0) return 1;
  return (
    (carried * (career.world.carry.quality[itemId] ?? 1) +
      stored * career.world.stores.storedQualityOf(itemId)) /
    total
  );
}

function withdrawSellable(
  career: Career,
  itemId: string,
  quantity: number,
): Result<{ quality: number }> {
  const fromCarry = Math.min(quantity, career.world.carry.items[itemId] ?? 0);
  let quality = 1;
  let taken = 0;
  if (fromCarry > 0) {
    const result = career.world.carry.put(itemId, fromCarry);
    if (!result.ok) return result;
    quality = result.value.quality;
    taken = fromCarry;
  }

  const remaining = quantity - fromCarry;
  if (remaining > 0) {
    const result = career.world.stores.withdrawStoredAnywhere(itemId, remaining);
    if (!result.ok) return result;
    quality = blendQuality(taken, quality, remaining, result.value.quality);
  }
  return ok({ quality });
}

export function sellSpot(
  career: Career,
  itemId: string,
  quantity: number,
): Result<{ payout: Cents; quantity: number }> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return ruleViolation('Quantity must be a positive whole number.');
  }
  const held = sellableQuantity(career, itemId);
  if (held < quantity) return ruleViolation(`Need ${quantity} ${itemId}, holding ${held}.`);

  const taken = withdrawSellable(career, itemId, quantity);
  if (!taken.ok) return taken;

  const unit = cents(
    spotPriceFor(itemId) *
      qualityPriceMultiplier(taken.value.quality) *
      projectDeliveryBonus(career.town.completedProjectIds),
  );
  const payout = cents(unit * quantity);
  career.adjustBalance(payout, 'spot sale', true);
  career.bump('itemsSold', quantity);
  return ok({ payout, quantity });
}

export interface ContractOffer {
  readonly id: string;
  readonly buyerId: BuyerId;
  readonly itemId: string;
  readonly quantity: number;
  readonly unitPrice: Cents;
  readonly minimumQuality: number;
  readonly deadlineTick: number;
}

/**
 * Accepts a contract.
 *
 * Accepting is the commitment: from here a failure costs trust and, with the
 * cannery, money. Nothing is reserved, so the player may still sell the goods
 * elsewhere - and then has to live with that.
 */
export function acceptContract(career: Career, offer: ContractOffer): Result<void> {
  const unlocked = requireUnlock(career.unlocks, 'contracts');
  if (!unlocked.ok) return unlocked;
  const buyer = getBuyer(offer.buyerId);
  if (!buyer) return ruleViolation('That buyer is not taking orders.');
  if (career.contracts.some((contract) => contract.id === offer.id)) {
    return ruleViolation('You have already taken that contract.');
  }
  if (career.contracts.filter((contract) => contract.status === 'open').length >= 6) {
    return ruleViolation('You have promised enough for now.');
  }

  career.setContracts([
    ...career.contracts,
    {
      id: offer.id,
      buyerId: offer.buyerId,
      itemId: offer.itemId,
      quantity: offer.quantity,
      delivered: 0,
      unitPrice: offer.unitPrice,
      minimumQuality: offer.minimumQuality,
      acceptedTick: career.tick,
      deadlineTick: offer.deadlineTick,
      recurringEveryTicks: 0,
      status: 'open',
    },
  ]);
  return ok(undefined);
}

export interface DeliveryOutcome {
  readonly payout: Cents;
  readonly delivered: number;
  readonly complete: boolean;
}

/**
 * Delivers against a contract, in whatever quantity the farm can manage.
 *
 * Partial delivery is allowed on purpose: a player who is two units short an
 * hour before the deadline should be able to send what they have and then
 * decide whether to sprint for the rest.
 */
export function deliverContract(
  career: Career,
  contractId: string,
  quantity: number,
): Result<DeliveryOutcome> {
  const contract = career.contracts.find((entry) => entry.id === contractId);
  if (!contract) return ruleViolation('No such contract.');
  if (contract.status !== 'open') return ruleViolation(`That contract is ${contract.status}.`);
  if (career.tick > contract.deadlineTick) return ruleViolation('That deadline has passed.');

  const outstanding = contract.quantity - contract.delivered;
  const wanted = Math.min(Math.max(1, Math.floor(quantity)), outstanding);
  const held = sellableQuantity(career, contract.itemId);
  if (held < wanted) return ruleViolation(`Need ${wanted} ${contract.itemId}, holding ${held}.`);

  const quality = sellableQuality(career, contract.itemId);
  if (quality < contract.minimumQuality) {
    return ruleViolation('This batch is not up to the grade they asked for.');
  }
  if (!meetsQualityBar(contract.buyerId as BuyerId, quality)) {
    return ruleViolation('That buyer will not take produce of this grade.');
  }

  const taken = withdrawSellable(career, contract.itemId, wanted);
  if (!taken.ok) return taken;

  const payout = cents(
    contract.unitPrice *
      wanted *
      qualityPriceMultiplier(quality) *
      projectDeliveryBonus(career.town.completedProjectIds),
  );
  career.adjustBalance(payout, 'contract', true);
  career.bump('itemsSold', wanted);

  const delivered = contract.delivered + wanted;
  const complete = delivered >= contract.quantity;

  career.setContracts(
    career.contracts.map((entry) =>
      entry.id === contractId
        ? { ...entry, delivered, status: complete ? 'fulfilled' : 'open' }
        : entry,
    ),
  );

  if (complete) {
    const buyerId = contract.buyerId as BuyerId;
    const relationship = career.relationship(buyerId);
    career.setRelationship(buyerId, {
      ...recordDelivery(buyerId, relationship),
      lastDeliveryTick: career.tick,
    });
    career.bump('contractsCompleted');
    career.setTown({
      ...career.town,
      prosperity: career.town.prosperity + prosperityForDelivery(contract.quantity),
    });
  }

  return ok({ payout, delivered: wanted, complete });
}

/** Marks a contract failed once its deadline passes. Called by the season director. */
export function failContract(career: Career, contractId: string): void {
  const contract = career.contracts.find((entry) => entry.id === contractId);
  if (!contract || contract.status !== 'open') return;

  const buyerId = contract.buyerId as BuyerId;
  const buyer = getBuyer(buyerId);
  career.setContracts(
    career.contracts.map((entry) =>
      entry.id === contractId ? { ...entry, status: 'failed' } : entry,
    ),
  );
  career.setRelationship(buyerId, {
    ...recordFailure(buyerId, career.relationship(buyerId)),
    lastDeliveryTick: career.relationship(buyerId).lastDeliveryTick,
  });
  career.bump('contractsFailed');
  if (buyer && buyer.failurePenalty > 0) {
    career.adjustBalance(cents(-buyer.failurePenalty), 'contract penalty');
  }
}

/** Price a buyer would offer per unit today, including trust and town size. */
export function offeredUnitPrice(career: Career, buyerId: BuyerId, itemId: string): Cents {
  const buyer = getBuyer(buyerId);
  if (!buyer) return cents(0);
  const trust = career.relationship(buyerId).trust;
  return cents(
    unitPriceFor(buyer, spotPriceFor(itemId), trust) *
      townDemandMultiplier(career.town.prosperity) *
      trustPriceMultiplier(trust),
  );
}
