/**
 * How a career is judged.
 *
 * The first playable had a terminal outcome: buy the parcel and the run ends.
 * A career has no such moment - buying land is now a beginning, and insolvency
 * is a restructuring rather than an ending (see finance.ts and
 * docs/decisions/0018-career-restructuring-instead-of-bankruptcy.md).
 *
 * What remains here is what both the client and the server still need to agree
 * on: whether the farm is in trouble, and how to summarise a stretch of play.
 */
import { CROPS } from '../domain/crops.js';
import { cents, type Cents } from '../domain/ids.js';
import { STAGE_NAMES, type CareerStage } from '../domain/milestones.js';
import type { Season } from '../domain/seasons.js';
import type { Ticks } from '../domain/time.js';
import type { Inventory } from './storage.js';

/** Cheapest way back into the loop. Below this, a player cannot plant anything. */
export function cheapestSeedCost(): Cents {
  return cents(Math.min(...Object.values(CROPS).map((crop) => crop.seedCost)));
}

export function totalItems(inventory: Inventory): number {
  return Object.values(inventory).reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
}

export type CareerHealth = 'healthy' | 'strained' | 'insolvent';

export interface CareerHealthState {
  readonly balance: Cents;
  readonly storedUnits: number;
  readonly growingPlots: number;
  readonly buildingInProgress: boolean;
  readonly debt: Cents;
  readonly dailyCosts: Cents;
}

/**
 * A three-state read on the farm's finances.
 *
 * 'strained' exists so the UI can warn before the restructuring is forced. A
 * player who is told "you are running out of room" can act; one who is only
 * told after the bank has already sold their cart cannot.
 */
export function careerHealth(state: CareerHealthState): CareerHealth {
  const canPlant = state.balance >= cheapestSeedCost();
  if (
    !canPlant &&
    state.storedUnits === 0 &&
    state.growingPlots === 0 &&
    !state.buildingInProgress
  ) {
    return 'insolvent';
  }
  if (state.balance < state.dailyCosts * 2 || state.debt > state.balance * 3) return 'strained';
  return 'healthy';
}

/**
 * A summary of one stretch of play.
 *
 * Used by the season review, the milestone card and the analytics funnel.
 * `cyclesCompleted` is the number the core playtest question turns on - "does
 * this create an engaging reason to begin another production cycle?" is
 * answered by how many cycles players voluntarily start.
 */
export interface RunSummary {
  readonly outcome: 'season' | 'milestone' | 'restructured';
  readonly stage: CareerStage;
  readonly stageName: string;
  readonly season: Season;
  readonly elapsedTicks: Ticks;
  readonly finalBalance: Cents;
  readonly peakBalance: Cents;
  readonly totalEarned: Cents;
  readonly totalSpent: Cents;
  readonly cropsHarvested: number;
  readonly cyclesCompleted: number;
  readonly goodsHauled: number;
  readonly goodsProcessed: number;
  readonly contractsCompleted: number;
  readonly incidentsSurvived: number;
  readonly incidentsMitigated: number;
  readonly buildingsBuilt: number;
}

export function stageName(stage: CareerStage): string {
  return STAGE_NAMES[stage];
}
