/**
 * Drizzle schema for the SQLite adapter.
 *
 * Conventions:
 *  - ids are text ULID-ish strings generated in the application, not
 *    autoincrementing integers, so a record can be created before it is written
 *    and ids never leak row counts
 *  - timestamps are integer epoch milliseconds; SQLite has no native date type
 *    and storing ISO strings makes range queries string comparisons
 *  - money is integer cents, matching @farmrise/shared
 *  - every foreign key cascades on delete, so deleting a user genuinely deletes
 *    their data (a requirement, not a convenience)
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Incremented on every refresh. A lower value in a presented token means replay. */
    generation: integer('generation').notNull().default(0),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export const saves = sqliteTable(
  'saves',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Optimistic concurrency token. Bumped on every accepted write. */
    revision: integer('revision').notNull().default(0),
    /** The SaveState document, validated against the shared schema before write. */
    state: text('state', { mode: 'json' }).notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  // One save per user for now. The unique index is what makes "get or create"
  // safe under concurrent first-login requests.
  (table) => [uniqueIndex('saves_user_unique').on(table.userId)],
);

export const marketOrders = sqliteTable(
  'market_orders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    buyerId: text('buyer_id').notNull(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    deadlineTick: integer('deadline_tick').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: integer('created_at').notNull(),
    fulfilledAt: integer('fulfilled_at'),
  },
  (table) => [index('market_orders_user_status_idx').on(table.userId, table.status)],
);

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    route: text('route').notNull(),
    /** The exact response that was returned, replayed verbatim on retry. */
    response: text('response', { mode: 'json' }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idempotency_user_key_unique').on(table.userId, table.key)],
);

export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** Signed cents. Positive is money in. */
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('ledger_user_created_idx').on(table.userId, table.createdAt)],
);
