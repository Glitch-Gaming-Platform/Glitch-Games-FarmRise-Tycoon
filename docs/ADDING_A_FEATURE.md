# Adding a feature

Worked examples. Each one ends with the same three questions: what did you add, what did you test,
what did you document.

Before any of them, the scope rule from the design blueprint:

> Every new crop, animal, building or event must introduce a distinct economic, spatial, timing or
> risk decision rather than only adding visual variety.

If your addition does not change a decision, it is content, not a feature, and it can wait.

---

## 1. A new crop

**Rules:** `packages/shared/src/domain/crops.ts`. **Presentation:** four Blender stages plus a
Blender-rendered inventory/market icon.

```ts
strawberry: defineCrop({
  id: 'strawberry',
  displayName: 'Strawberry',
  rarity: 'rare',          // derives a 7x fresh premium return
  baseUnitPrice: cents(180),
  baseYield: 8,
  growthTicks: secondsToTicks(360), // every higher return tier takes longer
  waterPerDay: 4,        // thirstier than corn: irrigation matters more
  diseaseRisk: 0.09,
  tendActions: 3,        // high labour, so it competes for player time
  soilDraw: 0.1,
  favouredSeasons: ['spring'],
  offSeasonGrowth: 0.55,
  freshnessDecayPerDay: 0.11,
  requiresUnlock: null,
  plantingSeasons: ['spring'],
}),
```

Because `CROP_IDS`, the save schema's crop enum, the item registry, the HUD crop cycle and the
market's spot-sale pool are derived from this object, no parallel crop enum is needed. Seasonal
contract generation filters the same catalog by the active season.

Add `SM_crop_<id>_s1` through `_s4` to the correct crop pack in
`tools/blender/seasonal_crops.py`/`assets.py`; stage 4 alone may look harvestable. Add the stage-4
composition to `render_ui_icons.py` and map its measured WebP in `uiIcons.manifest.ts` so inventory,
field stacks, contracts and spot-sale rows never fall back to Wheat art.

**Test:** cover planting-window boundaries, return tier, growth-time ordering, standing-crop price
loss and stored freshness decay. `modelCatalog.test.ts` requires all four meshes and
`uiIconCatalog.test.ts` requires a distinct icon.

**Document:** if it changes the balance story, say so in the design blueprint. Otherwise no doc
change is needed — the definition is self-documenting.

---

## 2. A new building

**Where:** `packages/shared/src/domain/buildings.ts`, plus wherever its *effect* lives.

1. Add the definition (cost, build time, footprint, upkeep, description).
2. Implement the effect where it belongs:
   - storage → `rules/storage.ts`
   - movement/collision → `world/models/BuildingModel.ts` and `world/collisionProfiles.ts`
   - crop behaviour → `FarmWorld.#refreshIrrigation` or an equivalent
   - incident interaction → shared incident rules plus `IncidentDirector` target/application logic
3. Give it a mesh in `world/view/StructureView.ts` and a material in `world/view/materials.ts`.

**Watch:** the career site's `placedBuildingSchema` derives its enum from `BUILDING_KINDS`, so the
definition updates the wire type automatically. You still need to decide its unlock, save-stable
identity, collision footprint, world presentation and whether server transition validation needs a
new spending or state-change rule.

**Test:** `apps/game/tests/unit/farmWorld.test.ts` — cost charged, tiles reserved, effect only after
construction completes, upkeep charged.

---

## 3. A new farm incident

**Where:** `packages/shared/src/domain/incidents.ts`, `packages/shared/src/rules/incidents.ts` and
`apps/game/src/game/events/IncidentDirector.ts`.

Every incident must honour the contract, or it violates the Recoverable Disruption pillar:

1. A warning fires `warningTicks` before impact.
2. At least one response is an active task; payment may be an alternative but not the only answer.
3. The scheduled instance stores named target ids, severity, timing and response progress in the
   career save, so reload cannot reroll or erase it.
4. Impact is visible and recoverable rather than an unexplained deletion.

Add the definition to `INCIDENTS`. Existing target kinds inherit scheduling and response math from
the shared rules. A new target kind also needs candidate selection and impact application in
`IncidentDirector`, a UI affordance for the response, and save/transition validation coverage.

**Test:** cover eligibility, cooldown and mitigation math in `packages/shared/tests/`, then add an
integration case proving warning → response/impact → resolution and reload persistence.

---

## 4. A new engine system

**Where:** `apps/game/src/engine/<area>/`, registered in `bootstrap/createEngine.ts`.

```ts
export class WeatherSystem implements EngineSystem {
  readonly id = 'weather';
  readonly priority = SystemPriority.Simulation;
  init(context: SystemInitContext): void { /* resolve dependencies here, never in the loop */ }
  fixedUpdate(context: FixedUpdateContext): void {}
  update(context: RenderContext): void {}
  dispose(): void {}
}
```

Rules:
- **It must not import from `game/`.** If it needs game data, take it as a constructor argument or
  define a port the game implements. `GridPhysics` taking `roadMultiplier` as an option rather than
  importing the game's tuning constant is the pattern to copy.
- Register in **dependency order**; set `priority` for **frame order**. They are different things.
- Resolve services in `init`, never inside `fixedUpdate`.

**Test:** `apps/game/tests/unit/` with a `createManualScheduler()`, so frames are exact.

---

## 5. A new API route

Full checklist in [NETWORKING.md](NETWORKING.md#adding-a-route). The short version:

1. Schemas in `packages/shared/src/schemas/`; path in `Routes`.
2. `apps/server/app/api/v1/…/route.ts` using `createRoute({ … })`. Never bypass the wrapper.
3. The decision goes in a service; the handler stays thin.
4. New persistence → new port method → both adapters → a migration.
5. Typed call in `apps/game/src/net/GameApi.ts`.
6. Tests: anonymous access, another user's resource, invalid input, replayed request if money moves.
7. A contract test asserting the real response parses with the shared schema.

**If the route moves money, it takes an intent and computes the amount server-side.** No exceptions.

---

## 6. A new UI screen

**Where:** `apps/game/src/ui/`, registered in `UiRoot`.

Implement `Screen` (`id`, `root`, optional `show`/`hide`/`dispose`), build the DOM with the `el`
helper, style it with a class in `core/styles.ts`.

Rules:
- `ui/` may **read** `game/`. `game/` may never touch `ui/` — emit an event instead.
- Give interactive elements a `testId`; the Playwright specs select on those.
- Minimum 44 px touch targets, visible focus rings, `aria-live` on anything that announces.
- Honour `prefers-reduced-motion` (the stylesheet already has the media query).

---

## 7. A new scene

Implement `GameScene`, register it on the `SceneManager` in `bootstrap/startGame.ts`, and add a
phase or a transition if it needs one.

Non-negotiables:
- `load()` must honour `context.signal` — a player who backs out must stop the work.
- `load()` must call `reportProgress` so the loading screen tells the truth.
- `dispose()` must free every geometry, material and texture the scene created. Three.js will not do
  it for you, and a few scene changes will exhaust VRAM on a phone.

---

## Definition of done

```bash
npm run verify   # format:check → lint → typecheck → test → build
```

Then ask:

1. **Did I put it in the right layer?** `npm run lint` answers this — the boundary rules are real.
2. **Is anything now over ~300 lines or holding two responsibilities?** See the list in
   [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md#files-that-must-not-become-monolithic).
3. **Did I document it?** New rule of thumb: a behaviour change updates the relevant doc; an
   architectural or dependency change also updates `AI_INSTRUCTIONS.md` and adds an ADR under
   `docs/decisions/`.
