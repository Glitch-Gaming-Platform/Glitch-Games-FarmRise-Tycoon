/**
 * Carrying, dropping and buying something better to carry with.
 *
 * These are the verbs the second parcel creates a need for. None of them do
 * anything clever; they exist so that the walk between where food grows and
 * where it is worth money is a thing the player performs rather than a thing
 * the simulation assumes.
 */
import {
  CARRIERS,
  cents,
  getCarrier,
  ok,
  ruleViolation,
  type CarrierKind,
  type Result,
} from '@farmrise/shared';
import type { Career } from '../../career/Career.js';

export interface DepositOutcome {
  readonly stored: number;
  readonly refused: number;
  readonly storeId: string;
}

/**
 * Puts everything the player is carrying into the store they are standing at.
 *
 * All of it at once, deliberately: a per-item transfer UI would turn the most
 * frequent action in the game into a menu.
 */
export function depositCarried(
  career: Career,
  tileX: number,
  tileZ: number,
  targetStoreId?: string,
): Result<DepositOutcome> {
  const world = career.world;
  if (world.carry.isEmpty) return ruleViolation('You are not carrying anything.');

  const store = targetStoreId
    ? storeInRange(world.stores.get(targetStoreId), tileX, tileZ, 2)
    : world.stores.nearest(tileX, tileZ, 2);
  if (!store) return ruleViolation('There is nowhere to put this here.');

  const load = world.carry.drain();
  let stored = 0;
  let refused = 0;

  for (const [itemId, quantity] of Object.entries(load.items)) {
    if (quantity <= 0) continue;
    const outcome = world.stores.deposit(store.id, itemId, quantity, load.quality[itemId] ?? 1);
    stored += outcome.stored;
    if (outcome.spilled > 0) {
      // Anything that does not fit stays in the player's hands rather than
      // vanishing, so a full barn is a problem to solve, not a loss to mourn.
      world.carry.pickUp(itemId, outcome.spilled, load.quality[itemId] ?? 1);
      refused += outcome.spilled;
    }
  }

  career.bump('goodsHauled', stored);
  return ok({ stored, refused, storeId: store.id });
}

/** Picks a field stack back up. */
export function collectStack(
  career: Career,
  tileX: number,
  tileZ: number,
  targetStoreId?: string,
): Result<{ taken: number }> {
  const world = career.world;
  const store = targetStoreId
    ? storeInRange(world.stores.get(targetStoreId), tileX, tileZ, 2)
    : world.stores.nearest(tileX, tileZ, 2);
  if (!store || store.buildingId !== null || !store.id.startsWith('stack-')) {
    return ruleViolation('There is nothing to pick up here.');
  }

  let taken = 0;
  for (const [itemId, quantity] of Object.entries(store.items)) {
    if (quantity <= 0) continue;
    const outcome = world.carry.pickUp(itemId, quantity, store.quality[itemId] ?? 1);
    if (outcome.taken > 0) {
      world.stores.withdraw(store.id, itemId, outcome.taken);
      taken += outcome.taken;
    }
  }

  if (taken === 0) return ruleViolation('Your hands are full.');
  return ok({ taken });
}

function storeInRange<T extends { tileX: number; tileZ: number }>(
  store: T | undefined,
  tileX: number,
  tileZ: number,
  maxTiles: number,
): T | undefined {
  if (!store) return undefined;
  const distance = Math.abs(store.tileX - tileX) + Math.abs(store.tileZ - tileZ);
  return distance <= maxTiles ? store : undefined;
}

export function buyCarrier(career: Career, kind: string): Result<{ carrier: CarrierKind }> {
  const definition = getCarrier(kind);
  if (!definition) return ruleViolation(`There is no such thing as a ${kind}.`);
  if (career.world.carry.owns(definition.id)) return ruleViolation('You already have one.');
  if (definition.requiresUnlock && !career.unlocks.includes(definition.requiresUnlock)) {
    return ruleViolation('Nobody in Millbrook has one of those to sell you yet.');
  }
  if (career.balance < definition.purchaseCost) return ruleViolation('Not enough money.');

  career.adjustBalance(cents(-definition.purchaseCost), 'carrier');
  career.world.carry.own(definition.id);
  return ok({ carrier: definition.id });
}

/** Switches between carrying by hand and using the cart. */
export function useCarrier(career: Career, kind: string): Result<void> {
  if (!(kind in CARRIERS)) return ruleViolation(`There is no such thing as a ${kind}.`);
  return career.world.carry.use(kind as CarrierKind);
}

/** Leaves the cart where the player is standing. */
export function parkCart(career: Career, tileX: number, tileZ: number): Result<void> {
  if (career.world.carry.carrier === 'arms') return ruleViolation('You are not using a cart.');
  career.world.carry.parkCart(tileX, tileZ);
  return ok(undefined);
}
