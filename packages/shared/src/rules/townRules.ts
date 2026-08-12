/**
 * How Millbrook responds to being supplied.
 *
 * Prosperity is earned by delivering and decays when the farm stops, so a town
 * that has grown is proof of sustained supply rather than of one good week.
 * Community projects are the only place the player spends money on something
 * that is not theirs, which is what makes them worth the screen space
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §10).
 */
import { cents, type Cents } from '../domain/ids.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import {
  COMMUNITY_PROJECTS_BY_ID,
  PROSPERITY_DECAY_PER_DAY,
  PROSPERITY_PER_CONTRACT,
  PROSPERITY_PER_DELIVERED_UNIT,
  STARTER_COMMUNITY_PROJECT_ID,
  townStageFor,
  type CommunityProjectDefinition,
} from '../domain/town.js';
import { ok, ruleViolation, type Result } from './result.js';
import type { Inventory } from './storage.js';

export function prosperityForDelivery(units: number): number {
  return units * PROSPERITY_PER_DELIVERED_UNIT + PROSPERITY_PER_CONTRACT;
}

/** Decay applied over a span of ticks. Floors at zero; the town never resents you. */
export function decayProsperity(prosperity: number, dtTicks: Ticks): number {
  return Math.max(0, prosperity - (PROSPERITY_DECAY_PER_DAY * dtTicks) / GAME_DAY_TICKS);
}

/** Contract volume multiplier the town's current size grants every buyer. */
export function townDemandMultiplier(prosperity: number): number {
  return townStageFor(prosperity).demandMultiplier;
}

export interface ProjectStartRequest {
  readonly projectId: string;
  readonly prosperity: number;
  readonly completedProjectIds: readonly string[];
  readonly hasActiveProject: boolean;
  readonly balance: Cents;
  readonly available: Inventory;
  readonly unlocks: readonly string[];
  readonly ownedParcelIds: readonly string[];
}

export interface ProjectStart {
  readonly project: CommunityProjectDefinition;
  readonly balance: Cents;
  readonly consumed: Inventory;
  readonly remainingTicks: Ticks;
}

export function validateProjectStart(request: ProjectStartRequest): Result<ProjectStart> {
  const project = COMMUNITY_PROJECTS_BY_ID[request.projectId];
  if (!project) return ruleViolation(`Millbrook has no such project: ${request.projectId}.`);
  if (project.requiresUnlock && !request.unlocks.includes(project.requiresUnlock)) {
    return ruleViolation('The town council does not take proposals from you yet.');
  }
  if (project.requiresParcelId && !request.ownedParcelIds.includes(project.requiresParcelId)) {
    return ruleViolation('Open the Starter Extension before funding this project.');
  }
  if (request.completedProjectIds.includes(project.id)) {
    return ruleViolation('That has already been built.');
  }
  if (request.hasActiveProject) {
    return ruleViolation('The town can only build one thing at a time.');
  }
  if (townStageFor(request.prosperity).stage < project.requiresTownStage) {
    return ruleViolation('Millbrook is not big enough to need that yet.');
  }
  if (request.balance < project.cost) {
    return ruleViolation('You cannot cover your share of the cost.');
  }

  const consumed: Record<string, number> = { ...request.available };
  for (const [itemId, quantity] of Object.entries(project.materials)) {
    const held = consumed[itemId] ?? 0;
    if (held < quantity) {
      return ruleViolation(`The project needs ${quantity} ${itemId}; you have ${held}.`);
    }
    consumed[itemId] = held - quantity;
  }

  return ok({
    project,
    balance: cents(request.balance - project.cost),
    consumed,
    remainingTicks: project.buildTicks,
  });
}

/** Payout multiplier granted by completed projects. Small, permanent, cumulative. */
export function projectDeliveryBonus(completedProjectIds: readonly string[]): number {
  let multiplier = 1;
  if (completedProjectIds.includes(STARTER_COMMUNITY_PROJECT_ID)) multiplier += 0.01;
  if (completedProjectIds.includes('project-market-road')) multiplier += 0.06;
  return multiplier;
}

/** Drought damage multiplier granted by the village wells. */
export function projectDroughtRelief(completedProjectIds: readonly string[]): number {
  return completedProjectIds.includes('project-well-network') ? 0.5 : 1;
}

/** Extra shared storage the public grain store contributes. */
export function projectStorageBonus(completedProjectIds: readonly string[]): number {
  return completedProjectIds.includes('project-grain-store') ? 80 : 0;
}
