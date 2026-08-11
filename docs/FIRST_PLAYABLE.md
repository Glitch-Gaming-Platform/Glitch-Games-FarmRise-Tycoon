# The first playable slice

The smallest polished build that proves the mechanics, assets, feedback and complete core loop work
together. It is deliberately **not** the whole game.

> This is the acceptance record for the original slice. The current career build deliberately
> extends several exclusions below with parcels, seasons, cows, processing, workers, buyers and
> town progression. Current scope and deferred systems are tracked in
> [PROGRESSION_GAMEPLAY_PLAN.md](PROGRESSION_GAMEPLAY_PLAN.md).

## What the slice proves

| Requirement | How it is met |
| --- | --- |
| Core fantasy | You walk your own farm, work it by hand, sell what you grow and decide what to do with the money. |
| Core verbs | Plant and tend → harvest → build and upgrade → trade and expand. All four are playable. |
| Approved mechanics working together | Timed crop plots, active farm work, animal production, dynamic market orders, functional infrastructure and warned farm events all run in one session. |
| Signature mechanic | **Warned farm events.** A drought or fox raid is announced with a countdown, and `F` spends money to prevent it. Doing nothing is a legitimate choice. |
| Moment-to-moment loop | Read conditions → choose output → commit → work → respond to trouble → harvest and trade → reinvest. All seven steps are reachable. |
| One meaningful trade-off | **Spot price now, or a contract that pays 15–45% more but commits you to a quantity and a deadline.** The market panel shows the premium as a percentage so the choice is legible. |
| Success state | Buy the neighbouring parcel for $75. Ends the season with a summary. |
| Failure state | Bankruptcy — no seed money, nothing in store, nothing growing, nothing under construction. All four at once. |
| Controls, camera, UI, feedback, audio | Desktop keyboard + pointer and a capability-gated mobile joystick/actions path, 13.25 m / 34° / 42° FOV / -42° azimuth follow camera, HUD with progressive disclosure, coach marks, 23 sound effects and five music tracks. |
| Approved assets | All 52 authored world meshes, the animation layer, and the generated audio set. |
| Persistence | Server-authoritative saves and trades where a backend is present; fully playable offline with local contracts. |
| Analytics | 29 typed events covering the funnel, the loop and the outcome. |

## The playable path

```
Menu → Play
  ↓
Loading (art + audio)
  ↓
ONBOARDING — each beat is completed by doing the real thing
  move → plant → tend → harvest → haul → sell → reinvest → eggs → expand → setback → goal
  (the first watered crop ripens over about three simulation seconds; later crops use normal timing)
  (the egg step uses a collectible basket at the shelter)
  (egg collection unlocks the $20 three-bed Starter Extension)
  (buying that extension schedules one real minor fox warning before random incidents begin)
  ↓
FREE LOOP  ─────────────────────────────────────────────┐
  read the HUD and the market                           │
  choose a crop (Q), plant (E), tend (E)                │
  respond to a warned event (F to prevent)              │
  harvest and carry home (E; R is a transfer shortcut)  │
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
| `E` / left click | Perform the action named by the context prompt: plant, tend, harvest, transfer, collect, repair or respond; confirm a building placement |
| `Q` | Cycle seed; shown beside `E` while standing on an empty bed |
| `R` | Pick up or deposit goods at the current stack/store |
| `M` / Market icon | Market |
| `B` / Build icon | Build & Reinvest — roads, barns, irrigation, fences, chickens and land |
| `F` | Pay to prevent the warned event |
| `Esc` | Close a panel, cancel a placement, or pause |
| `` ` `` | Debug overlay (also `?debug=overlay`) |

Touch-primary mobile devices replace movement keys with an analog joystick. **Work** performs the
same plot action as `E`, **Seed** cycles crop, **Protect** maps to prevention, and Market/Build retain
their illustrated buttons. Placement is a canvas tap with an explicit **Cancel** action. Desktop
keeps the table above unchanged.

## What was deliberately excluded from the original slice

Per the original stop conditions, none of the following was required to accept that slice:

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
| Build placement | `game/systems/PlacementController.ts` | A mouse/touch pointer cursor, separate from plot interaction |
| Mobile controls | `ui/hud/TouchControls.ts` | Semantic joystick/actions; no synthetic keyboard events |
| Mobile lifecycle | `bootstrap/bindMobileLifecycle.ts` | Stops hidden work, releases input and suspends audio |
| Onboarding | `game/onboarding/` | Beat table + director, no DOM or audio |
| Offline market | `game/career/ContractBoard.ts` | Seeded local offers; account saves are transition-validated by the server |
| Panels, coach marks, outcome | `ui/panels/`, `ui/onboarding/`, `ui/outcome/` | Panels float and capture gameplay input; screens are exclusive |
| Analytics | `analytics/` + `bootstrap/bindAnalytics.ts` | A sink. Gameplay contains zero analytics calls |
| Audio, HUD, session wiring | `bootstrap/bind*.ts` | The deliberate meeting points |

**New architectural boundary:** `analytics/` may not be imported by `game/`, `ui/`, `net/` or
`assets/`, and `game/` may not import `analytics/`. Enforced in `eslint.config.js`.

## Economy, and how the goal was priced

Six plots, measured per production cycle:

| Crop | Cycle | Profit per cycle (6 plots) |
| --- | ---: | ---: |
| Wheat | 90 s | +$16.20 |
| Corn | 180 s | +$45.60 |
| Pumpkin | 330 s | +$136.08 |

Starting balance is $50. The required land path is the $20 Starter Extension followed by the $75
North Field, so land costs $95 in total and the farm must earn at least $45 before optional spending.
Whole production cycles from the table above give the practical lower bound:

| Strategy | Cycles needed | Wall clock |
| --- | ---: | ---: |
| Wheat only | 3 | ~4.5 min |
| Corn only | 1 | ~3 min |
| Pumpkin only | 1 | ~5.5 min |

These are fresh, fully tended premium returns. Crop rarity targets **3× common, 5× uncommon, 7×
rare and 10× exotic** gross return on seed cost. Every higher return tier also takes longer than
the tier below it. Poor water, missed tending, disease, spoilage and leaving a ripe crop standing
reduce the realized price; the headline multiplier is never guaranteed after neglect or delay.

So **roughly 3–6 minutes of growing time** depending on strategy, before walking, selling or reacting.
The $20 strip keeps the first expansion inside onboarding, while the $75 North Field remains the
first real savings goal. `ESTATE_PARCELS` is the shared price table; re-derive both entries whenever
crop economics change.

## Tests and measurements

`npm run verify` — **401 tests, all passing.** Lint, typecheck, format and all builds clean.

| Suite | Covers |
| --- | --- |
| `packages/shared/tests/outcome.test.ts` | Bankruptcy requires all four dead ends; success beats bankruptcy when both apply; land purchase arithmetic |
| `apps/game/tests/integration/sessionLoop.test.ts` | The whole loop headless: plant → harvest → sell, contract vs spot, reinvestment, both end states, prevention through the real director, panel/placement exclusivity |
| `apps/game/tests/unit/onboarding.test.ts` | Beat order, copy budget, progressive reveal, hint escalation, adaptive skip, player skip, deferred setback beat |
| `apps/game/tests/unit/analyticsFunnel.test.ts` | Ordering, once-only metrics, buffer overflow policy, sink isolation, no PII, local contract generation |
| `tests/e2e/slice.spec.ts` | Desktop first-session specs: coach marks, accelerated crop growth, selling, build placement, panel isolation, matching click/key menu shortcuts and prompt exclusivity |
| `tests/e2e/mobile.spec.ts` | Mobile render budget, joystick hold, Work state change, both viewport orientations and touch placement |

The complete serialized Playwright matrix passes 80 checks with 14 platform-inapplicable skips
across Chromium, Firefox, WebKit, mobile Chrome and mobile WebKit. The
physical iPhone production starter view now measures 91 draw calls and 222,856 rendered triangles
at 60 FPS in the expanded progression build; this is one-device evidence rather than a universal
performance guarantee.

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
2. **Storage pressure may be invisible.** Base storage is 60 units; a pumpkin-heavy player can
   overflow and lose produce before understanding why. The toast explains it; nothing else does.
3. **Local contracts are not the server's contracts.** Offline play generates its own. Behaviour is
   equivalent, but a signed-in session and an anonymous one see different markets.
4. **Mobile breadth is not yet proven.** The touch path is playable and was exercised on one iPhone,
   but an older iPhone, iPad, Android hardware, physical landscape rotation, background recovery and
   a long thermal soak remain untested. See [MOBILE.md](MOBILE.md).
5. **The market panel does not pause the world.** Deliberate, but it means a player reading contracts
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
npm run verify         # format, lint, typecheck, 401 tests, all builds
npx playwright install && npm run test:e2e   # production bundle in desktop and mobile browser projects
```

To replay onboarding, clear `farmrise:onboarded` from localStorage or use a private window.

## What the next playtest must answer

Ordered by how much they would change the design:

1. **The core playtest question.** After the first sale, how many more cycles does a player start
   *voluntarily*? Fewer than two means the loop does not yet earn its own repetition.
2. **Did the signature mechanic create a decision?** Every new player receives one taught warning;
   what fraction press `F`, and what fraction deliberately accept the hit? Later warning frequency
   still needs tuning against session length.
3. **Is the trade-off real?** What is the split between `goods_sold` with `viaContract: true` and
   `false`? If nearly everyone sells at spot, the contract premium is too small or the deadline is
   too frightening.
4. **Where does onboarding lose people?** Which `onboarding_beat_start` has no matching
   `onboarding_beat_complete`? Which beats need hints most often?
5. **Is the goal legible?** Do players who reach $75 buy the parcel promptly, or sit on the money
   without realising they have won?
6. **Does the reinvestment choice feel like a choice?** What is the distribution across barn,
   irrigation, road, fence and hen? A single dominant pick means three of the five are decoration.
7. **How long does a run actually take**, and does it match the 3–6 minute growing-time estimate? That estimate
   counts growing time only — it assumes zero time spent walking, reading the market or deciding.
