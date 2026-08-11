/**
 * Milestones, stages and unlocks.
 *
 * The player never sees a number go up here. A milestone is reached because the
 * farm they built now satisfies a description of itself, which is why every
 * requirement is expressed in things they can point at: land they own, buyers
 * who rely on them, goods they carried, seasons they survived
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §6).
 *
 * The server evaluates the identical predicate, so a client cannot award itself
 * a stage - and therefore cannot award itself the unlocks a stage carries.
 */
import {
  MILESTONES,
  MILESTONES_BY_ID,
  milestoneForStage,
  type CareerStage,
  type MilestoneDefinition,
  type MilestoneRequirement,
  type UnlockId,
} from '../domain/milestones.js';
import { ok, ruleViolation, type Result } from './result.js';

/**
 * Everything a milestone can be measured against.
 *
 * Deliberately a flat projection rather than the save document: it keeps the
 * predicate testable without constructing a whole career, and it makes it
 * obvious which numbers are load-bearing for progression.
 */
export interface ProgressionState {
  readonly stage: CareerStage;
  readonly completedMilestoneIds: readonly string[];
  readonly lifetimeEarned: number;
  readonly buyersServed: number;
  readonly parcelsOwned: number;
  readonly contractsCompleted: number;
  readonly goodsHauled: number;
  readonly goodsProcessed: number;
  readonly seasonsCompleted: number;
  readonly workersEmployed: number;
  readonly townProjects: number;
}

export interface RequirementProgress {
  readonly key: keyof MilestoneRequirement;
  readonly label: string;
  readonly current: number;
  readonly target: number;
  readonly met: boolean;
}

const REQUIREMENT_LABELS: Readonly<Record<keyof MilestoneRequirement, string>> = Object.freeze({
  lifetimeEarned: 'Earned',
  buyersServed: 'Buyers supplied',
  parcelsOwned: 'Parcels owned',
  contractsCompleted: 'Contracts completed',
  goodsHauled: 'Goods hauled',
  goodsProcessed: 'Goods processed',
  seasonsCompleted: 'Seasons completed',
  workersEmployed: 'Workers employed',
  townProjects: 'Town projects',
});

function currentValue(state: ProgressionState, key: keyof MilestoneRequirement): number {
  switch (key) {
    case 'lifetimeEarned':
      return state.lifetimeEarned;
    case 'buyersServed':
      return state.buyersServed;
    case 'parcelsOwned':
      return state.parcelsOwned;
    case 'contractsCompleted':
      return state.contractsCompleted;
    case 'goodsHauled':
      return state.goodsHauled;
    case 'goodsProcessed':
      return state.goodsProcessed;
    case 'seasonsCompleted':
      return state.seasonsCompleted;
    case 'workersEmployed':
      return state.workersEmployed;
    case 'townProjects':
      return state.townProjects;
    default:
      return 0;
  }
}

/** Per-requirement progress, for the milestone card and the HUD objective. */
export function milestoneProgress(
  milestone: MilestoneDefinition,
  state: ProgressionState,
): readonly RequirementProgress[] {
  return (Object.keys(milestone.requirement) as (keyof MilestoneRequirement)[]).map((key) => {
    const target = milestone.requirement[key] ?? 0;
    const current = currentValue(state, key);
    return {
      key,
      label: REQUIREMENT_LABELS[key],
      current,
      target,
      met: current >= target,
    };
  });
}

export function isMilestoneMet(milestone: MilestoneDefinition, state: ProgressionState): boolean {
  return milestoneProgress(milestone, state).every((entry) => entry.met);
}

/** Overall completion of the current milestone, 0..1. Drives the objective meter. */
export function stageProgress(state: ProgressionState): number {
  const milestone = milestoneForStage(state.stage);
  if (!milestone) return 1;
  const entries = milestoneProgress(milestone, state);
  if (entries.length === 0) return 1;
  const total = entries.reduce(
    (sum, entry) => sum + Math.min(1, entry.target === 0 ? 1 : entry.current / entry.target),
    0,
  );
  return total / entries.length;
}

export interface StageAdvance {
  readonly milestone: MilestoneDefinition;
  readonly stage: CareerStage;
  readonly unlocked: readonly UnlockId[];
}

/**
 * The only way a career stage ever increases.
 *
 * Returns a failure rather than throwing when the milestone is not met, so the
 * server can reject a client that claims a stage it has not earned using the
 * same call the client uses to decide whether to show the card.
 */
export function claimMilestone(milestoneId: string, state: ProgressionState): Result<StageAdvance> {
  const milestone = MILESTONES_BY_ID[milestoneId];
  if (!milestone) return ruleViolation(`Unknown milestone: ${milestoneId}.`);
  if (state.completedMilestoneIds.includes(milestoneId)) {
    return ruleViolation('That milestone has already been completed.');
  }
  if (milestone.stage !== state.stage) {
    return ruleViolation('That milestone belongs to a different career stage.');
  }
  if (!isMilestoneMet(milestone, state)) {
    return ruleViolation('The farm does not meet that milestone yet.');
  }
  return ok({
    milestone,
    stage: milestone.advancesToStage,
    unlocked: milestone.unlocks,
  });
}

/** The milestone the player is currently working toward, if any remain. */
export function activeMilestone(state: ProgressionState): MilestoneDefinition | undefined {
  return MILESTONES.find(
    (milestone) =>
      milestone.stage === state.stage && !state.completedMilestoneIds.includes(milestone.id),
  );
}

export function hasUnlock(unlocks: readonly string[], unlock: UnlockId): boolean {
  return unlocks.includes(unlock);
}

/** Guard for any command gated behind an unlock. */
export function requireUnlock(unlocks: readonly string[], unlock: UnlockId): Result<true> {
  return hasUnlock(unlocks, unlock)
    ? ok(true)
    : ruleViolation('That is not available on your farm yet.');
}
