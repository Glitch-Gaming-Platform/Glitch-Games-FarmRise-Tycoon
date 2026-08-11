/**
 * Hired help.
 *
 * A worker is not an idle-game multiplier. They remove repetition the player
 * has already mastered - walking, loading, tending - and in exchange introduce
 * a fixed wage that is charged whether or not the farm earned anything that
 * day. That is the bargain the "Local Supplier" stage is built on
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §10).
 *
 * Workers are deliberately worse than the player at everything. They are worth
 * hiring because the player cannot be in two places at once, not because they
 * are more efficient.
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

export type WorkerRole = 'field_hand' | 'hauler' | 'processor_hand';

/** What a worker can be told to prioritise. Order in the array is priority order. */
export type WorkerTask = 'tend' | 'harvest' | 'haul' | 'load_processor' | 'feed_animals';

export interface WorkerRoleDefinition {
  readonly id: WorkerRole;
  readonly displayName: string;
  /** One-off cost to hire. Covers the hut, the tools and the first week. */
  readonly hiringCost: Cents;
  /** Charged every in-game day, forever, whether or not they worked. */
  readonly wagePerDay: Cents;
  /** Tasks this role will accept, in default priority order. */
  readonly tasks: readonly WorkerTask[];
  /** Ticks to complete one unit of work. Higher than the player's own speed. */
  readonly actionTicks: Ticks;
  /** Fraction of the player's effectiveness at the same job, 0..1. */
  readonly effectiveness: number;
  /** Units a hauler can carry per trip. */
  readonly carryCapacity: number;
  readonly description: string;
}

export const WORKER_ROLES: Readonly<Record<WorkerRole, WorkerRoleDefinition>> = Object.freeze({
  field_hand: {
    id: 'field_hand',
    displayName: 'Field hand',
    hiringCost: cents(6_000),
    wagePerDay: cents(320),
    tasks: ['tend', 'harvest', 'feed_animals'],
    actionTicks: secondsToTicks(6),
    effectiveness: 0.75,
    carryCapacity: 6,
    description: 'Tends and harvests the beds you point them at, a little slower than you would.',
  },
  hauler: {
    id: 'hauler',
    displayName: 'Hauler',
    hiringCost: cents(5_000),
    wagePerDay: cents(280),
    tasks: ['haul', 'load_processor'],
    actionTicks: secondsToTicks(4),
    effectiveness: 0.9,
    carryCapacity: 14,
    description: 'Walks harvested goods back to storage so you can stay in the field.',
  },
  processor_hand: {
    id: 'processor_hand',
    displayName: 'Processor hand',
    hiringCost: cents(8_000),
    wagePerDay: cents(420),
    tasks: ['load_processor', 'haul'],
    actionTicks: secondsToTicks(5),
    effectiveness: 0.85,
    carryCapacity: 10,
    description: 'Hauls staged goods around the processing yard and back to storage.',
  },
});

export const WORKER_ROLE_IDS = Object.keys(WORKER_ROLES) as readonly WorkerRole[];

export function getWorkerRole(id: string): WorkerRoleDefinition | undefined {
  return (WORKER_ROLES as Record<string, WorkerRoleDefinition>)[id];
}

/**
 * Skill grows with completed tasks and is capped, so a long-serving worker is
 * meaningfully better than a new hire but never replaces a second pair of hands.
 */
export const MAX_WORKER_SKILL = 3;
export const TASKS_PER_SKILL_LEVEL = 40;
/** Effectiveness added per skill level. */
export const SKILL_EFFECTIVENESS_STEP = 0.08;

/** Hard cap on employed workers, to keep the simulation and the payroll legible. */
export const MAX_WORKERS = 6;

/** A worker with no task in range idles here rather than pathing across the estate. */
export const WORKER_IDLE_RADIUS_TILES = 6;
