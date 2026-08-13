import { describe, expect, it } from 'vitest';
import {
  MILESTONES,
  activeMilestone,
  claimMilestone,
  hasUnlock,
  isMilestoneMet,
  milestoneForStage,
  milestoneProgress,
  requireUnlock,
  stageProgress,
  unlocksUpToStage,
  type MilestoneRequirement,
  type ProgressionState,
} from '../src/index.js';

const state = (overrides: Partial<ProgressionState> = {}): ProgressionState => ({
  stage: 0,
  completedMilestoneIds: [],
  lifetimeEarned: 0,
  buyersServed: 0,
  parcelsOwned: 1,
  contractsCompleted: 0,
  goodsHauled: 0,
  goodsProcessed: 0,
  seasonsCompleted: 0,
  workersEmployed: 0,
  townProjects: 0,
  ...overrides,
});

/** A state that satisfies whatever the first milestone happens to require. */
function satisfying(stage: ProgressionState['stage']): ProgressionState {
  const milestone = milestoneForStage(stage);
  if (!milestone) throw new Error(`No milestone for stage ${stage}.`);
  return state({
    stage,
    lifetimeEarned: milestone.requirement.lifetimeEarned ?? 0,
    buyersServed: milestone.requirement.buyersServed ?? 0,
    parcelsOwned: milestone.requirement.parcelsOwned ?? 1,
    contractsCompleted: milestone.requirement.contractsCompleted ?? 0,
    goodsHauled: milestone.requirement.goodsHauled ?? 0,
    goodsProcessed: milestone.requirement.goodsProcessed ?? 0,
    seasonsCompleted: milestone.requirement.seasonsCompleted ?? 0,
    workersEmployed: milestone.requirement.workersEmployed ?? 0,
    townProjects: milestone.requirement.townProjects ?? 0,
  });
}

describe('the milestone table', () => {
  it('advances the stage by exactly one step each time', () => {
    for (const milestone of MILESTONES) {
      expect(milestone.advancesToStage).toBe(milestone.stage + 1);
    }
  });

  it('gives every milestone at least one new capability', () => {
    for (const milestone of MILESTONES) {
      expect(milestone.unlocks.length).toBeGreaterThan(0);
    }
  });

  it('names the new problem each success creates', () => {
    for (const milestone of MILESTONES) {
      expect(milestone.newProblem.length).toBeGreaterThan(20);
    }
  });

  it('never unlocks the same capability twice', () => {
    const seen = new Set<string>();
    for (const milestone of MILESTONES) {
      for (const unlock of milestone.unlocks) {
        expect(seen.has(unlock)).toBe(false);
        seen.add(unlock);
      }
    }
  });
});

describe('milestoneProgress', () => {
  it('reports every requirement, met or not', () => {
    const milestone = milestoneForStage(0);
    if (!milestone) throw new Error('No opening milestone.');
    const rows = milestoneProgress(milestone, state());
    expect(rows.length).toBe(Object.keys(milestone.requirement).length);
    expect(rows.every((row) => !row.met)).toBe(true);
  });

  it('marks a requirement met once it is reached exactly', () => {
    const milestone = milestoneForStage(0);
    if (!milestone) throw new Error('No opening milestone.');
    const rows = milestoneProgress(milestone, satisfying(0));
    expect(rows.every((row) => row.met)).toBe(true);
    expect(isMilestoneMet(milestone, satisfying(0))).toBe(true);
  });

  it('marks every individual task complete independently at every career stage', () => {
    for (const milestone of MILESTONES) {
      const keys = Object.keys(milestone.requirement) as (keyof MilestoneRequirement)[];
      for (const key of keys) {
        const target = milestone.requirement[key];
        if (target === undefined) throw new Error(`Missing target for ${milestone.id}:${key}.`);
        const progress = milestoneProgress(
          milestone,
          state({ stage: milestone.stage, [key]: target }),
        );

        expect(progress.find((entry) => entry.key === key)?.met, `${milestone.id}:${key}`).toBe(
          true,
        );
        expect(
          progress.filter((entry) => entry.key !== key).every((entry) => !entry.met),
          `${milestone.id}:${key} should not complete another task`,
        ).toBe(true);
        expect(isMilestoneMet(milestone, state({ stage: milestone.stage, [key]: target }))).toBe(
          keys.length === 1,
        );
      }
    }
  });
});

describe('stageProgress', () => {
  it('is partial on a brand-new career and one when the milestone is met', () => {
    // Not zero: a new farm already owns one of the three parcels the opening
    // milestone asks for, and the meter should say so rather than pretending
    // the player has done nothing.
    const opening = stageProgress(state());
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
    expect(stageProgress(satisfying(0))).toBe(1);
  });

  it('never exceeds one, however far past a requirement the player goes', () => {
    expect(
      stageProgress(state({ lifetimeEarned: 10_000_000, parcelsOwned: 5 })),
    ).toBeLessThanOrEqual(1);
  });
});

describe('claimMilestone', () => {
  it('advances every stage only after its complete checklist and grants its unlocks', () => {
    for (const milestone of MILESTONES) {
      const result = claimMilestone(milestone.id, satisfying(milestone.stage));
      expect(result.ok, milestone.id).toBe(true);
      if (!result.ok) continue;
      expect(result.value.stage).toBe(milestone.advancesToStage);
      expect(result.value.unlocked).toEqual(milestone.unlocks);
    }
  });

  it('refuses a milestone the farm has not earned', () => {
    const milestone = milestoneForStage(0);
    if (!milestone) throw new Error('No opening milestone.');
    const result = claimMilestone(milestone.id, state());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/does not meet/i);
  });

  it('refuses a milestone that has already been claimed', () => {
    const milestone = milestoneForStage(0);
    if (!milestone) throw new Error('No opening milestone.');
    const claimed = { ...satisfying(0), completedMilestoneIds: [milestone.id] };
    expect(claimMilestone(milestone.id, claimed).ok).toBe(false);
  });

  it('refuses a milestone from another stage, however well the farm is doing', () => {
    const later = MILESTONES.find((entry) => entry.stage === 2);
    if (!later) throw new Error('No stage 2 milestone.');
    const generous = state({
      stage: 0,
      lifetimeEarned: 10_000_000,
      goodsProcessed: 10_000,
      seasonsCompleted: 99,
    });
    expect(claimMilestone(later.id, generous).ok).toBe(false);
  });

  it('refuses an unknown milestone id', () => {
    expect(claimMilestone('milestone-imaginary', satisfying(0)).ok).toBe(false);
  });
});

describe('activeMilestone', () => {
  it('is the unclaimed milestone for the current stage', () => {
    expect(activeMilestone(state())?.stage).toBe(0);
  });

  it('is undefined once the last stage has been reached', () => {
    const finished = state({ stage: 5 });
    expect(activeMilestone(finished)).toBeUndefined();
    expect(stageProgress(finished)).toBe(1);
  });
});

describe('unlocks', () => {
  it('grants nothing at stage zero, so the opening is the bare loop', () => {
    expect(unlocksUpToStage(0)).toHaveLength(0);
  });

  it('accumulates every earlier stage’s unlocks', () => {
    const atTwo = unlocksUpToStage(2);
    expect(atTwo).toContain('hauling');
    expect(atTwo).toContain('processing');
    expect(atTwo).not.toContain('machinery');
  });

  it('gates a command behind an unlock with a player-readable refusal', () => {
    expect(hasUnlock(['hauling'], 'hauling')).toBe(true);
    const refused = requireUnlock([], 'processing');
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toMatch(/not available/i);
  });
});
