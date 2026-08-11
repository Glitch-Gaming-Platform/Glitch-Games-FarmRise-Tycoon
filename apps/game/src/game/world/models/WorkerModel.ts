/**
 * The people the player employs.
 *
 * A worker is a small state machine: find a job that matches their priorities,
 * spend the ticks their role costs, complete it, look again. They are
 * deliberately slower than the player and deliberately visible - a wage being
 * paid for someone standing idle should be something the player can see and
 * fix, not a line in a ledger (docs/PROGRESSION_GAMEPLAY_PLAN.md §10).
 */
import {
  actionTicks,
  canPerform,
  completeTask,
  defaultPriorities,
  nextTaskFor,
  wagesForTicks,
  type Inventory,
  type Worker,
  type WorkerRole,
  type WorkerTask,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';

export interface EmployedWorker extends Omit<Worker, 'skill' | 'tasksCompleted' | 'priorities'> {
  /** Mutable where the shared Worker view is read-only: this is the record. */
  skill: number;
  tasksCompleted: number;
  priorities: readonly string[];
  parcelId: string | null;
  hutBuildingId: string | null;
  actionProgress: number;
  currentTask: WorkerTask | null;
  carrying: Inventory;
  tileX: number;
  tileZ: number;
}

export interface WorkerModelEvents extends Record<string, unknown> {
  'worker:hired': { id: string; role: WorkerRole };
  'worker:task-completed': { id: string; task: WorkerTask };
  'worker:idle': { id: string };
}

/** What the site can currently offer, and how each job is actually carried out. */
export interface WorkBoard {
  available(): readonly WorkerTask[];
  perform(worker: EmployedWorker, task: WorkerTask): boolean;
}

export class WorkerModel {
  readonly events = new EventBus<WorkerModelEvents>();
  #workers: EmployedWorker[] = [];
  #nextId = 1;

  get workers(): readonly EmployedWorker[] {
    return this.#workers;
  }

  get count(): number {
    return this.#workers.length;
  }

  get(id: string): EmployedWorker | undefined {
    return this.#workers.find((worker) => worker.id === id);
  }

  hire(
    role: WorkerRole,
    displayName: string,
    hutBuildingId: string | null,
    tileX: number,
    tileZ: number,
  ): EmployedWorker {
    const worker: EmployedWorker = {
      id: `worker-${this.#nextId}`,
      role,
      displayName,
      skill: 0,
      tasksCompleted: 0,
      priorities: defaultPriorities(role),
      parcelId: null,
      hutBuildingId,
      actionProgress: 0,
      currentTask: null,
      carrying: {},
      tileX,
      tileZ,
    };
    this.#nextId += 1;
    this.#workers.push(worker);
    this.events.emit('worker:hired', { id: worker.id, role });
    return worker;
  }

  dismiss(id: string): void {
    this.#workers = this.#workers.filter((worker) => worker.id !== id);
  }

  setPriorities(id: string, priorities: readonly string[]): void {
    const worker = this.get(id);
    if (worker) worker.priorities = [...priorities];
  }

  setParcel(id: string, parcelId: string | null): void {
    const worker = this.get(id);
    if (worker) worker.parcelId = parcelId;
  }

  /** Wages owed across a span of ticks, as a float so the remainder can be carried. */
  wagesFor(dtTicks: number): number {
    return wagesForTicks(this.#workers, dtTicks);
  }

  /**
   * Runs every worker for one step.
   *
   * A worker holds their task while they work it, so a job cannot be half-done
   * and forgotten when the priority list changes mid-action.
   */
  advance(dtTicks: number, board: WorkBoard): void {
    if (this.#workers.length === 0) return;
    const available = board.available();

    for (const worker of this.#workers) {
      if (!worker.currentTask) {
        const task = nextTaskFor(worker, available);
        if (!task || !canPerform(worker, task)) {
          this.events.emit('worker:idle', { id: worker.id });
          continue;
        }
        worker.currentTask = task;
        worker.actionProgress = 0;
      }

      worker.actionProgress += dtTicks;
      if (worker.actionProgress < actionTicks(worker)) continue;

      worker.actionProgress = 0;
      const task = worker.currentTask;
      worker.currentTask = null;
      if (!task) continue;

      if (!board.perform(worker, task)) continue;
      const promoted = completeTask(worker);
      worker.skill = promoted.skill;
      worker.tasksCompleted = promoted.tasksCompleted;
      this.events.emit('worker:task-completed', { id: worker.id, task });
    }
  }

  /** Worker ids an incident could target. */
  incidentCandidates(): string[] {
    return this.#workers.map((worker) => worker.id);
  }

  hydrate(workers: readonly EmployedWorker[]): void {
    this.#workers = workers.map((worker) => ({ ...worker, carrying: { ...worker.carrying } }));
    for (const worker of this.#workers) {
      const match = /(\d+)$/.exec(worker.id);
      if (match) this.#nextId = Math.max(this.#nextId, Number(match[1]) + 1);
    }
  }

  toSaveState(): EmployedWorker[] {
    return this.#workers.map((worker) => ({ ...worker, carrying: { ...worker.carrying } }));
  }
}
