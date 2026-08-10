-- Rollback for 0001_init. Dropped in reverse dependency order.
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS market_orders;
DROP TABLE IF EXISTS saves;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
