# Backend

Next.js App Router route handlers over SQLite. Authoritative for accounts, saves, market orders and
every cent of the economy. See [NETWORKING.md](NETWORKING.md) for the trust model; this document is
about running, extending and troubleshooting the service.

## Audit of what was here before

The repository was empty. There was no existing frontend owning sensitive logic to migrate, no
existing conventions to follow and no prior dependencies to preserve. Every decision below was made
fresh and recorded in [decisions/](decisions/).

## Data flow

```
Request
  └─ createRoute()                     src/http/route.ts
       ├─ protocol version check        426 on a major mismatch
       ├─ rate limit                    429, keyed per user or per IP
       ├─ authenticate                  401; user id comes from the token, never from input
       ├─ validate body (zod)           422 with field-level detail
       ├─ handler → service             the decision happens here
       │    └─ repository port          the only way to reach data
       │         └─ Drizzle / SQLite    the only place SQL exists
       └─ envelope + no-store + request id
```

Authentication runs **before** body validation: an anonymous caller should not get to exercise the
parser.

## Setup

```bash
cp apps/server/.env.example apps/server/.env.local
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"  # x2

npm run build --workspace @farmrise/shared   # services import its build output
npm run db:migrate
SEED_USER_PASSWORD='<local-password>' npm run db:seed  # optional: farmer@example.com
npm run dev:server
```

`.env.local` is gitignored. In development, working secrets are defaulted so nobody has to invent
them to run tests. **In production a missing secret is a hard startup failure** — never a silently
insecure default. Secrets must be at least 32 characters; `src/config/env.ts` refuses shorter ones.

There is no `NEXT_PUBLIC_` variable anywhere, and adding one that carries a secret is a review
blocker. The browser receives only what a route explicitly returns.

## Database

### Schema

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `users` | Accounts | Unique index on normalised email — enforced in the DB, because two concurrent registrations would both pass an application-level check |
| `sessions` | Refresh sessions | `generation` counter drives rotation and replay detection |
| `saves` | One save per user | Unique on `user_id`; `revision` is the optimistic-concurrency token |
| `market_orders` | Contracts | `CHECK` on quantity/price/status; composite index on `(user_id, status)` |
| `idempotency_keys` | Replay protection | Unique on `(user_id, key)` — the constraint *is* the protection |
| `ledger_entries` | Append-only audit of every balance change | Index on `(user_id, created_at)` |
| `schema_migrations` | Applied migrations + checksums | Created by the runner |

Conventions: application-generated time-sortable text ids (a primary key index that stays
append-mostly, and ids that cannot be enumerated); integer epoch-millisecond timestamps; integer
cents for money; `ON DELETE CASCADE` everywhere so deleting a user genuinely deletes their data.

### Migrations

Hand-written SQL in `src/db/migrations/`, applied by `src/db/migrator.ts`.

- `NNNN_name.sql` forward, `NNNN_name.down.sql` back. A migration without a down script is allowed
  but refuses to roll back — "this is irreversible" becomes a conscious decision.
- Each runs inside a transaction, so a failure leaves nothing half-applied (tested).
- Applied migrations are recorded with a SHA-256 checksum. Editing one that already ran throws
  rather than silently diverging (tested).

```bash
npm run db:migrate    # apply all pending
npm run db:rollback   # roll back exactly one
```

Rollback undoes one migration per invocation, deliberately — a loop that unwinds the whole schema is
a foot-gun.

**Recovering a bad deploy:** roll back the application first, then `npm run db:rollback`. If the
migration was additive (new nullable column, new table), rolling back the app alone is usually
enough and safer. Back up `apps/server/data/farmrise.sqlite` before any destructive migration; there
is no point-in-time recovery.

### Why hand-written SQL rather than drizzle-kit generation

The requirement was explicit, reviewable SQL with a matching rollback for every change, and a
comment next to every index explaining why it exists. Generated migrations are excellent at keeping
up with a schema and poor at recording intent. Drizzle is still used for typed queries.

## Repository ports

Services depend on interfaces in `src/repositories/ports.ts` and never on Drizzle, SQLite or SQL.
That buys three things:

1. Service tests run against the in-memory adapter — fast, no cleanup, no fixtures.
2. Swapping the database is a new folder, not a rewrite.
3. Every query the application can make is enumerable by reading one file, which is how you know
   where indexes are needed.

Method names carry semantics — `updateIfRevisionMatches`, `rotate(id, expectedGeneration)` — so
concurrency lives in the port instead of being reinvented at each call site.

**The in-memory adapter is not a toy.** It must honour the same concurrency contracts as the SQL
one; a divergence means one of them is wrong.

### Adding Postgres

1. Create `src/repositories/postgres/` implementing the same ports.
2. Add a `pg` schema under `src/db/` (Drizzle's Postgres dialect differs from SQLite's).
3. Port the migrations — the runner is dialect-agnostic, the SQL is not.
4. Add the case in `src/repositories/container.ts` (it currently throws a pointed error).
5. Run the same service and route tests against it.

## Security controls

| Control | Where | Note |
| --- | --- | --- |
| scrypt password hashing | `auth/password.ts` | N=2¹⁷, r=8, p=1, per-password salt, constant-time compare. Cost factors stored in the hash so they can be raised later. No native dependency. |
| Account-enumeration resistance | `services/authService.ts` | Unknown email burns comparable time via `fakeVerifyDelay`; identical error message either way (tested) |
| JWT with audience separation | `auth/tokens.ts` | Separate secrets and audiences for access vs refresh; `alg` pinned to HS256 |
| Refresh rotation + replay revocation | `authService.refresh` | A replayed generation revokes the whole family |
| httpOnly / SameSite / Secure cookie | `auth/cookies.ts` | Scoped to `/api/v1/auth` |
| Rate limiting | `http/rateLimit.ts` | Per-process; see the limitation in NETWORKING.md |
| Input validation | `http/route.ts` + shared schemas | Every string and array is bounded — an unbounded schema is a DoS vector |
| Ownership by construction | every route | The user id comes from the verified token. No route takes a user id as input, so there is no `?id=` to escalate through |
| Idempotency | `repositories.idempotency` | Unique constraint |
| Optimistic concurrency | `saves.updateIfRevisionMatches` | Conditional UPDATE |
| Generic 500s | `http/respond.ts` | Detail to the log, request id to the client |
| Security headers | `next.config.mjs` | nosniff, DENY framing, no-referrer, restrictive Permissions-Policy, HSTS |
| `cache-control: no-store` | every response | Per-user state cached on a shared proxy is a data leak |

### Residual risks

- Rate limits are per process (see above).
- Save validation is plausibility-based (see NETWORKING.md, "Grade 2").
- No CSRF token beyond `SameSite`. Adequate while the only cookie-authenticated route is refresh; a
  token is required if cookie auth is ever extended to mutating routes.
- No audit log of *reads*, only of balance changes.
- No account lockout after repeated failures — only rate limiting.

## Tests

102 server tests, all passing.

| File | Covers |
| --- | --- |
| `unit/password.test.ts` | Verify, reject, salt, malformed hash, unicode normalisation |
| `unit/tokens.test.ts` | Round-trip, tampering, cross-audience misuse, `alg: none` |
| `unit/rateLimit.test.ts` | Limit, isolation, window reset |
| `unit/saveValidation.test.ts` | Every anti-cheat rule, plus the legitimate cases it must allow |
| `unit/migrator.test.ts` | Ordering, idempotency, rollback, checksum drift, transactional failure |
| `integration/authService.test.ts` | Registration, login, rotation, replay revocation, logout |
| `integration/marketService.test.ts` | Payouts, double-spend, cross-user access, ledger, order stability |
| `routes/*.test.ts` | The full middleware chain, including 401/403/409/422/429 paths |
| `protocol/contract.test.ts` | Real responses parse with the shared schemas |

Route handlers are plain `Request → Response` functions, so they are exercised directly with no HTTP
server and no Next runtime.

## Scaling

Current shape suits launch scale for a single-player game: one process, one SQLite file, WAL mode.

In rough order of when each becomes the bottleneck:

1. **Multiple instances** → move rate limiting to Redis and migrate SQLite to Postgres.
2. **Save write volume** → the autosave cadence (30 s) is the knob; consider delta writes.
3. **Order generation** → currently computed on read. Move to a scheduled job if it shows up in
   traces.
4. **Ledger growth** → append-only and unbounded. Add partitioning or archival before it matters.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `No "exports" main defined in @farmrise/shared` | The shared package has not been built | `npm run build --workspace @farmrise/shared` |
| `Invalid environment configuration` | Missing or short secret | Check `.env.local` against `.env.example` |
| `Cannot open database because the directory does not exist` | `DATABASE_URL` points somewhere uncreatable | Use a path under an existing directory; the client creates the immediate parent |
| `Migration "…" has changed since it was applied` | An applied migration was edited | Revert the edit and add a new migration |
| Every request returns 426 | Client/server protocol major mismatch | Rebuild the client, or bump `PROTOCOL_VERSION` deliberately |
| `STALE_WRITE` on every save | Two clients on one account | Reload; last-write-wins is intentionally not offered |
| `Top-level await is not supported with the "cjs" output format` | A new script under `scripts/` uses top-level await | Wrap it in `main()` — tsx transpiles this package as CJS |
