import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_PROJECTS,
  GAME_DAY_TICKS,
  TOWN_STAGES,
  availableProjects,
  cents,
  decayProsperity,
  projectDeliveryBonus,
  projectDroughtRelief,
  projectStorageBonus,
  prosperityForDelivery,
  townDemandMultiplier,
  townStageFor,
  validateProjectStart,
} from '../src/index.js';

const start = (overrides = {}) => ({
  projectId: 'project-market-road',
  prosperity: 500,
  completedProjectIds: [] as string[],
  hasActiveProject: false,
  balance: cents(100_000),
  available: { wheat: 100, flour: 100, preserves: 100, cheese: 100 },
  unlocks: ['town_projects'],
  ...overrides,
});

describe('prosperity', () => {
  it('grows with what the farm delivers', () => {
    expect(prosperityForDelivery(20)).toBeGreaterThan(prosperityForDelivery(5));
  });

  it('decays when the farm stops supplying, but never past zero', () => {
    expect(decayProsperity(100, GAME_DAY_TICKS)).toBeLessThan(100);
    expect(decayProsperity(0.1, GAME_DAY_TICKS * 100)).toBe(0);
  });
});

describe('town stages', () => {
  it('starts as a hamlet and grows in order', () => {
    expect(townStageFor(0).stage).toBe(0);
    let previous = -1;
    for (const stage of TOWN_STAGES) {
      expect(stage.prosperityRequired).toBeGreaterThan(previous);
      previous = stage.prosperityRequired;
    }
  });

  it('raises demand as the town grows', () => {
    expect(townDemandMultiplier(0)).toBeLessThan(townDemandMultiplier(100_000));
  });
});

describe('validateProjectStart', () => {
  it('starts a project the town needs and the player can fund', () => {
    const result = validateProjectStart(start());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.remainingTicks).toBeGreaterThan(0);
    expect(result.value.consumed['wheat']).toBeLessThan(100);
  });

  it('refuses before the town will take a proposal from the player', () => {
    expect(validateProjectStart(start({ unlocks: [] })).ok).toBe(false);
  });

  it('refuses a second project while one is being built', () => {
    expect(validateProjectStart(start({ hasActiveProject: true })).ok).toBe(false);
  });

  it('refuses one that has already been built', () => {
    expect(validateProjectStart(start({ completedProjectIds: ['project-market-road'] })).ok).toBe(
      false,
    );
  });

  it('refuses without the money', () => {
    expect(validateProjectStart(start({ balance: cents(0) })).ok).toBe(false);
  });

  it('refuses without the materials, and names what is missing', () => {
    const result = validateProjectStart(start({ available: { wheat: 1 } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/wheat/);
  });

  it('refuses a project the town is too small to need', () => {
    const late = COMMUNITY_PROJECTS.find((project) => project.requiresTownStage > 0);
    if (!late) throw new Error('No gated project to test.');
    expect(validateProjectStart(start({ projectId: late.id, prosperity: 0 })).ok).toBe(false);
  });

  it('refuses a project that does not exist', () => {
    expect(validateProjectStart(start({ projectId: 'project-cathedral' })).ok).toBe(false);
  });
});

describe('availableProjects', () => {
  it('offers only what the town has grown into and has not already built', () => {
    const offered = availableProjects(0, []);
    expect(offered.every((project) => project.requiresTownStage === 0)).toBe(true);
    expect(availableProjects(0, [offered[0]?.id ?? ''])).toHaveLength(offered.length - 1);
  });
});

describe('what a finished project buys', () => {
  it('does nothing until it is actually finished', () => {
    expect(projectDeliveryBonus([])).toBe(1);
    expect(projectDroughtRelief([])).toBe(1);
    expect(projectStorageBonus([])).toBe(0);
  });

  it('pays out permanently once it is', () => {
    expect(projectDeliveryBonus(['project-market-road'])).toBeGreaterThan(1);
    expect(projectDroughtRelief(['project-well-network'])).toBeLessThan(1);
    expect(projectStorageBonus(['project-grain-store'])).toBeGreaterThan(0);
  });
});
