/**
 * Moving goods from where they were made to where they are worth something.
 *
 * These functions are what turn distance into a cost. A harvest lands in the
 * field; the player decides whether to carry it, cart it, stage it on a loading
 * pad or leave it to spoil. Nothing here is random, so the server can re-run a
 * claimed haul exactly (docs/PROGRESSION_GAMEPLAY_PLAN.md §38.4).
 */
import { getItem } from '../domain/items.js';
import { CARRIERS, spoilageForTicks, type CarrierKind } from '../domain/logistics.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import { ok, ruleViolation, type Result } from './result.js';
import type { Inventory } from './storage.js';

export interface Load {
  readonly items: Inventory;
  readonly carrier: CarrierKind;
}

/** Storage units a set of goods occupies. Processed goods are heavier. */
export function loadWeight(items: Inventory): number {
  let total = 0;
  for (const [itemId, quantity] of Object.entries(items)) {
    total += Math.max(0, quantity) * (getItem(itemId)?.storageWeight ?? 1);
  }
  return total;
}

export function carryCapacity(carrier: CarrierKind): number {
  return CARRIERS[carrier].capacity;
}

export function freeCapacity(load: Load): number {
  return Math.max(0, carryCapacity(load.carrier) - loadWeight(load.items));
}

/** Movement speed multiplier, scaled by how full the carrier actually is. */
export function loadedSpeedMultiplier(load: Load): number {
  const definition = CARRIERS[load.carrier];
  const fullness = Math.min(1, loadWeight(load.items) / Math.max(1, definition.capacity));
  return 1 - (1 - definition.loadedSpeedMultiplier) * fullness;
}

export interface TransferOutcome {
  readonly from: Inventory;
  readonly to: Inventory;
  readonly moved: number;
  /** Units that would not fit and were left behind. */
  readonly refused: number;
}

/**
 * Moves as much of one item as will fit, and reports what did not.
 *
 * Partial transfer rather than rejection: standing at a full barn holding
 * twelve pumpkins should put ten of them away, not none of them.
 */
export function transferItem(
  from: Inventory,
  to: Inventory,
  itemId: string,
  requested: number,
  destinationCapacity: number,
): Result<TransferOutcome> {
  if (!Number.isFinite(requested) || requested <= 0) {
    return ruleViolation('Quantity must be positive.');
  }
  const held = from[itemId] ?? 0;
  if (held <= 0) return ruleViolation(`Nothing to move: no ${itemId} here.`);

  const weight = getItem(itemId)?.storageWeight ?? 1;
  const room = Math.max(0, destinationCapacity - loadWeight(to));
  const movable = Math.min(held, requested, Math.floor(room / weight));

  if (movable <= 0) {
    return ruleViolation('There is no room for that.');
  }

  return ok({
    from: { ...from, [itemId]: held - movable },
    to: { ...to, [itemId]: (to[itemId] ?? 0) + movable },
    moved: movable,
    refused: Math.min(held, requested) - movable,
  });
}

/** Ticks to move a quantity in or out of a carrier. */
export function transferTicks(carrier: CarrierKind, quantity: number): Ticks {
  return Math.ceil(CARRIERS[carrier].transferTicksPerUnit * Math.max(0, quantity));
}

export interface SpoilageOutcome {
  readonly items: Inventory;
  /** Fractional loss carried into the next tick, per item. */
  readonly remainder: Readonly<Record<string, number>>;
  readonly lost: number;
}

/**
 * Applies decay to a pile of goods.
 *
 * The fractional part is carried rather than dropped. Rounding decay away every
 * tick would make a hundred small ticks cost nothing at all, and would let a
 * player dodge spoilage entirely by saving and reloading (§33.8).
 */
export function applySpoilage(
  items: Inventory,
  /**
   * Multiplier on each item's own decay rate, not a rate of its own. See
   * STORED_SPOILAGE_MULTIPLIER and FIELD_SPOILAGE_MULTIPLIER for why.
   */
  environmentMultiplier: number,
  dtTicks: Ticks,
  remainder: Readonly<Record<string, number>> = {},
  preserving = false,
): SpoilageOutcome {
  if (preserving || environmentMultiplier <= 0 || dtTicks <= 0) {
    return { items, remainder, lost: 0 };
  }

  const nextItems: Record<string, number> = { ...items };
  const nextRemainder: Record<string, number> = { ...remainder };
  let lost = 0;

  for (const [itemId, quantity] of Object.entries(items)) {
    if (quantity <= 0) continue;
    const itemRate = environmentMultiplier * (getItem(itemId)?.freshnessDecayPerDay ?? 0);
    const owed = spoilageForTicks(itemRate, dtTicks) * quantity + (nextRemainder[itemId] ?? 0);
    const whole = Math.floor(owed);
    nextRemainder[itemId] = owed - whole;
    if (whole > 0) {
      const removed = Math.min(quantity, whole);
      nextItems[itemId] = quantity - removed;
      lost += removed;
    }
  }

  return { items: nextItems, remainder: nextRemainder, lost };
}

/**
 * Ticks until this pile loses its next whole unit, or null if it never will.
 *
 * Spoilage is charged in whole units with the fraction carried, so "how long
 * have I got?" is a question about when the accumulator next crosses one - not
 * about the decay rate in the abstract. The interface asks it of whatever the
 * player is standing next to.
 */
export function ticksUntilNextLoss(
  items: Inventory,
  environmentMultiplier: number,
  remainder: Readonly<Record<string, number>> = {},
  preserving = false,
): Ticks | null {
  if (preserving || environmentMultiplier <= 0) return null;

  let soonest: Ticks | null = null;
  for (const [itemId, quantity] of Object.entries(items)) {
    if (quantity <= 0) continue;
    // Clamped exactly as applySpoilage clamps it, or this would promise a loss
    // sooner than the simulation delivers one for anything very perishable in a
    // very bad place - milk in an open field is already past 100% a day.
    const perDay = Math.min(
      1,
      environmentMultiplier * (getItem(itemId)?.freshnessDecayPerDay ?? 0),
    );
    if (perDay <= 0) continue;

    const perTick = (perDay * quantity) / GAME_DAY_TICKS;
    if (perTick <= 0) continue;
    const carried = Math.min(1, Math.max(0, remainder[itemId] ?? 0));
    let ticks = Math.max(1, Math.ceil((1 - carried) / perTick));
    // Ceiling can land a hair short of the whole unit in floating point, which
    // would have this promise a loss one tick before the simulation delivers
    // it. Step forward until the two actually agree.
    if (perTick * ticks + carried < 1) ticks += 1;
    if (soonest === null || ticks < soonest) soonest = ticks;
  }
  return soonest;
}

/**
 * How much of a pile survives the next in-game day where it is standing.
 *
 * Expressed as a fraction so a meter can show "keeping" rather than "losing",
 * which is the direction the player actually cares about.
 */
export function fractionKeptPerDay(items: Inventory, environmentMultiplier: number): number {
  const total = totalUnits(items);
  if (total <= 0) return 1;
  const after = applySpoilage(items, environmentMultiplier, GAME_DAY_TICKS);
  return Math.min(1, Math.max(0, totalUnits(after.items) / total));
}

/** Total units held, for capacity readouts and milestone counting. */
export function totalUnits(items: Inventory): number {
  return Object.values(items).reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
}
