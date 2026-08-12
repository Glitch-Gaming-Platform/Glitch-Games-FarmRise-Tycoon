# Internationalization

FarmRise has one shared localization service for the browser client. It owns locale detection,
lazy message loading, English fallback, number/currency/plural formatting, text direction and live
UI updates. Game rules and persisted saves remain locale-neutral.

## Supported locales

FarmRise currently ships twelve locales: the initial ten-language product set plus Japanese and
German.

| Locale | Flag | Language | Direction |
| --- | --- | --- | --- |
| `en` | 🇺🇸 | English | LTR |
| `zh-Hans` | 🇨🇳 | Simplified Chinese (Mandarin) | LTR |
| `hi` | 🇮🇳 | Hindi | LTR |
| `es` | 🇪🇸 | Spanish | LTR |
| `ar` | 🇸🇦 | Standard Arabic | RTL |
| `fr` | 🇫🇷 | French | LTR |
| `bn` | 🇧🇩 | Bengali | LTR |
| `pt` | 🇧🇷 | Portuguese | LTR |
| `id` | 🇮🇩 | Indonesian | LTR |
| `ur` | 🇵🇰 | Urdu | RTL |
| `ja` | 🇯🇵 | Japanese | LTR |
| `de` | 🇩🇪 | German | LTR |

The picker always displays each language in its own language. English is the source and fallback
catalog, so a missing translation never exposes a message id or prevents the game from starting.
Each locale also has a representative flag as a quick visual cue. Because languages can span many
countries, the native language name remains the authoritative label and the flag is decorative.

## Selection and persistence

On startup, `createGameLocalization()` resolves the locale in this order:

1. an explicit locale supplied by a test or host;
2. the player's saved `farmrise:language` choice;
3. the first supported value in `navigator.languages` (with regional tags such as `es-MX` matched
   to their base language);
4. English.

The resolved locale is persisted immediately. A change from either the start screen or Settings
uses the same service, updates all bound UI and panel projections, persists the choice, and updates
the document's `lang` and `dir` attributes. Arabic and Urdu therefore switch the complete DOM
overlay into right-to-left layout without a reload.

## Code layout

| Path | Responsibility |
| --- | --- |
| `apps/game/src/engine/i18n/Localization.ts` | Reusable catalog runtime, formatters, interpolation and DOM bindings |
| `apps/game/src/ui/i18n/gameI18n.ts` | FarmRise locale registry, browser detection, persistence and document metadata |
| `apps/game/src/ui/i18n/messages/` | One lazy-loaded catalog per locale |
| `apps/game/src/ui/i18n/domainText.ts` | Translation keys for shared domain data without putting presentation text in `@farmrise/shared` |
| `apps/game/src/ui/i18n/LanguageSelect.ts` | Shared start-screen and Settings control |
| `apps/game/src/bootstrap/` | Resolves game events and domain definitions at the presentation boundary |

The `game/` layer may consume the engine-level `TextLocalizer` interface for loading labels, but it
must not import FarmRise UI catalogs. The `ui/` and `bootstrap/` layers translate domain display
names and event feedback. This preserves the dependency direction in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Message conventions

- Use stable dot-separated ids grouped by surface, such as `menu.play` or `toast.sale`.
- Keep values locale-neutral. Pass numbers through `formatNumber`, money through `formatCents`,
  percentages through `formatPercent`, and durations through `formatDurationSeconds`.
- Use `{name}` placeholders rather than concatenating translated sentence fragments.
- Add `.one`, `.other`, or other `Intl.PluralRules` categories when grammar changes with `count`.
- Translate shared domain records with `domain.<kind>.<id>.<field>` and retain the definition's
  English display text as the fallback.
- Do not persist translated strings or send them as economy inputs.

## Adding a language

1. Add a `LocaleDefinition` to `SUPPORTED_LOCALES`, including native name, direction and browser
   tags.
2. Add a lazy loader in `MESSAGE_LOADERS`.
3. Create `messages/<locale>.ts`, preserving placeholders from the English source catalog.
4. Add detection, live-switch and RTL coverage where applicable.
5. Run `npm run verify` and the Playwright language-switch test under Node 24.

No menu, settings panel or gameplay binder should need a locale-specific branch.
