/**
 * Owns one sitting: onboarding, the panels, build placement, and routing the
 * player's verbs so that audio, analytics and the HUD see one consistent
 * stream of outcomes.
 *
 * What it deliberately no longer owns is the *career*. Deciding when a stage is
 * reached, when a season turns and what happens to an insolvent farm are long
 * horizon questions and they live in CareerDirector
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §39.1). This class stays what FarmScene
 * needs: the thing that turns a keypress into a command.
 */
import {
  ANIMALS,
  STARTER_EXTENSION_PARCEL_ID,
  isMitigated,
  type BuildingKind,
  type Cents,
  type Result,
} from '@farmrise/shared';
import type * as THREE from 'three';
import { EventBus } from '@engine/core/EventBus.js';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { Career } from '../career/Career.js';
import type { CareerDirector } from '../career/CareerDirector.js';
import { ContractBoard } from '../career/ContractBoard.js';
import {
  acceptContract,
  buyAnimal,
  buyCarrier,
  buyLand,
  borrow,
  buyInsurance,
  collectStack,
  chooseSpecialization,
  cancelInsurance,
  deliverContract,
  depositCarried,
  hireWorker,
  queueProcessing,
  repay,
  sellSpot,
  startTownProject,
  useCarrier,
} from '../world/FarmCommands.js';
import type { Player } from '../player/Player.js';
import type { PlayerController } from '../player/PlayerController.js';
import type { IncidentDirector } from '../events/IncidentDirector.js';
import { PlacementController } from './PlacementController.js';
import { OnboardingDirector, hasOnboardedBefore } from '../onboarding/OnboardingDirector.js';
import { OnboardingAnimalBoost } from '../onboarding/OnboardingAnimalBoost.js';
import { OnboardingCropBoost } from '../onboarding/OnboardingCropBoost.js';
import type { OnboardingContext } from '../onboarding/beats.js';
import type { GameAction } from '../GameActions.js';

export type PanelName = 'none' | 'market' | 'build' | 'career' | 'town';

export interface SessionEvents extends Record<string, unknown> {
  'session:panel': { panel: PanelName };
  'session:refused': { action: string; reason: string };
  'session:responded': { incidentId: string; response: string };
  'session:sold': { itemId: string; quantity: number; payout: Cents; viaContract: boolean };
  'session:hauled': { stored: number; refused: number };
  'session:career-changed': { action: string };
}

export interface SessionOptions {
  readonly skipOnboarding?: boolean;
  /** Injected so tests can drive time deterministically. */
  readonly now?: () => number;
}

export class SessionController {
  readonly events = new EventBus<SessionEvents>();
  readonly onboarding: OnboardingDirector;
  readonly placement: PlacementController;
  readonly board: ContractBoard;
  readonly #onboardingCropBoost: OnboardingCropBoost;
  readonly #onboardingAnimalBoost: OnboardingAnimalBoost;
  readonly #startingBuildingCount: number;

  #panel: PanelName = 'none';
  #startedAt: number;
  #hasMoved = false;
  #salesMade = 0;
  #reinvestments = 0;
  #incidentsResolved = 0;
  readonly #now: () => number;

  constructor(
    private readonly career: Career,
    private readonly player: Player,
    private readonly playerController: PlayerController,
    private readonly incidents: IncidentDirector,
    private readonly careerDirector: CareerDirector,
    private readonly input: InputSystem<GameAction>,
    camera: THREE.Camera,
    options: SessionOptions = {},
  ) {
    this.#now = options.now ?? (() => performance.now());
    this.#startedAt = this.#now();
    const skipOnboarding =
      options.skipOnboarding ?? (career.onboardingCompleted || hasOnboardedBefore());
    this.onboarding = new OnboardingDirector({ skip: skipOnboarding });
    incidents.setRandomSchedulingEnabled(skipOnboarding);
    if (skipOnboarding) career.setOnboardingCompleted(true);
    this.onboarding.events.on('onboarding:complete', () => {
      career.setOnboardingCompleted(true);
      incidents.setRandomSchedulingEnabled(true);
    });
    this.#onboardingCropBoost = new OnboardingCropBoost(career);
    this.#onboardingAnimalBoost = new OnboardingAnimalBoost(career);
    this.#startingBuildingCount = career.world.buildings.length;
    this.placement = new PlacementController(career, input, camera, player);
    this.board = new ContractBoard(career);
    this.board.refresh();

    incidents.events.on('incident:resolved', () => {
      this.#incidentsResolved += 1;
    });
  }

  get panel(): PanelName {
    return this.#panel;
  }

  get contracts() {
    return this.board.available();
  }

  openPanel(panel: PanelName): void {
    if (this.#panel === panel) return;
    this.#panel = panel;
    // Opening a panel cancels a placement in progress: two modal cursors at
    // once is how a player ends up placing a barn they cannot see.
    if (panel !== 'none') this.placement.cancel('player');
    this.events.emit('session:panel', { panel });
  }

  togglePanel(panel: PanelName): void {
    this.openPanel(this.#panel === panel ? 'none' : panel);
  }

  // -- player-facing commands ---------------------------------------------

  sell(itemId: string, quantity: number): void {
    const result = sellSpot(this.career, itemId, quantity);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'sell', reason: result.reason });
      return;
    }
    this.#salesMade += 1;
    this.events.emit('session:sold', {
      itemId,
      quantity: result.value.quantity,
      payout: result.value.payout,
      viaContract: false,
    });
  }

  accept(offerId: string): void {
    const entry = this.board.available().find((candidate) => candidate.offer.id === offerId);
    if (!entry) {
      this.events.emit('session:refused', { action: 'accept', reason: 'That offer is gone.' });
      return;
    }
    const result = acceptContract(this.career, entry.offer);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'accept', reason: result.reason });
      return;
    }
    this.events.emit('session:career-changed', { action: 'acceptContract' });
  }

  deliver(contractId: string, quantity: number): void {
    const contract = this.career.contracts.find((entry) => entry.id === contractId);
    const result = deliverContract(this.career, contractId, quantity);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'deliver', reason: result.reason });
      return;
    }
    this.#salesMade += 1;
    this.events.emit('session:sold', {
      itemId: contract?.itemId ?? 'goods',
      quantity: result.value.delivered,
      payout: result.value.payout,
      viaContract: true,
    });
  }

  chooseBuilding(kind: BuildingKind): void {
    this.openPanel('none');
    this.placement.begin(kind);
  }

  purchaseAnimal(species = 'chicken'): void {
    const result = buyAnimal(this.career, species, 1);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'buyAnimal', reason: result.reason });
      return;
    }
    this.#reinvestments += 1;
  }

  purchaseLand(parcelId: string): void {
    const onboardingRequirement = this.landPurchaseRequirement(parcelId);
    if (onboardingRequirement) {
      this.events.emit('session:refused', { action: 'buyLand', reason: onboardingRequirement });
      return;
    }
    const result = buyLand(this.career, parcelId);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'buyLand', reason: result.reason });
      return;
    }
    this.#reinvestments += 1;
    this.openPanel('none');
  }

  /** Keeps the tutorial expansion after the egg lesson without gating normal careers. */
  landPurchaseRequirement(parcelId: string): string | null {
    if (
      parcelId === STARTER_EXTENSION_PARCEL_ID &&
      this.onboarding.active &&
      !this.#onboardingContext().eggsHandled
    ) {
      return 'Collect the eggs before opening the Starter Extension.';
    }
    return null;
  }

  purchaseCarrier(kind: string): void {
    const result = buyCarrier(this.career, kind);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'buyCarrier', reason: result.reason });
      return;
    }
    this.#reinvestments += 1;
    useCarrier(this.career, kind);
    this.events.emit('session:career-changed', { action: 'buyCarrier' });
  }

  claimMilestone(milestoneId: string): void {
    this.#reportCareerChange('claimMilestone', this.careerDirector.claim(milestoneId));
  }

  specialize(id: string): void {
    this.#reportCareerChange('specialize', chooseSpecialization(this.career, id));
  }

  queueBatch(buildingId: string, recipeId: string, batches = 1): void {
    this.#reportCareerChange(
      'queueProcessing',
      queueProcessing(this.career, buildingId, recipeId, batches),
    );
  }

  employ(role: string): void {
    this.#reportCareerChange('hireWorker', hireWorker(this.career, role));
  }

  takeLoan(offerId: string): void {
    this.#reportCareerChange('borrow', borrow(this.career, offerId));
  }

  repayLoan(loanId: string, amount: number): void {
    this.#reportCareerChange('repay', repay(this.career, loanId, amount));
  }

  insure(policyId: string): void {
    this.#reportCareerChange('buyInsurance', buyInsurance(this.career, policyId));
  }

  cancelPolicy(): void {
    this.#reportCareerChange('cancelInsurance', cancelInsurance(this.career));
  }

  fundTownProject(projectId: string): void {
    this.#reportCareerChange('startTownProject', startTownProject(this.career, projectId));
  }

  /**
   * The haul verb: put down what you are carrying, or pick up what is here.
   *
   * One key for both because they are never both available in the same place -
   * you are either standing at a store or at a pile in a field.
   */
  haul(): void {
    const tile = this.career.world.grid.worldToTile(this.player.position.x, this.player.position.z);
    if (!this.career.world.carry.isEmpty) {
      const result = depositCarried(this.career, tile.x, tile.z);
      if (!result.ok) {
        this.events.emit('session:refused', { action: 'haul', reason: result.reason });
        return;
      }
      this.events.emit('session:hauled', {
        stored: result.value.stored,
        refused: result.value.refused,
      });
      return;
    }

    const picked = collectStack(this.career, tile.x, tile.z);
    if (!picked.ok) {
      this.events.emit('session:refused', { action: 'haul', reason: picked.reason });
      return;
    }
    this.events.emit('session:hauled', { stored: 0, refused: 0 });
  }

  /** The signature mechanic's active response. */
  respondToIncident(responseKind?: string): void {
    const instance = this.incidents.mostUrgentActionable;
    const definition = instance ? this.incidents.definitionOf(instance) : undefined;
    if (!instance || !definition) {
      this.events.emit('session:refused', {
        action: 'respond',
        reason: 'Nothing to answer right now.',
      });
      return;
    }

    const kind =
      responseKind ?? definition.responses.find((response) => response.kind === 'pay')?.kind;
    if (!kind) {
      this.events.emit('session:refused', {
        action: 'respond',
        reason: 'Go to the marked problem and use Work to answer it.',
      });
      return;
    }

    const result = this.incidents.respond(instance.id, kind);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'respond', reason: result.reason });
      return;
    }
    this.events.emit('session:responded', { incidentId: instance.id, response: kind });
  }

  // -- ticking -----------------------------------------------------------

  fixedUpdate(context: FixedUpdateContext): void {
    if (this.player.position.x !== 0 || this.player.position.z !== 0) this.#hasMoved = true;

    // Placement confirmation must see the input edge on this fixed tick.
    // Reading it later from render loses clicks when one slow frame performs
    // several catch-up steps.
    const placementWasActive = this.placement.active;
    this.placement.fixedUpdate(this.#now());

    // Panel keys are read here rather than in InteractionController because
    // they are session-level, not plot-level. Placement swallows `cancel`
    // itself, so only close a panel when nothing is being placed.
    if (this.input.wasPressed('openMarket')) this.togglePanel('market');
    if (this.input.wasPressed('openBuild')) this.togglePanel('build');
    if (this.input.wasPressed('openCareer')) this.togglePanel('career');
    if (this.input.wasPressed('openTown')) this.togglePanel('town');
    // R is contextually Rotate during placement and Haul during ordinary play.
    // Other world actions are suppressed for the same reason plot interaction
    // is: placement owns the action layer until it is cancelled or exhausted.
    if (!placementWasActive && this.input.wasPressed('prevent')) this.respondToIncident();
    if (!placementWasActive && this.input.wasPressed('haul')) this.haul();
    if (this.input.wasPressed('cancel') && this.#panel !== 'none' && !this.placement.active) {
      this.openPanel('none');
    }

    this.board.fixedUpdate();

    this.#onboardingCropBoost.update(this.onboarding.currentBeat?.id === 'tend');
    this.#onboardingAnimalBoost.update(
      this.onboarding.currentBeat?.id === 'eggs',
      this.career.world.stores.totalOf('eggs') + (this.career.world.carry.items['eggs'] ?? 0),
    );
    let onboardingContext = this.#onboardingContext();
    // Once the player has completed the production/egg loop, guarantee one
    // fresh warning before the land purchase and final community-project
    // lesson. This keeps the incident lesson inside onboarding without putting
    // another required task after the project the player was just taught.
    if (
      this.onboarding.active &&
      onboardingContext.reinvestments > 0 &&
      onboardingContext.eggsHandled &&
      (this.onboarding.currentBeat?.id === 'eggs' || this.onboarding.currentBeat?.id === 'setback')
    ) {
      this.incidents.ensureOnboardingWarning();
      onboardingContext = this.#onboardingContext();
    }
    this.onboarding.start(onboardingContext);
    this.onboarding.update(onboardingContext);

    void context;
  }

  update(context: RenderContext): void {
    this.placement.update(context);
  }

  skipOnboarding(): void {
    this.onboarding.skip(this.#onboardingContext());
  }

  /** Progress toward the current milestone, for the HUD objective meter. */
  milestoneProgress(): number {
    return this.career.milestoneProgress();
  }

  shelterFree(): number {
    const used = this.career.world.animals.reduce(
      (sum, group) => sum + group.count * (ANIMALS[group.species]?.shelterSlots ?? 1),
      0,
    );
    return Math.max(0, this.career.world.shelterCapacity() - used);
  }

  summary() {
    return this.careerDirector.summary('season');
  }

  #reportCareerChange(action: string, result: Result<unknown>): void {
    if (!result.ok) {
      this.events.emit('session:refused', { action, reason: result.reason });
      return;
    }
    this.events.emit('session:career-changed', { action });
  }

  #onboardingContext(): OnboardingContext {
    const stats = this.career.statistics;
    const world = this.career.world;
    let tendCount = 0;
    let planted = 0;
    let eggsReady = 0;
    let eggsCollected = world.carry.items['eggs'] ?? 0;
    let eggsHandled = eggsCollected > 0;
    for (const plot of world.plots.values()) {
      if (plot.cropId) planted += 1;
      tendCount += plot.tendCount;
    }
    for (const store of world.stores.stores) {
      const eggs = store.items['eggs'] ?? 0;
      if (store.id.startsWith('stack-')) eggsReady += eggs;
      else {
        eggsCollected += eggs;
        if (eggs > 0) eggsHandled = true;
      }
      // Old saves can contain an emptied egg stack after the player collected
      // or sold the clutch before this lesson existed. Credit that real action
      // instead of asking for an impossible second clutch with no feed left.
      if (Object.hasOwn(store.items, 'eggs') && eggs <= 0) eggsHandled = true;
    }
    return {
      nowMs: this.#now() - this.#startedAt,
      hasMoved: this.#hasMoved,
      plotInReach: this.playerController.plotInReach(),
      plantedPlots: planted,
      tendCount,
      cropsHarvested: stats.cropsHarvested,
      goodsHauled: stats.goodsHauled,
      salesMade: this.#salesMade + (stats.itemsSold > 0 ? 1 : 0),
      reinvestments:
        this.#reinvestments + Math.max(0, world.buildings.length - this.#startingBuildingCount),
      eggsReady,
      eggsCollected,
      eggsHandled: eggsHandled || eggsCollected > 0,
      starterExtensionOwned: world.parcels.owns(STARTER_EXTENSION_PARCEL_ID),
      communityProjectHandled:
        this.career.town.activeProject !== null || this.career.town.completedProjectIds.length > 0,
      warningActive: this.incidents.active.some(
        (instance) => this.career.tick < instance.impactTick && !isMitigated(instance as never),
      ),
      eventsResolved: this.#incidentsResolved,
      marketOpen: this.#panel === 'market',
      buildOpen: this.#panel === 'build',
    };
  }
}
