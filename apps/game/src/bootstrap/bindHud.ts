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
  ESTATE_PARCELS,
  SEASON_DEFINITIONS,
  getCrop,
  getIncident,
  getItem,
  incidentPhase,
  isMitigated,
  itemNameForQuantity,
  storageUsed,
  type Cents,
} from '@farmrise/shared';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';
import type { Hud } from '@ui/hud/Hud.js';
import type { Unsubscribe } from '@engine/core/types.js';
import type { GameLocalization } from '@ui/i18n/gameI18n.js';
import { createEnglishLocalization } from '@ui/i18n/gameI18n.js';
import { localizeGameText } from '@ui/i18n/gameText.js';
import {
  buildingName,
  cropName,
  domainText,
  incidentName,
  itemName,
  seasonName,
} from '@ui/i18n/domainText.js';

export function bindHud(
  scene: FarmScene,
  hud: Hud,
  session: SessionController,
  i18n: GameLocalization,
): Unsubscribe {
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
  let promptState: readonly [string | null, string | null, string | null] = [null, null, null];

  const showPrompt = (): void => {
    hud.setPrompt(
      localizeGameText(i18n, promptState[0]),
      localizeGameText(i18n, promptState[1]),
      localizeGameText(i18n, promptState[2]),
    );
  };

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
      label: incidentName(i18n, definition.id, definition.displayName),
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
      selectedCrop: (() => {
        const crop = getCrop(interaction.selectedCropId);
        return cropName(
          i18n,
          interaction.selectedCropId,
          crop?.displayName ?? interaction.selectedCropId,
        );
      })(),
      readyPlots: world.readyPlotIds().length,
      warning: warningSnapshot(),
      // The HUD only shows what onboarding has revealed. Once onboarding
      // finishes, isRevealed returns true for everything.
      revealed: session.onboarding.revealed,
      objectiveProgress: session.milestoneProgress(),
      objectiveLabel: milestone
        ? domainText(i18n, 'milestone', milestone.id, 'name', milestone.displayName)
        : i18n.t('objective.runEstate', undefined, 'Run the estate'),
      objectiveReady,
      carry: { units: world.carry.used, capacity: world.carry.capacity },
      // Season is hidden until the first boundary is crossed, so a first-time
      // player is not asked to care about a calendar they have not met.
      season:
        career.statistics.seasonsCompleted > 0
          ? seasonName(i18n, career.season, SEASON_DEFINITIONS[career.season].displayName)
          : null,
    });
  };

  unsubscribes.push(
    world.events.on('world:harvested', ({ itemId, quantity, carried }) => {
      const left = quantity - carried;
      const item = getItem(itemId);
      hud.toast(
        i18n.t('toast.harvested', {
          quantity: i18n.formatNumber(quantity),
          item: itemName(i18n, itemId, item?.displayName ?? itemId),
          left: left > 0 ? i18n.t('toast.harvestLeft', { quantity: i18n.formatNumber(left) }) : '',
        }),
      );
      render();
    }),
    career.events.on('career:balance-changed', render),
    world.events.on('world:carry-changed', render),
    world.events.on('world:storage-full', ({ itemId }) => {
      const item = getItem(itemId);
      hud.toast(
        i18n.t('toast.storageFull', {
          item: itemName(i18n, itemId, item?.displayName ?? itemId),
        }),
        'warn',
      );
    }),
    world.events.on('world:goods-spoiled', ({ items, emptied, inTheOpen }) => {
      if (!emptied || !inTheOpen) return;
      const lost = Object.entries(items)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => {
          const item = getItem(itemId);
          return `${i18n.formatNumber(quantity)} ${itemName(
            i18n,
            itemId,
            item?.displayName ?? itemId,
          )}`;
        })
        .join(', ');
      hud.toast(i18n.t('toast.fieldPileGone', { items: lost || i18n.t('toast.produce') }), 'warn');
      render();
    }),
    world.events.on('world:building-completed', ({ kind }) =>
      hud.toast(
        i18n.t('toast.buildingFinished', {
          building: buildingName(i18n, kind, kind),
        }),
      ),
    ),
    world.events.on('world:produce', ({ itemId, quantity }) => {
      const item = getItem(itemId);
      hud.toast(
        i18n.t('toast.productReady', {
          quantity: i18n.formatNumber(quantity),
          item: itemName(i18n, itemId, item?.displayName ?? itemId),
        }),
      );
    }),
    world.events.on('world:stack-collected', ({ items }) => {
      for (const [itemId, quantity] of Object.entries(items)) {
        const item = getItem(itemId);
        if (quantity <= 0 || item?.category !== 'animal_product') continue;
        hud.toast(
          i18n.t('toast.pickedUpProduct', {
            quantity: i18n.formatNumber(quantity),
            item: itemName(i18n, itemId, item.displayName),
          }),
        );
      }
      render();
    }),
    world.events.on('world:animal-purchased', ({ species, count }) => {
      const definition = ANIMALS[species];
      const name = animalCountName(i18n, species, count);
      const feedDefinition = getItem(definition.feedItemId);
      const productDefinition = getItem(definition.producesItemId);
      const feed = itemName(
        i18n,
        definition.feedItemId,
        feedDefinition?.displayName ?? definition.feedItemId,
      );
      const product = itemName(
        i18n,
        definition.producesItemId,
        productDefinition?.displayName ?? definition.producesItemId,
      );
      hud.toast(
        i18n.t('toast.animalAdded', {
          count: i18n.formatNumber(count),
          animal: name,
          feedQuantity: i18n.formatNumber(definition.feedPerCycle * count),
          feed,
          product,
        }),
      );
      render();
    }),
    world.events.on('world:animal-hungry', ({ species, feedItemId, needed, available }) => {
      const definition = ANIMALS[species];
      const productDefinition = getItem(definition.producesItemId);
      const feedDefinition = getItem(feedItemId);
      hud.toast(
        i18n.t('toast.animalHungry', {
          animals: animalCountName(i18n, species, 2),
          needed: i18n.formatNumber(needed),
          feed: itemName(i18n, feedItemId, feedDefinition?.displayName ?? feedItemId),
          product: itemName(
            i18n,
            definition.producesItemId,
            productDefinition?.displayName ?? i18n.t('toast.produce'),
          ),
          available: i18n.formatNumber(available),
        }),
        'warn',
      );
    }),
    world.events.on('world:animal-lost', ({ species, count, remaining }) => {
      hud.toast(
        i18n.t('toast.animalLost', {
          count: i18n.formatNumber(count),
          animal: animalCountName(i18n, species, count),
          remaining: i18n.formatNumber(remaining),
        }),
        'error',
      );
      render();
    }),
    world.events.on('world:parcel-acquired', ({ displayName, bedCount }) => {
      const parcel = ESTATE_PARCELS.find((candidate) => candidate.displayName === displayName);
      hud.toast(
        i18n.t('toast.parcelAcquired', {
          land: parcel ? domainText(i18n, 'parcel', parcel.id, 'name', displayName) : displayName,
          count: bedCount,
        }),
      );
      render();
    }),

    interaction.events.on('interaction:prompt', ({ label, secondaryLabel, notice }) => {
      promptState = [label, secondaryLabel, notice];
      showPrompt();
    }),
    interaction.events.on('interaction:refused', ({ reason }) =>
      hud.toast(localizeGameText(i18n, reason) ?? reason, 'warn'),
    ),
    interaction.events.on('interaction:crop-selected', render),
    interaction.events.on('interaction:performed', render),

    // --- incidents ---------------------------------------------------------
    incidents.events.on('incident:warned', ({ instance, definition }) => {
      void instance;
      hud.toast(
        domainText(i18n, 'incident', definition.id, 'warning', definition.warningText),
        'warn',
      );
      render();
    }),
    incidents.events.on('incident:impact', ({ definition }) => {
      hud.toast(
        domainText(i18n, 'incident', definition.id, 'impact', definition.impactText),
        'error',
      );
      render();
    }),
    incidents.events.on('incident:resolved', ({ definition, mitigated, reimbursed }) => {
      const recovery = domainText(
        i18n,
        'incident',
        definition.id,
        'recovery',
        definition.recoveryText,
      );
      hud.toast(
        mitigated ? i18n.t('toast.incidentMitigated', { recovery }) : recovery,
        mitigated ? 'info' : 'warn',
      );
      if (reimbursed > 0) {
        hud.toast(i18n.t('toast.insurancePaid', { amount: i18n.formatCents(reimbursed as Cents) }));
      }
      render();
    }),
    incidents.events.on('incident:response-progressed', render),

    // --- career ------------------------------------------------------------
    careerDirector.events.on('career:milestone-ready', ({ milestone }) => {
      objectiveReady = true;
      hud.toast(
        i18n.t('toast.milestoneReady', {
          milestone: domainText(i18n, 'milestone', milestone.id, 'name', milestone.displayName),
        }),
      );
      render();
    }),
    careerDirector.events.on('career:milestone-claimed', ({ milestone }) => {
      objectiveReady = false;
      hud.toast(domainText(i18n, 'milestone', milestone.id, 'summary', milestone.summary));
      hud.toast(
        domainText(i18n, 'milestone', milestone.id, 'problem', milestone.newProblem),
        'warn',
      );
      render();
    }),
    careerDirector.events.on('career:season-review', ({ date, advice }) => {
      hud.toast(
        i18n.t('toast.seasonDate', {
          season: seasonName(i18n, date.season, SEASON_DEFINITIONS[date.season].displayName),
          year: i18n.formatNumber(date.year),
        }),
      );
      hud.toast(advice);
      render();
    }),
    careerDirector.events.on('career:contract-failed', () =>
      hud.toast(i18n.t('toast.contractFailed'), 'error'),
    ),
    careerDirector.events.on('career:project-completed', ({ displayName }) =>
      hud.toast(i18n.t('toast.projectComplete', { project: displayName })),
    ),
    careerDirector.events.on('career:warning', ({ message }) => hud.toast(message, 'warn')),
    careerDirector.events.on('career:restructured', ({ explanation }) => {
      hud.toast(explanation, 'error');
      render();
    }),
    career.events.on('career:town-grew', ({ displayName }) =>
      hud.toast(i18n.t('toast.townGrew', { stage: displayName.toLowerCase() })),
    ),
    career.events.on('career:unlocked', ({ unlocks }) => {
      if (unlocks.length > 0) hud.toast(i18n.t('toast.unlocked'));
      render();
    }),

    // Session-level feedback. Every refusal reaches the player as words,
    // because a silently ignored key press is the single most common reason
    // a new player concludes a game is broken.
    session.events.on('session:refused', ({ reason }) =>
      hud.toast(localizeGameText(i18n, reason) ?? reason, 'warn'),
    ),
    session.events.on('session:sold', ({ quantity, itemId, payout, viaContract }) => {
      hud.toast(saleToastMessage(itemId, quantity, payout, career.balance, viaContract, i18n));
      for (const definition of Object.values(ANIMALS)) {
        if (definition.feedItemId !== itemId) continue;
        const count = world.livestock.countOf(definition.id);
        const available = world.stores.storedTotalOf(itemId);
        const needed = count * definition.feedPerCycle;
        if (count > 0 && available < needed) {
          const feedDefinition = getItem(itemId);
          const productDefinition = getItem(definition.producesItemId);
          hud.toast(
            i18n.t('toast.feedWarning', {
              count: i18n.formatNumber(count),
              animal: animalCountName(i18n, definition.id, count),
              needed: i18n.formatNumber(needed),
              feed: itemName(i18n, itemId, feedDefinition?.displayName ?? itemId),
              product: itemName(
                i18n,
                definition.producesItemId,
                productDefinition?.displayName ?? definition.producesItemId,
              ),
            }),
            'warn',
          );
        }
      }
      render();
    }),
    session.events.on('session:hauled', ({ stored, refused }) => {
      if (stored > 0) {
        hud.toast(
          i18n.t('toast.stored', {
            stored: i18n.formatNumber(stored),
            refused:
              refused > 0
                ? i18n.t('toast.storedRefused', {
                    refused: i18n.formatNumber(refused),
                  })
                : '',
          }),
        );
      }
      render();
    }),
    session.events.on('session:responded', () => {
      hud.toast(i18n.t('toast.responding'));
      render();
    }),
    world.events.on('world:building-placed', ({ kind }) => {
      hud.toast(
        i18n.t('toast.buildingStarted', {
          building: buildingName(i18n, kind, kind),
        }),
      );
      render();
    }),
    session.onboarding.events.on('onboarding:revealed', render),
    i18n.onChange(() => {
      render();
      showPrompt();
    }),
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
  i18n: GameLocalization = createEnglishLocalization(),
): string {
  return i18n.t('toast.sale', {
    payout: i18n.formatCents(payout),
    quantity: i18n.formatNumber(quantity),
    item: i18n.t(
      `domain.item.${itemId}.name`,
      { count: quantity },
      itemNameForQuantity(itemId, quantity),
    ),
    contract: viaContract ? i18n.t('toast.onContract') : '',
    balance: i18n.formatCents(balance),
  });
}

function animalCountName(
  i18n: GameLocalization,
  species: keyof typeof ANIMALS,
  count: number,
): string {
  const fallback =
    species === 'chicken'
      ? count === 1
        ? 'hen'
        : 'hens'
      : species === 'sheep'
        ? 'sheep'
        : count === 1
          ? 'cow'
          : 'cows';
  return i18n.t(`domain.animal.${species}.name`, { count }, fallback);
}
