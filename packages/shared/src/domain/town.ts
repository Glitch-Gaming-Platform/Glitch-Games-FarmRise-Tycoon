/**
 * Millbrook: the town the farm supplies.
 *
 * The town is the visible proof that the player's work mattered to someone
 * other than their own balance (docs/PROGRESSION_GAMEPLAY_PLAN.md §10). It
 * grows from deliveries, not from a purchase, and each growth stage opens
 * something the player then has to decide whether to fund.
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

export type TownStage = 0 | 1 | 2 | 3;

export interface TownStageDefinition {
  readonly stage: TownStage;
  readonly displayName: string;
  /** Prosperity needed to reach this stage. */
  readonly prosperityRequired: number;
  readonly populationBand: string;
  /** Multiplier applied to every buyer's contract volume at this stage. */
  readonly demandMultiplier: number;
  readonly summary: string;
}

export const TOWN_STAGES: readonly TownStageDefinition[] = Object.freeze([
  {
    stage: 0,
    displayName: 'Hamlet',
    prosperityRequired: 0,
    populationBand: 'Under 200',
    demandMultiplier: 1,
    summary: 'A shop, a chapel and a road that goes somewhere else.',
  },
  {
    stage: 1,
    displayName: 'Village',
    prosperityRequired: 120,
    populationBand: '200-600',
    demandMultiplier: 1.2,
    summary: 'The cannery reopens and the market runs twice a week.',
  },
  {
    stage: 2,
    displayName: 'Market town',
    prosperityRequired: 400,
    populationBand: '600-2,000',
    demandMultiplier: 1.45,
    summary: 'A restaurant, a co-op depot and people who moved here for the work.',
  },
  {
    stage: 3,
    displayName: 'Regional centre',
    prosperityRequired: 1_000,
    populationBand: 'Over 2,000',
    demandMultiplier: 1.8,
    summary: 'Millbrook feeds the region, and the region knows whose farm did it.',
  },
]);

/** Prosperity earned per unit of goods delivered to a town buyer. */
export const PROSPERITY_PER_DELIVERED_UNIT = 0.35;
/** Prosperity earned per completed contract, on top of the volume. */
export const PROSPERITY_PER_CONTRACT = 4;
/** Prosperity lost per in-game day with no delivery at all. */
export const PROSPERITY_DECAY_PER_DAY = 1.5;

export interface CommunityProjectDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly requiresTownStage: TownStage;
  readonly cost: Cents;
  /** Goods the project also wants, on top of money. */
  readonly materials: Readonly<Record<string, number>>;
  readonly buildTicks: Ticks;
  /** Prosperity granted on completion. */
  readonly prosperity: number;
  readonly benefit: string;
  readonly description: string;
}

const PROJECT_LIST: CommunityProjectDefinition[] = [
  {
    id: 'project-market-road',
    displayName: 'Market Road',
    requiresTownStage: 0,
    cost: cents(18_000),
    materials: { wheat: 20 },
    buildTicks: secondsToTicks(300),
    prosperity: 60,
    benefit: 'Every delivery pays 6% more, because your goods arrive in better condition.',
    description:
      'Metalling the lane between the estate and the town square. Everyone uses it; you use it most.',
  },
  {
    id: 'project-grain-store',
    displayName: 'Public Grain Store',
    requiresTownStage: 1,
    cost: cents(32_000),
    materials: { flour: 15, wheat: 40 },
    buildTicks: secondsToTicks(420),
    prosperity: 120,
    benefit: 'Adds shared storage you can draw on, and steadies prices in a bad season.',
    description: 'A stone store by the chapel so a poor harvest stops meaning a hungry winter.',
  },
  {
    id: 'project-well-network',
    displayName: 'Village Wells',
    requiresTownStage: 2,
    cost: cents(48_000),
    materials: { preserves: 10, cheese: 10 },
    buildTicks: secondsToTicks(480),
    prosperity: 200,
    benefit: 'Halves the impact of drought on every field you own.',
    description: 'Four deep wells and the pipes between them. The town stops fearing a dry summer.',
  },
];

export const COMMUNITY_PROJECTS: readonly CommunityProjectDefinition[] =
  Object.freeze(PROJECT_LIST);

export const COMMUNITY_PROJECTS_BY_ID: Readonly<Record<string, CommunityProjectDefinition>> =
  Object.freeze(Object.fromEntries(COMMUNITY_PROJECTS.map((project) => [project.id, project])));

export function townStageFor(prosperity: number): TownStageDefinition {
  let current = TOWN_STAGES[0] as TownStageDefinition;
  for (const stage of TOWN_STAGES) {
    if (prosperity >= stage.prosperityRequired) current = stage;
  }
  return current;
}

export function availableProjects(
  prosperity: number,
  completedIds: readonly string[],
): readonly CommunityProjectDefinition[] {
  const stage = townStageFor(prosperity).stage;
  const completed = new Set(completedIds);
  return COMMUNITY_PROJECTS.filter(
    (project) => !completed.has(project.id) && project.requiresTownStage <= stage,
  );
}
