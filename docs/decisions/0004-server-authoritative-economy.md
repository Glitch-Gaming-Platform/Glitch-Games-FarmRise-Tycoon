# 0004. Server-authoritative economy with plausibility-checked saves

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The game is single-player, so there is no opponent to protect a player from. But progress persists
across sessions, and the brief requires that trusted state stay on the server.

Two extremes were available. Trust the client entirely and store whatever it sends — cheap, and it
makes the save file an editable text box. Or re-simulate every session on the server — the strongest
guarantee, and the most expensive thing in the system, for a game where nobody else is affected by a
player's balance.

## Decision

Split authority into two grades and be explicit about where the line is.

**Grade 1 — fully authoritative: money from trades.** `POST /market/orders/:id/fulfill` and
`POST /market/spot-sell` accept only an intent. There is no field through which a client can propose
a price, a payout or a balance. The server reads its own stored inventory, computes the amount from
the shared item registry, writes the balance and appends a ledger entry.

**Grade 2 — plausibility-checked: the save document.** `PUT /save` accepts the client's whole state
and `validateSaveTransition` rejects anything physically impossible: time moving backwards, ticks
ahead of the server clock, balance or goods growing faster than the game can produce them, storage
over capacity, land granted rather than bought, crops grown past their maximum or faster than elapsed
time.

## Consequences

- The thing worth stealing — money — cannot be forged at all.
- The client can run the full simulation locally, so the game is instant and works offline. The
  connection layer queues writes and replays them with their original idempotency keys.
- A patient attacker who stays inside every bound gains a bounded, modest advantage. Accepted: there
  is no leaderboard, no trading between players and no real-money purchase.
- **This decision expires the moment any of those exist.** Adding a leaderboard, player-to-player
  trading, or purchases makes Grade 2 insufficient, and the save must move to server-side
  re-simulation. That will be a new ADR.
- Every money-moving route needs an idempotency key, because a mobile client cannot distinguish a
  failed request from a lost response, and the difference is a duplicate payout.
- Save writes need optimistic concurrency, or two devices silently overwrite each other.

## Alternatives considered

- **Full server-side re-simulation.** Strongest, and disproportionate for the threat. Reconsider when
  the threat changes.
- **Client-authoritative saves with a signature.** A signature proves the save was not modified in
  transit and proves nothing about a modified client that produced it.
- **Server-side simulation of the whole session in real time.** Would break offline play entirely for
  a single-player game.
