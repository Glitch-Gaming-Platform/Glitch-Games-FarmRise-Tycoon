# The first playable slice

The smallest polished build that proves the mechanics, assets, feedback and complete core loop work
together. It is deliberately **not** the whole game.

## What the slice proves

| Requirement | How it is met |
| --- | --- |
| Core fantasy | You walk your own farm, work it by hand, sell what you grow and decide what to do with the money. |
| Core verbs | Plant and tend → harvest → build and upgrade → trade and expand. All four are playable. |
| Approved mechanics working together | Timed crop plots, active farm work, animal production, dynamic market orders, functional infrastructure and warned farm events all run in one session. |
| Signature mechanic | **Warned farm events.** A drought or fox raid is announced with a countdown, and `F` spends money to prevent it. Doing nothing is a legitimate choice. |
| Moment-to-moment loop | Read conditions → choose output → commit → work → respond to trouble → harvest and trade → reinvest. All seven steps are reachable. |
| One meaningful trade-off | **Spot price now, or a contract that pays 15–45% more but commits you to a quantity and a deadline.** The market panel shows the premium as a percentage so the choice is legible. |
| Success state | Buy the neighbouring parcel for $150. Ends the season with a summary. |
| Failure state | Bankruptcy — no seed money, nothing in store, nothing growing, nothing under construction. All four at once. |
| Controls, camera, UI, feedback, audio | Keyboard + pointer, 38° follow camera, HUD with progressive disclosure, coach marks, 23 sound effects and five music tracks. |
| Approved assets | All 24 authored meshes, the animation layer, and the generated audio set. |
| Persistence | Server-authoritative saves and trades where a backend is present; fully playable offline with local contracts. |
| Analytics | 29 typed events covering the funnel, the loop and the outcome. |

## The playable path

```
Menu → Play
  ↓
Loading (art + audio)
  ↓
ONBOARDING — 7 beats, each completed by doing the real thing
  move → plant → tend → harvest → sell → reinvest → goal
  (the first watered crop ripens over about three simulation seconds; later crops use normal timing)
  (+ "setback" fires just-in-time on the first weather warning, whenever that is)
  ↓
FREE LOOP  ─────────────────────────────────────────────┐
  read the HUD and the market                           │
  choose a crop (Q), plant (E), tend (E)                │
  respond to a warned event (F to prevent)              │
  harvest (E)                                           │
  sell at spot or fulfil a contract (M)                 │
  reinvest: barn / irrigation / road / fence / hen (B)  │
  save toward the parcel ────────────────────────────────┘
  ↓
OUTCOME
  expanded  → "The parcel is yours" + run summary
  bankrupt  → "The season got away from you" + run summary
  ↓
Run another season (skips onboarding) or back to menu
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Walk |
| `Shift` | Sprint |
| `E` / left click | Plant, tend or harvest the bed in reach; confirm a building placement |
| `Q` | Cycle seed |
| `M` / Market icon | Market |
| `B` / Build icon | Build & Reinvest — roads, barns, irrigation, fences, chickens and land |
| `F` | Pay to prevent the warned event |
| `Esc` | Close a panel, cancel a placement, or pause |
| `` ` `` | Debug overlay (also `?debug=overlay`) |

## What was deliberately excluded

Per the stop conditions, none of the following is in the slice:

- **Content breadth.** Three crops, one animal, four structures, one buyer, two events — exactly the
  scope rule from the design blueprint. No new crops were added to make the loop feel fuller.
- **Metaprogression, cosmetics, unlocks, achievements.** A run is self-contained.
- **World size.** One 16×16 farm and one purchasable parcel. No second biome, no map.
- **Secondary systems.** No processing chains, no NPC relationships, no quests, no day/night cycle,
  no seasons, no weather beyond the two authored events.
- **Multiple buyers or a price market.** One buyer, fixed spot prices. Dynamic pricing is a system to
  test after the loop is proven, not before.
- **Account gating.** No sign-in is required to play. The backend is optional.
- **Animal breadth.** One hen. No cows, no products beyond eggs.

## Architecture

Everything uses existing patterns; nothing here is a temporary scaffold.

| Concern | Owner | Notes |
| --- | --- | --- |
| Run rules (win, loss, land price) | `packages/shared/src/rules/outcome.ts` | Shared so the server reaches the same verdict |
| Session orchestration | `game/systems/SessionController.ts` | Onboarding, panels, placement, prevention, outcome |
| Build placement | `game/systems/PlacementController.ts` | A pointer cursor, separate from plot interaction |
| Onboarding | `game/onboarding/` | Beat table + director, no DOM or audio |
| Offline market | `game/world/localContracts.ts` | Replaced wholesale by server orders when signed in |
| Panels, coach marks, outcome | `ui/panels/`, `ui/onboarding/`, `ui/outcome/` | Panels float and capture gameplay input; screens are exclusive |
| Analytics | `analytics/` + `bootstrap/bindAnalytics.ts` | A sink. Gameplay contains zero analytics calls |
| Audio, HUD, session wiring | `bootstrap/bind*.ts` | The deliberate meeting points |

**New architectural boundary:** `analytics/` may not be imported by `game/`, `ui/`, `net/` or
`assets/`, and `game/` may not import `analytics/`. Enforced in `eslint.config.js`.

## Economy, and how the goal was priced

Six plots, measured per production cycle:

| Crop | Cycle | Profit per cycle (6 plots) |
| --- | ---: | ---: |
| Wheat | 90 s | +$9.00 |
| Corn | 180 s | +$26.40 |
| Pumpkin | 330 s | +$87.60 |

Starting balance is $50, the parcel costs $150, so a run needs +$100. Computed from the table above:

| Strategy | Cycles needed | Wall clock |
| --- | ---: | ---: |
| Wheat only | 11.1 | ~16.7 min |
| Corn only | 3.8 | ~11.4 min |
| Pumpkin only | 1.1 | ~6.3 min |

So **roughly 6–17 minutes** depending on strategy, before any time spent walking, selling or
reacting. An earlier $250 price took a wheat-only player over half an hour while a pumpkin player
finished in two cycles — punishing the safe, beginner-friendly crop, which is backwards.
`LAND_PARCEL_COST` is the single number that sets session length; re-derive it whenever crop
economics change.

## Tests and measurements

`npm run verify` — **371 tests, all passing.** Lint, typecheck, format and both builds clean.

| Suite | Covers |
| --- | --- |
| `packages/shared/tests/outcome.test.ts` | Bankruptcy requires all four dead ends; success beats bankruptcy when both apply; land purchase arithmetic |
| `apps/game/tests/integration/sessionLoop.test.ts` | The whole loop headless: plant → harvest → sell, contract vs spot, reinvestment, both end states, prevention through the real director, panel/placement exclusivity |
| `apps/game/tests/unit/onboarding.test.ts` | Beat order, copy budget, progressive reveal, hint escalation, adaptive skip, player skip, deferred setback beat |
| `apps/game/tests/unit/analyticsFunnel.test.ts` | Ordering, once-only metrics, buffer overflow policy, sink isolation, no PII, local contract generation |
| `tests/e2e/slice.spec.ts` | First-session specs across four browser projects: coach marks, accelerated crop growth, selling, build placement, panel isolation, matching click/key menu shortcuts and prompt exclusivity |

The full Playwright suite passes in desktop Chromium, mobile Chromium, Firefox and WebKit. A live
in-app browser review also exercised onboarding, the Market click path, the `B` key path and panel
input isolation. The observed starter view measured 36 draw calls and 72,694 rendered triangles;
these are regression measurements on one machine rather than a universal performance guarantee.

## Analytics coverage

29 typed events in `analytics/events.ts`. The funnel that answers the core playtest question:

```
session_start → scene_ready → onboarding_start
  → first_input → first_meaningful_action → first_feedback
  → crop_planted → crop_harvested → first_success → goods_sold
  → onboarding_complete → cycle_completed (repeating) → run_completed
```

`cycle_completed` carries the cycle index and elapsed time, so **"how many production cycles does a
player voluntarily start after their first sale, and where do they stop?"** is a direct query.
Friction is covered by `action_refused`, `onboarding_hint_shown`, `storage_overflowed` and
`onboarding_skipped`.

No personal data is collected. There is a random anonymous id in localStorage to distinguish a
return visit from a new one, and a per-session id. Neither is derived from anything about the person,
and a test asserts no email, IP or credential shapes appear in any payload.

There is **no analytics vendor wired up.** A console sink runs in development and a memory sink in
tests; choosing a destination is a business decision and is one file's worth of work.

## Known risks

1. **Session length is unvalidated.** 6–17 minutes is derived from crop arithmetic alone — it
   excludes walking, selling and thinking — and nobody has been observed playing. A wheat-only
   beginner sits at the long end, which is the wrong way round for the beginner's crop.
2. **The setback beat may never fire.** Events start after a 90-second grace period and then average
   150 seconds apart. A fast player could buy the parcel having never seen the signature mechanic —
   which would mean the slice failed to test the thing it most needs to test.
3. **Storage pressure may be invisible.** Base storage is 60 units; a pumpkin-heavy player can
   overflow and lose produce before understanding why. The toast explains it; nothing else does.
4. **Local contracts are not the server's contracts.** Offline play generates its own. Behaviour is
   equivalent, but a signed-in session and an anonymous one see different markets.
5. **No pointer-only or touch path.** Every action needs a keyboard. The camera and UI are
   touch-legible but the game is not touch-playable.
6. **The market panel does not pause the world.** Deliberate, but it means a player reading contracts
   can be raided while they read.

## How to run it

```bash
npm install
npm run build --workspace @farmrise/shared
npm run dev            # Vite on :5173, Next.js on :3000
```

Open <http://localhost:5173> and press **Work the farm**. The backend is optional — the slice is
fully playable with `npm run dev:game` alone.

```bash
npm run verify         # format, lint, typecheck, 324 tests, both builds
npx playwright install && npm run test:e2e   # browser specs, never yet run here
```

To replay onboarding, clear `farmrise:onboarded` from localStorage or use a private window.

## What the next playtest must answer

Ordered by how much they would change the design:

1. **The core playtest question.** After the first sale, how many more cycles does a player start
   *voluntarily*? Fewer than two means the loop does not yet earn its own repetition.
2. **Did they meet the signature mechanic?** What fraction of runs include a `farm_event_warned`
   event, and of those, what fraction press `F`? If most players never see a setback, the event
   cadence is wrong for the session length.
3. **Is the trade-off real?** What is the split between `goods_sold` with `viaContract: true` and
   `false`? If nearly everyone sells at spot, the contract premium is too small or the deadline is
   too frightening.
4. **Where does onboarding lose people?** Which `onboarding_beat_start` has no matching
   `onboarding_beat_complete`? Which beats need hints most often?
5. **Is the goal legible?** Do players who reach $150 buy the parcel promptly, or sit on the money
   without realising they have won?
6. **Does the reinvestment choice feel like a choice?** What is the distribution across barn,
   irrigation, road, fence and hen? A single dominant pick means three of the five are decoration.
7. **How long does a run actually take**, and does it match the 6–17 minute estimate? That estimate
   counts growing time only — it assumes zero time spent walking, reading the market or deciding.
