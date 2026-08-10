-- 0001_init: accounts, sessions, saves, market orders, idempotency, ledger.
--
-- Written by hand rather than generated, so that every index and constraint is
-- a deliberate decision with a reason next to it.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
-- Unique on the normalised (lowercased) email. Enforced in the database, not
-- just in application code, because two concurrent registrations would both
-- pass an application-level "does this email exist?" check.
CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  generation INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
-- Supports the periodic cleanup of expired sessions without a table scan.
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE saves (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL DEFAULT 0,
  state      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- One save per user. Also makes the "create if missing" path race-safe.
CREATE UNIQUE INDEX saves_user_unique ON saves (user_id);

CREATE TABLE market_orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  buyer_id      TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    INTEGER NOT NULL CHECK (unit_price >= 0),
  deadline_tick INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'fulfilled', 'expired', 'cancelled')),
  created_at    INTEGER NOT NULL,
  fulfilled_at  INTEGER
);
-- The hot query is "open orders for this user", so index both columns together.
CREATE INDEX market_orders_user_status_idx ON market_orders (user_id, status);

CREATE TABLE idempotency_keys (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  route      TEXT NOT NULL,
  response   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- The uniqueness constraint IS the replay protection: the insert fails on a
-- duplicate, and the stored response is returned instead of paying twice.
CREATE UNIQUE INDEX idempotency_user_key_unique ON idempotency_keys (user_id, key);

CREATE TABLE ledger_entries (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  metadata      TEXT,
  created_at    INTEGER NOT NULL
);
-- Append-only audit trail. Every balance change the server makes is recorded
-- here, which is what makes "did this player earn this?" an answerable question.
CREATE INDEX ledger_user_created_idx ON ledger_entries (user_id, created_at);
