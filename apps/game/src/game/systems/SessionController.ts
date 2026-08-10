/**
 * Owns one run: onboarding, the panels, build placement, the prevention
 * action, and deciding when the run is over.
 *
 * This exists so FarmScene can stay what the architecture doc requires it to
 * be - composition and tick order, nothing else. Every rule about *how a
 * session unfolds* lives here, and FarmScene simply ticks it.
 */
import {
  ANIMALS,
  FARM_EVENTS,
  LAND_PARCEL_COST,
  evaluateRun,
  expansionProgress,
  type BuildingKind,
  type Cents,
  type MarketOrder,
  type RunOutcome,
  type RunSummary,
} from '@farmrise/shared';
import type * as THREE from 'three';
import { EventBus } from '@engine/core/EventBus.js';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { FarmWorld } from '../world/FarmWorld.js';
import {
  buyAnimal,
  buyLand,
  fulfilContract,
  sellSpot,
  shelterCapacity,
} from '../world/FarmCommands.js';
import type { Player } from '../player/Player.js';
import type { PlayerController } from '../player/PlayerController.js';
import type { EventDirector } from '../events/EventDirector.js';
import { PlacementController } from './PlacementController.js';
import { OnboardingDirector, hasOnboardedBefore } from '../onboarding/OnboardingDirector.js';
import { OnboardingCropBoost } from '../onboarding/OnboardingCropBoost.js';
import { createContractRng, refreshLocalContracts } from '../world/localContracts.js';
import type { OnboardingContext } from '../onboarding/beats.js';
import type { GameAction } from '../GameActions.js';

export type PanelName = 'none' | 'market' | 'build';

export interface SessionEvents extends Record<string, unknown> {
  'session:panel': { panel: PanelName };
  'session:outcome': { summary: RunSummary };
  'session:refused': { action: string; reason: string };
  'session:prevented': { kind: string; cost: Cents };
  'session:sold': { itemId: string; quantity: number; payout: Cents; viaContract: boolean };
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
  readonly #onboardingCropBoost: OnboardingCropBoost;
  readonly #startingBuildingCount: number;

  #panel: PanelName = 'none';
  #outcome: RunOutcome = 'in_progress';
  #contracts: readonly MarketOrder[] = [];
  /**
   * True while contracts are generated locally. Flips to false the moment the
   * server supplies real ones, and never flips back - a signed-in player's
   * market is the server's, permanently.
   */
  #contractsAreLocal = true;
  #contractRng = createContractRng(1);
  #nextContractCheck = 0;
  #startedAt: number;
  #hasMoved = false;
  #salesMade = 0;
  #reinvestments = 0;
  #eventsResolved = 0;
  readonly #now: () => number;

  constructor(
    private readonly world: FarmWorld,
    private readonly player: Player,
    private readonly playerController: PlayerController,
    private readonly eventDirector: EventDirector,
    private readonly input: InputSystem<GameAction>,
    camera: THREE.Camera,
    options: SessionOptions = {},
  ) {
    this.#now = options.now ?? (() => performance.now());
    this.#startedAt = this.#now();
    this.onboarding = new OnboardingDirector({
      skip: options.skipOnboarding ?? hasOnboardedBefore(),
    });
    this.#onboardingCropBoost = new OnboardingCropBoost(world);
    this.#startingBuildingCount = world.buildings.length;
    this.placement = new PlacementController(world, input, camera);
    this.#contractRng = createContractRng(world.rng.state());
    this.#contracts = refreshLocalContracts([], world.tick, this.#contractRng);

    // Run scoring for events lives here because this class already owns the
    // director's lifetime. Putting it in the scene made it invisible to any
    // headless consumer.
    eventDirector.events.on('event:ended', ({ mitigated }) => {
      world.bumpStat('eventsSurvived');
      if (mitigated) world.bumpStat('eventsPrevented');
      this.#eventsResolved += 1;
    });
  }

  get panel(): PanelName {
    return this.#panel;
  }
  get outcome(): RunOutcome {
    return this.#outcome;
  }
  get contracts(): readonly MarketOrder[] {
    return this.#contracts;
  }
  get finished(): boolean {
    return this.#outcome !== 'in_progress';
  }

  /** Called with the server's orders. Takes precedence over local ones. */
  setContracts(orders: readonly MarketOrder[]): void {
    this.#contracts = orders;
    this.#contractsAreLocal = false;
  }

  get contractsAreLocal(): boolean {
    return this.#contractsAreLocal;
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

  // -- player-facing commands, all routed through here so onboarding,
  //    audio and analytics see one consistent stream of outcomes ----------

  sell(itemId: string, quantity: number): void {
    const result = sellSpot(this.world, itemId, quantity);
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

  fulfil(orderId: string): void {
    const order = this.#contracts.find((candidate) => candidate.id === orderId);
    if (!order) {
      this.events.emit('session:refused', { action: 'fulfil', reason: 'That contract is gone.' });
      return;
    }
    const result = fulfilContract(this.world, order);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'fulfil', reason: result.reason });
      return;
    }
    this.#salesMade += 1;
    this.#contracts = this.#contracts.filter((candidate) => candidate.id !== orderId);
    this.events.emit('session:sold', {
      itemId: order.itemId,
      quantity: result.value.quantity,
      payout: result.value.payout,
      viaContract: true,
    });
  }

  chooseBuilding(kind: BuildingKind): void {
    this.openPanel('none');
    this.placement.begin(kind, this.#now());
  }

  purchaseChicken(): void {
    const result = buyAnimal(this.world, 'chicken', 1);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'buyAnimal', reason: result.reason });
      return;
    }
    this.#reinvestments += 1;
  }

  purchaseLand(): void {
    const result = buyLand(this.world);
    if (!result.ok) {
      this.events.emit('session:refused', { action: 'buyLand', reason: result.reason });
      return;
    }
    this.#reinvestments += 1;
    this.openPanel('none');
  }

  /** The signature mechanic's active response. */
  prevent(): void {
    const current = this.eventDirector.current;
    if (!current || current.phase !== 'warning') {
      this.events.emit('session:refused', {
        action: 'prevent',
        reason: 'Nothing to prevent right now.',
      });
      return;
    }
    const cost = FARM_EVENTS[current.kind].preventionCost;
    const result = this.eventDirector.prevent();
    if (!result.ok) {
      this.events.emit('session:refused', {
        action: 'prevent',
        reason: result.reason ?? 'Cannot prevent that.',
      });
      return;
    }
    this.events.emit('session:prevented', { kind: current.kind, cost });
  }

  // -- ticking -----------------------------------------------------------

  fixedUpdate(context: FixedUpdateContext): void {
    if (this.finished) return;

    if (this.player.position.x !== 0 || this.player.position.z !== 0) this.#hasMoved = true;

    // Placement confirmation must see the input edge on this fixed tick.
    // Reading it later from render loses clicks when one slow frame performs
    // several catch-up steps.
    this.placement.fixedUpdate(this.#now());

    // Panel keys are read here rather than in InteractionController because
    // they are session-level, not plot-level. Placement swallows `cancel`
    // itself, so only close a panel when nothing is being placed.
    if (this.input.wasPressed('openMarket')) this.togglePanel('market');
    if (this.input.wasPressed('openBuild')) this.togglePanel('build');
    if (this.input.wasPressed('prevent')) this.prevent();
    if (this.input.wasPressed('cancel') && this.#panel !== 'none' && !this.placement.active) {
      this.openPanel('none');
    }

    // Keep the market stocked when playing offline. Checked on a slow cadence
    // rather than every tick: this only needs to be right by the time the
    // player next opens the panel.
    if (this.#contractsAreLocal && this.world.tick >= this.#nextContractCheck) {
      this.#nextContractCheck = this.world.tick + 300;
      this.#contracts = refreshLocalContracts(this.#contracts, this.world.tick, this.#contractRng);
    }

    this.#onboardingCropBoost.update(this.onboarding.currentBeat?.id === 'tend');
    const onboardingContext = this.#onboardingContext();
    this.onboarding.start(onboardingContext);
    this.onboarding.update(onboardingContext);

    this.#evaluateOutcome(context);
  }

  update(context: RenderContext): void {
    this.placement.update(context);
  }

  skipOnboarding(): void {
    this.onboarding.skip(this.#onboardingContext());
  }

  landProgress(): number {
    return expansionProgress(this.world.balance);
  }

  landAffordable(): boolean {
    return this.world.balance >= LAND_PARCEL_COST && this.world.landParcels < 2;
  }

  shelterFree(): number {
    const used = this.world.animals.reduce(
      (sum, group) => sum + group.count * (ANIMALS[group.species]?.shelterSlots ?? 1),
      0,
    );
    return Math.max(0, shelterCapacity(this.world) - used);
  }

  summary(): RunSummary {
    const stats = this.world.stats;
    return {
      outcome: this.#outcome,
      elapsedTicks: this.world.tick,
      finalBalance: this.world.balance,
      peakBalance: stats.peakBalance as Cents,
      totalEarned: stats.totalEarned as Cents,
      totalSpent: stats.totalSpent as Cents,
      cropsHarvested: stats.cropsHarvested,
      cyclesCompleted: stats.cyclesCompleted,
      eventsSurvived: stats.eventsSurvived,
      eventsPrevented: stats.eventsPrevented,
      buildingsBuilt: stats.buildingsBuilt,
    };
  }

  #onboardingContext(): OnboardingContext {
    const stats = this.world.stats;
    let tendCount = 0;
    let planted = 0;
    for (const plot of this.world.plots.values()) {
      if (plot.cropId) planted += 1;
      tendCount += plot.tendCount;
    }
    return {
      nowMs: this.#now() - this.#startedAt,
      hasMoved: this.#hasMoved,
      plotInReach: this.playerController.plotInReach(),
      plantedPlots: planted,
      tendCount,
      cropsHarvested: stats.cropsHarvested,
      salesMade: this.#salesMade,
      reinvestments:
        this.#reinvestments +
        Math.max(0, this.world.buildings.length - this.#startingBuildingCount),
      warningActive: this.eventDirector.current?.phase === 'warning',
      eventsResolved: this.#eventsResolved,
      marketOpen: this.#panel === 'market',
      buildOpen: this.#panel === 'build',
    };
  }

  #evaluateOutcome(_context: FixedUpdateContext): void {
    const next = evaluateRun(this.world.runState());
    if (next === 'in_progress' || next === this.#outcome) return;
    this.#outcome = next;
    this.openPanel('none');
    this.placement.cancel('player');
    this.events.emit('session:outcome', { summary: this.summary() });
  }
}
