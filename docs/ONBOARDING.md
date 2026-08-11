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
- **One concept at a time**, then combined: move → plant → tend → harvest → haul → sell → reinvest →
  collect eggs → buy the three-bed Starter Extension.
- **Never punished for the untaught.** Random incidents are paused during onboarding. After the
  egg lesson, one minor fox warning is scheduled so the response mechanic is taught against a real,
  actionable event before ordinary incident scheduling begins.
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
| 4 | `harvest` | "Watch it ripen — Your first watered crop ripens quickly. When it turns gold or orange, press E to harvest it." | Any crop harvested into the active carrier | ready |
| 5 | `haul` | "Carry it home — Carry the crop to the shelter. When Put down appears, press E to store it." | Any goods deposited into storage | storage |
| 6 | `sell` | "Turn crops into money — Press M or click Market, then choose Sell all beside the crop you stored." | Any sale made | — |
| 7 | `reinvest` | "Spend it on the farm — Press B or click Build, then buy a hen or place a building on open ground." | Any building placed or hen bought | objective |
| 8 | `eggs` | "Collect the eggs — This first clutch is fed. Hens need stored corn later. Walk to the basket and press E at Pick up Eggs." | Eggs picked up from the shelter stack | — |
| 9 | `expand` | "Open three more beds — Press B, then buy the $20 Starter Extension. Its gate opens three new crop beds nearby." | Starter Extension owned | objective |
| 10 | `setback` | "Something is coming — Pay to prevent it, or take the hit." | Warning resolves | warning |
| 11 | `goal` | "The North Field is next — Keep growing and selling. At $75, press B or click Build to buy the larger North Field." | Immediately; it is a hand-off | objective |

`eggs` pauses animal production until that lesson is current, then lets the starter hens finish the
clutch already near completion. That first clutch is treated as already fed so a resumed career,
an older save or an accidentally sold starter feed stack cannot deadlock onboarding. Every later
cycle consumes one stored corn per hen. Feed must be in collected storage: corn left in a field
pile or carried in the player's hands is not available to the hens. A camera-facing **Pick up Eggs ·
E / Work** badge sits over a reserved, walkable basket tile beside the shelter; buildings and crop
beds cannot cover it. The basket is not market inventory until the player physically collects it.
After collection, eggs appear immediately in Market whether they are still being carried or have
been deposited. Tutorial eggs cannot spoil away while onboarding is active.

The same rule applies to later livestock. Cows consume stored clover and leave collectible milk;
each livestock row states its feed amount, production time and output before purchase. A hunger
warning names the missing feed and the product that has stopped. Once the player collects the first
eggs, onboarding asks them to buy the $20 Starter Extension. Its three beds sit in the reserved strip
between the original six beds and North Field, so no existing structure can cover them. The Build
panel lists Starter Extension immediately above the locked North Field row. Once the extension is
owned, the session schedules a real minor fox warning and shows `setback`. The beat resolves against
that live incident; it is never resurrected after onboarding has completed or been skipped. See ADR
0013.

### Touch copy

Touch-primary devices use the same beat ids and completion predicates, but name the controls the
player can actually see: **joystick**, **Work**, **Market**, **Build** and **Protect**. The mobile
copy lives beside the desktop copy in `beats.ts`; it is not a second tutorial. **Work** is also the
context action for putting down a carried harvest at the shelter. Unit tests apply the same title,
sentence and length budgets to both variants.

## The first 75 seconds

| Time | Player sees | Player does | Feedback |
| --- | --- | --- | --- |
| 0–3 s | Menu, music playing | Clicks **Work the farm** | `ui.confirm`, loading bar with real progress |
| 3–6 s | Farm, farmer, six bare beds. Coach: *"Walk to the soil plots"* | Presses W/A/S/D and walks onto a brown plot | Footsteps, dust, gait animation, camera follows |
| 6–15 s | Coach: *"Put something in the ground"*, `E` key cap. Money appears in the HUD | Walks to a bed, presses `E` | Crouch/press animation, seed particles, `farm.plant`, a sprout pops in |
| 15–25 s | Coach: *"Look after it"* | Presses `E` again | Pour gesture, water droplets, `farm.tend` |
| 25–32 s | Coach: *"Watch it ripen"*. Ready appears | Watches the first watered crop move through its remaining stages | The onboarding crop uses the real growth rule on an approximately three-simulation-second accelerated timeline |
| 32–40 s | First crop turns gold or orange | Presses `E` | Pull/recoil, gold burst, `farm.harvest`, carrying meter appears |
| 40–55 s | Coach: *"Carry it home"* | Walks to the shelter and presses `E`/Work at **Put down** | Load leaves the carrier, storage increases, `goods_hauled` fires |
| 55–75 s | Coach names the exact Market and Build actions | Opens **Market**, chooses **Sell all**, then opens **Build** | Money updates; an affordable purchase or placed building advances the tutorial immediately |
| 60–90 s | A visible egg basket appears in front of the shelter | Walks to it and presses `E`/Work at **Pick up Eggs** | Basket empties into the active carrier; the egg beat completes |
| 75–100 s | Starter Extension appears above North Field in Build | Buys the $20 parcel | Gate opens; exactly three nearby crop beds appear |
| 90–120 s | A minor fox warning and countdown appear | Presses `F`/Protect or accepts the warned consequence | The real incident resolves, then the North Field goal hand-off completes onboarding |

Only the first crop watered while the `tend` beat is active receives the approximately
three-simulation-second onboarding boost.
Every later crop keeps its normal economic timing. If the crop is somehow still not ready after eight
seconds, the hint points directly at the gold/orange colour and the Harvest prompt.

## The first ten minutes

| Phase | Roughly | What happens |
| --- | --- | --- |
| Learn | 0–2 min | Beats 1–5. First harvest is physically carried home. |
| Earn | 2–3 min | Beat 6. Market opens; spot vs contract is presented with the premium shown. |
| Choose | 3–4 min | Beats 7–9. Buy livestock, collect eggs, then open the three-bed Starter Extension. |
| Run | 4–10 min | Free loop. Random incidents begin only after the taught fox warning is resolved. |
| Resolve | 3–6 min | Parcel bought, or the run ends broke. Depends on crop choice and travel time. |

## Mechanic-teaching table

| Mechanic | Prerequisite | Taught by | Safe practice | Reinforcement | Mastery signal | Fallback hint |
| --- | --- | --- | --- | --- | --- | --- |
| Movement | none | Coach + key caps or joystick label | Empty farm, no threats | Every subsequent beat | Reaches a bed | Desktop names WASD; mobile names the joystick. |
| Planting | movement | Coach + proximity prompt | 6 beds, 90 s grace before events | Repeated each cycle | Any plot planted | Desktop: `E`; mobile: **Work**. Seed changes crop. |
| Tending | planting | Coach; same contextual action | Cannot fail; tending only helps | Yield visibly higher | tendCount > 0 | Use `E` or **Work** on the same bed again. |
| Watering | first planted bed | Proximity water bar with a countdown, plus the Tend prompt | Bars only show within reach; irrigation reads as "handled" | Every unirrigated bed | Water restored by tending | The bar says "dry in 40s" before it says "thirsty". |
| Growth stages | planting | The art itself — a hue journey to gold; the first watered crop demonstrates it in about three simulation seconds | Watching costs nothing | Every crop, forever | Harvests at stage 4 | "When the prompt says Harvest, press E." |
| Harvesting | growth | Coach + gold colour | No penalty for early attempts | Every cycle | Goods in the active carrier | — |
| Hauling | harvest | Coach + carrying meter + contextual **Put down** prompt | Starter shelter is close; overflow stays carried | Every distant field and processor | Goods deposited | Desktop uses `E` (`R` is a shortcut); mobile uses **Work**. |
| Selling | hauling | Coach + `M` / Market shortcut | Panel is non-blocking; nothing is forced | Every cycle | A sale | "Press M or click Market. Contracts pay more than spot." |
| Contracts vs spot | selling | Premium shown as a % next to each | Spot is always available as the safe option | Every market visit | Fulfils a contract | — |
| Reinvestment | a sale | Coach + `B` / Build shortcut; all options priced | Nothing is irreversible except spending | Every surplus | A purchase | "Press B or click Build. A barn holds more; irrigation loses less." |
| Egg collection | starter hens finish a cycle | Visible basket + contextual **Pick up Eggs** prompt | The first clutch is already fed; later cycles require stored corn | Every later animal cycle | Eggs enter the active carrier | Walk in front of the shelter and use `E`/Work. |
| Starter expansion | egg collection | Build panel shows Starter Extension above North Field | Costs $20 and adds exactly three nearby beds | North Field remains visible as the next $75 goal | Starter Extension owned | Open Build and choose Starter Extension. |
| Building placement | reinvestment | Ghost preview, green/red | Esc or **Cancel** exits; no cost until confirmed | Each build | A placed building | Desktop says click/Esc; mobile says tap/Cancel. |
| Warned events | starter expansion | A deterministic minor fox warning with a real countdown | Random incidents stay paused until the lesson resolves | Every later event | Uses `F`/Protect, or accepts the hit | Doing nothing remains valid. |
| The goal | starter expansion | Objective meter + the North Field row | Purely additive | Meter fills constantly | Buys North Field | Meter shows % saved |

## Rules the implementation enforces

**Prompts.** One `CoachMark` instance exists, so prompts cannot stack. Showing a new beat replaces
the old one. A hint *replaces the body of its own beat* rather than adding a second prompt. Nothing
is auto-focused, so a player mid-keypress is never interrupted. `role="status"` + `aria-live="polite"`
lets a screen reader finish its sentence rather than interrupt.

**Progressive disclosure.** The HUD bar hides itself entirely when nothing is revealed. Features
unlock at the beat that makes them meaningful; finishing or skipping onboarding reveals everything.

**Skip.** Always available, always in the same place in the coach mark. Skipping reveals the full HUD,
writes `farmrise:onboarded`, and sets `onboardingCompleted` in the career save. The career field is
what prevents the tutorial returning on another device through Glitch Cloud; local storage remains a
fast same-browser hint.

**Adaptive shortening.** A beat whose action the player already performed is skipped and reported as
`mastery`. Someone who plants before being told never sees the planting beat. Replaying after a
finished run skips onboarding entirely.

**Interface input isolation.** Market, Build & Reinvest and Account panels capture the full pointer surface,
and plot interaction plus movement are suppressed while a gameplay panel or placement cursor is open.
The farm simulation still advances behind Market and Build & Reinvest. `Esc` closes the active panel or
cancels placement before it is allowed to pause the game.

**Menu shortcuts.** During desktop play, the bottom-right Market, Build, Office and Town buttons pair
Blender-rendered icons with their `M`, `B`, `C` and `T` keys. Touch-primary play moves the same dock
into a two-by-two upper-left group. Clicking an icon or pressing the shown letter opens the same
panel. The dock hides while a panel or exclusive screen is open, so menu controls are never
duplicated.

**Checkpointing.** Career save v2 is local-first and hydrated back into the active scene. A timed
autosave covers ordinary play, irreversible choices save immediately, and `pagehide` performs a
synchronous local checkpoint. Signed-in saves add optimistic-concurrency account durability, while a
validated Glitch launch restores its verified cloud slot before choosing the career and carries the
tutorial-completion flag with it.

**Accessibility.** Desktop remains keyboard-operable; touch-primary devices expose labelled
joystick and action controls without removing desktop bindings. `prefers-reduced-motion` disables
panel, coach and meter animation. The palette passes a WCAG contrast audit for every
gameplay-critical pair, so growth stages remain distinguishable with any form of colour blindness.
Prompts are ≤ 2 lines at 13 px and essential mobile controls meet the approximately 44 CSS-pixel
target rule.

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
| The player harvests but does not understand why Market is empty | Medium | Dedicated haul beat, carrying meter and contextual Put down prompt | Mitigated, browser-tested |
| The player never meets a warned event before winning | Low | Egg collection schedules one real minor fox warning before the goal hand-off | Mitigated, integration-tested |
| The player misses the starter egg clutch | Low | Feed covers the starter hens plus the tutorial purchase; eggs remain in a visible ground basket | Mitigated, browser-tested |
| The normal 90 s wheat timer stalls the tutorial before harvesting | Medium | The first watered onboarding crop visibly ripens in about three simulation seconds; regular crop timing is unchanged | Mitigated, browser-tested |
| Storage overflow surprises a pumpkin-heavy player | Medium | Toast + `ui.deny`; barn is the first build option | Partly mitigated |
| Market panel does not pause, so a player can be raided while reading | Low | Deliberate; it captures gameplay input while the simulation and warning bus continue | Accepted |
| Mobile layout or controls regress independently of desktop | Medium | Capability gate, mobile copy tests, mobile Playwright project and physical iPhone touch check | Mitigated; broader hardware matrix remains open |
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
| Taught setback and no post-completion resurrection | incident/onboarding integration tests |
| Progressive reveal | "reveals HUD features progressively rather than all at once" |
| Prompts never stack, non-blocking | `slice.spec.ts` — "prompts never stack", "never blocks the game behind it" |
| Matching pointer and keyboard menu paths | `slice.spec.ts` — Market click / M, Build click / B, Esc |
| Mobile movement and plot work | `mobile.spec.ts` — held joystick reaches a plot; Work changes money and prompt |
| Mobile placement | `mobile.spec.ts` — touch canvas tap spends money and exits placement; Cancel is visible |
| Copy budget | "stays within the prompt length budget" |

The Playwright suite executes desktop Chromium/Firefox/WebKit and dedicated mobile Chrome/WebKit
projects against the production bundle. Desktop first-session coverage remains keyboard/pointer
focused; mobile coverage verifies the mobile render gate, joystick, Work, orientation bounds and
touch placement. Trusted joystick and Work actions were also exercised on a connected iPhone; see
[MOBILE.md](MOBILE.md) for untested physical gates.

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
