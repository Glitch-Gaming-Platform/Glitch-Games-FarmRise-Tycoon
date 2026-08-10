# 0006. A DOM overlay instead of a UI framework

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The client needs a main menu, a loading screen, a pause panel, a settings panel and a HUD. The
obvious default is React — it is already a dependency of the server app, so it is "free" in the
repository sense.

## Decision

A roughly 40-line `el()` helper, one `Screen` interface, one `UiRoot` that shows exactly one screen
at a time, and a HUD that subscribes to game events.

## Consequences

- No framework runtime in the client bundle, and no reconciliation pass competing with the render
  loop for main-thread time. The HUD updates on events plus a 4 Hz poll rather than every frame.
- UI code is testable in jsdom with no transformer or test renderer.
- Screens are constructed once and toggled rather than created and destroyed, which avoids losing
  focus state and a layout flash.
- Anything with real client-side state — an inventory grid with sorting and filtering, a build menu
  with search — will be more work than it would be in React. `ui/core/dom.ts` is deliberately the
  seam where a framework would be introduced, and that will be a new ADR.
- Accessibility is manual: focus rings, `aria-live`, and 44 px touch targets are conventions in the
  stylesheet rather than something a component library provides.

## Alternatives considered

- **React.** Familiar and well-tooled; a runtime and a build step to save very little at this size.
- **Lit / web components.** Lighter than React, still a dependency and a mental model for five
  screens.
- **Rendering the UI inside the WebGL canvas.** Loses accessibility, text selection, native input
  behaviour and platform text rendering. Not worth it.
