# Mobile runtime and device verification

FarmRise uses one deterministic game and two presentation profiles. Desktop keeps the existing
keyboard, pointer and render path. A capability-gated phone/tablet profile adds touch controls,
safe-area layout, a smaller GPU/audio working set and mobile lifecycle handling without changing
simulation rules or server authority.

## Capability gate

`isTouchPrimaryDevice()` in `apps/game/src/engine/render/capabilities.ts` enables the mobile profile
only when the browser exposes touch input and either a coarse primary pointer or a viewport no wider
than 1,024 CSS pixels. Do not replace this with user-agent sniffing. Hybrid desktops must retain the
desktop experience unless their capabilities and viewport actually match the mobile path.

`createEngine()` records the result as `data-mobile-optimized` on `#app`. CSS and runtime quality
changes use that value; gameplay code does not branch on device names.

## Controls and interaction

| Context | Mobile input |
| --- | --- |
| Movement | Analog joystick at bottom-left. Its four fractional action values feed `InputSystem` directly. |
| Context work | **Work** plants, tends, harvests, picks up, deposits or repairs whatever is in reach. |
| Crop choice | **Seed** cycles the selected crop. |
| Warned event | **Protect** pays the normal prevention cost when a response window is active. |
| Management | The illustrated Market, Build, Office and Town buttons open the same panels as desktop. |
| Placement | Tap open ground to place repeated copies; **Rotate** turns the preview and **Cancel** exits. |
| Pause | The compact `Ⅱ` control opens the existing pause screen. |

`apps/game/src/ui/hud/TouchControls.ts` owns touch pointer ids and pointer capture. It never emits
synthetic keyboard events. `InputSystem.setActionValue()` buffers joystick values and buttons on the
same fixed-tick path as physical keys. Plot work and placement therefore reach the authoritative
game commands instead of being DOM-only affordances.

The action buttons represent edge-triggered commands, so they queue a complete press/release pulse
on `pointerdown`. Pointer ownership still controls the pressed visual, while the semantic action no
longer depends on Safari preserving pointer capture through the end of a touch gesture.

Touch taps may have no hover or `pointermove` event. `InputSystem` records contact coordinates on
`pointerdown`, which is required for a single canvas tap to position and confirm a building. A
successful tap keeps placement active so roads, fences and other repeated items do not require
reopening Build between every tile.

Panels and coach marks remain DOM interfaces and carry `data-engine-input-ignore`; touching them
must not move the player, work a plot or commit a placement behind the interface.

## Mobile-only runtime profile

| Setting | Mobile | Desktop |
| --- | ---: | ---: |
| Maximum render pixel ratio | 1.5 | 2.0 |
| WebGL antialias request | Off | Existing renderer default |
| Directional shadow map | 512 × 512 | 1,024 × 1,024 |
| Default music | 26-second mono procedural loop at at most 22,050 Hz | Generated four-minute stereo track |
| Hidden-page behavior | Stop loop, release input, suspend audio | Existing browser behavior |

The mobile changes are deliberately reversible and presentation-only. The fixed 60 Hz simulation,
economy, world size, entity counts, draw distance and authored models are unchanged. On the tested
iPhone, the render cap reduced the starter canvas from 996,000 to 559,752 backing pixels (43.8%) and
the shadow map from 1,048,576 to 262,144 texels (75%).

The accepted phone performance floor is 30 FPS, not a forced render cap. The current profile keeps
rendering at the display cadence when the device can sustain it while the authoritative simulation
remains fixed at 60 Hz.

The low-memory music path avoids fetching the 3,841,581-byte default MP3 and avoids its roughly
92.2 MB decoded stereo PCM allocation. The mono procedural buffer is roughly 2.35 MB at 22,050 Hz.
Sound effects still use the generated clips after the first user gesture and keep procedural
fallbacks.

Until platform tooling supplies real process/GPU measurements, use these as provisional release
budgets rather than claimed results: at most 256 MB total browser working set attributable to the
game, at most 64 MB GPU-resident resources and at most 16 MB decoded audio on mobile. A release may
not mark those gates PASS from source estimates; profile them on a constrained physical device.

## Layout rules

- Use `100dvh` plus `env(safe-area-inset-*)`; never assume browser bars leave a fixed viewport.
- Keep the joystick bottom-left and primary actions bottom-right so two thumbs can operate together.
- Keep the two-by-two Market, Build, Office and Town dock in the upper-left. When the developer
  overlay is active, place the dock immediately below it rather than covering either surface.
- Keep the onboarding coach below and clear of that dock. The center of every essential target must
  remain the topmost hit-test result, not merely visible underneath another DOM surface.
- Essential targets remain at least approximately 44 CSS pixels and inside both portrait and short
  landscape viewports.
- Short landscape must be tested at the physical Safari viewport, not only the nominal device
  resolution. The iPhone 12 mini exposes 812 × 311 CSS pixels with browser chrome; force the
  management dock into compact icon/key-cap tiles there and keep Pause beside rather than over it.
- During placement, hide gameplay controls and show the explicit **Rotate** and **Cancel** actions.
  The canvas owns placement taps.
- Mobile copy says **joystick**, **tap Work**, the visible management-button names, **Rotate** and
  **Cancel**.
  Desktop copy continues to name WASD, keys, clicks and Escape.

## Lifecycle ownership

`bootstrap/bindMobileLifecycle.ts` subscribes only when the mobile profile is active.

- `visibilitychange` hidden or `pagehide`: remember whether the engine was running, stop the loop,
  disable and release input, and suspend Web Audio.
- visible or `pageshow`: re-enable input, restart only a loop that was previously running, and resume
  audio.
- disposal: remove every listener through the unbind function owned by `startGame()`.

This prevents held joystick state, catch-up simulation and hidden GPU work after an iPhone tab is
backgrounded. The ordinary pause screen still pauses simulation while rendering the frozen farm;
mobile page hiding is a separate whole-loop lifecycle event.

## Connected iPhone procedure

The physical-device path used for this work was:

1. Enable Developer Mode on the iPhone, trust the Mac, and enable Safari Remote Automation.
2. Confirm the wired device with `xcrun devicectl list devices`.
3. Build or run the client on all interfaces, for example
   `npm run preview --workspace @farmrise/game -- --host 0.0.0.0 --port 4173 --strictPort`.
4. Start `safaridriver -p 4444`, create an iPhone WebDriver session, and navigate Safari to the
   Mac's LAN address. `ios_webkit_debug_proxy` may be used for additional inspection but is not a
   game dependency.
5. Use WebDriver touch pointer actions for acceptance. JavaScript `element.click()` may prepare a
   menu state, but it is not evidence that movement or gameplay works.
6. Record device, OS, Safari version, viewport, DPR, orientation, canvas backing size, debug-overlay
   FPS/draws/triangles, startup resources and the authoritative HUD/world change caused by input.

The repository automation command is:

```bash
npm run test:e2e
```

It builds and previews the production client, serializes software-WebGL sessions for stability, and
runs desktop Chromium/Firefox/WebKit plus mobile Chrome and mobile WebKit projects. Mobile-specific
coverage lives in `tests/e2e/mobile.spec.ts` and includes the render cap, joystick hold, Work state
change, all four management panels, portrait/landscape target bounds and hit-test ownership, plus
rotated, repeated touch building placement and explicit cancellation.

## Measured device result

| Item | Result |
| --- | --- |
| Device | iPhone 12 mini (`iPhone13,1`), wired |
| OS / browser | iOS 26.5.2 (23F84), Safari 26.5.2 |
| Production snapshot | `index-CQ2zZVWJ.js` (`820f2558…108bd`) + `three-CA4pNA7X.js` (`26e6ef40…8397`); aggregate snapshot SHA-256 `1757dcb2…1905d` |
| Touch capability | 5 touch points, DPR 3 |
| Physical orientation | Portrait and landscape right |
| Baseline canvas | 375 × 664 CSS; 750 × 1,328 backing pixels |
| Final mobile canvas | 375 × 664 CSS; 562 × 996 backing pixels |
| Final landscape canvas | 812 × 311 CSS; 1,218 × 466 backing pixels |
| Baseline starter view | 60 FPS, 31 draws, 71,208 triangles |
| Current production starter scene | 60 FPS, 91 draws, 222,856 rendered triangles |
| Exercised production range | 43–60 FPS during immediate action samples; 91–100 draws and about 223k–225k triangles. The user-approved phone floor is 30 FPS. |
| Current cold navigation/resources | 1,015 ms page load and 992 ms Play-to-dock readiness; 39 farm resources totaling 3,264,805 encoded bytes, including 1,804,776 model bytes and 1,080,206 JavaScript bytes; authored music MP3 omitted on mobile |
| Current warm reload / farm entry | 471 ms page load with 4.8 KB of transfer headers and zero encoded resource bodies; warm Play-to-dock readiness measured 316 ms |
| Management dock | PASS in portrait and landscape on hardware plus both mobile browser projects — all four buttons stayed in bounds, owned their center hit-test point and occupied a two-by-two upper-left dock; the debug build moves it below the FPS panel |
| Physical short landscape | PASS at Safari's 812 × 311 viewport — dock 183 × 121 at x=58/y=8, joystick 126 × 126 at x=62/y=153, Pause at x=246/y=123 and actions at the right; no target center was covered, trusted joystick movement reached a plot and trusted Work changed Plant to Tend |
| Trusted joystick | PASS on the exact production snapshot — a held touch moved the player into plot range and released to center |
| Trusted Work | PASS on that snapshot — balance decreased by the current $0.80 wheat cost and prompt changed from Plant Wheat to Tend |
| Trusted placement | The captured hardware snapshot placed one road and charged the current $4.00 road cost. The newer rotate-and-repeat flow has browser coverage and still requires a focused hardware retest. |
| Pause/settings | PASS on hardware — trusted Pause opened the screen; the 345 × 636 settings panel stayed inside the 375 × 664 viewport and exposed all five music choices |
| Foreground soak | PASS for more than 10 minutes on the immediately preceding runtime-identical snapshot, after separate trusted movement, Work and placement checks; every one-minute sample stayed at 60 FPS. The final change is short-landscape CSS and received focused hardware/browser retesting rather than a second soak. |
| Safari tab background/resume | PASS on the preceding runtime-identical snapshot for more than one minute — the engine tick advanced only 199 ticks after returning, input was released, the dock/canvas layout stayed fixed and rendering resumed at 60 FPS |

These are observations from one capable phone, not a minimum-device guarantee. Safari does not
expose process memory, GPU time or thermal state through WebDriver, so no memory ceiling or thermal
pass is claimed.

## Known limits and required retest

- A one-minute app-level background/resume is **not conclusively tested**. Switching to Settings now
  succeeds, but reactivating Safari replaces the iPhone WebDriver session. Repeat manually and
  verify no held movement, no catch-up burst and resumed audio.
- Physical multi-touch (joystick held while Work is tapped) is **not conclusively tested**. Pointer
  ownership has unit coverage; repeat it on hardware.
- The current **Rotate**, repeated placement and explicit **Cancel** sequence has not yet been
  repeated on physical hardware after replacing the older one-placement-and-exit behavior.
- Offline/reconnect, WebGL context loss, lock/unlock, low-memory recovery, battery and thermal
  behavior are **not tested** on hardware.
- Only one physical iPhone was available. Test an older constrained iPhone, an iPad and at least one
  Android device before claiming broad mobile support.
- The completed soak is browser-level evidence only. Safari WebDriver exposes no process/GPU memory,
  battery or thermal signal, and the run did not reach a mature dense estate or a warned event. A
  20–30 minute instrumented soak on constrained iOS and Android hardware remains a release gate.
