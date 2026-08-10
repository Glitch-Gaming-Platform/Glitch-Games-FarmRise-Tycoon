/**
 * In-memory repositories.
 *
 * Not a toy: these are the implementations the service tests run against, so
 * they must honour the same contracts as the SQL ones - especially the
 * concurrency semantics (revision matching, generation rotation, unique keys).
 * If a behaviour differs between this and the Drizzle adapter, one of them is
 * wrong, which is what the shared contract test suite exists to catch.
 */
import type { SaveState } from '@farmrise/shared';
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

export function createMemoryRepositories(): Repositories & { reset(): void } {
  const usersById = new Map<string, UserRecord>();
  const usersByEmail = new Map<string, string>();
  const sessionsById = new Map<string, SessionRecord>();
  const savesByUser = new Map<string, SaveRecord>();
  const ordersById = new Map<string, MarketOrderRecord>();
  const idempotency = new Map<string, { route: string; response: unknown }>();
  const ledger: LedgerEntryRecord[] = [];

  const users: UserRepository = {
    async findById(id) {
      return usersById.get(id) ?? null;
    },
    async findByEmail(email) {
      const id = usersByEmail.get(email);
      return id ? (usersById.get(id) ?? null) : null;
    },
    async create(input) {
      if (usersByEmail.has(input.email)) return null;
      const now = Date.now();
      const record: UserRecord = { ...input, createdAt: now, updatedAt: now };
      usersById.set(record.id, record);
      usersByEmail.set(record.email, record.id);
      return record;
    },
  };

  const sessions: SessionRepository = {
    async create(input) {
      const record: SessionRecord = {
        ...input,
        generation: 0,
        revokedAt: null,
        createdAt: Date.now(),
      };
      sessionsById.set(record.id, record);
      return record;
    },
    async findById(id) {
      return sessionsById.get(id) ?? null;
    },
    async rotate(id, expectedGeneration) {
      const record = sessionsById.get(id);
      if (!record || record.generation !== expectedGeneration) return null;
      const next = { ...record, generation: record.generation + 1 };
      sessionsById.set(id, next);
      return next;
    },
    async revoke(id) {
      const record = sessionsById.get(id);
      if (record) sessionsById.set(id, { ...record, revokedAt: Date.now() });
    },
    async revokeAllForUser(userId) {
      for (const [id, record] of sessionsById) {
        if (record.userId === userId) sessionsById.set(id, { ...record, revokedAt: Date.now() });
      }
    },
    async deleteExpired(now) {
      let deleted = 0;
      for (const [id, record] of sessionsById) {
        if (record.expiresAt < now) {
          sessionsById.delete(id);
          deleted += 1;
        }
      }
      return deleted;
    },
  };

  const saves: SaveRepository = {
    async findByUserId(userId) {
      return savesByUser.get(userId) ?? null;
    },
    async createIfMissing(userId, state: SaveState) {
      const existing = savesByUser.get(userId);
      if (existing) return existing;
      const now = Date.now();
      const record: SaveRecord = {
        id: newId('sav'),
        userId,
        revision: 0,
        state,
        createdAt: now,
        updatedAt: now,
      };
      savesByUser.set(userId, record);
      return record;
    },
    async updateIfRevisionMatches(userId, expectedRevision, state) {
      const existing = savesByUser.get(userId);
      if (!existing || existing.revision !== expectedRevision) return null;
      const next: SaveRecord = {
        ...existing,
        state,
        revision: existing.revision + 1,
        updatedAt: Date.now(),
      };
      savesByUser.set(userId, next);
      return next;
    },
  };

  const market: MarketRepository = {
    async listOpenForUser(userId) {
      return [...ordersById.values()]
        .filter((order) => order.userId === userId && order.status === 'open')
        .sort((a, b) => a.deadlineTick - b.deadlineTick)
        .slice(0, 50);
    },
    async findForUser(userId, orderId) {
      const order = ordersById.get(orderId);
      return order && order.userId === userId ? order : null;
    },
    async insertMany(orders) {
      for (const order of orders) ordersById.set(order.id, order);
    },
    async markFulfilled(userId, orderId, at) {
      const order = ordersById.get(orderId);
      if (!order || order.userId !== userId || order.status !== 'open') return false;
      ordersById.set(orderId, { ...order, status: 'fulfilled', fulfilledAt: at });
      return true;
    },
    async expireOverdue(userId, nowTick) {
      let expired = 0;
      for (const [id, order] of ordersById) {
        if (order.userId === userId && order.status === 'open' && order.deadlineTick < nowTick) {
          ordersById.set(id, { ...order, status: 'expired' });
          expired += 1;
        }
      }
      return expired;
    },
  };

  const idempotencyRepository: IdempotencyRepository = {
    async find(userId, key) {
      return idempotency.get(`${userId}:${key}`) ?? null;
    },
    async remember(userId, key, route, response) {
      const composite = `${userId}:${key}`;
      if (idempotency.has(composite)) return false;
      idempotency.set(composite, { route, response });
      return true;
    },
  };

  const ledgerRepository: LedgerRepository = {
    async append(entry) {
      const record: LedgerEntryRecord = { ...entry, id: newId('led'), createdAt: Date.now() };
      ledger.push(record);
      return record;
    },
    async listRecent(userId, limit) {
      return ledger
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
  };

  return {
    users,
    sessions,
    saves,
    market,
    idempotency: idempotencyRepository,
    ledger: ledgerRepository,
    reset(): void {
      usersById.clear();
      usersByEmail.clear();
      sessionsById.clear();
      savesByUser.clear();
      ordersById.clear();
      idempotency.clear();
      ledger.length = 0;
    },
  };
}
