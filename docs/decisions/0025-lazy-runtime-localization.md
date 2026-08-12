# 0025. Lazy runtime localization with English fallback

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Player-facing copy was embedded throughout DOM components and bootstrap event handlers. Adding ten
launch languages by branching in each component would duplicate detection and persistence, make
right-to-left support inconsistent, and couple deterministic game state to presentation language.
Loading every catalog into the initial bundle would also make each future language increase every
player's startup cost.

## Decision

Use a small dependency-free localization runtime in `engine/i18n`. Register FarmRise locales and
lazy catalog imports in `ui/i18n`, with English as the source and fallback catalog. Resolve a saved
player choice before browser language detection, default to English when no supported locale can be
matched, and persist the result under one stable key.

Share one localization instance across screens, panels, the HUD and bootstrap binders. Locale
changes update bound DOM nodes and rerender dynamic projections immediately. Set the document
`lang` and `dir` attributes from locale metadata, with CSS using logical layout plus focused RTL
overrides. Keep simulation data, saves and shared rules locale-neutral; translate shared domain
definitions only at presentation boundaries.

Use platform `Intl` formatters for numbers, currency, percentages and plurals. Catalog interpolation
uses named placeholders. New locales are added through metadata, one lazy loader and one catalog,
without adding locale branches to UI components.

## Consequences

- The first visit follows a supported browser language and later visits respect the player's saved
  choice.
- Start-screen and Settings selectors are two views onto the same game-wide locale state.
- Arabic and Urdu can use RTL layout without maintaining separate components.
- Locale chunks other than the active one are not part of the initial language payload.
- English fallback keeps partial or newly added catalogs safe while translation coverage is being
  completed, but missing entries remain visible to players as English and should be treated as
  localization debt.
- Domain ids and message placeholders become compatibility surfaces and must remain stable.

## Alternatives considered

- **Branch on locale inside each component.** Rejected because it duplicates behavior and makes an
  eleventh locale a code change across the UI.
- **Put translated display names in `@farmrise/shared`.** Rejected because the server and
  deterministic rules do not need presentation language, and it would mix locale state into shared
  economy data.
- **Bundle every catalog eagerly.** Rejected because startup cost would grow with every supported
  locale even though a session uses only one.
- **Use browser language on every boot.** Rejected because it would overwrite an explicit player
  choice.
