# 0005. SQLite behind repository ports, with hand-written migrations

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The backend needs durable storage for accounts, sessions, saves, orders, idempotency keys and a money
ledger. Expected launch scale is unknown but small, and the game is single-player, so there is no
shared world to contend over. The brief requires a testable, database-agnostic access layer with
migrations and rollback guidance.

## Decision

- **SQLite** via `better-sqlite3`, with WAL mode, enforced foreign keys and a busy timeout.
- **Drizzle ORM** for typed queries — not for migrations.
- **Repository ports** in `src/repositories/ports.ts`. Services depend only on those interfaces.
  Adapters: `drizzle/` (SQLite) and `memory/` (used by the service and route tests).
- **Hand-written SQL migrations** applied by a small runner: ordered files, one transaction each,
  checksum-verified, with a matching `.down.sql`.

## Consequences

- Zero-configuration local development: no Docker, no server to start, one file to delete to reset.
- Service and route tests run against the in-memory adapter — 102 server tests with no fixtures and
  no cleanup.
- The in-memory adapter must honour the same concurrency semantics as the SQL one. A divergence means
  one of them is wrong, which is a real maintenance obligation.
- Every index and constraint has a comment explaining why it exists, which generated migrations do
  not give you.
- Editing an applied migration throws instead of silently diverging.
- **Postgres is not implemented.** The container throws a pointed error naming what to build.
  Migrating means a new adapter folder, a Postgres schema (the dialects differ) and ported SQL.
- `better-sqlite3` is a native module: it needs a rebuild per platform, and it is excluded from the
  Next.js bundler via `serverExternalPackages`.
- SQLite serialises writes. Fine for one process; a hard ceiling if the service is ever scaled out,
  which is precisely when Postgres becomes necessary.

## Alternatives considered

- **Postgres from day one.** Most production-like, and it makes `npm test` depend on Docker.
- **Drizzle-kit generated migrations.** Excellent at tracking a schema, poor at recording intent, and
  the brief asked specifically for rollback guidance.
- **Prisma.** Heavier, with its own engine binary and a code-generation step, for no benefit here.
- **A raw query builder with no ORM.** Loses the compile-time link between schema and query for very
  little.
