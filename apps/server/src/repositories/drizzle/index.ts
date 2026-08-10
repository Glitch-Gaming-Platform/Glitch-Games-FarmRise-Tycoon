/**
 * Drizzle/SQLite implementations of the repository ports.
 *
 * All SQL in the application lives in this folder. If you find a query anywhere
 * else, that is the bug.
 */
import { and, asc, desc, eq, lt, ne } from 'drizzle-orm';
import type { SaveState } from '@farmrise/shared';
import type { Db } from '../../db/client';
import {
  idempotencyKeys,
  ledgerEntries,
  marketOrders,
  saves,
  sessions,
  users,
} from '../../db/schema';
import { newId } from '../../db/ids';
import type {
  IdempotencyRepository,
  LedgerEntryRecord,
  LedgerRepository,
  MarketOrderRecord,
  MarketRepository,
  Repositories,
  SaveRecord,
  SaveRepository,
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '../ports';

/** better-sqlite3 raises this on a unique-index violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT')
  );
}

export function createDrizzleRepositories(db: Db): Repositories {
  const userRepository: UserRepository = {
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    },
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    },
    async create(input) {
      const now = Date.now();
      const record: UserRecord = { ...input, createdAt: now, updatedAt: now };
      try {
        await db.insert(users).values(record);
        return record;
      } catch (error) {
        // Losing the race to a concurrent registration is an expected outcome,
        // not an exception the caller should have to catch.
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },
  };

  const sessionRepository: SessionRepository = {
    async create(input) {
      const record: SessionRecord = {
        ...input,
        generation: 0,
        revokedAt: null,
        createdAt: Date.now(),
      };
      await db.insert(sessions).values(record);
      return record;
    },
    async findById(id) {
      const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      return row ?? null;
    },
    async rotate(id, expectedGeneration) {
      // The WHERE clause carries the expected generation, so two concurrent
      // refreshes cannot both succeed: the second matches zero rows.
      const updated = await db
        .update(sessions)
        .set({ generation: expectedGeneration + 1 })
        .where(and(eq(sessions.id, id), eq(sessions.generation, expectedGeneration)))
        .returning();
      return updated[0] ?? null;
    },
    async revoke(id) {
      await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.id, id));
    },
    async revokeAllForUser(userId) {
      await db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.userId, userId));
    },
    async deleteExpired(now) {
      const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning();
      return deleted.length;
    },
  };

  const saveRepository: SaveRepository = {
    async findByUserId(userId) {
      const [row] = await db.select().from(saves).where(eq(saves.userId, userId)).limit(1);
      return row ? toSaveRecord(row) : null;
    },
    async createIfMissing(userId, state) {
      const existing = await this.findByUserId(userId);
      if (existing) return existing;

      const now = Date.now();
      const record = {
        id: newId('sav'),
        userId,
        revision: 0,
        state,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await db.insert(saves).values(record);
        return record;
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Another request created it between our read and our insert.
          const raced = await this.findByUserId(userId);
          if (raced) return raced;
        }
        throw error;
      }
    },
    async updateIfRevisionMatches(userId, expectedRevision, state) {
      const updated = await db
        .update(saves)
        .set({ state, revision: expectedRevision + 1, updatedAt: Date.now() })
        .where(and(eq(saves.userId, userId), eq(saves.revision, expectedRevision)))
        .returning();
      const row = updated[0];
      return row ? toSaveRecord(row) : null;
    },
  };

  const marketRepository: MarketRepository = {
    async listOpenForUser(userId) {
      const rows = await db
        .select()
        .from(marketOrders)
        .where(and(eq(marketOrders.userId, userId), eq(marketOrders.status, 'open')))
        .orderBy(asc(marketOrders.deadlineTick))
        .limit(50);
      return rows.map(toOrderRecord);
    },
    async findForUser(userId, orderId) {
      const [row] = await db
        .select()
        .from(marketOrders)
        .where(and(eq(marketOrders.id, orderId), eq(marketOrders.userId, userId)))
        .limit(1);
      return row ? toOrderRecord(row) : null;
    },
    async insertMany(orders) {
      if (orders.length === 0) return;
      await db.insert(marketOrders).values(orders);
    },
    async markFulfilled(userId, orderId, at) {
      // status='open' in the WHERE clause is the double-fulfilment guard: a
      // replayed request updates zero rows and gets `false`.
      const updated = await db
        .update(marketOrders)
        .set({ status: 'fulfilled', fulfilledAt: at })
        .where(
          and(
            eq(marketOrders.id, orderId),
            eq(marketOrders.userId, userId),
            eq(marketOrders.status, 'open'),
          ),
        )
        .returning();
      return updated.length > 0;
    },
    async expireOverdue(userId, nowTick) {
      const updated = await db
        .update(marketOrders)
        .set({ status: 'expired' })
        .where(
          and(
            eq(marketOrders.userId, userId),
            eq(marketOrders.status, 'open'),
            lt(marketOrders.deadlineTick, nowTick),
            ne(marketOrders.status, 'fulfilled'),
          ),
        )
        .returning();
      return updated.length;
    },
  };

  const idempotencyRepository: IdempotencyRepository = {
    async find(userId, key) {
      const [row] = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
        .limit(1);
      return row ? { route: row.route, response: row.response } : null;
    },
    async remember(userId, key, route, response) {
      try {
        await db.insert(idempotencyKeys).values({
          id: newId('idem'),
          userId,
          key,
          route,
          response,
          createdAt: Date.now(),
        });
        return true;
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },
  };

  const ledgerRepository: LedgerRepository = {
    async append(entry) {
      const record: LedgerEntryRecord = { ...entry, id: newId('led'), createdAt: Date.now() };
      await db.insert(ledgerEntries).values(record);
      return record;
    },
    async listRecent(userId, limit) {
      const rows = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.userId, userId))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(limit);
      return rows.map((row) => ({
        ...row,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      }));
    },
  };

  return {
    users: userRepository,
    sessions: sessionRepository,
    saves: saveRepository,
    market: marketRepository,
    idempotency: idempotencyRepository,
    ledger: ledgerRepository,
  };
}

function toSaveRecord(row: typeof saves.$inferSelect): SaveRecord {
  return { ...row, state: row.state as SaveState };
}

function toOrderRecord(row: typeof marketOrders.$inferSelect): MarketOrderRecord {
  return { ...row, status: row.status as MarketOrderRecord['status'] };
}
