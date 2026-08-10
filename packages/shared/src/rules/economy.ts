/**
 * Money rules: what the player can afford, and what the farm costs to run.
 *
 * Every function here takes the whole relevant state and returns a Result, so
 * the server can call it with the stored state and the client can call it with
 * its predicted state without either of them re-implementing the arithmetic.
 */
import { BUILDINGS, type BuildingKind } from '../domain/buildings.js';
import { requireCrop } from '../domain/crops.js';
import { addCents, cents, subCents, type Cents } from '../domain/ids.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import { ok, ruleViolation, type Result } from './result.js';

export interface Wallet {
  readonly balance: Cents;
}

export function canAfford(wallet: Wallet, price: Cents): boolean {
  return wallet.balance >= price;
}

export function spend(wallet: Wallet, price: Cents, label: string): Result<Wallet> {
  if (price < 0) return ruleViolation('Price cannot be negative.');
  if (!canAfford(wallet, price)) {
    return ruleViolation(`Cannot afford ${label}: costs ${price}, balance ${wallet.balance}.`);
  }
  return ok({ balance: subCents(wallet.balance, price) });
}

export function earn(wallet: Wallet, amount: Cents): Wallet {
  return { balance: addCents(wallet.balance, Math.max(0, amount) as Cents) };
}

export function seedPrice(cropId: string): Cents {
  return requireCrop(cropId).seedCost;
}

export function buildPrice(kind: BuildingKind): Cents {
  return BUILDINGS[kind].buildCost;
}

/** Upkeep accrued by a set of completed buildings over a span of ticks. */
export function upkeepForTicks(buildings: readonly BuildingKind[], dtTicks: Ticks): Cents {
  const perDay = buildings.reduce((total, kind) => total + BUILDINGS[kind].upkeepPerDay, 0);
  return cents((perDay * dtTicks) / GAME_DAY_TICKS);
}

/** Starting money for a new save. Enough for roughly two wheat cycles plus a road. */
export const STARTING_BALANCE: Cents = cents(5000);

/**
 * Sanity ceiling used by the server as a cheap anti-cheat heuristic: no
 * legitimate session can gain more than this per tick. It is intentionally
 * generous - it exists to catch "balance = 99999999", not to balance the game.
 * The tuned, secret thresholds live on the server.
 */
export const MAX_PLAUSIBLE_EARNINGS_PER_TICK: Cents = cents(400);

/**
 * Companion ceiling for goods. Six plots of the fastest crop cannot physically
 * produce more than this per tick, so a save claiming more has been edited.
 * Same caveat as above: a coarse impossibility check, not balance.
 */
export const MAX_PLAUSIBLE_ITEMS_PER_TICK = 0.5;

/**
 * How far ahead of the server's own clock a client's tick counter may run
 * before the write is rejected. Covers clock skew and a slow round trip without
 * allowing a client to fast-forward growth timers by inventing elapsed time.
 */
export const MAX_TICK_DRIFT_TICKS = 60 * 30;
