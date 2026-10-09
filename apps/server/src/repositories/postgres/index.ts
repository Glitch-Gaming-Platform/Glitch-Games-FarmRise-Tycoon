/** Durable PostgreSQL implementation of Farmrise repository ports. */
import type { Pool, QueryResultRow } from 'pg';
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

type Row = Record<string, unknown>;
function int(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error('Unsafe database integer; refusing lossy conversion.');
  return n;
}
const user = (r: Row): UserRecord => ({
  id: String(r.id),
  email: String(r.email),
  displayName: String(r.display_name),
  passwordHash: String(r.password_hash),
  createdAt: int(r.created_at),
  updatedAt: int(r.updated_at),
});
const session = (r: Row): SessionRecord => ({
  id: String(r.id),
  userId: String(r.user_id),
  generation: int(r.generation),
  expiresAt: int(r.expires_at),
  revokedAt: r.revoked_at == null ? null : int(r.revoked_at),
  userAgent: r.user_agent == null ? null : String(r.user_agent),
  createdAt: int(r.created_at),
});
const save = (r: Row): SaveRecord => ({
  id: String(r.id),
  userId: String(r.user_id),
  revision: int(r.revision),
  state: r.state as SaveState,
  createdAt: int(r.created_at),
  updatedAt: int(r.updated_at),
});
const order = (r: Row): MarketOrderRecord => ({
  id: String(r.id),
  userId: String(r.user_id),
  buyerId: String(r.buyer_id),
  itemId: String(r.item_id),
  quantity: int(r.quantity),
  unitPrice: int(r.unit_price),
  deadlineTick: int(r.deadline_tick),
  status: r.status as MarketOrderRecord['status'],
  createdAt: int(r.created_at),
  fulfilledAt: r.fulfilled_at == null ? null : int(r.fulfilled_at),
});
const ledger = (r: Row): LedgerEntryRecord => ({
  id: String(r.id),
  userId: String(r.user_id),
  kind: String(r.kind),
  amount: int(r.amount),
  balanceAfter: int(r.balance_after),
  metadata: r.metadata == null ? null : (r.metadata as Record<string, unknown>),
  createdAt: int(r.created_at),
});
function conflict(error: unknown): boolean {
  return !!(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

export function createPostgresRepositories(db: Pool): Repositories {
  const one = async (sql: string, params: unknown[] = []): Promise<Row | null> => {
    const result = await db.query<QueryResultRow>(sql, params);
    return (result.rows[0] as Row | undefined) ?? null;
  };

  const users: UserRepository = {
    async findById(id) {
      const r = await one('SELECT * FROM users WHERE id=$1', [id]);
      return r ? user(r) : null;
    },
    async findByEmail(email) {
      const r = await one('SELECT * FROM users WHERE email=$1', [email]);
      return r ? user(r) : null;
    },
    async create(input) {
      const now = Date.now();
      const record: UserRecord = { ...input, createdAt: now, updatedAt: now };
      try {
        const r = await one(
          `INSERT INTO users(id,email,display_name,password_hash,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO NOTHING RETURNING *`,
          [record.id, record.email, record.displayName, record.passwordHash, now, now],
        );
        return r ? user(r) : null;
      } catch (e) {
        if (conflict(e)) return null;
        throw e;
      }
    },
  };

  const sessions: SessionRepository = {
    async create(input) {
      const now = Date.now();
      const r = await one(
        `INSERT INTO sessions
        (id,user_id,generation,expires_at,revoked_at,user_agent,created_at)
        VALUES($1,$2,0,$3,NULL,$4,$5) RETURNING *`,
        [input.id, input.userId, input.expiresAt, input.userAgent, now],
      );
      if (!r) throw new Error('Session insert returned no row');
      return session(r);
    },
    async findById(id) {
      const r = await one('SELECT * FROM sessions WHERE id=$1', [id]);
      return r ? session(r) : null;
    },
    async rotate(id, generation) {
      const r = await one(
        `UPDATE sessions SET generation=generation+1
        WHERE id=$1 AND generation=$2 RETURNING *`,
        [id, generation],
      );
      return r ? session(r) : null;
    },
    async revoke(id) {
      await db.query('UPDATE sessions SET revoked_at=$2 WHERE id=$1', [id, Date.now()]);
    },
    async revokeAllForUser(userId) {
      await db.query('UPDATE sessions SET revoked_at=$2 WHERE user_id=$1', [userId, Date.now()]);
    },
    async deleteExpired(now) {
      const r = await db.query('DELETE FROM sessions WHERE expires_at<$1 RETURNING id', [now]);
      return r.rowCount ?? 0;
    },
  };

  const saves: SaveRepository = {
    async findByUserId(userId) {
      const r = await one('SELECT * FROM saves WHERE user_id=$1', [userId]);
      return r ? save(r) : null;
    },
    async createIfMissing(userId, state) {
      const now = Date.now();
      const r = await one(
        `INSERT INTO saves(id,user_id,revision,state,created_at,updated_at)
        VALUES($1,$2,0,$3::jsonb,$4,$4) ON CONFLICT(user_id) DO NOTHING RETURNING *`,
        [newId('sav'), userId, JSON.stringify(state), now],
      );
      if (r) return save(r);
      const existing = await this.findByUserId(userId);
      if (!existing) throw new Error('Save creation raced but no existing row was found.');
      return existing;
    },
    async updateIfRevisionMatches(userId, revision, state) {
      const r = await one(
        `UPDATE saves SET state=$3::jsonb, revision=revision+1,
        updated_at=$4 WHERE user_id=$1 AND revision=$2 RETURNING *`,
        [userId, revision, JSON.stringify(state), Date.now()],
      );
      return r ? save(r) : null;
    },
  };

  const market: MarketRepository = {
    async listOpenForUser(userId) {
      const r = await db.query(
        `SELECT * FROM market_orders
        WHERE user_id=$1 AND status='open' ORDER BY deadline_tick ASC LIMIT 50`,
        [userId],
      );
      return r.rows.map(order);
    },
    async findForUser(userId, orderId) {
      const r = await one('SELECT * FROM market_orders WHERE id=$1 AND user_id=$2', [
        orderId,
        userId,
      ]);
      return r ? order(r) : null;
    },
    async insertMany(orders) {
      if (!orders.length) return;
      // All-or-nothing statement; avoid INSERT loops that leave half a market.
      const fields = [
        'id',
        'user_id',
        'buyer_id',
        'item_id',
        'quantity',
        'unit_price',
        'deadline_tick',
        'status',
        'created_at',
        'fulfilled_at',
      ];
      const values: unknown[] = [];
      const placeholders = orders.map((o) => {
        const v = [
          o.id,
          o.userId,
          o.buyerId,
          o.itemId,
          o.quantity,
          o.unitPrice,
          o.deadlineTick,
          o.status,
          o.createdAt,
          o.fulfilledAt,
        ];
        const n = values.length;
        values.push(...v);
        return '(' + v.map((_, k) => '$' + (n + k + 1)).join(',') + ')';
      });
      await db.query(
        `INSERT INTO market_orders(${fields.join(',')}) VALUES ${placeholders.join(',')}`,
        values,
      );
    },
    async markFulfilled(userId, orderId, at) {
      const r = await one(
        `UPDATE market_orders SET status='fulfilled',fulfilled_at=$3
        WHERE user_id=$1 AND id=$2 AND status='open' RETURNING id`,
        [userId, orderId, at],
      );
      return !!r;
    },
    async expireOverdue(userId, tick) {
      const r = await db.query(
        `UPDATE market_orders SET status='expired'
        WHERE user_id=$1 AND status='open' AND deadline_tick<$2 RETURNING id`,
        [userId, tick],
      );
      return r.rowCount ?? 0;
    },
  };

  const idempotency: IdempotencyRepository = {
    async find(userId, key) {
      const r = await one(
        'SELECT route,response FROM idempotency_keys WHERE user_id=$1 AND key=$2',
        [userId, key],
      );
      return r ? { route: String(r.route), response: r.response } : null;
    },
    async remember(userId, key, route, response) {
      const r = await one(
        `INSERT INTO idempotency_keys(id,user_id,key,route,response,created_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6)
        ON CONFLICT(user_id,key) DO NOTHING RETURNING id`,
        [newId('idem'), userId, key, route, JSON.stringify(response), Date.now()],
      );
      return !!r;
    },
  };

  const ledgerRepo: LedgerRepository = {
    async append(entry) {
      const record: LedgerEntryRecord = { ...entry, id: newId('led'), createdAt: Date.now() };
      const r = await one(
        `INSERT INTO ledger_entries
        (id,user_id,kind,amount,balance_after,metadata,created_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
        [
          record.id,
          record.userId,
          record.kind,
          record.amount,
          record.balanceAfter,
          record.metadata == null ? null : JSON.stringify(record.metadata),
          record.createdAt,
        ],
      );
      if (!r) throw new Error('Ledger insert returned no row.');
      return ledger(r);
    },
    async listRecent(userId, limit) {
      const r = await db.query(
        `SELECT * FROM ledger_entries WHERE user_id=$1
        ORDER BY created_at DESC LIMIT $2`,
        [userId, Math.max(0, Math.min(limit, 1000))],
      );
      return r.rows.map(ledger);
    },
  };

  return { users, sessions, saves, market, idempotency, ledger: ledgerRepo };
}
