/**
 * Decides when the career is written to disk.
 *
 * Autosave used to hang off the balance-changed event, which meant a player
 * could finish construction, survive an incident, reassign a worker, move goods
 * and cross a season boundary without any of it being written
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.5).
 *
 * The replacement is boring on purpose:
 *   - a wall-clock interval, so idle progress is still captured;
 *   - an immediate checkpoint after anything irreversible;
 *   - local first, always, because a save that only exists on a server is a
 *     save that is gone the moment the network is;
 *   - a dirty flag, so an unchanged farm is never re-serialised.
 */
import type { CareerSaveState } from '@farmrise/shared';
import type { Disposable, Unsubscribe } from '@engine/core/types.js';
import type { SaveDirector } from './SaveDirector.js';

/** How often a merely-playing farm is written. Short enough to lose little. */
export const AUTOSAVE_INTERVAL_MS = 20_000;

export interface AutosaveOptions {
  readonly intervalMs?: number;
  readonly now?: () => number;
}

export class AutosaveController implements Disposable {
  #dirty = false;
  #lastWriteMs = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  readonly #unsubscribes: Unsubscribe[] = [];
  readonly #intervalMs: number;
  readonly #now: () => number;

  constructor(
    private readonly saves: SaveDirector,
    private readonly snapshot: () => CareerSaveState | null,
    options: AutosaveOptions = {},
  ) {
    this.#intervalMs = options.intervalMs ?? AUTOSAVE_INTERVAL_MS;
    this.#now = options.now ?? (() => Date.now());
  }

  /** Marks the career as having changed since the last write. */
  markDirty(): void {
    this.#dirty = true;
  }

  /** Subscribes to a source of change. Returns nothing: this owns the handle. */
  watch(subscribe: (onChange: () => void) => Unsubscribe): void {
    this.#unsubscribes.push(subscribe(() => this.markDirty()));
  }

  start(): void {
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => {
      // The simulation changes even when no command event fires: animals eat
      // and produce, incidents land, construction counts down, goods spoil and
      // the career clock advances. Treat every elapsed autosave interval as a
      // dirty snapshot so those gains and losses reach Glitch Cloud too.
      this.markDirty();
      void this.maybeSave();
    }, this.#intervalMs);
  }

  async maybeSave(): Promise<boolean> {
    if (!this.#dirty) return false;
    if (this.#now() - this.#lastWriteMs < this.#intervalMs) return false;
    return this.save();
  }

  /**
   * Writes now, whatever the interval says.
   *
   * Used after the irreversible actions - buying land, claiming a milestone,
   * choosing a specialization, taking a loan, a restructuring - where losing
   * the last twenty seconds would mean losing a decision rather than a few
   * crop ticks.
   */
  async save(): Promise<boolean> {
    const state = this.snapshot();
    if (!state) return false;
    this.#dirty = false;
    this.#lastWriteMs = this.#now();
    await this.saves.save(state);
    return true;
  }

  /** Synchronous local-only write, for pagehide where promises do not resolve. */
  flushLocal(): void {
    const state = this.snapshot();
    if (state) this.saves.writeLocal(state);
  }

  dispose(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    for (const unsubscribe of this.#unsubscribes) unsubscribe();
    this.#unsubscribes.length = 0;
  }
}
