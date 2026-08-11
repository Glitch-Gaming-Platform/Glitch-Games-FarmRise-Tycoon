# 0016. Capability-gated mobile runtime profile

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The desktop build rendered correctly on an iPhone 12 mini, but its 2× render cap produced a
750 × 1,328 backing canvas, its 1,024² shadow map spent four times the shadow texels now used on
mobile, and decoding the default four-minute music file would allocate roughly 92.2 MB of stereo
PCM. The game also had no touch gameplay path or explicit hidden-page cleanup.

A permanent quality reduction for every browser would damage the working desktop experience, while
user-agent checks would age badly and misclassify hybrid hardware.

## Decision

Add one capability-gated mobile presentation profile. Touch plus a coarse primary pointer or compact
viewport enables:

- an analog joystick and semantic touch action controls;
- a maximum 1.5 render pixel ratio, no antialias request and a 512² directional shadow map;
- a mono procedural default music buffer at at most 22,050 Hz instead of fetching/decoding the
  four-minute track;
- safe-area/short-landscape CSS and mobile-specific instructional copy;
- whole-loop stop, input release and audio suspend while the page is hidden.

Simulation frequency, world rules, models, entity counts, desktop controls and desktop quality stay
unchanged. The gate is capability-based and stored on the app container for CSS; it never uses a
device name or user-agent string.

## Consequences

- The tested phone's backing-pixel count falls 43.8%, and shadow-map texels fall 75%.
- Mobile avoids a 3.84 MB music transfer and roughly 92.2 MB decoded PCM allocation.
- Mobile and desktop share the authoritative action map, so touch does not create a second gameplay
  implementation.
- The client bundle grows by several kilobytes for controls and lifecycle handling.
- Capability detection is intentionally broad for touch-primary tablets; unusual hybrid devices
  need browser testing.
- One iPhone result is not a broad device claim. Older iOS, iPadOS and Android hardware still require
  physical performance, lifecycle and thermal validation.

Revisit the fixed 1.5/512 profile when measurements from both constrained and capable phones justify
multiple quality tiers, or when compressed audio can provide authored mobile music inside an agreed
decoded-memory budget.

## Alternatives considered

- **Reduce quality for every browser.** Rejected because desktop was already working and the user
  explicitly required mobile-only changes.
- **User-agent-based iPhone/Android branches.** Rejected because capabilities, not brand strings,
  determine whether touch layout and a smaller working set are appropriate.
- **Cap mobile simulation or gameplay to 30 Hz.** Rejected because the measured phone sustained the
  60 FPS target after reducing render work; changing authoritative tick behavior was unnecessary.
- **Keep authored music on mobile.** Rejected for this profile because its decoded PCM dominates the
  known working set. The procedural fallback preserves music without the allocation.
