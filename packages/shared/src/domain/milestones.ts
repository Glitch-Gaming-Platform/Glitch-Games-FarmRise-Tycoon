/**
 * Career stages and the milestones that advance them.
 *
 * Milestones replace levels and XP (docs/PROGRESSION_GAMEPLAY_PLAN.md §6). A
 * milestone is always a description of the farm the player has actually built -
 * "you are holding 40 units and shipping to two buyers" - so it is reached by
 * operating the farm rather than by filling a bar.
 *
 * Every stage must grant a capability that interacts with two systems the
 * player already understands, which is why each entry lists its unlocks
 * explicitly and the UI teaches exactly those.
 */
import { cents, type Cents } from './ids.js';

/** Numeric so comparisons ("requires stage >= 2") stay cheap and orderable. */
export type CareerStage = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Everything a stage can switch on. String ids rather than booleans so the save
 * stores what was unlocked and why, and so a scenario can grant one early.
 */
export type UnlockId =
  | 'land_purchase'
  | 'hauling'
  | 'handcart'
  | 'buyer_cannery'
  | 'buyer_co_op'
  | 'contracts'
  | 'loans'
  | 'specialization'
  | 'processing'
  | 'soil_management'
  | 'quality_grading'
  | 'buyer_restaurant'
  | 'insurance'
  | 'workers'
  | 'scheduled_delivery'
  | 'town_projects'
  | 'second_site'
  | 'machinery'
  | 'utilities';

export interface MilestoneRequirement {
  /** Lifetime money earned across the whole career. */
  readonly lifetimeEarned?: Cents;
  /** Distinct buyers with at least one completed delivery. */
  readonly buyersServed?: number;
  /** Owned parcels. */
  readonly parcelsOwned?: number;
  /** Completed contracts, lifetime. */
  readonly contractsCompleted?: number;
  /** Units of goods hauled into storage by hand or cart. */
  readonly goodsHauled?: number;
  /** Units produced by any processor. */
  readonly goodsProcessed?: number;
  /** Distinct seasons survived. */
  readonly seasonsCompleted?: number;
  /** Workers currently employed. */
  readonly workersEmployed?: number;
  /** Completed community projects. */
  readonly townProjects?: number;
}

export interface MilestoneDefinition {
  readonly id: string;
  readonly stage: CareerStage;
  /** Stage the player reaches by completing this milestone. */
  readonly advancesToStage: CareerStage;
  readonly displayName: string;
  readonly roleName: string;
  readonly requirement: MilestoneRequirement;
  readonly unlocks: readonly UnlockId[];
  /** One-time cash grant on completion. Small: this is recognition, not income. */
  readonly reward: Cents;
  readonly summary: string;
  /** What the player should now be worried about. Shown on the milestone card. */
  readonly newProblem: string;
}

export const MILESTONES: readonly MilestoneDefinition[] = Object.freeze([
  {
    id: 'milestone-smallholder',
    stage: 0,
    advancesToStage: 1,
    displayName: 'Buy the North Field',
    roleName: 'Smallholder',
    requirement: { lifetimeEarned: cents(15_000), parcelsOwned: 2 },
    unlocks: ['land_purchase', 'hauling', 'handcart', 'buyer_cannery', 'buyer_co_op', 'contracts'],
    reward: cents(1_000),
    summary: 'You earned enough to buy the land beyond the north gate, and the gate is now open.',
    newProblem:
      'The new beds are a long walk from the barn. Everything you grow up there has to be carried back.',
  },
  {
    id: 'milestone-working-farm',
    stage: 1,
    advancesToStage: 2,
    displayName: 'Supply two buyers',
    roleName: 'Working farmer',
    requirement: { buyersServed: 2, contractsCompleted: 4, goodsHauled: 60 },
    unlocks: ['specialization', 'processing', 'soil_management', 'loans'],
    reward: cents(2_500),
    summary:
      'Two buyers rely on you and the cart is paying for itself. You can now choose what kind of farm this is.',
    newProblem:
      'Selling raw produce caps what any field can earn, and the ground you have worked hardest is getting tired.',
  },
  {
    id: 'milestone-licensed-producer',
    stage: 2,
    advancesToStage: 3,
    displayName: 'Ship your own processed goods',
    roleName: 'Licensed producer',
    requirement: { goodsProcessed: 40, seasonsCompleted: 2, lifetimeEarned: cents(80_000) },
    unlocks: ['quality_grading', 'buyer_restaurant', 'insurance', 'workers', 'town_projects'],
    reward: cents(5_000),
    summary:
      'Your processed goods carry your name, and a restaurant that grades what it buys is willing to talk.',
    newProblem:
      'Processing, hauling and tending now compete for the same pair of hands. You need help.',
  },
  {
    id: 'milestone-local-supplier',
    stage: 3,
    advancesToStage: 4,
    displayName: 'Employ and deliver',
    roleName: 'Local supplier',
    requirement: { workersEmployed: 2, contractsCompleted: 20, townProjects: 1 },
    unlocks: ['scheduled_delivery'],
    reward: cents(9_000),
    summary:
      'The farm runs when you are not standing on it, and Millbrook is visibly better for your being here.',
    newProblem:
      'A payroll and a delivery schedule are fixed costs. A bad season now costs you more than a bad day used to.',
  },
  {
    id: 'milestone-regional',
    stage: 4,
    advancesToStage: 5,
    displayName: 'Supply the whole district',
    roleName: 'Regional supplier',
    requirement: { parcelsOwned: 4, seasonsCompleted: 6, lifetimeEarned: cents(400_000) },
    unlocks: ['utilities'],
    reward: cents(20_000),
    summary: 'You hold the whole estate and supply Millbrook as a network rather than a field.',
    newProblem:
      'Water, processors and workers now fail differently across a farm too large to watch all at once.',
  },
]);

export const MILESTONES_BY_ID: Readonly<Record<string, MilestoneDefinition>> = Object.freeze(
  Object.fromEntries(MILESTONES.map((milestone) => [milestone.id, milestone])),
);

export function milestoneForStage(stage: CareerStage): MilestoneDefinition | undefined {
  return MILESTONES.find((milestone) => milestone.stage === stage);
}

export const STAGE_NAMES: Readonly<Record<CareerStage, string>> = Object.freeze({
  0: 'Smallholding',
  1: 'Homestead',
  2: 'Licensed Producer',
  3: 'Local Supplier',
  4: 'Regional Enterprise',
  5: 'Agricultural Estate',
});

/** Unlocks a brand-new career starts with. Deliberately the bare loop. */
export const STARTING_UNLOCKS: readonly UnlockId[] = Object.freeze([]);

export function unlocksUpToStage(stage: CareerStage): readonly UnlockId[] {
  const granted = new Set<UnlockId>(STARTING_UNLOCKS);
  for (const milestone of MILESTONES) {
    if (milestone.advancesToStage <= stage) {
      for (const unlock of milestone.unlocks) granted.add(unlock);
    }
  }
  return [...granted];
}
