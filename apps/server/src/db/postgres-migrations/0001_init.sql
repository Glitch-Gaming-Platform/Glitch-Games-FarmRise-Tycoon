-- Farmrise PostgreSQL schema. No destructive changes to existing tables.
-- Apply to a new, dedicated, private tenant database before the cutover.
BEGIN;
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE,
  display_name text NOT NULL, password_hash text NOT NULL,
  created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation integer NOT NULL DEFAULT 0, expires_at bigint NOT NULL,
  revoked_at bigint, user_agent text, created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS saves (
  id text PRIMARY KEY, user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0, state jsonb NOT NULL,
  created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS market_orders (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id text NOT NULL, item_id text NOT NULL, quantity bigint NOT NULL CHECK (quantity > 0),
  unit_price bigint NOT NULL CHECK (unit_price >= 0), deadline_tick bigint NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','expired','cancelled')),
  created_at bigint NOT NULL, fulfilled_at bigint
);
CREATE INDEX IF NOT EXISTS market_orders_user_status_idx ON market_orders(user_id, status);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL, route text NOT NULL, response jsonb NOT NULL,
  created_at bigint NOT NULL, CONSTRAINT idempotency_user_key_unique UNIQUE(user_id, key)
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL, amount bigint NOT NULL, balance_after bigint NOT NULL,
  metadata jsonb, created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON ledger_entries(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS migration_history (
  id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
