# Farmrise Azure game-server migration: prerequisites and runbook

Status: **development implementation verified locally; production cutover blocked**.

## What is implemented

- PostgreSQL repository implementing all six existing repository ports: accounts,
  sessions, saves, market, idempotency keys and ledger. Save revisions and token
  generations are atomic compare-and-update operations. Market fulfilment
  permits only one winner. A dedicated schema migration has no destructive
  statements and checks a SHA-256 migration history.
- `scripts/import-sqlite-snapshots.ts` opens immutable, coherent SQLite offline
  backups read-only, checks integrity and foreign keys, deduplicates identical
  rows, detects cross-replica conflicts, and emits **redacted** totals and
  fingerprint hashes, never player identifiers, emails or saved state.
- The importer refuses to continue when overlapping rows differ, unique keys
  conflict, backups are corrupt, foreign keys are missing, or the declared
  replica count does not match the number of unique backups.
- A PostgreSQL import is explicit and transactional, requires a previously
  migrated *empty* target database and separate operator approvals. It never
  overwrites an existing account or save.

## Production blockers checked October 9, 2026

1. Azure currently has two Farmrise replicas on revision
   `farmrise-tycoon-node--0000024`, at min 2/max 3, with no shared ACA volume.
   Each replica can hold its own authoritative SQLite saves.
2. `az containerapp exec` to a named live replica via the Mac's Azure CLI
   failed at the Azure WebSocket connection with `[Errno 60] Operation timed out`.
   **Neither replica's backup was obtained**; no customer data reconciliation
   has been performed. Azure API configuration inspection alone does not
   prove save state.
3. Current production image does not run the PostgreSQL adapter and cannot
   be switched by setting `DATABASE_DRIVER` alone.
4. Auth secrets/session continuity and the write-freeze window must be
   verified on the actual running game, not inferred from local fixtures.
5. For arbitrary customer-supplied code, Microsoft advises a separate ACA
   environment per untrusted tenant. A shared ACA environment is NOT a
   network isolation boundary. The secure test environment's outbound rules
   remain broad and are not certified.

## Planned production cutover (not yet performed)

- Obtain an authenticated, consistent SQLite online backup *from each named
  old replica*. Use SQLite's `backup()` API within each live container to
  include pending WAL writes. Transfer over a secure, time-limited operator
  channel, encrypt at rest and verify hashes outside Azure. Do not restart,
  update, scale down or discard either source replica before this.
- Freeze writes and drain old connections. Take **final** fresh online backups
  from all replicas. Keep old routing intact. The expected replica count must
  be recorded from a fresh `az containerapp replica list` call.
- Run `npx tsx apps/server/scripts/import-sqlite-snapshots.ts
  --expected-replicas=2 path/to/replicaA.sqlite path/to/replicaB.sqlite`
  from the repository root. If it reports `approvedForImport:false`, stop:
  reconcile conflicts with an audited, player-safe procedure, not by choosing
  the newest timestamp or deleting one replica.
- Provision a dedicated, private PostgreSQL database, least-privilege user,
  TLS verification and tested backups. Apply schema with
  `FARMRISE_ALLOW_POSTGRES_MIGRATION=yes` and `npm run db:pg:migrate
  --workspace @farmrise/server`, with its `DATABASE_URL` securely supplied.
  Run a tested encrypted restore before admitting customer data.
- Only after backups and write freeze are independently verified may an
  operator supply `FARMRISE_DATA_IMPORT_APPROVED=yes`,
  `FARMRISE_WRITES_FROZEN=yes`, `FARMRISE_BACKUPS_VERIFIED=yes`,
  plus `--apply` to the import tool. Check all table row counts and
  cross-replica save revisions after import.
- Deploy the new PostgreSQL-backed image to **a new isolated ACA environment**
  with tenant-specific registry identity and deny-by-default inspected egress.
  Stage with no customer traffic, verify login, refresh, existing saves,
  market, ledger, reconnect, session expiry, autosave and rollback.
- Shift a small portion of real traffic, observe, then fully cut over only
  when game-side tests pass with the source database still intact. Retire
  old replicas only after the rollback window, data verification and
  explicit customer-server approval.

## Local verification

- Disposable `postgres:17` test server on `127.0.0.1:15438`:
  5 repository tests passed (account, save concurrency, sessions, market,
  idempotency and ledger).
- Two-replica SQLite reconciliation: 5 tests passed, including conflict and
  corruption handling.
- Two-replica transactional SQLite-to-Postgres import: 2 tests passed,
  including reimport refusal.
- `tsc -p apps/server/tsconfig.json --noEmit --emitDeclarationOnly false`
  passed. Main Farmrise server suite passed 149 tests before the importer
  integration test was added.

**Until the live backups are available and validated, production migration
remains forbidden. Do not shut down or reduce Farmrise's original replicas.**
