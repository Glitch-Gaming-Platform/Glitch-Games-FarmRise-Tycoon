/**
 * Save loading and writing.
 *
 * Two guarantees:
 *  1. Optimistic concurrency. A write carries the revision the client believes
 *     it is updating; if another device wrote first the write is rejected with
 *     STALE_WRITE instead of silently destroying the other session's progress.
 *  2. Plausibility. Every write runs through validateSaveTransition against the
 *     stored state before it is accepted.
 */
import {
  SAVE_SCHEMA_VERSION,
  STARTING_BALANCE,
  type SaveEnvelope,
  type SaveState,
} from '@farmrise/shared';
import { HttpError } from '../http/errors';
import type { Repositories, SaveRecord } from '../repositories/ports';
import { serverTick } from '../domain/serverClock';
import { validateSaveTransition } from './saveValidation';

export function createInitialSaveState(): SaveState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    tick: serverTick(),
    balance: STARTING_BALANCE,
    plots: [],
    buildings: [],
    animals: [],
    inventory: {},
    landParcels: 1,
    rngState: Math.floor(Math.random() * 0xffffffff),
  };
}

export class SaveService {
  constructor(private readonly repositories: Repositories) {}

  /** Loads the player's save, creating a fresh one on first play. */
  async load(userId: string): Promise<SaveEnvelope> {
    const record = await this.repositories.saves.createIfMissing(userId, createInitialSaveState());
    return toEnvelope(record);
  }

  async write(userId: string, expectedRevision: number, state: SaveState): Promise<SaveEnvelope> {
    const current = await this.repositories.saves.findByUserId(userId);
    if (!current) {
      // Nothing to compare against, so accept it as the first write and let the
      // schema validation that already ran be the only gate.
      const created = await this.repositories.saves.createIfMissing(userId, state);
      return toEnvelope(created);
    }

    if (current.revision !== expectedRevision) {
      throw HttpError.staleWrite(
        `Your save is at revision ${expectedRevision} but the server has ${current.revision}. Reload before saving.`,
      );
    }

    const outcome = validateSaveTransition(current.state, state, serverTick());
    if (!outcome.ok) {
      throw HttpError.ruleViolation(outcome.reason ?? 'That save is not a possible continuation.');
    }

    const updated = await this.repositories.saves.updateIfRevisionMatches(
      userId,
      expectedRevision,
      state,
    );
    // A null here means someone else wrote between the check and the update.
    // The check-then-act race is real, which is why the update re-checks the
    // revision in its WHERE clause rather than trusting the read above.
    if (!updated) throw HttpError.staleWrite();

    return toEnvelope(updated);
  }

  /** Applies a server-computed balance and inventory change from a trade. */
  async applyTradeResult(
    userId: string,
    mutate: (state: SaveState) => SaveState,
  ): Promise<{ envelope: SaveEnvelope; state: SaveState }> {
    const current = await this.repositories.saves.createIfMissing(userId, createInitialSaveState());
    const next = mutate(current.state);
    const updated = await this.repositories.saves.updateIfRevisionMatches(
      userId,
      current.revision,
      next,
    );
    if (!updated) {
      throw HttpError.conflict('The save changed while the trade was being applied. Try again.');
    }
    return { envelope: toEnvelope(updated), state: next };
  }
}

function toEnvelope(record: SaveRecord): SaveEnvelope {
  return {
    saveId: record.id,
    revision: record.revision,
    updatedAt: record.updatedAt,
    state: record.state,
  };
}
