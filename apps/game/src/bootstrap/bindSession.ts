/**
 * Connects the session to the interface.
 *
 * Like bindHud and bindAudio, this is a deliberate meeting point: the session
 * emits, the UI renders, and neither imports the other. It owns the panel
 * refresh cadence, the coach mark, the placement banner and the hand-off to
 * the outcome screen.
 */
import {
  ANIMALS,
  LAND_PARCEL_COST,
  BUILDINGS,
  orderPayout,
  orderPremium,
  spotValue,
  getItem,
  storageUsed,
  type BuildingKind,
} from '@farmrise/shared';
import type { Unsubscribe } from '@engine/core/types.js';
import type { AudioSystem } from '@engine/audio/AudioSystem.js';
import { SOUND } from '@assets/audio/soundIds.js';
import { inventoryRows } from '@game/items/InventoryView.js';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';
import type { UiRoot } from '@ui/UiRoot.js';

const BUILD_KINDS: readonly BuildingKind[] = ['barn', 'irrigation', 'road', 'fence'];

export interface SessionBinding {
  readonly unsubscribe: Unsubscribe;
  /** Refreshes both panels. Called whenever the world's money or goods move. */
  readonly refresh: () => void;
}

export function bindSession(
  scene: FarmScene,
  session: SessionController,
  ui: UiRoot,
  audio: AudioSystem,
  onOutcome: () => void,
): SessionBinding {
  const world = scene.world;
  if (!world) throw new Error('bindSession requires a loaded FarmScene.');

  const subscriptions: Unsubscribe[] = [];
  ui.setMenuShortcutsAvailable(true);
  const playUi = (id: string, volume = 0.75) =>
    audio.play(id, { bus: 'ui', volume, detuneJitter: 10 });

  const refresh = (): void => {
    if (ui.market.visible) {
      ui.market.update({
        balance: world.balance,
        rows: inventoryRows(world.inventory),
        storageUsed: storageUsed(world.inventory),
        storageCapacity: world.storageCapacity,
        contracts: session.contracts.map((order) => {
          const held = world.inventory[order.itemId] ?? 0;
          return {
            orderId: String(order.id),
            itemId: order.itemId,
            displayName: getItem(order.itemId)?.displayName ?? order.itemId,
            quantity: order.quantity,
            payout: orderPayout(order),
            spotValue: spotValue(order.itemId, order.quantity),
            premiumPercent: orderPremium(order),
            ticksRemaining: Math.max(0, order.deadlineTick - world.tick),
            held,
            canFulfil: held >= order.quantity,
          };
        }),
      });
    }
    if (ui.build.visible) {
      ui.build.update({
        balance: world.balance,
        options: BUILD_KINDS.map((kind) => ({
          kind,
          affordable: world.balance >= BUILDINGS[kind].buildCost,
        })),
        chickenCost: ANIMALS.chicken.purchaseCost,
        canAffordChicken: world.balance >= ANIMALS.chicken.purchaseCost,
        shelterFree: session.shelterFree(),
        landCost: LAND_PARCEL_COST,
        canAffordLand: session.landAffordable(),
        landAvailable: world.landParcels < 2,
        landProgress: session.landProgress(),
      });
    }
  };

  subscriptions.push(
    session.events.on('session:panel', ({ panel }) => {
      ui.market.setVisible(panel === 'market');
      ui.build.setVisible(panel === 'build');
      ui.setMenuShortcutPanel(panel);
      playUi(panel === 'none' ? SOUND.uiClick : SOUND.uiOpen, panel === 'none' ? 0.6 : 0.8);
      refresh();
    }),
    session.events.on('session:sold', refresh),
    session.events.on('session:refused', () => playUi(SOUND.uiDeny, 0.7)),
    world.events.on('world:balance-changed', refresh),
    world.events.on('world:harvested', refresh),
    world.events.on('world:produce', refresh),

    // --- build placement ------------------------------------------------
    session.placement.events.on('placement:started', ({ kind }) => {
      ui.setPlacing(`Placing ${BUILDINGS[kind].displayName} — click to build, Esc to cancel`);
      scene.setPlacementPreview(kind, 0, 0, true);
      playUi(SOUND.uiOpen, 0.7);
    }),
    session.placement.events.on('placement:moved', ({ kind, tileX, tileZ, valid }) => {
      scene.setPlacementPreview(kind, tileX, tileZ, valid);
      ui.setPlacing(
        valid
          ? `Placing ${BUILDINGS[kind].displayName} — click to build, Esc to cancel`
          : `Cannot build here — move the cursor, Esc to cancel`,
        !valid,
      );
    }),
    session.placement.events.on('placement:placed', () => {
      ui.setPlacing(null);
      scene.setPlacementPreview(null);
      refresh();
    }),
    session.placement.events.on('placement:cancelled', () => {
      ui.setPlacing(null);
      scene.setPlacementPreview(null);
    }),
    session.placement.events.on('placement:refused', ({ reason }) => {
      playUi(SOUND.uiDeny, 0.7);
      ui.hud.toast(reason, 'warn');
    }),

    // --- onboarding ------------------------------------------------------
    session.onboarding.events.on('onboarding:beat', ({ beat }) => {
      ui.coach.show(beat, () => session.skipOnboarding());
      playUi(SOUND.uiOpen, 0.5);
    }),
    session.onboarding.events.on('onboarding:hint', ({ beat }) => {
      // The hint replaces the beat's body in place rather than adding a
      // second prompt, so prompts can never stack.
      ui.coach.show({ ...beat, body: beat.hint?.body ?? beat.body }, () =>
        session.skipOnboarding(),
      );
    }),
    session.onboarding.events.on('onboarding:beat-complete', () => playUi(SOUND.uiConfirm, 0.5)),
    session.onboarding.events.on('onboarding:complete', () => {
      ui.coach.hide();
      refresh();
    }),
    session.onboarding.events.on('onboarding:skipped', ({ reason }) => {
      if (reason === 'player') ui.coach.hide();
    }),

    // --- outcome ----------------------------------------------------------
    session.events.on('session:outcome', ({ summary }) => {
      ui.outcome.present(summary);
      audio.play(summary.outcome === 'expanded' ? SOUND.runSuccess : SOUND.runFail, {
        bus: 'ui',
        volume: 0.9,
      });
      onOutcome();
    }),
  );

  refresh();

  return {
    refresh,
    unsubscribe: () => {
      for (const unsubscribe of subscriptions) unsubscribe();
      ui.coach.hide();
      ui.setPlacing(null);
      ui.market.setVisible(false);
      ui.build.setVisible(false);
      ui.setMenuShortcutPanel('none');
      ui.setMenuShortcutsAvailable(false);
    },
  };
}
