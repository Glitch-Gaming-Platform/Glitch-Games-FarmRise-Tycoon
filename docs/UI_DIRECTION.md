# Interface direction

FarmRise menus should feel like useful objects from the same warm, toy-like farm world—not like a
web dashboard placed over it. This document turns the supplied game-menu references into concrete
rules for every screen, panel, button and HUD element.

## What makes the references read as game menus

The four references differ in age and genre, but share six useful decisions:

1. **A physical frame.** Timber, paper, stitched cloth, tabs and beveled borders make the interface
   feel built rather than browser-native.
2. **Object art before explanation.** Crops, vehicles, buildings and rewards are recognized from a
   large illustration before the player reads their names.
3. **One obvious selection and one obvious action.** A selected tile is unmistakable; the next
   button is larger or brighter than secondary controls.
4. **Icon, name, cost and state stay together.** The player does not have to compare distant parts
   of the screen to decide whether an item is useful, owned, locked or affordable.
5. **The game world remains context.** Panels float over the map instead of replacing it with a
   generic application page.
6. **Labels are short and concrete.** “Sell all,” “Place,” and “Close” win over explanatory prose.

## FarmRise adaptation

The interface uses the same palette and form language as the world art:

- cream paper surfaces for readable content;
- double timber frames with rounded, slightly toy-like corners;
- teal controls for normal actions, gold for the primary next action and red only for errors;
- chunky display headings and compact body copy;
- Blender-rendered crops, buildings, animals and characters from the real game meshes;
- the 3D farm remains visible around floating panels.

The CSS variables in `apps/game/src/ui/core/styles.ts` are derived from
`tools/blender/palette.py`. New interface colors must map to a named palette role instead of
introducing an unrelated visual system.

## Blender-rendered interface art

Run:

```bash
npm run art:ui-icons
```

`tools/blender/render_ui_icons.py` opens the generated master blend, composes the actual game
meshes, and writes 44 transparent WebP illustrations to
`apps/game/public/assets/ui/icons/`. Measured sizes are recorded in
`art/ui_icon_report.json` and mirrored in `uiIcons.manifest.ts`.

The current set is **166,366 bytes total**, under the **175 KB interface-art budget**. Twelve crop
icons were added as lazy inventory/market presentation under ADR 0024. These images
are DOM presentation art. They do not add WebGL draw calls, UVs or texture sampling to the 3D world.

## Component rules

- Every exclusive screen has a title ribbon, a strong visual anchor and one primary action.
- Every floating panel owns the full backdrop while open. Pointer and keyboard input must not reach
  the farm behind it.
- Market rows show crop art, item name, quantity/value and action in one row. “Sell now” comes before
  contracts because it is the first-session path.
- Build rows show the placed object, price and affordability together. Locked and unaffordable
  states remain visible; they are not silently removed.
- The HUD stays compact and transparent enough to preserve the world. It may use framed chips, but
  must not become a second large panel.
- Proximity gauges appear only while the player is standing next to the thing they describe: water
  for a planted bed, freshness for a pile of goods. Every bar reads as "how much is left", so a full
  bar is always the good state, and every bar carries the number in words as well - a length alone
  cannot say "dry in forty seconds", and colour alone cannot say "urgent".
- Desktop active play exposes a bottom-right menu dock for important letter shortcuts. Each button
  pairs a Blender-rendered icon, a plain-language menu name and its key cap; clicking it and pressing
  the shown letter must open the same interface.
- Touch-primary mobile play adds an analog joystick at bottom-left and action controls at
  bottom-right, and moves the Market/Build/Office/Town dock into a two-by-two upper-left group. This
  layout is capability-gated; never show or reserve its space on desktop.
- The joystick feeds fractional semantic actions into `InputSystem`. Mobile UI controls must not
  dispatch synthetic keys or mouse events.
- During mobile placement, hide gameplay controls, expose clear **Rotate** and **Cancel** actions,
  and let direct canvas taps place repeated copies until the player cancels or cannot afford another.
- Mobile layout uses `100dvh` and safe-area insets. Essential controls remain approximately 44 CSS
  pixels or larger and inside portrait and short-landscape viewports.
- Hide the shortcut dock whenever a panel or exclusive screen already presents menu controls. This
  avoids duplicate icons and prevents controls from competing with an open interface.
- Coach marks state the next physical action and the target. Never say only “use WASD”; say where to
  walk and what to do there.
- Icon-only controls require an accessible name. Decorative images use empty alternative text;
  informative hero art has concise alternative text.

## Verification

Visible interface work requires:

1. unit coverage for generated-art catalog and measured file sizes;
2. Playwright coverage for opening, closing and action paths;
3. an input-isolation test proving open panels block movement, interaction and world clicks;
4. desktop and mobile browser review for clipping, scrolling, safe areas and readable action hierarchy;
5. trusted-touch hardware review for joystick hold/release, Work state changes and canvas placement;
6. `npm run verify`, `npm run art:check` and `npm run test:e2e` before completion.
