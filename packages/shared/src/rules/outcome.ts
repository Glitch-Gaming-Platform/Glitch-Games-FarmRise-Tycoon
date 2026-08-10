/**
 * Session outcome rules: how a run is won, and how it is lost.
 *
 * These live in the shared package because the server must be able to reach
 * the same verdict as the client. A client that could declare its own
 * victory could grant itself the land parcel; a client that could declare
 * its own bankruptcy could reset a run it was losing.
 *
 * The design constraint from docs/game-design/mechanics-and-core-loop.md:
 * "Expansion initially means purchasing one adjacent plot." So the first
 * playable has exactly one win condition and it is that purchase.
 */
import { CROPS } from '../domain/crops.js';
import { cents, type Cents } from '../domain/ids.js';
import type { Ticks } from '../domain/time.js';
import { ok, ruleViolation, type Result } from './result.js';
import type { Inventory } from './storage.js';

/**
 * Price of the adjacent parcel - the slice's success condition.
 *
 * Priced against MEASURED cycle economics rather than intuition. Six plots
 * yield roughly, per cycle: wheat +900 over 90 s, corn +2,640 over 180 s,
 * pumpkin +8,760 over 330 s. Starting balance is 5,000.
 *
 * At 25,000 a wheat-only player needed about 22 cycles - over half an hour -
 * while a pumpkin player finished in two. That spread punished the safe,
 * beginner-friendly crop, which is the opposite of the intent. At 15,000 the
 * range is roughly 8-16 minutes across strategies, which fits one sitting and
 * still forces at least one real reinvestment decision on the way.
 *
 * Re-derive this whenever crop economics change; it is the single number that
 * decides how long the slice takes.
 */
export const LAND_PARCEL_COST: Cents = cents(15_000);

/** Maximum parcels ownable in the first playable. */
export const MAX_LAND_PARCELS = 2;

export type RunOutcome = 'in_progress' | 'expanded' | 'bankrupt';

export interface RunState {
  readonly balance: Cents;
  readonly inventory: Inventory;
  readonly landParcels: number;
  /** Number of plots currently holding a crop, at any stage. */
  readonly growingPlots: number;
  /** Whether any building is still under construction. */
  readonly buildingInProgress: boolean;
}

/** Cheapest way back into the loop. Below this, a player cannot plant anything. */
export function cheapestSeedCost(): Cents {
  return cents(Math.min(...Object.values(CROPS).map((crop) => crop.seedCost)));
}

export function totalItems(inventory: Inventory): number {
  return Object.values(inventory).reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
}

/**
 * A run is lost only when the player has no path back into the loop:
 * no money for the cheapest seed, nothing to sell, nothing growing, and
 * nothing being built.
 *
 * All four conditions are required on purpose. The design pillar is
 * "Recoverable Disruption" - a player who is merely poor is having a bad
 * run, not a lost one, and telling them otherwise would contradict the
 * entire event design.
 */
export function isBankrupt(run: RunState): boolean {
  return (
    run.balance < cheapestSeedCost() &&
    totalItems(run.inventory) === 0 &&
    run.growingPlots === 0 &&
    !run.buildingInProgress
  );
}

export function evaluateRun(run: RunState): RunOutcome {
  if (run.landParcels >= MAX_LAND_PARCELS) return 'expanded';
  if (isBankrupt(run)) return 'bankrupt';
  return 'in_progress';
}

/** Progress toward the goal, 0..1. Drives the objective meter in the HUD. */
export function expansionProgress(balance: Cents): number {
  return Math.max(0, Math.min(1, balance / LAND_PARCEL_COST));
}

export function validateLandPurchase(run: RunState): Result<{ balance: Cents; parcels: number }> {
  if (run.landParcels >= MAX_LAND_PARCELS) {
    return ruleViolation('There is no more land to buy in this build.');
  }
  if (run.balance < LAND_PARCEL_COST) {
    return ruleViolation('Not enough money for the neighbouring parcel.');
  }
  return ok({
    balance: cents(run.balance - LAND_PARCEL_COST),
    parcels: run.landParcels + 1,
  });
}

/**
 * A run summary, used by the outcome screen and by analytics.
 *
 * `cyclesCompleted` is the number the core playtest question actually turns
 * on - "does this create an engaging reason to begin another production
 * cycle?" is answered by how many cycles players voluntarily start.
 */
export interface RunSummary {
  readonly outcome: RunOutcome;
  readonly elapsedTicks: Ticks;
  readonly finalBalance: Cents;
  readonly peakBalance: Cents;
  readonly totalEarned: Cents;
  readonly totalSpent: Cents;
  readonly cropsHarvested: number;
  readonly cyclesCompleted: number;
  readonly eventsSurvived: number;
  readonly eventsPrevented: number;
  readonly buildingsBuilt: number;
}
