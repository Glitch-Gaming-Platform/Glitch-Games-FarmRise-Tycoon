# Analytics

FarmRise has one typed analytics stream and three optional website providers: Google Analytics 4,
Microsoft Clarity and Glitch website analytics. The same stream is translated to Glitch in-game
events after a Glitch install exists. Gameplay never imports an analytics provider.

## Runtime policy

- External analytics exist only in a Vite production build. Development uses the console sink and
  unit-test memory sink; it never loads Google, Clarity or Glitch website scripts.
- Analytics are **on by default** for a first-time player, per the product decision on August 12,
  2026. Settings > Privacy choices provides an opt-out. An opt-out is persisted and reloads the page
  so automatic provider listeners are removed completely.
- Default-on is not represented as explicit legal consent. Until the player actively chooses,
  Glitch install heartbeats send `consent_given: false`. Clarity receives `consentv2` only after an
  explicit choice; without that signal Clarity applies its own regional consent behavior.
- A stored opt-out prevents provider scripts, persistent analytics identifiers, Glitch installs,
  heartbeats, events and consented fingerprint components from being created.
- Ad-conversion forwarding stays disabled. Glitch conversion events are marked for reports but
  `sendToConversionApis(false)` remains in force because there is no separate advertising consent.
- Google signals and ad-personalization signals are disabled.

The default-on policy needs legal review before marketing the game in regions requiring prior
consent. The implementation does not pretend that an automatic default is an affirmative choice.

## Configuration

Copy the public values from `apps/game/.env.example` into the protected production build
environment. The Google measurement ID and Clarity project ID were not supplied for this work, so
those providers remain inactive until configured. The supplied Glitch website token is public
browser configuration; it is not a runtime title token.

| Variable | Purpose |
| --- | --- |
| `VITE_GA_MEASUREMENT_ID` | GA4 web data stream, for example `G-...` |
| `VITE_CLARITY_PROJECT_ID` | Clarity project identifier |
| `VITE_GLITCH_TITLE_ID` | FarmRise Glitch title UUID |
| `VITE_GLITCH_WEB_TRACKING_TOKEN` | Browser website analytics token |
| `VITE_GLITCH_TITLE_TOKEN` | Runtime title token for installs, heartbeats, events, saves and verified purchases |
| `VITE_GLITCH_BUILD_TYPE` | `production`, `demo` or `playtest` |
| `VITE_APP_VERSION` | Release version attached to every provider event |

`VITE_ANALYTICS_TEST_MODE=1` is allowed only in the Playwright build. It does nothing unless the
page also has `?analytics-test=1`, and is not set in production deployment instructions.

## Ownership and delivery

| Responsibility | File |
| --- | --- |
| Event and payload contract | `apps/game/src/analytics/events.ts` |
| Runtime event-name coverage list | `apps/game/src/analytics/eventNames.ts` |
| Buffer, validation, once-only metrics and sink isolation | `apps/game/src/analytics/AnalyticsClient.ts` |
| Default-on preference and persisted opt-out | `apps/game/src/analytics/consent.ts` |
| Provider construction and consent-sensitive lifecycle | `apps/game/src/bootstrap/createAnalytics.ts` |
| GA4, Clarity and Glitch website scripts | `apps/game/src/analytics/WebAnalytics.ts` |
| Game event-bus subscriptions | `apps/game/src/bootstrap/bindAnalytics.ts` |
| Saves, screens, errors, idling and performance | `apps/game/src/bootstrap/bindRuntimeAnalytics.ts` |
| Typed event to Glitch `(step_key, action_key)` translation | `apps/game/src/bootstrap/bindGlitch.ts` |
| Glitch install, heartbeat and fingerprint payload | `apps/game/src/platform/glitch/GlitchSession.ts` |
| Verified revenue endpoint adapter | `apps/game/src/platform/glitch/GlitchPurchases.ts` |

`AnalyticsClient` rejects nested values, non-finite numbers, strings over 160 characters and keys
that look like credentials, email, chat, cookies or user IDs. Provider bridges add a stable
`sessionId:sequence` event ID, app/protocol version, build type, platform, device class, coarse OS,
input method and browser locale. They do not add raw user agent, IP address, account form values,
exceptions, stack traces or translated display text. The account panel is masked from Clarity.

Glitch events queue before the install exists, send in order over the documented single-event route,
requeue after failure and cap memory. The bulk route is not used because it requires an admin JWT.
Every provider call is failure-isolated; blocked scripts, timeouts and malformed responses cannot
interrupt input, saving, networking, scene transitions or simulation.

## Coverage matrix

| Journey/system | Stable events | Outcome and important properties | Providers |
| --- | --- | --- | --- |
| Acquisition and landing | website `pageview`, `session_start`, `screen_viewed` | privacy-safe URL, referrer host, viewport, campaign query, version/platform context | GA4, Clarity, Glitch web; screens also Glitch game |
| Session lifecycle | `session_start`, `visibility_changed`, `idle_detected`, `session_end` | background duration, idle seconds/phase, total duration and exit reason | All configured providers |
| Loading and reliability | `scene_ready`, `runtime_error`, `save_completed`, `save_failed` | load time/art status; stable error code only; save tier | All configured providers |
| Performance | `performance_sample`, `performance_overrun` | FPS, draws, triangles, quality tier, dropped simulation steps | All configured providers plus Glitch web automatic timings |
| Onboarding | `onboarding_start`, `onboarding_beat_start`, `onboarding_beat_complete`, `onboarding_hint_shown`, `onboarding_skipped`, `onboarding_complete` | beat ID/index, duration, adaptive path, hints, skip reason | All configured providers |
| Time-to-value | `first_input`, `first_meaningful_action`, `first_feedback`, `first_success` | once per session, elapsed milliseconds and stable action/kind | All configured providers |
| Crop loop | `crop_selected`, `crop_planted`, `crop_tended`, `crop_harvested`, `cycle_completed` | crop/plot ID, quantity/spill, cycle, balance and elapsed time | All configured providers |
| Storage and hauling | `goods_hauled`, `storage_overflowed`, `goods_spoiled`, `carrier_changed` | stored/refused/lost units, open-field flag, carrier | All configured providers |
| Animals | `animal_purchased`, `animal_product_collected`, `animal_hungry`, `animal_lost` | species/item/count/cost/feed availability | All configured providers |
| Market and contracts | `goods_sold`, `career_action_completed`, `contract_failed` | item, quantity, payout, contract flag, buyer ID; contract acceptance uses stable action `acceptContract` | All configured providers |
| Building and land economy | `building_placed`, `building_completed`, `land_purchased`, `building_broken`, `building_repaired` | stable kind/parcel, cost, balance, parcel count | All configured providers |
| Processing and workers | `career_action_completed`, `processing_completed`, `worker_task_completed` | queued action, output item/quantity and task kind | All configured providers |
| Long progression | `milestone_ready`, `milestone_claimed`, `unlock_granted`, `specialization_chosen`, `town_grew`, `town_project_completed`, `career_restructured` | stable milestone/unlock/specialization/project IDs and stage | All configured providers |
| Setbacks/challenges | `farm_event_warned`, `farm_event_prevented`, `farm_event_impacted`, `fox_scared_off` | stable incident/response kind, targets, mitigation, remaining threats | All configured providers |
| Menus and settings | `panel_viewed`, `screen_viewed`, `setting_changed`, `consent_updated` | stable panel/screen/setting IDs; no display text | All configured providers |
| Accounts | `account_action` | register/login/logout and started/succeeded/failed only; no email, name or password | All configured providers |
| Season outcome | `run_completed` | outcome, duration, cycles, final/peak balance, harvests, incidents and buildings | All configured providers |
| Real-money purchases | `GlitchPurchases.recordVerified` adapter only | exact Glitch install UUID, provider transaction ID, SKU, amount/currency/quantity | Glitch purchase endpoint after server/store verification |

Combat, player death, quests, multiplayer, private chat and native platform achievements do not
exist in this title. Their coverage is not simulated with misleading placeholder events. Milestones
are the current achievement system; incidents and fox defense are the current challenge/combat-like
systems.

## Glitch-specific coverage and limits

- Installs use one persisted `user_install_id`; the returned `data.id` is the only
  `install_id`/`game_install_id` used by events, saves and purchases.
- Heartbeats repeat `POST /titles/{title_id}/installs` every 30 seconds only while actively playing,
  with one session ID and a final best-effort heartbeat on exit.
- Desktop App launch parameters win over local fallbacks and are captured before the browser URL is
  scrubbed of `install_id`, `user_install_id`, `session_id`, `title_id` and `game_id` for website
  analytics.
- After an explicit opt-in, coarse fingerprint components contain only documented fields: device type, required
  `unknown` model/version when unavailable, standardized OS name, resolution, CPU-core count,
  language and timezone. No serial number, advertising ID, raw hardware ID or keyboard capture is
  collected.
- A verified-purchase adapter is present but has no call site. FarmRise has no configured storefront
  or receipt-verification backend, so sending client-invented purchases would be incorrect.
- Xsolla is not enabled: the title has no Xsolla project ID or webhook secret. No webhook or Pay
  Station event is fabricated.
- SKAdNetwork/AdAttributionKit is not applicable to this browser build. Add it only in a signed native
  iOS target with the documented `Info.plist` entries and conversion mapping.
- Funnel creation/report routes require an admin JWT and must never run in the client. Configure
  dashboard funnels from these ordered steps: `boot -> onboarding -> farm -> market -> reinvest ->
  progression -> outcome`, plus separate `navigation`, `friction`, `save`, `reliability` and
  `performance` diagnostic funnels.

## Validation

Automated evidence:

```bash
npm test -- --project game apps/game/tests/unit/analyticsProviders.test.ts \
  apps/game/tests/unit/analyticsFunnel.test.ts apps/game/tests/unit/glitchPlatform.test.ts
npm run test:e2e -- --grep analytics
npm run verify
```

The unit suites prove production gating, default-on and explicit opt-out persistence, payload
validation, provider mapping, URL redaction, no-op disabled behavior, script failure isolation,
Glitch install identity/consent/fingerprint fields, ordered event retry, complete typed-event mapping
and verified-purchase gating. The Playwright test proves the production bundle auto-starts the
isolated analytics test provider and exposes privacy choices without blocking the game.

Provider dashboards still require release credentials and a deployed production visit:

1. GA4: use DebugView/Realtime and verify `page_view`, `session_start`, `onboarding_complete`,
   `goods_sold`, `milestone_claimed` and `run_completed`; mark the intended events as key events.
2. Clarity: verify the live session, masked account panel, custom events, heat map, scroll and
   performance data; test an affected consent region separately.
3. Glitch website: verify session/pageview/event rows and the `device_id`/`session_id` identity
   cookies. Glitch game reports: verify one install, 30-second retention rows, ordered event
   transitions and the onboarding/core-loop funnel.

These live dashboard checks were not claimed here because the GA4 and Clarity IDs were not supplied
and this change was not deployed.

## Adding an event

1. Add the typed name and flat payload to `analytics/events.ts`. Use stable English machine IDs,
   never translated labels or player-entered text.
2. Add the name to `analytics/eventNames.ts` and the website category in `WebAnalytics.ts`.
3. Subscribe to an existing event bus in `bootstrap/bindAnalytics.ts`, or use
   `bindRuntimeAnalytics.ts` for app lifecycle/infrastructure. Do not call analytics from gameplay.
4. Add a complete `(step_key, action_key)` mapping and business label in `bindGlitch.ts`; its
   `Record<AnalyticsEventName, Mapping>` type must remain exhaustive.
5. Use `trackOnce` for every `first_*` or single-exit event.
6. Add unit coverage for payload, order, privacy and failure behavior; add Playwright coverage if the
   player-visible privacy/settings flow changes.
