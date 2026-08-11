/**
 * Schedules and resolves incidents.
 *
 * Replaces EventDirector, which could hold one warned event with a boolean
 * mitigation. This one keeps several live at once, targets specific entities by
 * id, tracks how much of a physical response the player actually performed, and
 * persists all of it - so a disaster cannot be dodged by reloading
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §40).
 */
import {
  MAX_CONCURRENT_INCIDENTS,
  applyResponseWork,
  chooseIncident,
  cooldownUntil,
  eligibleIncidents,
  getIncident,
  incidentChancePerTick,
  incidentPhase,
  isMitigated,
  projectDroughtRelief,
  requiredWork,
  resolvedMultiplier,
  rollSeverity,
  scheduleIncident,
  claimAmount,
  cents,
  ok,
  ruleViolation,
  type IncidentDefinition,
  type IncidentInstance,
  type Result,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { Career } from '../career/Career.js';

export interface IncidentDirectorEvents extends Record<string, unknown> {
  'incident:warned': { instance: IncidentInstance; definition: IncidentDefinition };
  'incident:impact': { instance: IncidentInstance; definition: IncidentDefinition };
  'incident:resolved': {
    instance: IncidentInstance;
    definition: IncidentDefinition;
    mitigated: boolean;
    reimbursed: number;
  };
  'incident:response-progressed': { instanceId: string; progress: number; required: number };
}

export class IncidentDirector {
  readonly events = new EventBus<IncidentDirectorEvents>();
  #randomSchedulingEnabled = true;

  constructor(private readonly career: Career) {}

  get active(): readonly IncidentInstance[] {
    return this.career.incidents.filter((instance) => !instance.resolved);
  }

  /** The one the HUD should be shouting about: soonest impact first. */
  get mostUrgent(): IncidentInstance | null {
    return [...this.active].sort((a, b) => a.impactTick - b.impactTick)[0] ?? null;
  }

  /** Soonest incident that can still accept response work. */
  get mostUrgentActionable(): IncidentInstance | null {
    return (
      [...this.active]
        .filter((instance) => !isMitigated(instance as never))
        .sort((a, b) => a.impactTick - b.impactTick)[0] ?? null
    );
  }

  definitionOf(instance: IncidentInstance): IncidentDefinition | undefined {
    return getIncident(instance.definitionId);
  }

  /**
   * Guarantees one honest warning for the first-session incident lesson.
   *
   * Random scheduling made the lesson arrive after onboarding had finished,
   * sometimes for a drought the player had already mitigated by normal crop
   * care. The tutorial now requests a minor fox warning only after the player
   * has collected eggs, when starter hens are known to exist and the response
   * is still actionable.
   */
  ensureOnboardingWarning(): IncidentInstance | null {
    const existing = [...this.active]
      .filter(
        (instance) => this.career.tick < instance.impactTick && !isMitigated(instance as never),
      )
      .sort((a, b) => a.impactTick - b.impactTick)[0];
    if (existing) return existing;
    if (this.active.length >= MAX_CONCURRENT_INCIDENTS) return null;

    const definition = getIncident('incident-fox-raid');
    if (!definition) return null;
    const candidates = this.career.world.livestock.incidentCandidates();
    if (candidates.length === 0) return null;
    const scheduled = scheduleIncident({
      definition,
      siteId: this.career.world.id,
      nowTick: this.career.tick,
      severity: 'minor',
      candidates,
      rng: this.career.rng('incidents'),
    });
    if (!scheduled.ok) return null;

    const instance: IncidentInstance = {
      ...(scheduled.value as unknown as IncidentInstance),
      appliedMultiplier: null,
    };
    this.career.setIncidents([...this.career.incidents, instance]);
    this.career.setIncidentCooldown(definition.id, cooldownUntil(definition, this.career.tick));
    this.events.emit('incident:warned', { instance, definition });
    return instance;
  }

  fixedUpdate(dtTicks: number): void {
    this.#advanceExisting();
    this.#maybeSchedule(dtTicks);
  }

  /** Existing incidents keep advancing; this only gates new random warnings. */
  setRandomSchedulingEnabled(enabled: boolean): void {
    this.#randomSchedulingEnabled = enabled;
  }

  /**
   * Applies one unit of the player's response work.
   *
   * Work done after impact still counts, at half rate: arriving late should be
   * better than not arriving, or a player who is losing simply stops playing.
   */
  respond(instanceId: string, responseKind: string, units = 1): Result<void> {
    const instance = this.career.incidents.find((entry) => entry.id === instanceId);
    if (!instance) return ruleViolation('That is not happening any more.');

    const definition = getIncident(instance.definitionId);
    const response = definition?.responses.find((entry) => entry.kind === responseKind);
    if (!definition || !response) return ruleViolation('That is not a way to answer this.');
    if (isMitigated(instance as never)) return ruleViolation('That is already dealt with.');
    if (
      response.kind === 'pay' &&
      incidentPhase(instance as never, this.career.tick) !== 'warning'
    ) {
      return ruleViolation('It is too late to arrange that now. Work the problem on the farm.');
    }

    if (response.cost > 0 && instance.responseProgress === 0) {
      if (this.career.balance < response.cost) return ruleViolation('You cannot afford that.');
      this.career.adjustBalance(cents(-response.cost), 'incident response');
    }

    const updated = applyResponseWork(instance as never, responseKind, this.career.tick, units);
    if (!updated.ok) return updated;

    const next = updated.value as unknown as IncidentInstance;
    this.career.setIncidents(
      this.career.incidents.map((entry) => (entry.id === instanceId ? next : entry)),
    );
    if (isMitigated(next as never)) this.#completeResponse(next, definition, response.kind);
    this.events.emit('incident:response-progressed', {
      instanceId,
      progress: next.responseProgress,
      required: requiredWork(definition, response.kind, next.severity),
    });
    return ok(undefined);
  }

  #advanceExisting(): void {
    const now = this.career.tick;
    let changed = false;
    const next: IncidentInstance[] = [];

    for (const instance of this.career.incidents) {
      if (instance.resolved) continue;
      const definition = getIncident(instance.definitionId);
      if (!definition) {
        changed = true;
        continue;
      }

      const phase = incidentPhase(instance as never, now);
      if (phase === 'warning') {
        next.push(instance);
        continue;
      }

      if (phase === 'active') {
        if (instance.appliedMultiplier === null) {
          const applied = this.#applyImpact(instance, definition);
          next.push(applied);
          changed = true;
          this.events.emit('incident:impact', { instance: applied, definition });
        } else {
          next.push(instance);
        }
        continue;
      }

      const mitigated = isMitigated(instance as never);
      const reimbursed = this.#reimburse(instance);
      if (instance.responseKind === 'move_animals') {
        for (const groupId of instance.targetIds)
          this.career.world.livestock.setSheltered(groupId, false);
      }
      if (definition.target === 'processor') {
        for (const buildingId of instance.targetIds) {
          this.career.world.structures.setBroken(buildingId, false);
        }
      }
      next.push({ ...instance, resolved: true });
      changed = true;
      this.career.bump('incidentsSurvived');
      if (mitigated) this.career.bump('incidentsMitigated');
      this.events.emit('incident:resolved', {
        instance,
        definition,
        mitigated,
        reimbursed,
      });
    }

    if (changed) this.career.setIncidents(next);
  }

  /**
   * Applies the incident to exactly the entities it named.
   *
   * Targeting by id rather than by area is what lets the UI mark the specific
   * beds, animals or machine that are in danger, which is the difference
   * between a warning the player can act on and a message they can only read.
   */
  #applyImpact(instance: IncidentInstance, definition: IncidentDefinition): IncidentInstance {
    const world = this.career.world;
    let multiplier = resolvedMultiplier(instance as never);
    if (definition.id === 'incident-drought') {
      const relief = projectDroughtRelief(this.career.town.completedProjectIds);
      multiplier = 1 - (1 - multiplier) * relief;
    }

    switch (definition.target) {
      case 'plots':
        for (const plotId of instance.targetIds) world.fields.applyMultiplier(plotId, multiplier);
        break;
      case 'animals':
        for (const groupId of instance.targetIds) {
          const group = world.livestock.get(groupId);
          if (!group || group.sheltered) continue;
          world.livestock.removeTo(groupId, group.count * (1 - multiplier));
        }
        break;
      case 'carried_goods':
        world.carry.spill(multiplier);
        break;
      case 'stored_goods':
        for (const storeId of instance.targetIds) {
          const store = world.stores.get(storeId);
          if (!store || store.preserving) continue;
          for (const [itemId, quantity] of Object.entries(store.items)) {
            const kept = Math.floor(quantity * multiplier);
            if (kept < quantity) world.stores.withdraw(storeId, itemId, quantity - kept);
          }
        }
        break;
      case 'processor':
        if (multiplier < 1) {
          for (const buildingId of instance.targetIds) world.structures.setBroken(buildingId, true);
        }
        break;
      case 'contract': {
        const targetIds = new Set(instance.targetIds);
        this.career.setContracts(
          this.career.contracts.map((contract) => {
            if (!targetIds.has(contract.id) || contract.status !== 'open') return contract;
            const remaining = Math.max(1, contract.deadlineTick - this.career.tick);
            return {
              ...contract,
              deadlineTick: this.career.tick + Math.max(1, Math.floor(remaining * multiplier)),
            };
          }),
        );
        break;
      }
      default:
        break;
    }

    return { ...instance, appliedMultiplier: multiplier };
  }

  #completeResponse(
    instance: IncidentInstance,
    definition: IncidentDefinition,
    responseKind: string,
  ): void {
    const world = this.career.world;
    if (responseKind === 'move_animals') {
      for (const groupId of instance.targetIds) world.livestock.setSheltered(groupId, true);
      return;
    }
    if (responseKind === 'repair' && definition.target === 'processor') {
      for (const buildingId of instance.targetIds) world.structures.setBroken(buildingId, false);
      return;
    }
    if (responseKind !== 'unload_processor') return;

    for (const buildingId of instance.targetIds) {
      const building = world.structures.get(buildingId);
      const processor = world.processing.forBuilding(buildingId);
      if (!building || !processor) continue;
      const recovered = world.processing.unload(processor.id);
      for (const [itemId, quantity] of Object.entries(recovered)) {
        world.depositNear(building.tileX, building.tileZ, itemId, quantity, 1);
      }
    }
  }

  #reimburse(instance: IncidentInstance): number {
    const insurance = this.career.insurance;
    if (!insurance || instance.appliedMultiplier === null) return 0;
    // Loss is approximated from how much was taken rather than tracked per
    // item: the policy exists to blunt a bad day, not to price it exactly.
    const loss = Math.round((1 - instance.appliedMultiplier) * 4_000);
    const payout = claimAmount(cents(loss), insurance.coverage);
    if (payout <= 0) return 0;
    this.career.adjustBalance(payout, 'insurance claim');
    this.career.setInsurance({ ...insurance, claimsMade: insurance.claimsMade + 1 });
    return payout;
  }

  #maybeSchedule(dtTicks: number): void {
    if (!this.#randomSchedulingEnabled) return;
    if (this.active.length >= MAX_CONCURRENT_INCIDENTS) return;

    const rng = this.career.rng('incidents');
    const chance = incidentChancePerTick(this.career.season, this.career.stage) * dtTicks;
    if (!rng.chance(chance)) return;

    const world = this.career.world;
    const eligible = eligibleIncidents({
      stage: this.career.stage,
      nowTick: this.career.tick,
      season: this.career.season,
      cooldowns: this.career.incidentCooldowns,
      activeCount: this.active.length,
      availableTargets: {
        plots: world.fields.incidentCandidates(),
        animals: world.livestock.incidentCandidates(),
        carried_goods: world.carry.isEmpty ? [] : ['carried'],
        stored_goods: this.#exposedStores(),
        processor: world.processing.incidentCandidates(),
        worker: world.workforce.incidentCandidates(),
        contract: this.career.contracts
          .filter((contract) => contract.status === 'open')
          .map((contract) => contract.id),
      },
    });

    const definition = chooseIncident(eligible, rng);
    if (!definition) return;

    const candidates = this.#candidatesFor(definition);
    const scheduled = scheduleIncident({
      definition,
      siteId: world.id,
      nowTick: this.career.tick,
      severity: rollSeverity(rng, this.career.stage),
      candidates,
      rng,
    });
    if (!scheduled.ok) return;

    const instance: IncidentInstance = {
      ...(scheduled.value as unknown as IncidentInstance),
      appliedMultiplier: null,
    };
    this.career.setIncidents([...this.career.incidents, instance]);
    this.career.setIncidentCooldown(definition.id, cooldownUntil(definition, this.career.tick));
    this.events.emit('incident:warned', { instance, definition });
  }

  #candidatesFor(definition: IncidentDefinition): string[] {
    const world = this.career.world;
    switch (definition.target) {
      case 'plots':
        return world.fields.incidentCandidates();
      case 'animals':
        return world.livestock.incidentCandidates();
      case 'carried_goods':
        return world.carry.isEmpty ? [] : ['carried'];
      case 'stored_goods':
        return this.#exposedStores();
      case 'processor':
        return world.processing.incidentCandidates();
      case 'worker':
        return world.workforce.incidentCandidates();
      case 'contract':
        return this.career.contracts
          .filter((contract) => contract.status === 'open')
          .map((contract) => contract.id);
      default:
        return [];
    }
  }

  #exposedStores(): string[] {
    return this.career.world.stores.stores
      .filter(
        (store) => !store.preserving && Object.values(store.items).some((quantity) => quantity > 0),
      )
      .map((store) => store.id);
  }
}
