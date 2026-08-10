# Adding a feature

Worked examples. Each one ends with the same three questions: what did you add, what did you test,
what did you document.

Before any of them, the scope rule from the design blueprint:

> Every new crop, animal, building or event must introduce a distinct economic, spatial, timing or
> risk decision rather than only adding visual variety.

If your addition does not change a decision, it is content, not a feature, and it can wait.

---

## 1. A new crop

**Where:** `packages/shared/src/domain/crops.ts` — and nowhere else, if you do it right.

```ts
strawberry: {
  id: asCropId('strawberry'),
  displayName: 'Strawberry',
  seedCost: cents(450),
  baseUnitPrice: cents(150),
  baseYield: 7,
  growthTicks: secondsToTicks(150),
  waterPerDay: 4,        // thirstier than corn: irrigation matters more
  diseaseRisk: 0.09,
  tendActions: 3,        // high labour, so it competes for player time
},
```

Because `CROP_IDS`, the save schema's crop enum, the item registry, the HUD crop cycle and the
market's item pool are all derived from this object, nothing else needs to change.

**Test:** add a case to `packages/shared/tests/growth.test.ts`. Confirm the save schema still
rejects unknown crops (already covered) and that `CROP_IDS` includes yours.

**Document:** if it changes the balance story, say so in the design blueprint. Otherwise no doc
change is needed — the definition is self-documenting.

---

## 2. A new building

**Where:** `packages/shared/src/domain/buildings.ts`, plus wherever its *effect* lives.

1. Add the definition (cost, build time, footprint, upkeep, description).
2. Implement the effect where it belongs:
   - storage → `rules/storage.ts`
   - movement → the tile flag in `FarmWorld.#applyBuildingToGrid`
   - crop behaviour → `FarmWorld.#refreshIrrigation` or an equivalent
   - event mitigation → `EventDirector.#autoMitigated`
3. Give it a mesh in `world/view/StructureView.ts` and a material in `world/view/materials.ts`.

**Watch:** `placedBuildingSchema` in `schemas/save.ts` has a literal `z.enum([...])` of building
kinds. Add yours there or saves containing it will be rejected. This is deliberate — the wire format
must be explicit — but it is the one place a new building needs a second edit.

**Test:** `apps/game/tests/unit/farmWorld.test.ts` — cost charged, tiles reserved, effect only after
construction completes, upkeep charged.

---

## 3. A new farm event

**Where:** `packages/shared/src/domain/events.ts` and `apps/game/src/game/events/EventDirector.ts`.

Every event must honour the contract, or it violates the Recoverable Disruption pillar:

1. A warning fires `warningTicks` before impact.
2. The player can pay to prevent, act to mitigate, or accept the loss.
3. Damage lands on named assets, visibly.

```ts
hailstorm: {
  id: 'hailstorm',
  warningTicks: secondsToTicks(35),
  durationTicks: secondsToTicks(60),
  preventionCost: cents(900),
  unmitigatedMultiplier: 0.5,
  mitigatedMultiplier: 0.9,
  targets: 'crops',
  warningText: 'Hail forecast. Mature crops are most exposed.',
},
```

Then extend `#pickTargets` and `#autoMitigated` for the new kind, and add a HUD label in
`bootstrap/bindHud.ts`.

**Test:** `apps/game/tests/integration/farmSession.test.ts` already asserts *every* `started` is
preceded by a `warned` — your event is covered by that the moment it can fire. Add a case for its
specific mitigation.

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
