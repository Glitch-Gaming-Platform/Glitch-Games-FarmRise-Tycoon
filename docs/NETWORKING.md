# Networking

## What this layer is for

FarmRise Tycoon is **single-player**. There is no multiplayer, no lockstep, no replication.

The networking layer exists for one reason: the game has a **persistent economy**. Money, goods,
buildings and land survive across sessions. The moment progress persists, the client stops being
trustworthy — it is a program running on someone else's computer, its memory can be edited, its
JavaScript can be replaced and its requests can be forged.

So the design goal is not synchronisation. It is: **the client is a predictor, the server is the
authority.**

## The trust boundary

```
        CLIENT (untrusted)                        SERVER (authority)
 ┌──────────────────────────────┐         ┌────────────────────────────────┐
│ Career + FarmWorld           │         │ SaveService                    │
 │  runs shared rules locally   │         │  optimistic concurrency        │
 │  so the game feels instant   │         │  plausibility validation       │
 │                              │         │                                │
 │ GameApi ── intent only ─────────HTTP──▶│ MarketService                  │
 │  "fulfil order X"            │         │  computes the payout itself    │
 │  "sell 6 wheat"              │         │  from ITS OWN stored state     │
 │                              │         │                                │
 │ never sends a price          │         │ private: order seeds,          │
 │ never sends a payout         │         │ anti-cheat thresholds          │
 │ never sends a balance it     │◀────────│ returns balance + revision     │
 │ expects to be honoured       │         │                                │
 └──────────────────────────────┘         └────────────────────────────────┘
              │                                          │
              └──────────── @farmrise/shared ────────────┘
                    schemas + rules, no secrets
```

### Shared, not shared

| In `@farmrise/shared` | Stays in `apps/server` |
| --- | --- |
| Request/response schemas | Order generation seed and salt |
| Error codes and status mapping | The `MAX_PLAUSIBLE_*` tuning in context |
| Crop, animal, building, event definitions | Password hashing parameters |
| Growth, yield, storage, order rules | JWT secrets and rotation |
| Seeded RNG **algorithm** | The **seeds** themselves |

The algorithm being public is fine — that is Kerckhoffs's principle. The seed is what must not leak,
because a client that could predict order generation could farm favourable contracts.

## Two grades of authority

Be precise about this, because "server-authoritative" is often claimed more broadly than it is true.

### Grade 1 — fully authoritative routes: money from server market trades

`POST /market/orders/:id/fulfill` and `POST /market/spot-sell` take **only an intent**:

```jsonc
{ "idempotencyKey": "…", "itemId": "wheat", "quantity": 6 }   // no price, no payout
```

The server reads its own stored inventory, computes the payout from the shared item registry, writes
the new balance, and appends a ledger entry. There is no field through which a client could propose
an amount — asserted by a test that pins the request schema's key list, and by a test that sends
`unitPrice` and `payout` and confirms they are ignored.

The persistent-career buyer board introduced in save v2 is currently an offline-first Grade 2
system. Its contracts, trust and payouts are transition-validated in the career save rather than
routed through the older server order table. Do not describe those career-board deliveries as fully
authoritative until dedicated intent routes replace that boundary.

### Grade 2 — plausibility-checked: the save document

`PUT /save` accepts the client's whole simulation state. Re-simulating every session server-side
would be stronger, and it is not what protects the things that matter here — trades already are.
Instead `validateSaveTransition` rejects anything physically impossible:

| Check | Rejects |
| --- | --- |
| Tick monotonic | Time running backwards |
| Tick vs server clock (`MAX_TICK_DRIFT_TICKS`) | Fast-forwarding to grow crops instantly |
| Balance gain ≤ earnings + known loan/milestone sources | `balance = 99999999` |
| Item gain ≤ `MAX_PLAUSIBLE_ITEMS_PER_TICK × elapsed` | Goods materialising |
| Milestones and unlocks follow the shared progression table | Inserting processors or workers early |
| Local stores and carriers stay within their own capacity | Deleting the hauling decision |
| Land, buildings, animals, workers and carriers match known costs/unlocks | Granting yourself the estate |
| Growth ≤ crop maximum, and ≤ elapsed ticks | Instant harvests |
| Loans and insurance match fixed offers/policies | Inventing free credit or full cover |
| Town projects match materials, cost, timer and prosperity sources | Granting permanent town bonuses |

Unexplained losses remain harmless, but known purchases and repayments must actually reduce the
balance. The validator deliberately remains a transition checker rather than a second full
simulation.

**What this does not catch:** a patient attacker staying inside every bound gains a modest,
bounded advantage. That is an accepted trade for a single-player game with no leaderboard and no
purchases. **If a leaderboard, trading between players, or real-money purchases are ever added,
Grade 2 is no longer sufficient** and the save must move to server-side re-simulation. Record that
as a new ADR when it happens.

## Protocol

**Envelope.** Every response is `{ ok: true, data }` or `{ ok: false, error: { code, message,
details?, requestId } }`. The client switches on `code`, never on `message`.

**Versioning.** Clients send `x-farmrise-protocol: 1.0`. A mismatched *major* version is rejected
with `426`. A stale cached bundle then fails loudly instead of writing a save the server would
misinterpret. Bump MAJOR when a field changes meaning or is removed; MINOR for backwards-compatible
additions.

**Routes** are built exclusively from `Routes` in the shared package, so a renamed route breaks the
type-check rather than production.

## Authentication

| Token | Lifetime | Storage | Why |
| --- | --- | --- | --- |
| Access | 15 min | **Memory only** | localStorage would make any XSS a permanent account takeover; a memory-only token dies with the tab |
| Refresh | 30 days | **httpOnly cookie** | JavaScript never sees it, so XSS cannot steal the session |

- Separate signing secrets for the two token classes, so compromising one verification key does not
  yield the other. Audience claims are checked, so a refresh token cannot be used as an access token
  (tested, including the `alg: none` case).
- **Rotation on every refresh.** Presenting a stale generation means the token was captured and
  replayed, so the entire session family is revoked. The legitimate user is logged out — the correct
  outcome when their token is known to be compromised.
- The refresh cookie is `SameSite=Lax`, `Path=/api/v1/auth`, `Secure` in production. `SameSite` is
  the CSRF defence for the refresh endpoint.
- `AUTH_JWT_SECRET_PREVIOUS` allows secret rotation without logging everybody out.

## Idempotency

Every money-moving request carries an `idempotencyKey`. The server stores `(user_id, key)` under a
unique index together with the exact response.

A retry after a dropped response replays the stored result instead of paying twice. This matters
because a mobile client on a flaky connection genuinely cannot tell "the request failed" from "the
response was lost" — and the difference is a duplicate payout.

Two protections stack on order fulfilment: the idempotency key, and a conditional
`UPDATE … WHERE status = 'open'` so two simultaneous requests cannot both claim the same order.

## Concurrency

Saves use optimistic concurrency. The client sends the `expectedRevision` it believes it is
updating; the server's `UPDATE … WHERE revision = ?` matches zero rows if anything wrote first, and
returns `STALE_WRITE` (409). The client must reload rather than clobber.

The revision is re-checked inside the `UPDATE`, not merely read beforehand — the check-then-act race
is real.

## Offline behaviour

Losing the connection never stops the local career. Every checkpoint writes local storage first;
account/cloud failure leaves that local document intact and a later autosave retries the durable
tiers. `ConnectionState` contains an idempotent mutation queue for future intent-route integration,
but current career-board progression does not claim durable queued server intents.

`HttpTransport` adds: a timeout (fetch has none by default), exponential backoff with jitter on
retryable codes only, and exactly one transparent refresh-and-retry on a 401.

## Glitch Cloud Save resume

A validated Glitch `user_id` is also the player's authentication identity in a Glitch launch. The
game must not layer its email/password form on top of that session.

A validated, login-backed Glitch install is checked before account or local storage when the game is
launched through Glitch. Slot `0` is listed with its payload, the decoded bytes are checksum-verified,
and only then is the career migrated and hydrated. This ensures the same losses and gains resume on a
different Glitch device rather than merely uploading a backup that is never read.

Timed autosave snapshots the whole career every 20 seconds, not only after command events. Autonomous
simulation changes—animal losses and production, spoilage, incident response/impact, construction
timers and elapsed career time—therefore participate in cloud persistence.

Unreadable cloud data is fail-closed: a local/account fallback may keep the player running, but cloud
writes are disabled for that session so a fresh or older local farm cannot overwrite the damaged
remote record. Optimistic concurrency still applies after load; listing the slot establishes the
`base_version`, and a 409 requires an explicit `keep_server` or `use_client` choice.

## Rate limiting

Fixed-window, in process memory. Anonymous callers are limited per IP, authenticated ones per
account.

| Route | Per minute | Why |
| --- | --- | --- |
| `auth.register` | 5 | Automated sign-up is how a service acquires a spam problem |
| `auth.login` | 10 | Credential stuffing |
| `auth.refresh` | 30 | |
| `save.put` | 60 | Autosave runs every 30 s; this is generous headroom |
| `market.*` | 60 | |
| default | 30 anon / 120 user | |

**Limitation, stated plainly:** this counts per Node process. With N instances the effective limit
is N×. Acceptable at launch scale for a single-player game; the interface is the one a Redis
implementation would have, so swapping it is a single file.

## Adding a route

1. Add the request/response schemas to `packages/shared/src/schemas/`.
2. Add the path to `Routes`.
3. Create `apps/server/app/api/v1/…/route.ts` with `createRoute({ name, auth, bodySchema, handler })`.
   Never bypass the wrapper — it is what makes the protocol check, rate limit, auth and validation
   impossible to forget.
4. Put the decision in a service, not the handler.
5. Add the typed call to `apps/game/src/net/GameApi.ts`.
6. Write a route test covering: anonymous access, another user's resource, invalid input, and a
   replayed request if it moves money.
7. Add a contract test asserting the real response parses with the shared schema.

## The rule for money

> If a client can name an amount, it will eventually name a large one.

Clients send intents. Servers compute amounts. Every time.
