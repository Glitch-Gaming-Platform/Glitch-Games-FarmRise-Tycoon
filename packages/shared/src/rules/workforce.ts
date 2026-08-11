/**
 * Employing people.
 *
 * A worker converts money into attention: they do a job the player already
 * knows how to do, slightly worse, in a place the player is not standing. The
 * wage is charged every day whether or not there was work, which is what turns
 * the "Local Supplier" stage from a bonus into a commitment
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §10).
 */
import { cents, type Cents } from '../domain/ids.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import {
  MAX_WORKERS,
  SKILL_EFFECTIVENESS_STEP,
  TASKS_PER_SKILL_LEVEL,
  MAX_WORKER_SKILL,
  WORKER_ROLES,
  getWorkerRole,
  type WorkerRole,
  type WorkerTask,
} from '../domain/workers.js';
import { ok, ruleViolation, type Result } from './result.js';

export interface Worker {
  readonly id: string;
  readonly role: WorkerRole;
  readonly displayName: string;
  readonly skill: number;
  readonly tasksCompleted: number;
  readonly priorities: readonly string[];
}

export interface HiringContext {
  readonly workers: readonly Worker[];
  readonly balance: Cents;
  /** Worker huts that are complete and not already occupied. */
  readonly freeHuts: number;
  readonly unlocks: readonly string[];
}

export function hireCost(role: WorkerRole): Cents {
  return WORKER_ROLES[role].hiringCost;
}

export function validateHire(role: string, context: HiringContext): Result<{ cost: Cents }> {
  const definition = getWorkerRole(role);
  if (!definition) return ruleViolation(`There is no such job as ${role}.`);
  if (!context.unlocks.includes('workers')) {
    return ruleViolation('Nobody in Millbrook is looking for work on a farm this size.');
  }
  if (context.workers.length >= MAX_WORKERS) {
    return ruleViolation(`You cannot manage more than ${MAX_WORKERS} people.`);
  }
  if (context.freeHuts <= 0) {
    return ruleViolation('There is nowhere for them to live. Build a worker hut first.');
  }
  if (context.balance < definition.hiringCost) {
    return ruleViolation('Not enough money to take someone on.');
  }
  return ok({ cost: definition.hiringCost });
}

/** Daily payroll for the whole workforce. */
export function dailyPayroll(workers: readonly Worker[]): Cents {
  return cents(workers.reduce((sum, worker) => sum + WORKER_ROLES[worker.role].wagePerDay, 0));
}

/** Wages accrued across a span of ticks, as a float so the remainder can be carried. */
export function wagesForTicks(workers: readonly Worker[], dtTicks: Ticks): number {
  return (dailyPayroll(workers) * dtTicks) / GAME_DAY_TICKS;
}

/** How effective a worker is at their job, including learned skill. */
export function effectiveness(worker: Worker): number {
  return Math.min(
    1,
    WORKER_ROLES[worker.role].effectiveness + worker.skill * SKILL_EFFECTIVENESS_STEP,
  );
}

/** Ticks this worker needs for one action. */
export function actionTicks(worker: Worker): Ticks {
  return Math.max(1, Math.round(WORKER_ROLES[worker.role].actionTicks / effectiveness(worker)));
}

export function carryCapacityFor(worker: Worker): number {
  return Math.round(WORKER_ROLES[worker.role].carryCapacity * effectiveness(worker));
}

/** Applies one completed task, promoting the worker when they have earned it. */
export function completeTask(worker: Worker): Worker {
  const tasksCompleted = worker.tasksCompleted + 1;
  const skill = Math.min(MAX_WORKER_SKILL, Math.floor(tasksCompleted / TASKS_PER_SKILL_LEVEL));
  return { ...worker, tasksCompleted, skill };
}

export function canPerform(worker: Worker, task: WorkerTask): boolean {
  return WORKER_ROLES[worker.role].tasks.includes(task);
}

/**
 * The task a worker should do next.
 *
 * Priorities are the player's instruction, so they are honoured in order and
 * the first one with available work wins. A worker with nothing to do stands
 * still rather than inventing a job - visible idleness is a legible signal that
 * the farm is over-staffed.
 */
export function nextTaskFor(
  worker: Worker,
  availableWork: readonly WorkerTask[],
): WorkerTask | null {
  const allowed = WORKER_ROLES[worker.role].tasks;
  const ordered = worker.priorities.length > 0 ? worker.priorities : allowed;
  for (const candidate of ordered) {
    const task = candidate as WorkerTask;
    if (allowed.includes(task) && availableWork.includes(task)) return task;
  }
  return null;
}

export function defaultPriorities(role: WorkerRole): readonly string[] {
  return [...WORKER_ROLES[role].tasks];
}
