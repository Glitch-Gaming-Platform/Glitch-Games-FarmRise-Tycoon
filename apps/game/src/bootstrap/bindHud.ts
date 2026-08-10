/**
 * Connects the simulation's events to the HUD.
 *
 * This binder is the deliberate meeting point of `game/` and `ui/`. Game code
 * emits events and knows nothing about the DOM; the HUD renders and knows
 * nothing about farms. Both directions of that ignorance are what let each be
 * tested on its own, and this file pays the small cost of joining them.
 */
import { FARM_EVENTS, formatCents, getCrop, storageUsed, type Cents } from '@farmrise/shared';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';
import type { Hud } from '@ui/hud/Hud.js';
import type { Unsubscribe } from '@engine/core/types.js';

export function bindHud(scene: FarmScene, hud: Hud, session: SessionController): Unsubscribe {
  const world = scene.world;
  const interaction = scene.interaction;
  const eventDirector = scene.eventDirector;
  if (!world || !interaction || !eventDirector) {
    throw new Error('bindHud requires a loaded FarmScene.');
  }

  const unsubscribes: Unsubscribe[] = [];
  let warning: { label: string; ticksRemaining: number; preventCost: Cents | null } | null = null;

  const render = (): void => {
    hud.render({
      balance: world.balance,
      storageUsed: storageUsed(world.inventory),
      storageCapacity: world.storageCapacity,
      selectedCrop: getCrop(interaction.selectedCropId)?.displayName ?? interaction.selectedCropId,
      readyPlots: world.readyPlotIds().length,
      warning,
      // The HUD only shows what onboarding has revealed. Once onboarding
      // finishes, isRevealed returns true for everything.
      revealed: session.onboarding.revealed,
      landProgress: session.landProgress(),
      landAffordable: session.landAffordable(),
    });
  };

  unsubscribes.push(
    world.events.on('world:harvested', ({ itemId, quantity, spilled }) => {
      hud.toast(
        `Harvested ${quantity} ${itemId}${spilled > 0 ? ` (${spilled} spoiled - no space)` : ''}`,
      );
      render();
    }),
    world.events.on('world:balance-changed', render),
    world.events.on('world:storage-full', ({ itemId }) =>
      hud.toast(`Storage is full - ${itemId} is going to waste. Build a barn.`, 'warn'),
    ),
    world.events.on('world:building-completed', ({ kind }) => hud.toast(`${kind} finished`)),
    world.events.on('world:produce', ({ itemId, quantity }) =>
      hud.toast(`Collected ${quantity} ${itemId}`),
    ),

    interaction.events.on('interaction:prompt', ({ label }) => hud.setPrompt(label)),
    interaction.events.on('interaction:refused', ({ reason }) => hud.toast(reason, 'warn')),
    interaction.events.on('interaction:crop-selected', render),
    interaction.events.on('interaction:performed', render),

    eventDirector.events.on('event:warned', ({ message, ticksUntilImpact, kind }) => {
      warning = {
        label: kind === 'drought' ? 'Drought' : 'Foxes',
        ticksRemaining: ticksUntilImpact,
        preventCost: FARM_EVENTS[kind].preventionCost,
      };
      hud.toast(message, 'warn');
      render();
    }),
    eventDirector.events.on('event:started', ({ kind, mitigated }) => {
      hud.toast(
        mitigated ? `${kind} hit, but your countermeasures held.` : `${kind} is damaging the farm!`,
        mitigated ? 'info' : 'error',
      );
    }),
    eventDirector.events.on('event:ended', () => {
      warning = null;
      render();
    }),
    eventDirector.events.on('event:mitigated', ({ kind }) => {
      if (warning) warning.preventCost = null;
      hud.toast(`Countermeasures in place for the ${kind}.`);
      render();
    }),

    // Session-level feedback. Every refusal reaches the player as words,
    // because a silently ignored key press is the single most common reason
    // a new player concludes a game is broken.
    session.events.on('session:refused', ({ reason }) => hud.toast(reason, 'warn')),
    session.events.on('session:sold', ({ quantity, itemId, payout, viaContract }) => {
      hud.toast(
        `Sold ${quantity} ${itemId} for ${formatCents(payout)}${viaContract ? ' on contract' : ''}`,
      );
      render();
    }),
    session.events.on('session:prevented', ({ cost }) =>
      hud.toast(`Countermeasures paid for: ${formatCents(cost)}`),
    ),
    world.events.on('world:land-purchased', () => {
      hud.toast('The field next door is yours.');
      render();
    }),
    world.events.on('world:building-placed', ({ kind }) => {
      hud.toast(`${kind} under construction`);
      render();
    }),
    session.onboarding.events.on('onboarding:revealed', render),
  );

  // A low-frequency tick keeps the countdown and money readable without
  // rebuilding DOM every frame.
  const interval = setInterval(() => {
    if (warning) warning.ticksRemaining = Math.max(0, warning.ticksRemaining - 15);
    render();
  }, 250);

  render();

  return () => {
    clearInterval(interval);
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
