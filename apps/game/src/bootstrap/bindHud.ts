/**
 * Connects the simulation's events to the HUD.
 *
 * This binder is the deliberate meeting point of `game/` and `ui/`. Game code
 * emits events and knows nothing about the DOM; the HUD renders and knows
 * nothing about farms. Both directions of that ignorance are what let each be
 * tested on its own, and this file pays the small cost of joining them.
 */
import {
  ANIMALS,
  SEASON_DEFINITIONS,
  formatCents,
  formatItemQuantity,
  getCrop,
  getIncident,
  getItem,
  incidentPhase,
  isMitigated,
  storageUsed,
  type Cents,
} from '@farmrise/shared';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';
import type { Hud } from '@ui/hud/Hud.js';
import type { Unsubscribe } from '@engine/core/types.js';

export function bindHud(scene: FarmScene, hud: Hud, session: SessionController): Unsubscribe {
  const career = scene.career;
  const world = scene.world;
  const interaction = scene.interaction;
  const incidents = scene.incidents;
  const careerDirector = scene.careerDirector;
  if (!career || !world || !interaction || !incidents || !careerDirector) {
    throw new Error('bindHud requires a loaded FarmScene.');
  }

  const unsubscribes: Unsubscribe[] = [];
  let objectiveReady = false;

  const warningSnapshot = (): {
    label: string;
    phase: 'warning' | 'active';
    ticksRemaining: number;
    preventCost: Cents | null;
  } | null => {
    const urgent = incidents.mostUrgent;
    if (!urgent) return null;
    const definition = getIncident(urgent.definitionId);
    if (!definition) return null;
    const phase = incidentPhase(urgent as never, career.tick);
    if (phase === 'over') return null;
    const pay = definition.responses.find((response) => response.kind === 'pay');
    const canPay =
      phase === 'warning' &&
      !isMitigated(urgent as never) &&
      (!urgent.responseKind || urgent.responseKind === 'pay');
    return {
      label: definition.displayName,
      phase,
      ticksRemaining: Math.max(
        0,
        (phase === 'warning' ? urgent.impactTick : urgent.endsTick) - career.tick,
      ),
      preventCost: canPay && pay ? pay.cost : null,
    };
  };

  const render = (): void => {
    const milestone = career.milestone();
    hud.render({
      balance: career.balance,
      storageUsed: storageUsed(world.storedInventory),
      storageCapacity: world.storageCapacity,
      selectedCrop: getCrop(interaction.selectedCropId)?.displayName ?? interaction.selectedCropId,
      readyPlots: world.readyPlotIds().length,
      warning: warningSnapshot(),
      // The HUD only shows what onboarding has revealed. Once onboarding
      // finishes, isRevealed returns true for everything.
      revealed: session.onboarding.revealed,
      objectiveProgress: session.milestoneProgress(),
      objectiveLabel: milestone?.displayName ?? 'Run the estate',
      objectiveReady,
      carry: { units: world.carry.used, capacity: world.carry.capacity },
      // Season is hidden until the first boundary is crossed, so a first-time
      // player is not asked to care about a calendar they have not met.
      season:
        career.statistics.seasonsCompleted > 0
          ? SEASON_DEFINITIONS[career.season].displayName
          : null,
    });
  };

  unsubscribes.push(
    world.events.on('world:harvested', ({ itemId, quantity, carried }) => {
      const left = quantity - carried;
      hud.toast(
        `Harvested ${quantity} ${itemId}${left > 0 ? ` (${left} left in the field - hands full)` : ''}`,
      );
      render();
    }),
    career.events.on('career:balance-changed', render),
    world.events.on('world:carry-changed', render),
    world.events.on('world:storage-full', ({ itemId }) =>
      hud.toast(`Storage is full - ${itemId} is going to waste. Build a barn.`, 'warn'),
    ),
    world.events.on('world:goods-spoiled', ({ items, emptied, inTheOpen }) => {
      if (!emptied || !inTheOpen) return;
      const lost = Object.entries(items)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => formatItemQuantity(itemId, quantity))
        .join(', ');
      hud.toast(`Field pile gone: ${lost || 'produce'} spoiled in the field.`, 'warn');
      render();
    }),
    world.events.on('world:building-completed', ({ kind }) => hud.toast(`${kind} finished`)),
    world.events.on('world:produce', ({ itemId, quantity }) =>
      hud.toast(`${quantity} ${getItem(itemId)?.displayName ?? itemId} ready by the shelter`),
    ),
    world.events.on('world:stack-collected', ({ items }) => {
      for (const [itemId, quantity] of Object.entries(items)) {
        const item = getItem(itemId);
        if (quantity <= 0 || item?.category !== 'animal_product') continue;
        hud.toast(`Picked up ${formatItemQuantity(itemId, quantity)}. Open Market to sell them.`);
      }
      render();
    }),
    world.events.on('world:animal-purchased', ({ species, count }) => {
      const definition = ANIMALS[species];
      const name = animalName(species, count);
      const feed = getItem(definition.feedItemId)?.displayName ?? definition.feedItemId;
      const product = getItem(definition.producesItemId)?.displayName ?? definition.producesItemId;
      hud.toast(
        `${count} ${name} added. Store ${definition.feedPerCycle * count} ${feed} each cycle to produce ${product}.`,
      );
      render();
    }),
    world.events.on('world:animal-hungry', ({ species, feedItemId, needed, available }) => {
      const animals = species === 'chicken' ? 'Hens' : 'Cows';
      const product = getItem(ANIMALS[species].producesItemId)?.displayName ?? 'produce';
      const feed = getItem(feedItemId)?.displayName ?? feedItemId;
      hud.toast(
        `${animals} need ${needed} ${feed} to make ${product}; only ${available} is stored.`,
        'warn',
      );
    }),
    world.events.on('world:animal-lost', ({ species, count, remaining }) => {
      const name = animalName(species, count);
      hud.toast(`A fox took ${count} ${name}. ${remaining} remain.`, 'error');
      render();
    }),
    world.events.on('world:parcel-acquired', ({ displayName, bedCount }) => {
      hud.toast(
        `${displayName} is yours. ${bedCount} new crop ${bedCount === 1 ? 'bed is' : 'beds are'} ready.`,
      );
      render();
    }),

    interaction.events.on('interaction:prompt', ({ label, secondaryLabel, notice }) =>
      hud.setPrompt(label, secondaryLabel, notice),
    ),
    interaction.events.on('interaction:refused', ({ reason }) => hud.toast(reason, 'warn')),
    interaction.events.on('interaction:crop-selected', render),
    interaction.events.on('interaction:performed', render),

    // --- incidents ---------------------------------------------------------
    incidents.events.on('incident:warned', ({ instance, definition }) => {
      void instance;
      hud.toast(definition.warningText, 'warn');
      render();
    }),
    incidents.events.on('incident:impact', ({ definition }) => {
      hud.toast(definition.impactText, 'error');
      render();
    }),
    incidents.events.on('incident:resolved', ({ definition, mitigated, reimbursed }) => {
      hud.toast(
        mitigated ? `${definition.recoveryText} Your response held.` : definition.recoveryText,
        mitigated ? 'info' : 'warn',
      );
      if (reimbursed > 0) hud.toast(`Insurance paid ${formatCents(reimbursed as Cents)}.`);
      render();
    }),
    incidents.events.on('incident:response-progressed', render),

    // --- career ------------------------------------------------------------
    careerDirector.events.on('career:milestone-ready', ({ milestone }) => {
      objectiveReady = true;
      hud.toast(`${milestone.displayName} - the farm is ready for it.`);
      render();
    }),
    careerDirector.events.on('career:milestone-claimed', ({ milestone }) => {
      objectiveReady = false;
      hud.toast(milestone.summary);
      hud.toast(milestone.newProblem, 'warn');
      render();
    }),
    careerDirector.events.on('career:season-review', ({ date, advice }) => {
      hud.toast(`${date.season[0]?.toUpperCase()}${date.season.slice(1)}, year ${date.year}.`);
      hud.toast(advice);
      render();
    }),
    careerDirector.events.on('career:contract-failed', () =>
      hud.toast('A contract went undelivered. That buyer will remember.', 'error'),
    ),
    careerDirector.events.on('career:project-completed', ({ displayName }) =>
      hud.toast(`Millbrook finished the ${displayName}.`),
    ),
    careerDirector.events.on('career:warning', ({ message }) => hud.toast(message, 'warn')),
    careerDirector.events.on('career:restructured', ({ explanation }) => {
      hud.toast(explanation, 'error');
      render();
    }),
    career.events.on('career:town-grew', ({ displayName }) =>
      hud.toast(`Millbrook is now a ${displayName.toLowerCase()}.`),
    ),
    career.events.on('career:unlocked', ({ unlocks }) => {
      if (unlocks.length > 0) hud.toast('Something new is available on the farm.');
      render();
    }),

    // Session-level feedback. Every refusal reaches the player as words,
    // because a silently ignored key press is the single most common reason
    // a new player concludes a game is broken.
    session.events.on('session:refused', ({ reason }) => hud.toast(reason, 'warn')),
    session.events.on('session:sold', ({ quantity, itemId, payout, viaContract }) => {
      hud.toast(saleToastMessage(itemId, quantity, payout, career.balance, viaContract));
      for (const definition of Object.values(ANIMALS)) {
        if (definition.feedItemId !== itemId) continue;
        const count = world.livestock.countOf(definition.id);
        const available = world.stores.storedTotalOf(itemId);
        const needed = count * definition.feedPerCycle;
        if (count > 0 && available < needed) {
          const product =
            getItem(definition.producesItemId)?.displayName ?? definition.producesItemId;
          hud.toast(
            `${count} ${animalName(definition.id, count)} need ${needed} ${getItem(itemId)?.displayName ?? itemId} stored before they can produce ${product}.`,
            'warn',
          );
        }
      }
      render();
    }),
    session.events.on('session:hauled', ({ stored, refused }) => {
      if (stored > 0)
        hud.toast(`Stored ${stored}${refused > 0 ? `, ${refused} would not fit` : ''}`);
      render();
    }),
    session.events.on('session:responded', () => {
      hud.toast('You are dealing with it.');
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
  const interval = setInterval(render, 250);

  render();

  return () => {
    clearInterval(interval);
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

/** Explicitly confirms both the payout and the resulting wallet balance. */
export function saleToastMessage(
  itemId: string,
  quantity: number,
  payout: Cents,
  balance: Cents,
  viaContract: boolean,
): string {
  return `Paid ${formatCents(payout)} for ${formatItemQuantity(itemId, quantity)}${viaContract ? ' on contract' : ''}. Balance ${formatCents(balance)}.`;
}

function animalName(species: keyof typeof ANIMALS, count: number): string {
  if (species === 'chicken') return count === 1 ? 'hen' : 'hens';
  return count === 1 ? 'cow' : 'cows';
}
