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
  ESTATE_PARCELS,
  INSURANCE_POLICIES,
  LOAN_OFFERS,
  PROCESSORS,
  SPECIALIZATIONS,
  STARTER_EXTENSION_PARCEL_ID,
  STAGE_NAMES,
  WORKER_ROLES,
  availableProjects,
  batchMargin,
  cents,
  getBuyer,
  getItem,
  hasBuildingAccess,
  milestoneProgress as milestoneRequirementProgress,
  plantableCrops,
  purchasableAnimals,
  recipesFor,
  storageUsed,
  townStageFor,
  ticksToSeconds,
  type BuildingKind,
  type ProcessorKind,
  type WorkerTask,
} from '@farmrise/shared';
import type { Unsubscribe } from '@engine/core/types.js';
import type { AudioSystem } from '@engine/audio/AudioSystem.js';
import { SOUND } from '@assets/audio/soundIds.js';
import { inventoryRows } from '@game/items/InventoryView.js';
import {
  buildCostFor,
  contractQuote,
  processableInventory,
  sellableInventory,
  sellableQuantity,
  spotQuote,
} from '@game/world/FarmCommands.js';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';
import type { UiRoot } from '@ui/UiRoot.js';
import type { GameLocalization } from '@ui/i18n/gameI18n.js';
import { buildingName, cropName, domainText, itemName, seasonName } from '@ui/i18n/domainText.js';
import { localizeGameText } from '@ui/i18n/gameText.js';
import type { Beat } from '@game/onboarding/beats.js';

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
  i18n: GameLocalization,
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
  let coachState: { readonly beat: Beat; readonly hint: boolean } | null = null;
  let placementState: {
    readonly kind: BuildingKind;
    readonly valid: boolean;
    readonly problem: string | null;
  } | null = null;

  const showCoach = (): void => {
    if (!coachState) return;
    const { beat, hint } = coachState;
    const copyKey = touch
      ? hint
        ? `onboarding.${beat.id}.touchHint`
        : `onboarding.${beat.id}.touchBody`
      : hint
        ? `onboarding.${beat.id}.hint`
        : `onboarding.${beat.id}.body`;
    const fallback = touch
      ? hint
        ? (beat.touch?.hintBody ?? beat.touch?.body ?? beat.body)
        : (beat.touch?.body ?? beat.body)
      : hint
        ? (beat.hint?.body ?? beat.body)
        : beat.body;
    ui.coach.show(
      {
        id: beat.id,
        title: i18n.t(`onboarding.${beat.id}.title`, undefined, beat.title),
        body: i18n.t(copyKey, undefined, fallback),
        key: touch ? beat.touch?.key : beat.key,
      },
      () => session.skipOnboarding(),
    );
  };

  const showPlacement = (): void => {
    if (!placementState) {
      ui.setPlacing(null);
      return;
    }
    const definition = BUILDINGS[placementState.kind];
    const building = domainText(
      i18n,
      'building',
      placementState.kind,
      'name',
      definition.displayName,
    );
    ui.setPlacing(
      placementState.valid
        ? i18n.t(touch ? 'placement.activeTouch' : 'placement.activeDesktop', { building })
        : i18n.t(touch ? 'placement.blockedTouch' : 'placement.blockedDesktop', {
            problem:
              localizeGameText(i18n, placementState.problem) ?? i18n.t('placement.cannotBuild'),
          }),
      !placementState.valid,
    );
  };

  const refresh = (): void => {
    if (ui.storage.visible) {
      const buildingId = session.focusedStorageBuildingId;
      const building = buildingId ? world.structures.get(buildingId) : undefined;
      const store = buildingId
        ? world.stores.stores.find((candidate) => candidate.buildingId === buildingId)
        : undefined;
      if (building && store) {
        ui.storage.update({
          title: buildingName(i18n, building.kind, BUILDINGS[building.kind].displayName),
          used: storageUsed(store.items),
          capacity: store.capacity,
          carryFree: world.carry.free,
          rows: Object.entries(store.items)
            .filter(([, quantity]) => quantity > 0)
            .map(([itemId, quantity]) => {
              const item = getItem(itemId);
              const weight = item?.storageWeight ?? 1;
              return {
                itemId,
                displayName: itemName(i18n, itemId, item?.displayName ?? itemId),
                quantity,
                takeQuantity: Math.min(quantity, Math.floor(world.carry.free / weight)),
              };
            })
            .sort((left, right) => left.displayName.localeCompare(right.displayName)),
        });
      }
    }

    if (ui.seed.visible) {
      const interaction = scene.interaction;
      if (!interaction) throw new Error('Seed panel requires the farm interaction controller.');
      const season = career.season;
      ui.seed.update({
        seasonName: seasonName(i18n, season, season[0]!.toUpperCase() + season.slice(1)),
        balance: career.balance,
        options: plantableCrops(career.unlocks, season).map((crop) => ({
          cropId: crop.id,
          displayName: cropName(i18n, crop.id, crop.displayName),
          cost: crop.seedCost,
          growthTicks: crop.growthTicks,
          baseYield: crop.baseYield,
          affordable: career.balance >= crop.seedCost,
          selected: interaction.selectedCropId === crop.id,
        })),
      });
    }

    if (ui.market.visible) {
      // Two kinds of row share the panel: offers you could take, and promises
      // you have already made. Accepted contracts come first because they are
      // the ones with a clock running.
      const accepted = career.contracts
        .filter((contract) => contract.status === 'open')
        .map((contract) => {
          const held = sellableQuantity(career, contract.itemId);
          const outstanding = contract.quantity - contract.delivered;
          const spotValue = cents(spotQuote(career, contract.itemId) * outstanding);
          const payout = contractQuote(career, contract.itemId, contract.unitPrice, outstanding);
          const item = getItem(contract.itemId);
          const buyer = getBuyer(contract.buyerId);
          return {
            action: 'deliver' as const,
            orderId: contract.id,
            itemId: contract.itemId,
            displayName: i18n.t('market.offerName', {
              item: itemName(i18n, contract.itemId, item?.displayName ?? contract.itemId),
              buyer: buyer
                ? domainText(i18n, 'buyer', buyer.id, 'name', buyer.displayName)
                : contract.buyerId,
            }),
            quantity: outstanding,
            payout,
            spotValue,
            premiumPercent: spotValue > 0 ? (payout - spotValue) / spotValue : 0,
            ticksRemaining: Math.max(0, contract.deadlineTick - career.tick),
            held,
            canFulfil: held > 0 && career.tick >= contract.acceptedTick,
            minimumQuality: contract.minimumQuality,
            recurringEveryTicks: contract.recurringEveryTicks,
            ticksUntilWindow: Math.max(0, contract.acceptedTick - career.tick),
            canSchedule: false,
          };
        });

      const offers = session.contracts.map((entry) => {
        const held = sellableQuantity(career, entry.offer.itemId);
        const spotValue = cents(spotQuote(career, entry.offer.itemId) * entry.offer.quantity);
        const payout = contractQuote(
          career,
          entry.offer.itemId,
          entry.offer.unitPrice,
          entry.offer.quantity,
        );
        const item = getItem(entry.offer.itemId);
        return {
          action: 'accept' as const,
          orderId: entry.offer.id,
          itemId: entry.offer.itemId,
          displayName: i18n.t('market.offerName', {
            item: itemName(i18n, entry.offer.itemId, item?.displayName ?? entry.offer.itemId),
            buyer: domainText(i18n, 'buyer', entry.buyer.id, 'name', entry.buyer.displayName),
          }),
          quantity: entry.offer.quantity,
          payout,
          spotValue,
          premiumPercent: spotValue > 0 ? (payout - spotValue) / spotValue : 0,
          ticksRemaining: Math.max(0, entry.offer.deadlineTick - career.tick),
          held,
          canFulfil: true,
          minimumQuality: entry.offer.minimumQuality,
          recurringEveryTicks: 0,
          ticksUntilWindow: 0,
          canSchedule: career.unlocks.includes('scheduled_delivery'),
        };
      });

      ui.market.update({
        balance: career.balance,
        rows: inventoryRows(sellableInventory(career), (itemId) => spotQuote(career, itemId)).map(
          (row) => ({
            ...row,
            displayName: itemName(i18n, row.itemId, row.displayName),
          }),
        ),
        storageUsed: storageUsed(world.storedInventory),
        storageCapacity: world.storageCapacity,
        contractsUnlocked: career.unlocks.includes('contracts'),
        contracts: career.unlocks.includes('contracts') ? [...accepted, ...offers] : [],
      });
    }

    if (ui.build.visible) {
      ui.build.update({
        context: session.focusedShelterId ? 'livestock' : null,
        balance: career.balance,
        options: buildableKinds(career.unlocks, career.contracts).map((kind) => {
          const cost = buildCostFor(career, kind);
          return { kind, cost: cents(cost), affordable: career.balance >= cost };
        }),
        animals: purchasableAnimals(career.unlocks).map((animal) => ({
          species: animal.id,
          affordable: career.balance >= animal.purchaseCost,
          shelterRequired: animal.shelterSlots,
        })),
        shelterFree: session.shelterFree(),
        land: ESTATE_PARCELS.filter(
          (parcel) => !world.parcels.owns(parcel.id) && parcel.requiresStage <= career.stage,
        ).map((parcel) => {
          const missing = parcel.requiresOwned.filter((id) => !world.parcels.owns(id));
          const ownershipRequirement = missing
            .map((id) => {
              const required = ESTATE_PARCELS.find((candidate) => candidate.id === id);
              return domainText(i18n, 'parcel', id, 'name', required?.displayName ?? id);
            })
            .join(', ');
          const tutorialRequirement = session.landPurchaseRequirement(parcel.id);
          const requirement =
            tutorialRequirement ??
            (missing.length > 0 ? i18n.t('build.buyFirst', { land: ownershipRequirement }) : null);
          return {
            parcelId: parcel.id,
            displayName: domainText(i18n, 'parcel', parcel.id, 'name', parcel.displayName),
            cost: parcel.purchaseCost,
            bedCount: parcel.beds.length,
            description: domainText(i18n, 'parcel', parcel.id, 'description', parcel.description),
            affordable: career.balance >= parcel.purchaseCost,
            available: missing.length === 0 && tutorialRequirement === null,
            progress:
              parcel.purchaseCost > 0
                ? Math.max(0, Math.min(1, career.balance / parcel.purchaseCost))
                : 1,
            requirement,
          };
        }),
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
      const completedHuts = world.structures
        .completed('worker_hut')
        .filter((hut) => !session.focusedWorkerHutId || hut.id === session.focusedWorkerHutId);
      const occupiedHuts = new Set(
        world.workforce.workers.map((worker) => worker.hutBuildingId).filter(Boolean),
      );
      const freeHuts = completedHuts.filter((hut) => !occupiedHuts.has(hut.id)).length;

      const processingInventory = processableInventory(career);
      const processorRows = world.processing.processors.flatMap((processor) => {
        const building = world.structures.get(processor.buildingId);
        if (!building) return [];
        if (
          session.focusedProcessorBuildingId &&
          building.id !== session.focusedProcessorBuildingId
        ) {
          return [];
        }
        const kind = building.kind as ProcessorKind;
        if (!PROCESSORS[kind]) return [];
        const queued = processor.queue.reduce((sum, entry) => sum + entry.batches, 0);
        const remaining = world.processing.remainingTicks(processor.id, career.specialization);
        return recipesFor(kind).map((recipe) => {
          const held = processingInventory[recipe.inputItemId] ?? 0;
          const enabled =
            !building.broken &&
            queued < PROCESSORS[kind].queueCapacity &&
            held >= recipe.inputQuantity &&
            career.balance >= recipe.batchCost;
          const input = getItem(recipe.inputItemId);
          const output = getItem(recipe.outputItemId);
          return {
            id: `${processor.id}-${recipe.id}`,
            buildingId: building.id,
            recipeId: recipe.id,
            title: domainText(i18n, 'recipe', recipe.id, 'name', recipe.displayName),
            meta: i18n.t('career.processorMeta', {
              inputQuantity: i18n.formatNumber(recipe.inputQuantity),
              input: itemName(i18n, recipe.inputItemId, input?.displayName ?? recipe.inputItemId),
              outputQuantity: i18n.formatNumber(recipe.outputQuantity),
              output: itemName(
                i18n,
                recipe.outputItemId,
                output?.displayName ?? recipe.outputItemId,
              ),
              cost: i18n.formatCents(recipe.batchCost),
              margin: i18n.formatCents(batchMargin(recipe)),
              queued: i18n.formatNumber(queued),
              capacity: i18n.formatNumber(PROCESSORS[kind].queueCapacity),
              remaining:
                remaining > 0
                  ? i18n.t('career.remaining', {
                      time: i18n.formatDurationSeconds(ticksToSeconds(remaining)),
                    })
                  : '',
            }),
            action: i18n.t(
              building.broken
                ? 'career.broken'
                : enabled
                  ? 'career.queueOne'
                  : 'common.unavailable',
            ),
            enabled,
          };
        });
      });

      const workerRows = career.unlocks.includes('workers')
        ? [
            ...world.workforce.workers
              .filter(
                (worker) =>
                  !session.focusedWorkerHutId ||
                  worker.hutBuildingId === session.focusedWorkerHutId,
              )
              .map((worker) => ({
                id: `employed-${worker.id}`,
                title: worker.displayName,
                meta: i18n.t('career.workerMeta', {
                  role: domainText(
                    i18n,
                    'worker',
                    worker.role,
                    'name',
                    WORKER_ROLES[worker.role].displayName,
                  ),
                  skill: i18n.formatNumber(worker.skill),
                  tasks: i18n.formatNumber(worker.tasksCompleted),
                  priorities: worker.priorities
                    .map((priority) => workerTaskName(i18n, priority as WorkerTask))
                    .join(' → '),
                }),
                action: worker.currentTask
                  ? workerTaskName(i18n, worker.currentTask)
                  : i18n.t('career.prioritize', {
                      task: workerTaskName(
                        i18n,
                        (worker.priorities[1] ?? worker.priorities[0]) as WorkerTask,
                      ),
                    }),
                enabled: !worker.currentTask && worker.priorities.length > 1,
                selected: true,
                workerId: worker.id,
              })),
            ...Object.values(WORKER_ROLES).map((role) => ({
              id: role.id,
              title: i18n.t('career.hireTitle', {
                role: domainText(i18n, 'worker', role.id, 'name', role.displayName),
              }),
              meta: i18n.t('career.hireMeta', {
                cost: i18n.formatCents(role.hiringCost),
                wage: i18n.formatCents(role.wagePerDay),
                description: domainText(i18n, 'worker', role.id, 'description', role.description),
              }),
              action: i18n.t(
                freeHuts > 0 && career.balance >= role.hiringCost
                  ? 'career.hire'
                  : 'common.unavailable',
              ),
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
                title: i18n.t('career.repayTitle', { loan: loan.id }),
                meta: i18n.t('career.loanOutstanding', {
                  amount: i18n.formatCents(loan.outstanding),
                  rate: i18n.formatNumber(loan.dailyRate * 100, {
                    maximumFractionDigits: 1,
                  }),
                }),
                action:
                  amount > 0
                    ? i18n.t('career.pay', { amount: i18n.formatCents(cents(amount)) })
                    : i18n.t('common.noCash'),
                enabled: amount > 0,
              };
            }),
            ...LOAN_OFFERS.filter((offer) => !heldLoanOffers.has(offer.id)).map((offer) => ({
              id: offer.id,
              title: domainText(i18n, 'loan', offer.id, 'name', offer.displayName),
              meta: i18n.t('career.loanOfferMeta', {
                principal: i18n.formatCents(offer.principal),
                rate: i18n.formatNumber(offer.dailyRate * 100, {
                  maximumFractionDigits: 1,
                }),
                description: domainText(i18n, 'loan', offer.id, 'description', offer.description),
              }),
              action: i18n.t('career.borrow'),
              enabled: true,
            })),
          ]
        : [];

      const insuranceRows = career.unlocks.includes('insurance')
        ? career.insurance
          ? [
              {
                id: 'cancel-policy',
                title: i18n.t('career.currentPolicy', { policy: career.insurance.policyId }),
                meta: i18n.t('career.policyMeta', {
                  premium: i18n.formatCents(career.insurance.premiumPerDay),
                  coverage: i18n.formatNumber(Math.round(career.insurance.coverage * 100)),
                  claims: i18n.formatNumber(career.insurance.claimsMade),
                }),
                action: i18n.t('common.cancel'),
                enabled: true,
                selected: true,
              },
            ]
          : INSURANCE_POLICIES.map((policy) => ({
              id: policy.policyId,
              title: domainText(i18n, 'insurance', policy.policyId, 'name', policy.displayName),
              meta: i18n.t('career.policyOfferMeta', {
                premium: i18n.formatCents(policy.premiumPerDay),
                coverage: i18n.formatNumber(Math.round(policy.coverage * 100)),
                description: domainText(
                  i18n,
                  'insurance',
                  policy.policyId,
                  'description',
                  policy.description,
                ),
              }),
              action: i18n.t('career.takePolicy'),
              enabled: true,
            }))
        : [];

      ui.career.update({
        context: session.focusedProcessorBuildingId
          ? 'processing'
          : session.focusedWorkerHutId
            ? 'workforce'
            : null,
        balance: career.balance,
        stageName: domainText(
          i18n,
          'stage',
          String(career.stage),
          'name',
          STAGE_NAMES[career.stage],
        ),
        health: domainText(
          i18n,
          'health',
          career.health(),
          'name',
          career.health()[0]!.toUpperCase() + career.health().slice(1),
        ),
        milestone: milestone
          ? {
              id: milestone.id,
              title: domainText(i18n, 'milestone', milestone.id, 'name', milestone.displayName),
              nextStageName: domainText(
                i18n,
                'stage',
                String(milestone.advancesToStage),
                'name',
                STAGE_NAMES[milestone.advancesToStage],
              ),
              summary: domainText(i18n, 'milestone', milestone.id, 'problem', milestone.newProblem),
              progress: career.milestoneProgress(),
              ready: career.milestoneProgress() >= 1,
              requirements: milestoneRequirementProgress(milestone, career.progression()).map(
                (entry) => {
                  const current =
                    entry.key === 'lifetimeEarned'
                      ? i18n.formatCents(cents(entry.current))
                      : i18n.formatNumber(Math.floor(entry.current));
                  const target =
                    entry.key === 'lifetimeEarned'
                      ? i18n.formatCents(cents(entry.target))
                      : i18n.formatNumber(Math.floor(entry.target));
                  return i18n.t('career.requirement', {
                    mark: entry.met ? '✓' : '○',
                    label: domainText(i18n, 'requirement', entry.key, 'name', entry.label),
                    current,
                    target,
                  });
                },
              ),
            }
          : null,
        specializations: career.unlocks.includes('specialization')
          ? Object.values(SPECIALIZATIONS).map((specialization) => ({
              id: specialization.id,
              title: domainText(
                i18n,
                'specialization',
                specialization.id,
                'name',
                specialization.displayName,
              ),
              meta: i18n.t('career.tradeoff', {
                description: domainText(
                  i18n,
                  'specialization',
                  specialization.id,
                  'description',
                  specialization.description,
                ),
                tradeoff: domainText(
                  i18n,
                  'specialization',
                  specialization.id,
                  'tradeoff',
                  specialization.tradeoff,
                ),
              }),
              action:
                currentSpecialization === specialization.id
                  ? i18n.t('common.chosen')
                  : currentSpecialization
                    ? i18n.t('career.switch', { cost: i18n.formatCents(switchCost) })
                    : i18n.t('common.choose'),
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
      const starterProjectAvailable = world.parcels.owns(STARTER_EXTENSION_PARCEL_ID);
      const projectSurfaceUnlocked =
        starterProjectAvailable ||
        career.unlocks.includes('town_projects') ||
        active !== null ||
        career.town.completedProjectIds.length > 0;
      ui.town.update({
        stageName: domainText(i18n, 'townStage', String(stage.stage), 'name', stage.displayName),
        population: domainText(
          i18n,
          'townStage',
          String(stage.stage),
          'population',
          stage.populationBand,
        ),
        prosperity: career.town.prosperity,
        summary: domainText(i18n, 'townStage', String(stage.stage), 'summary', stage.summary),
        activeProject: active
          ? {
              title: domainText(
                i18n,
                'project',
                active.id,
                'name',
                COMMUNITY_PROJECTS_BY_ID[active.id]?.displayName ?? active.id,
              ),
              remainingTicks: active.remainingTicks,
            }
          : null,
        projectsUnlocked: projectSurfaceUnlocked,
        projects: (projectSurfaceUnlocked
          ? availableProjects(career.town.prosperity, career.town.completedProjectIds, {
              unlocks: career.unlocks,
              ownedParcelIds: world.parcels.ownedIds,
            })
          : []
        )
          .filter((project) => project.id !== active?.id)
          .map((project) => {
            const materials = Object.entries(project.materials);
            const hasMaterials = materials.every(
              ([itemId, quantity]) => world.stores.totalOf(itemId) >= quantity,
            );
            const enabled = active === null && career.balance >= project.cost && hasMaterials;
            return {
              id: project.id,
              title: domainText(i18n, 'project', project.id, 'name', project.displayName),
              description: domainText(
                i18n,
                'project',
                project.id,
                'description',
                project.description,
              ),
              benefit: domainText(i18n, 'project', project.id, 'benefit', project.benefit),
              cost: project.cost,
              materials:
                materials
                  .map(([itemId, quantity]) => {
                    const item = getItem(itemId);
                    return i18n.t('town.materialHeld', {
                      quantity: i18n.formatNumber(quantity),
                      item: itemName(i18n, itemId, item?.displayName ?? itemId),
                      held: i18n.formatNumber(world.stores.totalOf(itemId)),
                    });
                  })
                  .join(', ') || i18n.t('town.noMaterials'),
              enabled,
            };
          }),
      });
    }
  };

  subscriptions.push(
    session.events.on('session:panel', ({ panel }) => {
      ui.seed.setVisible(panel === 'seed');
      ui.market.setVisible(panel === 'market');
      ui.build.setVisible(panel === 'build');
      ui.career.setVisible(panel === 'career');
      ui.town.setVisible(panel === 'town');
      ui.storage.setVisible(panel === 'storage');
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
    career.events.on('career:season-changed', refresh),
    career.events.on('career:specialization-chosen', refresh),
    world.events.on('world:harvested', refresh),
    world.events.on('world:animal-purchased', refresh),
    world.events.on('world:building-completed', refresh),
    world.events.on('world:produce', refresh),
    world.events.on('world:parcel-acquired', refresh),

    // --- build placement ------------------------------------------------
    session.placement.events.on('placement:started', ({ kind }) => {
      placementState = { kind, valid: true, problem: null };
      showPlacement();
      playUi(SOUND.uiOpen, 0.7);
    }),
    session.placement.events.on(
      'placement:moved',
      ({ kind, tileX, tileZ, rotation, valid, problem }) => {
        scene.setPlacementPreview(kind, tileX, tileZ, valid, rotation);
        placementState = { kind, valid, problem };
        showPlacement();
      },
    ),
    session.placement.events.on('placement:placed', () => {
      // Placement stays active so one selection can build a run. The
      // controller emits a fresh moved event for the now-occupied tile.
      refresh();
    }),
    session.placement.events.on('placement:cancelled', () => {
      placementState = null;
      showPlacement();
      scene.setPlacementPreview(null);
    }),
    session.placement.events.on('placement:refused', ({ reason }) => {
      playUi(SOUND.uiDeny, 0.7);
      ui.hud.toast(localizeGameText(i18n, reason) ?? reason, 'warn');
    }),

    // --- onboarding ------------------------------------------------------
    session.onboarding.events.on('onboarding:beat', ({ beat }) => {
      coachState = { beat, hint: false };
      showCoach();
      playUi(SOUND.uiOpen, 0.5);
    }),
    session.onboarding.events.on('onboarding:hint', ({ beat }) => {
      // The hint replaces the beat's body in place rather than adding a
      // second prompt, so prompts can never stack.
      coachState = { beat, hint: true };
      showCoach();
    }),
    session.onboarding.events.on('onboarding:beat-complete', () => playUi(SOUND.uiConfirm, 0.5)),
    session.onboarding.events.on('onboarding:complete', () => {
      coachState = null;
      ui.coach.hide();
      refresh();
    }),
    session.onboarding.events.on('onboarding:skipped', ({ reason }) => {
      if (reason === 'player') {
        coachState = null;
        ui.coach.hide();
      }
    }),

    // --- season review -----------------------------------------------------
    // A season boundary opens the review screen. Unlike the old outcome
    // screen it is not terminal: the farm is still running behind it.
    careerDirector.events.on('career:season-review', ({ summary }) => {
      ui.outcome.present(summary);
      onSeasonReview();
    }),
    i18n.onChange(() => {
      refresh();
      showCoach();
      showPlacement();
    }),
  );

  refresh();

  return {
    refresh,
    unsubscribe: () => {
      for (const unsubscribe of subscriptions) unsubscribe();
      ui.coach.hide();
      ui.setPlacing(null);
      ui.seed.setVisible(false);
      ui.market.setVisible(false);
      ui.build.setVisible(false);
      ui.career.setVisible(false);
      ui.town.setVisible(false);
      ui.storage.setVisible(false);
      ui.setMenuShortcutPanel('none');
      ui.setMenuShortcutsAvailable(false);
    },
  };
}

function workerTaskName(i18n: GameLocalization, task: WorkerTask): string {
  return i18n.t(`workerTask.${task}`, undefined, task.replaceAll('_', ' '));
}

/** Build options the player has actually been taught, in a stable order. */
function buildableKinds(
  unlocks: readonly string[],
  contracts: readonly { readonly itemId: string; readonly status: string }[],
): readonly BuildingKind[] {
  return BUILDING_KINDS.filter((kind) => hasBuildingAccess(kind, unlocks, contracts));
}
