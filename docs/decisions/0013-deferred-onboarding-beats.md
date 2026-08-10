# 0013. Onboarding beats that wait for the world

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The onboarding sequence teaches by doing: each beat completes when the player performs the real
command. That works for every mechanic the player initiates — move, plant, tend, harvest, sell,
reinvest.

It does not work for the signature mechanic. A **warned farm event** is initiated by the world, on a
90-second grace period and then a randomised ~150-second interval. A linear tutorial has no way to
schedule it, and the countermeasure (`F`) is meaningless when nothing is threatening the farm.

Three options: teach prevention with a fake event, teach it as text before it happens, or wait.

## Decision

Beats may declare `waitsFor(context)`. Such a beat is **deferred** rather than shown in sequence: the
director sets it aside, continues, and fires it just-in-time when its trigger becomes true — including
after onboarding has otherwise completed.

`OnboardingDirector.hasDeferredBeats` reports whether any are still pending, and completing a
deferred beat does not reopen the sequence.

## Consequences

- The countermeasure is taught at the only moment it can be understood: while a countdown is on
  screen and the player's crops are actually at risk.
- Onboarding is never blocked by weather. A player who wins before any event ever fires completes the
  tutorial normally and simply never sees that beat.
- The prompt can appear well after the player considers themselves done with the tutorial. That is
  intentional, and it is why the beat is written to stand alone rather than referring back to earlier
  steps.
- The director gained a second scheduling path, which is genuine added complexity. It is contained:
  one array, one lookup in `update()`, and it cannot interleave with the main sequence because a
  deferred beat is only shown when no beat is current.
- A test asserts both halves — that the beat does *not* appear on a clear day, and that it *does*
  appear later.

## Alternatives considered

- **Fire a scripted event during the tutorial.** Teaches the mechanic reliably, and it makes the
  first setback a fake one. The design pillar is "Recoverable Disruption" built on *warned, real*
  events, and a scripted drought that always happens at 90 seconds trains players to expect a
  scripted drought.
- **Explain prevention in text up front.** Cheapest, and it violates the teach-by-doing rule and asks
  the player to remember a key for a situation that does not exist yet.
- **Drop the beat and let players discover `F`.** They would not. The key is only useful during a
  short window, and nothing else in the game uses it.
