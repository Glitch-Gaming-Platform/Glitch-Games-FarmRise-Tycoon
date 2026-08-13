/**
 * The persistent career: everything that outlives a season.
 *
 * FarmWorld models a place. Career models a *history* - the money, who trusts
 * you, what you chose to become, what the town thinks, and which incident is
 * already on its way. It owns the save document, because the save is precisely
 * the set of things that must survive closing the tab
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §33).
 *
 * The client is still a predictor, never an authority: every rule applied here
 * is the same shared function the server re-runs when the save is written.
 */
import {
  BUYER_IDS,
  SPECIALIZATIONS,
  activeMilestone,
  calendarAt,
  careerHealth,
  cents,
  claimMilestone,
  createRng,
  decayProsperity,
  interestForTicks,
  normalizeCareerCompatibility,
  premiumForTicks,
  seasonAt,
  seasonsBetween,
  stageProgress,
  townStageFor,
  type BuyerId,
  type BuyerRelationship,
  type AnimalSpecies,
  type CalendarDate,
  type CareerSaveState,
  type CareerStage,
  type CareerStatistics,
  type Cents,
  type IncidentInstance,
  type LoanSaveState,
  type ProgressionState,
  type Rng,
  type Season,
  type SpecializationId,
  type UnlockId,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import { FarmWorld } from '../world/FarmWorld.js';
import { getLevel, STARTER_FARM } from '../world/levels/starterFarm.js';
import { createWorkBoard } from './createWorkBoard.js';

export interface CareerEvents extends Record<string, unknown> {
  'career:balance-changed': { balance: Cents; delta: Cents; reason: string };
  'career:stage-changed': {
    stage: CareerStage;
    milestoneId: string;
    unlocked: readonly UnlockId[];
  };
  'career:unlocked': { unlocks: readonly UnlockId[] };
  'career:season-changed': { season: Season; date: CalendarDate };
  'career:trust-changed': { buyerId: BuyerId; trust: number };
  'career:specialization-chosen': { specialization: SpecializationId };
  'career:restructured': { explanation: string };
  'career:town-grew': { stage: number; displayName: string };
}

export class Career {
  readonly events = new EventBus<CareerEvents>();
  readonly world: FarmWorld;

  #state: CareerSaveState;
  #rng: Record<'incidents' | 'market' | 'disease' | 'quality', Rng>;
  #lastSeason: Season;
  #lastTownStage: number;
  readonly #workBoard;

  private constructor(state: CareerSaveState, world: FarmWorld) {
    this.#state = state;
    this.world = world;
    this.#rng = {
      incidents: createRng(state.rng.incidents),
      market: createRng(state.rng.market),
      disease: createRng(state.rng.disease),
      quality: createRng(state.rng.quality),
    };
    this.#lastSeason = seasonAt(state.tick);
    this.#lastTownStage = townStageFor(state.town.prosperity).stage;
    this.#workBoard = createWorkBoard(this);
  }

  /** Builds a career and its active site from a validated save document. */
  static fromSaveState(state: CareerSaveState): Career {
    const normalized = normalizeCareerCompatibility(state).state;
    const site =
      normalized.sites.find((entry) => entry.id === normalized.activeSiteId) ?? normalized.sites[0];
    if (!site) throw new Error('A career save must contain at least one site.');
    const level = getLevel(site.levelId) ?? STARTER_FARM;
    return new Career(normalized, FarmWorld.fromSaveState(level, site));
  }

  // -- projections ---------------------------------------------------------

  get tick(): number {
    return this.#state.tick;
  }
  get balance(): Cents {
    return this.#state.balance;
  }
  get stage(): CareerStage {
    return this.#state.stage as CareerStage;
  }
  get unlocks(): readonly string[] {
    return this.#state.unlocks;
  }
  get specialization(): SpecializationId | null {
    return this.#state.specialization as SpecializationId | null;
  }
  get statistics(): CareerStatistics {
    return this.#state.statistics;
  }
  get contracts(): CareerSaveState['contracts'] {
    return this.#state.contracts;
  }
  get incidents(): readonly IncidentInstance[] {
    return this.#state.incidents;
  }
  get loans(): readonly LoanSaveState[] {
    return this.#state.loans;
  }
  get town(): CareerSaveState['town'] {
    return this.#state.town;
  }
  get seed(): number {
    return this.#state.seed;
  }
  get careerId(): string {
    return this.#state.careerId;
  }
  get onboardingCompleted(): boolean {
    return this.#state.onboardingCompleted;
  }

  get season(): Season {
    return seasonAt(this.#state.tick);
  }

  get date(): CalendarDate {
    return calendarAt(this.#state.tick);
  }

  rng(stream: 'incidents' | 'market' | 'disease' | 'quality'): Rng {
    return this.#rng[stream];
  }

  relationship(buyerId: BuyerId): BuyerRelationship {
    return (
      this.#state.buyers[buyerId] ?? {
        trust: 0,
        deliveries: 0,
        failures: 0,
        lastDeliveryTick: null,
      }
    );
  }

  has(unlock: UnlockId): boolean {
    return this.#state.unlocks.includes(unlock);
  }

  /** Yield multiplier the chosen identity applies to a given crop. */
  specializationYield(itemId: string): number {
    const id = this.specialization;
    if (!id) return 1;
    const definition = SPECIALIZATIONS[id];
    return definition.favouredItems.includes(itemId)
      ? definition.favouredYield
      : definition.unfavouredYield;
  }

  soilStrain(): number {
    const id = this.specialization;
    return id ? SPECIALIZATIONS[id].soilStrain : 1;
  }

  /** The flat projection the milestone rules are evaluated against. */
  progression(): ProgressionState {
    return {
      stage: this.stage,
      completedMilestoneIds: this.#state.completedMilestoneIds,
      lifetimeEarned: this.#state.statistics.lifetimeEarned,
      buyersServed: BUYER_IDS.filter((id) => this.relationship(id).deliveries > 0).length,
      parcelsOwned: this.world.parcels.count,
      contractsCompleted: this.#state.statistics.contractsCompleted,
      goodsHauled: this.#state.statistics.goodsHauled,
      goodsProcessed: this.#state.statistics.goodsProcessed,
      seasonsCompleted: this.#state.statistics.seasonsCompleted,
      workersEmployed: this.world.workforce.count,
      townProjects: this.#state.town.completedProjectIds.length,
    };
  }

  milestone() {
    return activeMilestone(this.progression());
  }

  milestoneProgress(): number {
    return stageProgress(this.progression());
  }

  health() {
    return careerHealth({
      balance: this.balance,
      storedUnits: Object.values(this.world.inventory).reduce((sum, n) => sum + n, 0),
      growingPlots: this.world.fields.growingCount(),
      buildingInProgress: this.world.structures.anyInProgress(),
      debt: cents(this.#state.loans.reduce((sum, loan) => sum + loan.outstanding, 0)),
      dailyCosts: cents(
        this.world.structures.upkeepFor(60 * 240) + this.world.workforce.wagesFor(60 * 240),
      ),
    });
  }

  // -- mutations -----------------------------------------------------------

  adjustBalance(delta: Cents, reason = 'unspecified', countsAsEarned = false): void {
    this.#state.balance = cents(Math.max(0, this.#state.balance + delta));
    if (delta > 0 && countsAsEarned) this.#state.statistics.lifetimeEarned += delta;
    if (delta < 0) this.#state.statistics.lifetimeSpent += -delta;
    this.#state.statistics.peakBalance = Math.max(
      this.#state.statistics.peakBalance,
      this.#state.balance,
    );
    this.events.emit('career:balance-changed', { balance: this.#state.balance, delta, reason });
  }

  bump<K extends keyof CareerStatistics>(key: K, by = 1): void {
    this.#state.statistics[key] = (this.#state.statistics[key] + by) as CareerStatistics[K];
  }

  setRelationship(buyerId: BuyerId, relationship: BuyerRelationship): void {
    this.#state.buyers = { ...this.#state.buyers, [buyerId]: relationship };
    this.events.emit('career:trust-changed', { buyerId, trust: relationship.trust });
  }

  setContracts(contracts: CareerSaveState['contracts']): void {
    this.#state.contracts = contracts;
  }

  setIncidents(incidents: readonly IncidentInstance[]): void {
    this.#state.incidents = [...incidents];
  }

  setIncidentCooldown(definitionId: string, readyAtTick: number): void {
    this.#state.incidentCooldowns = {
      ...this.#state.incidentCooldowns,
      [definitionId]: readyAtTick,
    };
  }

  setOnboardingCompleted(completed: boolean): void {
    this.#state.onboardingCompleted = completed;
  }

  get incidentCooldowns(): Readonly<Record<string, number>> {
    return this.#state.incidentCooldowns;
  }

  addLoan(loan: LoanSaveState): void {
    this.#state.loans = [...this.#state.loans, loan];
  }

  setLoans(loans: readonly LoanSaveState[]): void {
    this.#state.loans = [...loans];
  }

  setInsurance(insurance: CareerSaveState['insurance']): void {
    this.#state.insurance = insurance;
  }

  get insurance(): CareerSaveState['insurance'] {
    return this.#state.insurance;
  }

  setTown(town: CareerSaveState['town']): void {
    this.#state.town = town;
    const stage = townStageFor(town.prosperity);
    if (stage.stage !== this.#lastTownStage) {
      this.#lastTownStage = stage.stage;
      this.events.emit('career:town-grew', {
        stage: stage.stage,
        displayName: stage.displayName,
      });
    }
  }

  chooseSpecialization(specialization: SpecializationId): void {
    this.#state.specialization = specialization;
    this.events.emit('career:specialization-chosen', { specialization });
  }

  grant(unlocks: readonly UnlockId[]): void {
    const next = new Set(this.#state.unlocks);
    for (const unlock of unlocks) next.add(unlock);
    this.#state.unlocks = [...next];
    if (unlocks.length > 0) this.events.emit('career:unlocked', { unlocks });
  }

  /**
   * Advances the career stage, if the farm has earned it.
   *
   * Returns the failure rather than throwing so the UI can explain why the
   * milestone card is not ready yet, using the same call that grants it.
   */
  claim(milestoneId: string) {
    const result = claimMilestone(milestoneId, this.progression());
    if (!result.ok) return result;

    this.#state.stage = result.value.stage;
    this.#state.completedMilestoneIds = [...this.#state.completedMilestoneIds, milestoneId];
    this.grant(result.value.unlocked);
    this.adjustBalance(result.value.milestone.reward, 'milestone');
    this.events.emit('career:stage-changed', {
      stage: result.value.stage,
      milestoneId,
      unlocked: result.value.unlocked,
    });
    return result;
  }

  // -- simulation ----------------------------------------------------------

  /**
   * Advances the career by one fixed tick.
   *
   * Order matters: the site runs first, then the career pays for what it did.
   * Interest and premiums are charged from the same accumulator pattern as
   * upkeep, so a fraction of a cent is never rounded into the player's favour.
   */
  advance(
    dtTicks: number,
    protectedFieldItems: readonly string[] = [],
    animalProductionEnabled = true,
    animalFeedWaiverSpecies: readonly AnimalSpecies[] = [],
  ): void {
    const before = this.#state.tick;
    this.#state.tick += dtTicks;

    const report = this.world.advance(dtTicks, {
      season: this.season,
      specialization: this.specialization,
      workBoard: this.#workBoard,
      protectedFieldItems,
      animalProductionEnabled,
      animalFeedWaiverSpecies,
    });
    if (report.processedUnits > 0) this.bump('goodsProcessed', report.processedUnits);

    // Interest and premiums accrue at a fraction of a cent per tick, so the
    // remainder is carried rather than floored away - otherwise a loan is free
    // and an insurance policy costs nothing, which is exactly what happened
    // before this accumulator existed.
    const financeCost =
      report.upkeep +
      report.wages +
      interestForTicks(this.#state.loans as never, dtTicks) +
      (this.#state.insurance ? premiumForTicks(this.#state.insurance.premiumPerDay, dtTicks) : 0) +
      this.#state.financeRemainder;
    const whole = Math.floor(financeCost);
    this.#state.financeRemainder = financeCost - whole;
    if (whole > 0) this.adjustBalance(cents(-whole), 'running costs');

    this.setTown({
      ...this.#state.town,
      prosperity: decayProsperity(this.#state.town.prosperity, dtTicks),
    });

    const crossed = seasonsBetween(before, this.#state.tick);
    if (crossed > 0) {
      this.#state.statistics.seasonsCompleted += crossed;
      this.#lastSeason = this.season;
      this.events.emit('career:season-changed', { season: this.season, date: this.date });
    }
  }

  get lastSeason(): Season {
    return this.#lastSeason;
  }

  // -- persistence ---------------------------------------------------------

  toSaveState(): CareerSaveState {
    const active =
      this.#state.sites.find((entry) => entry.id === this.#state.activeSiteId) ??
      this.#state.sites[0];
    const site = this.world.toSaveState(
      active?.regionId ?? 'region-millbrook-valley',
      active?.seed ?? this.#state.seed,
      this.#state.tick,
    );
    return {
      ...this.#state,
      sites: [site, ...this.#state.sites.filter((entry) => entry.id !== site.id)],
      activeSiteId: site.id,
      rng: {
        incidents: this.#rng.incidents.state(),
        market: this.#rng.market.state(),
        disease: this.#rng.disease.state(),
        quality: this.#rng.quality.state(),
      },
    };
  }
}
