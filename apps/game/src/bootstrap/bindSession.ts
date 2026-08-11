/**
 * Connects the session to the interface.
 *
 * Like bindHud and bindAudio, this is a deliberate meeting point: the session
 * emits, the UI renders, and neither imports the other. It owns the panel
 * refresh cadence, the coach mark, the placement banner and the season review.
 *
 * The build menu is filtered by career unlocks rather than by a fixed list, so
 * a structure appears the moment the milestone that teaches it is claimed -
 * which is the progressive-disclosure rule from
 * docs/PROGRESSION_GAMEPLAY_PLAN.md §21 expressed in one line of code.
 */
import {
  BUILDINGS,
  BUILDING_KINDS,
  CARRIERS,
  COMMUNITY_PROJECTS_BY_ID,
  INSURANCE_POLICIES,
  LOAN_OFFERS,
  PROCESSORS,
  SPECIALIZATIONS,
  STAGE_NAMES,
  WORKER_ROLES,
  availableProjects,
  batchMargin,
  cents,
  formatCents,
  formatTicks,
  getItem,
  milestoneProgress as milestoneRequirementProgress,
  nextParcelFor,
  landProgress as landProgressOf,
  purchasableAnimals,
  recipesFor,
  storageUsed,
  townStageFor,
  type BuildingKind,
  type ProcessorKind,
} from '@farmrise/shared';
import type { Unsubscribe } from '@engine/core/types.js';
import type { AudioSystem } from '@engine/audio/AudioSystem.js';
import { SOUND } from '@assets/audio/soundIds.js';
import { inventoryRows } from '@game/items/InventoryView.js';
import { buildCostFor, spotQuote } from '@game/world/FarmCommands.js';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';
import type { UiRoot } from '@ui/UiRoot.js';

export interface SessionBinding {
  readonly unsubscribe: Unsubscribe;
  /** Refreshes both panels. Called whenever the career's money or goods move. */
  readonly refresh: () => void;
}

export function bindSession(
  scene: FarmScene,
  session: SessionController,
  ui: UiRoot,
  audio: AudioSystem,
  onSeasonReview: () => void,
): SessionBinding {
  const career = scene.career;
  const careerDirector = scene.careerDirector;
  if (!career || !careerDirector) throw new Error('bindSession requires a loaded FarmScene.');
  const world = career.world;

  const subscriptions: Unsubscribe[] = [];
  const touch = ui.touchControls !== null;
  ui.setMenuShortcutsAvailable(true);
  const playUi = (id: string, volume = 0.75) =>
    audio.play(id, { bus: 'ui', volume, detuneJitter: 10 });

  const refresh = (): void => {
    if (ui.market.visible) {
      // Two kinds of row share the panel: offers you could take, and promises
      // you have already made. Accepted contracts come first because they are
      // the ones with a clock running.
      const accepted = career.contracts
        .filter((contract) => contract.status === 'open')
        .map((contract) => {
          const held = world.stores.totalOf(contract.itemId);
          const outstanding = contract.quantity - contract.delivered;
          const spotValue = cents((getItem(contract.itemId)?.spotUnitPrice ?? 0) * outstanding);
          const payout = cents(contract.unitPrice * outstanding);
          return {
            action: 'deliver' as const,
            orderId: contract.id,
            itemId: contract.itemId,
            displayName: `${getItem(contract.itemId)?.displayName ?? contract.itemId} — deliver`,
            quantity: outstanding,
            payout,
            spotValue,
            premiumPercent: spotValue > 0 ? (payout - spotValue) / spotValue : 0,
            ticksRemaining: Math.max(0, contract.deadlineTick - career.tick),
            held,
            canFulfil: held > 0,
          };
        });

      const offers = session.contracts.map((entry) => {
        const held = world.stores.totalOf(entry.offer.itemId);
        const payout = cents(entry.offer.unitPrice * entry.offer.quantity);
        return {
          action: 'accept' as const,
          orderId: entry.offer.id,
          itemId: entry.offer.itemId,
          displayName: `${getItem(entry.offer.itemId)?.displayName ?? entry.offer.itemId} — ${entry.buyer.displayName}`,
          quantity: entry.offer.quantity,
          payout,
          spotValue: entry.spotValue,
          premiumPercent: entry.spotValue > 0 ? (payout - entry.spotValue) / entry.spotValue : 0,
          ticksRemaining: Math.max(0, entry.offer.deadlineTick - career.tick),
          held,
          canFulfil: true,
        };
      });

      ui.market.update({
        balance: career.balance,
        rows: inventoryRows(world.inventory, (itemId) => spotQuote(career, itemId)),
        storageUsed: storageUsed(world.inventory),
        storageCapacity: world.storageCapacity,
        contractsUnlocked: career.unlocks.includes('contracts'),
        contracts: career.unlocks.includes('contracts') ? [...accepted, ...offers] : [],
      });
    }

    if (ui.build.visible) {
      const parcel = nextParcelFor(world.parcels.ownedIds, career.stage);
      ui.build.update({
        balance: career.balance,
        options: buildableKinds(career.unlocks).map((kind) => {
          const cost = buildCostFor(career, kind);
          return { kind, cost: cents(cost), affordable: career.balance >= cost };
        }),
        animals: purchasableAnimals(career.unlocks).map((animal) => ({
          species: animal.id,
          affordable: career.balance >= animal.purchaseCost,
          shelterRequired: animal.shelterSlots,
        })),
        shelterFree: session.shelterFree(),
        landCost: parcel?.purchaseCost ?? cents(0),
        canAffordLand: parcel !== undefined && career.balance >= parcel.purchaseCost,
        landAvailable: parcel !== undefined,
        landProgress: landProgressOf(career.balance, world.parcels.ownedIds, career.stage),
        landName: parcel?.displayName ?? null,
        carriers: Object.values(CARRIERS)
          .filter(
            (carrier) =>
              carrier.id !== 'arms' &&
              !world.carry.owns(carrier.id) &&
              (!carrier.requiresUnlock || career.unlocks.includes(carrier.requiresUnlock)),
          )
          .map((carrier) => ({
            kind: carrier.id as 'handcart' | 'wagon',
            affordable: career.balance >= carrier.purchaseCost,
          })),
      });
    }

    if (ui.career.visible) {
      const milestone = career.milestone();
      const currentSpecialization = career.specialization;
      const switchCost = currentSpecialization
        ? SPECIALIZATIONS[currentSpecialization].switchCost
        : cents(0);
      const completedHuts = world.structures.completed('worker_hut');
      const occupiedHuts = new Set(
        world.workforce.workers.map((worker) => worker.hutBuildingId).filter(Boolean),
      );
      const freeHuts = completedHuts.filter((hut) => !occupiedHuts.has(hut.id)).length;

      const processorRows = career.unlocks.includes('processing')
        ? world.processing.processors.flatMap((processor) => {
            const building = world.structures.get(processor.buildingId);
            if (!building) return [];
            const kind = building.kind as ProcessorKind;
            if (!PROCESSORS[kind]) return [];
            const queued = processor.queue.reduce((sum, entry) => sum + entry.batches, 0);
            const remaining = world.processing.remainingTicks(processor.id, career.specialization);
            return recipesFor(kind).map((recipe) => {
              const held = world.stores.totalOf(recipe.inputItemId);
              const enabled =
                !building.broken &&
                queued < PROCESSORS[kind].queueCapacity &&
                held >= recipe.inputQuantity &&
                career.balance >= recipe.batchCost;
              return {
                id: `${processor.id}-${recipe.id}`,
                buildingId: building.id,
                recipeId: recipe.id,
                title: recipe.displayName,
                meta:
                  `${recipe.inputQuantity} ${recipe.inputItemId} → ${recipe.outputQuantity} ` +
                  `${recipe.outputItemId}; ${formatCents(recipe.batchCost)} to run; ` +
                  `${formatCents(batchMargin(recipe))} raw margin; ` +
                  `${queued}/${PROCESSORS[kind].queueCapacity} queued` +
                  (remaining > 0 ? `; ${formatTicks(remaining)} remaining` : ''),
                action: building.broken ? 'Broken' : enabled ? 'Queue 1' : 'Unavailable',
                enabled,
              };
            });
          })
        : [];

      const workerRows = career.unlocks.includes('workers')
        ? [
            ...world.workforce.workers.map((worker) => ({
              id: `employed-${worker.id}`,
              title: worker.displayName,
              meta:
                `${WORKER_ROLES[worker.role].displayName}; skill ${worker.skill}; ` +
                `${worker.tasksCompleted} tasks; priorities ${worker.priorities.join(', ')}`,
              action: worker.currentTask ?? 'Employed',
              enabled: false,
              selected: true,
            })),
            ...Object.values(WORKER_ROLES).map((role) => ({
              id: role.id,
              title: `Hire ${role.displayName}`,
              meta:
                `${formatCents(role.hiringCost)} to hire; ${formatCents(role.wagePerDay)} per day. ` +
                role.description,
              action: freeHuts > 0 && career.balance >= role.hiringCost ? 'Hire' : 'Unavailable',
              enabled: freeHuts > 0 && career.balance >= role.hiringCost,
            })),
          ]
        : [];

      const heldLoanOffers = new Set(
        career.loans.map((loan) => loan.id.split('-').slice(0, -1).join('-')),
      );
      const loanRows = career.unlocks.includes('loans')
        ? [
            ...career.loans.map((loan) => {
              const amount = Math.min(5_000, loan.outstanding, career.balance);
              return {
                id: `repay-${loan.id}`,
                loanId: loan.id,
                amount,
                title: `Repay ${loan.id}`,
                meta: `${formatCents(loan.outstanding)} outstanding; ${(loan.dailyRate * 100).toFixed(1)}% per day`,
                action: amount > 0 ? `Pay ${formatCents(cents(amount))}` : 'No cash',
                enabled: amount > 0,
              };
            }),
            ...LOAN_OFFERS.filter((offer) => !heldLoanOffers.has(offer.id)).map((offer) => ({
              id: offer.id,
              title: offer.displayName,
              meta:
                `${formatCents(offer.principal)} at ${(offer.dailyRate * 100).toFixed(1)}% per day. ` +
                offer.description,
              action: 'Borrow',
              enabled: true,
            })),
          ]
        : [];

      const insuranceRows = career.unlocks.includes('insurance')
        ? career.insurance
          ? [
              {
                id: 'cancel-policy',
                title: `Current policy: ${career.insurance.policyId}`,
                meta:
                  `${formatCents(career.insurance.premiumPerDay)} per day; ` +
                  `${Math.round(career.insurance.coverage * 100)}% coverage; ` +
                  `${career.insurance.claimsMade} claims`,
                action: 'Cancel',
                enabled: true,
                selected: true,
              },
            ]
          : INSURANCE_POLICIES.map((policy) => ({
              id: policy.policyId,
              title: policy.displayName,
              meta:
                `${formatCents(policy.premiumPerDay)} per day; ` +
                `${Math.round(policy.coverage * 100)}% coverage. ${policy.description}`,
              action: 'Take policy',
              enabled: true,
            }))
        : [];

      ui.career.update({
        balance: career.balance,
        stageName: STAGE_NAMES[career.stage],
        health: career.health()[0]!.toUpperCase() + career.health().slice(1),
        milestone: milestone
          ? {
              id: milestone.id,
              title: milestone.displayName,
              roleName: milestone.roleName,
              summary: milestone.newProblem,
              progress: career.milestoneProgress(),
              ready: career.milestoneProgress() >= 1,
              requirements: milestoneRequirementProgress(milestone, career.progression()).map(
                (entry) => {
                  const current =
                    entry.key === 'lifetimeEarned'
                      ? formatCents(cents(entry.current))
                      : String(Math.floor(entry.current));
                  const target =
                    entry.key === 'lifetimeEarned'
                      ? formatCents(cents(entry.target))
                      : String(Math.floor(entry.target));
                  return `${entry.met ? '✓' : '○'} ${entry.label}: ${current}/${target}`;
                },
              ),
            }
          : null,
        specializations: career.unlocks.includes('specialization')
          ? Object.values(SPECIALIZATIONS).map((specialization) => ({
              id: specialization.id,
              title: specialization.displayName,
              meta: `${specialization.description} Trade-off: ${specialization.tradeoff}`,
              action:
                currentSpecialization === specialization.id
                  ? 'Chosen'
                  : currentSpecialization
                    ? `Switch ${formatCents(switchCost)}`
                    : 'Choose',
              enabled:
                currentSpecialization !== specialization.id &&
                (!currentSpecialization || career.balance >= switchCost),
              selected: currentSpecialization === specialization.id,
            }))
          : [],
        processors: processorRows,
        workers: workerRows,
        loans: loanRows,
        insurance: insuranceRows,
      });
    }

    if (ui.town.visible) {
      const stage = townStageFor(career.town.prosperity);
      const active = career.town.activeProject;
      ui.town.update({
        stageName: stage.displayName,
        population: stage.populationBand,
        prosperity: career.town.prosperity,
        summary: stage.summary,
        activeProject: active
          ? {
              title: COMMUNITY_PROJECTS_BY_ID[active.id]?.displayName ?? active.id,
              remainingTicks: active.remainingTicks,
            }
          : null,
        projectsUnlocked: career.unlocks.includes('town_projects'),
        projects: (career.unlocks.includes('town_projects')
          ? availableProjects(career.town.prosperity, career.town.completedProjectIds)
          : []
        )
          .filter((project) => project.id !== active?.id)
          .map((project) => {
            const materials = Object.entries(project.materials);
            const hasMaterials = materials.every(
              ([itemId, quantity]) => world.stores.totalOf(itemId) >= quantity,
            );
            const enabled =
              career.unlocks.includes('town_projects') &&
              active === null &&
              career.balance >= project.cost &&
              hasMaterials;
            return {
              id: project.id,
              title: project.displayName,
              description: project.description,
              benefit: project.benefit,
              cost: project.cost,
              materials: materials
                .map(
                  ([itemId, quantity]) =>
                    `${quantity} ${itemId} (${world.stores.totalOf(itemId)} held)`,
                )
                .join(', '),
              enabled,
            };
          }),
      });
    }
  };

  subscriptions.push(
    session.events.on('session:panel', ({ panel }) => {
      ui.market.setVisible(panel === 'market');
      ui.build.setVisible(panel === 'build');
      ui.career.setVisible(panel === 'career');
      ui.town.setVisible(panel === 'town');
      ui.setMenuShortcutPanel(panel);
      playUi(panel === 'none' ? SOUND.uiClick : SOUND.uiOpen, panel === 'none' ? 0.6 : 0.8);
      refresh();
    }),
    session.events.on('session:sold', refresh),
    session.events.on('session:hauled', refresh),
    session.events.on('session:career-changed', refresh),
    session.events.on('session:refused', () => playUi(SOUND.uiDeny, 0.7)),
    career.events.on('career:balance-changed', refresh),
    career.events.on('career:unlocked', refresh),
    career.events.on('career:specialization-chosen', refresh),
    world.events.on('world:harvested', refresh),
    world.events.on('world:animal-purchased', refresh),
    world.events.on('world:building-completed', refresh),
    world.events.on('world:produce', refresh),
    world.events.on('world:parcel-acquired', refresh),

    // --- build placement ------------------------------------------------
    session.placement.events.on('placement:started', ({ kind }) => {
      ui.setPlacing(
        `Placing ${BUILDINGS[kind].displayName} — ${touch ? 'tap to build, Cancel to stop' : 'click to build, Esc to cancel'}`,
      );
      scene.setPlacementPreview(kind, 0, 0, true);
      playUi(SOUND.uiOpen, 0.7);
    }),
    session.placement.events.on('placement:moved', ({ kind, tileX, tileZ, valid }) => {
      scene.setPlacementPreview(kind, tileX, tileZ, valid);
      ui.setPlacing(
        valid
          ? `Placing ${BUILDINGS[kind].displayName} — ${touch ? 'tap to build, Cancel to stop' : 'click to build, Esc to cancel'}`
          : `Cannot build here — ${touch ? 'tap another spot or Cancel' : 'move the cursor, Esc to cancel'}`,
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
      ui.coach.show(
        touch && beat.touch ? { ...beat, body: beat.touch.body, key: beat.touch.key } : beat,
        () => session.skipOnboarding(),
      );
      playUi(SOUND.uiOpen, 0.5);
    }),
    session.onboarding.events.on('onboarding:hint', ({ beat }) => {
      // The hint replaces the beat's body in place rather than adding a
      // second prompt, so prompts can never stack.
      ui.coach.show(
        touch && beat.touch
          ? {
              ...beat,
              body: beat.touch.hintBody ?? beat.touch.body,
              key: beat.touch.key,
            }
          : { ...beat, body: beat.hint?.body ?? beat.body },
        () => session.skipOnboarding(),
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

    // --- season review -----------------------------------------------------
    // A season boundary opens the review screen. Unlike the old outcome
    // screen it is not terminal: the farm is still running behind it.
    careerDirector.events.on('career:season-review', ({ summary }) => {
      ui.outcome.present(summary);
      audio.play(SOUND.runSuccess, { bus: 'ui', volume: 0.7 });
      onSeasonReview();
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
      ui.career.setVisible(false);
      ui.town.setVisible(false);
      ui.setMenuShortcutPanel('none');
      ui.setMenuShortcutsAvailable(false);
    },
  };
}

/** Build options the player has actually been taught, in a stable order. */
function buildableKinds(unlocks: readonly string[]): readonly BuildingKind[] {
  return BUILDING_KINDS.filter((kind) => {
    const required = BUILDINGS[kind].requiresUnlock;
    return required === null || unlocks.includes(required);
  });
}
