# Onboarding

The first session, from launch until the player is running the core loop under their own steam.

## Audit of what was there before

Nothing. Before this work the game dropped a new player onto a farm with a HUD showing four numbers,
no prompts, no goal, and no way to sell anything or spend money. Measured from the code:

| Moment | Before | Now |
| --- | --- | --- |
| Time to first input possible | ~3 s (after load) | ~3 s |
| First guidance | never | ~3 s |
| First meaningful action | undiscoverable — `E` was never mentioned | ~15 s |
| First success (a harvest) | reachable but unexplained | ~60–90 s |
| Entry to the repeatable loop | impossible — no way to sell | ~2–3 min |
| A stated goal | none | revealed at the reinvest beat |

## Principles applied

- **Player-controlled action inside 30–60 s.** Beat 1 is "walk to the beds"; beat 2 is planting.
  Nothing is watched, and there is no cutscene.
- **Taught by doing.** Every beat completes when the player performs the *real* command in the *real*
  game. There is no tutorial level and no sandbox.
- **One concept at a time**, then combined: move → plant → tend → harvest → sell → reinvest.
- **Never punished for the untaught.** Farm events have a 90-second grace period, so the first
  setback cannot land before the player has planted and harvested.
- **Two short lines maximum**, contextual and non-blocking. Enforced by a unit test on the beat table
  (title ≤ 34 chars, body ≤ 110).
- **An early genuine win.** The first harvest gives particles, a sound, a HUD change and goods.
- **Progressive disclosure.** HUD elements appear as they become meaningful.
- **No gating.** No sign-in, no permissions, no store, no cookie wall. The backend is optional.

## Beat-by-beat

| # | Beat | Copy | Completes when | Reveals |
| --- | --- | --- | --- | --- |
| 1 | `move` | "Walk to the soil plots — Use W, A, S and D to walk over to one of the brown plots of land." | Player has moved and is in reach of a bed | — |
| 2 | `plant` | "Put something in the ground — When Plant Wheat appears, press E to sow your first crop." | Any plot planted | money, seed |
| 3 | `tend` | "Look after it — Press E on the planted plot again to water it." | Any plot tended | — |
| 4 | `harvest` | "Watch it ripen — Your first watered crop ripens quickly. When it turns gold or orange, press E to harvest it." | Any crop harvested | ready, storage |
| 5 | `sell` | "Turn crops into money — Press M or click Market, then choose Sell all beside the crop you harvested." | Any sale made | — |
| 6 | `reinvest` | "Spend it on the farm — Press B or click Build, then buy a hen or place a building on open ground." | Any building placed or hen bought | objective |
| 7 | `goal` | "The field next door — Keep growing and selling. At $150, press B or click Build to buy the neighbouring parcel." | Immediately; it is a hand-off | objective |
| ∗ | `setback` | "Something is coming — Pay to prevent it, or take the hit." | Warning resolves | warning |

`setback` is **deferred**, not sequential. It waits for a real weather warning and fires just-in-time
— including after onboarding has otherwise finished. Showing it on a schedule would mean teaching a
response to something that is not happening; dropping it would mean never teaching the countermeasure
at all. See ADR 0013.

## The first 60 seconds

| Time | Player sees | Player does | Feedback |
| --- | --- | --- | --- |
| 0–3 s | Menu, music playing | Clicks **Work the farm** | `ui.confirm`, loading bar with real progress |
| 3–6 s | Farm, farmer, six bare beds. Coach: *"Walk to the soil plots"* | Presses W/A/S/D and walks onto a brown plot | Footsteps, dust, gait animation, camera follows |
| 6–15 s | Coach: *"Put something in the ground"*, `E` key cap. Money appears in the HUD | Walks to a bed, presses `E` | Crouch/press animation, seed particles, `farm.plant`, a sprout pops in |
| 15–25 s | Coach: *"Look after it"* | Presses `E` again | Pour gesture, water droplets, `farm.tend` |
| 25–32 s | Coach: *"Watch it ripen"*. Ready/storage appear | Watches the first watered crop move through its remaining stages | The onboarding crop uses the real growth rule on an approximately three-simulation-second accelerated timeline |
| 32–40 s | First crop turns gold or orange | Presses `E` | Pull/recoil, gold burst, `farm.harvest`, goods in storage |
| 40–60 s | Coach names the exact Market and Build actions | Presses `M` or clicks **Market**, chooses **Sell all**, then presses `B` or clicks **Build** | Money updates; an affordable purchase or placed building advances the tutorial immediately |

Only the first crop watered while the `tend` beat is active receives the approximately
three-simulation-second onboarding boost.
Every later crop keeps its normal economic timing. If the crop is somehow still not ready after eight
seconds, the hint points directly at the gold/orange colour and the Harvest prompt.

## The first ten minutes

| Phase | Roughly | What happens |
| --- | --- | --- |
| Learn | 0–2 min | Beats 1–4. First harvest. |
| Earn | 2–3 min | Beat 5. Market opens; spot vs contract is presented with the premium shown. |
| Choose | 3–4 min | Beat 6. Five reinvestment options and the goal, all priced, all visible. |
| Run | 4–10 min | Free loop. First weather warning fires; `setback` beat appears just-in-time. |
| Resolve | 6–17 min | Parcel bought, or the run ends broke. Depends heavily on crop choice. |

## Mechanic-teaching table

| Mechanic | Prerequisite | Taught by | Safe practice | Reinforcement | Mastery signal | Fallback hint |
| --- | --- | --- | --- | --- | --- | --- |
| Movement | none | Coach + key caps | Empty farm, no threats | Every subsequent beat | Reaches a bed | "Use W, A, S and D to walk." |
| Planting | movement | Coach + proximity prompt | 6 beds, 90 s grace before events | Repeated each cycle | Any plot planted | "Press E while standing on a bed. Q swaps seed." |
| Tending | planting | Coach; same key, new context | Cannot fail; tending only helps | Yield visibly higher | tendCount > 0 | "Press E on the same bed again." |
| Growth stages | planting | The art itself — a hue journey to gold; the first watered crop demonstrates it in about three simulation seconds | Watching costs nothing | Every crop, forever | Harvests at stage 4 | "When the prompt says Harvest, press E." |
| Harvesting | growth | Coach + gold colour | No penalty for early attempts | Every cycle | Goods in storage | — |
| Selling | harvest | Coach + `M` / Market shortcut | Panel is non-blocking; nothing is forced | Every cycle | A sale | "Press M or click Market. Contracts pay more than spot." |
| Contracts vs spot | selling | Premium shown as a % next to each | Spot is always available as the safe option | Every market visit | Fulfils a contract | — |
| Reinvestment | a sale | Coach + `B` / Build shortcut; all options priced | Nothing is irreversible except spending | Every surplus | A purchase | "Press B or click Build. A barn holds more; irrigation loses less." |
| Building placement | reinvestment | Ghost preview, green/red | Esc cancels, no cost until confirmed | Each build | A placed building | Banner: "click to build, Esc to cancel" |
| Warned events | — | Deferred beat at the first warning | 90 s grace; warning gives a countdown | Every event | Presses F, or accepts the hit | "Press F to prevent. Doing nothing is also valid." |
| The goal | a sale | Objective meter + the panel's last row | Purely additive | Meter fills constantly | Buys the parcel | Meter shows % saved |

## Rules the implementation enforces

**Prompts.** One `CoachMark` instance exists, so prompts cannot stack. Showing a new beat replaces
the old one. A hint *replaces the body of its own beat* rather than adding a second prompt. Nothing
is auto-focused, so a player mid-keypress is never interrupted. `role="status"` + `aria-live="polite"`
lets a screen reader finish its sentence rather than interrupt.

**Progressive disclosure.** The HUD bar hides itself entirely when nothing is revealed. Features
unlock at the beat that makes them meaningful; finishing or skipping onboarding reveals everything.

**Skip.** Always available, always in the same place in the coach mark. Skipping reveals the full HUD
and writes `farmrise:onboarded`, so a returning player is never taught again on that browser.

**Adaptive shortening.** A beat whose action the player already performed is skipped and reported as
`mastery`. Someone who plants before being told never sees the planting beat. Replaying after a
finished run skips onboarding entirely.

**Interface input isolation.** Market, Build & Reinvest and Account panels capture the full pointer surface,
and plot interaction plus movement are suppressed while a gameplay panel or placement cursor is open.
The farm simulation still advances behind Market and Build & Reinvest. `Esc` closes the active panel or
cancels placement before it is allowed to pause the game.

**Menu shortcuts.** During active play, the bottom-right Market and Build buttons pair Blender-rendered
icons with their `M` and `B` keys. Clicking the icon or pressing the shown letter opens the same panel.
The dock hides while a panel or exclusive screen is open, so menu controls are never duplicated.

**Checkpointing.** Saves are server-side with optimistic concurrency where a backend is present. In
the offline slice a run is in-memory only — **a reload loses the run**, which is the largest
onboarding risk in the build and is listed below.

**Accessibility.** Keyboard-only throughout. `prefers-reduced-motion` disables panel, coach and meter
animation. The palette passes a WCAG contrast audit for every gameplay-critical pair, so growth
stages remain distinguishable with any form of colour blindness. Prompts are ≤ 2 lines at 13 px with
a 44 px minimum touch target on controls.

## Analytics funnel

```
session_start
  → scene_ready              (loadMs, artLoaded)
  → onboarding_start
  → onboarding_beat_start    ×N   (beat, index)
  → onboarding_hint_shown    ×N   (beat, attempt)
  → onboarding_beat_complete ×N   (durationMs, hintsShown)
  → first_input / first_meaningful_action / first_feedback / first_success   (once each)
  → onboarding_skipped       (reason: player | mastery)
  → onboarding_complete      (durationMs, beatsShown, hintsShown)
  → cycle_completed          ×N   ← the core playtest question lives here
  → run_completed            (outcome, cycles, balances, events)
```

Drop-off is any `onboarding_beat_start` with no matching `onboarding_beat_complete`. Friction is
`onboarding_hint_shown` and `action_refused`. Every `first_*` metric fires at most once, enforced by
`trackOnce` and a test — otherwise a median "time to first success" would be recomputed on every
later success and become meaningless.

## Risk flags

| Risk | Likelihood | Mitigation | Status |
| --- | --- | --- | --- |
| **A reload loses the run.** No local checkpoint in the offline slice. | High | Server saves when signed in | **Open — the biggest onboarding risk** |
| The player never meets a warned event before winning | Medium | Deferred beat fires whenever it happens | Partly mitigated; event cadence may need tuning |
| The normal 90 s wheat timer stalls the tutorial before harvesting | Medium | The first watered onboarding crop visibly ripens in about three simulation seconds; regular crop timing is unchanged | Mitigated, browser-tested |
| Storage overflow surprises a pumpkin-heavy player | Medium | Toast + `ui.deny`; barn is the first build option | Partly mitigated |
| Market panel does not pause, so a player can be raided while reading | Low | Deliberate; it captures gameplay input while the simulation and warning bus continue | Accepted |
| Keyboard-only excludes touch entirely | Certain on mobile | None | **Open** |
| `localStorage` unavailable in private mode → tutorial repeats | Low | Fails soft; only cost is seeing it again | Accepted |

## Verification

| Path | Covered by |
| --- | --- |
| Brand-new player, full sequence | `onboarding.test.ts` — "walks the whole sequence in order" |
| Experienced player skipping early | "can skip the whole tutorial at any point" |
| Player who acts before being told | "skips beats for things they already did" |
| Returning player | "is not taught at all when constructed with skip" |
| Ignored hints / slow completion | "escalates once when a beat stalls, and only once" |
| Out-of-sequence exploration | Adaptive skip tests |
| Deferred setback, before and after completion | "fires just-in-time when a warning finally appears" |
| Progressive reveal | "reveals HUD features progressively rather than all at once" |
| Prompts never stack, non-blocking | `slice.spec.ts` — "prompts never stack", "never blocks the game behind it" |
| Matching pointer and keyboard menu paths | `slice.spec.ts` — Market click / M, Build click / B, Esc |
| Copy budget | "stays within the prompt length budget" |

The Playwright suite is executed in desktop Chromium, mobile Chromium, Firefox and WebKit. The
onboarding path, accelerated first crop, selling, Build & Reinvest, input isolation and the matching
pointer/keyboard menu shortcuts are also exercised through the live in-app browser.

## Extending it

1. Add a beat to `game/onboarding/beats.ts`. Keep the copy budget; the test enforces it.
2. If it teaches a HUD element, add the feature to `HudFeature` and list it in `reveals`.
3. If it responds to a world event rather than a sequence position, give it `waitsFor` and it will be
   deferred and fired just-in-time.
4. If a player might already have done it, give it `alreadySatisfied`.
5. Add the funnel assertions to `onboarding.test.ts`.
6. `npm run verify`.

Do **not** add a beat that teaches something the player cannot immediately do, and do not add a
second prompt surface — `CoachMark` is deliberately a singleton.
