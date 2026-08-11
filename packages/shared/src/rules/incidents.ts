/**
 * Scheduling and resolving incidents.
 *
 * The first playable could hold one warned event with a boolean mitigation. A
 * career needs incidents that pick specific entities, offer a response the
 * player physically performs, remember how much of that response was done, and
 * survive a reload - because an incident a player can re-roll by refreshing is
 * not a risk, it is an inconvenience (docs/PROGRESSION_GAMEPLAY_PLAN.md §40).
 */
import {
  INCIDENTS,
  MAX_CONCURRENT_INCIDENTS,
  SEVERITY_SCALE,
  getIncident,
  type IncidentDefinition,
  type IncidentResponse,
  type IncidentSeverity,
} from '../domain/incidents.js';
import { seasonDefinition, type Season } from '../domain/seasons.js';
import type { Ticks } from '../domain/time.js';
import { ok, ruleViolation, type Result } from './result.js';
import type { Rng } from './rng.js';

export interface IncidentInstanceState {
  readonly id: string;
  readonly definitionId: string;
  readonly siteId: string;
  readonly severity: IncidentSeverity;
  readonly warnedTick: Ticks;
  readonly impactTick: Ticks;
  readonly endsTick: Ticks;
  readonly targetIds: readonly string[];
  readonly responseKind: string | null;
  readonly responseProgress: number;
  readonly resolved: boolean;
}

export type IncidentPhase = 'warning' | 'active' | 'over';

export function incidentPhase(instance: IncidentInstanceState, nowTick: Ticks): IncidentPhase {
  if (nowTick < instance.impactTick) return 'warning';
  if (nowTick < instance.endsTick) return 'active';
  return 'over';
}

export interface EligibilityContext {
  readonly stage: number;
  readonly nowTick: Ticks;
  readonly season: Season;
  readonly cooldowns: Readonly<Record<string, Ticks>>;
  readonly activeCount: number;
  /** Ids of things the incident could target, by target kind. */
  readonly availableTargets: Readonly<Record<string, readonly string[]>>;
}

/**
 * Which incidents could fire right now.
 *
 * An incident with nothing to target is not eligible, which is what stops the
 * game warning a player about their processor breaking down before they own
 * one - the single most common way a generic event system becomes nonsense.
 */
export function eligibleIncidents(context: EligibilityContext): readonly IncidentDefinition[] {
  if (context.activeCount >= MAX_CONCURRENT_INCIDENTS) return [];
  return INCIDENTS.filter((definition) => {
    if (definition.minimumStage > context.stage) return false;
    const readyAt = context.cooldowns[definition.id] ?? 0;
    if (context.nowTick < readyAt) return false;
    const targets = context.availableTargets[definition.target] ?? [];
    return targets.length > 0;
  });
}

/** Weighted pick from the eligible pool, using the incidents RNG stream. */
export function chooseIncident(
  eligible: readonly IncidentDefinition[],
  rng: Rng,
): IncidentDefinition | null {
  if (eligible.length === 0) return null;
  const total = eligible.reduce((sum, definition) => sum + definition.weight, 0);
  let roll = rng.next() * total;
  for (const definition of eligible) {
    roll -= definition.weight;
    if (roll <= 0) return definition;
  }
  return eligible[eligible.length - 1] ?? null;
}

export function rollSeverity(rng: Rng, stage: number): IncidentSeverity {
  // Later stages see heavier incidents, because by then the player has the
  // tools to answer them. A severe incident at stage 0 would just be unfair.
  const roll = rng.next() + stage * 0.04;
  if (roll < 0.55) return 'minor';
  if (roll < 0.88) return 'moderate';
  return 'severe';
}

export interface ScheduleRequest {
  readonly definition: IncidentDefinition;
  readonly siteId: string;
  readonly nowTick: Ticks;
  readonly severity: IncidentSeverity;
  readonly candidates: readonly string[];
  readonly rng: Rng;
}

export function scheduleIncident(request: ScheduleRequest): Result<IncidentInstanceState> {
  const { definition, candidates, rng, severity } = request;
  if (candidates.length === 0) return ruleViolation('There is nothing for that to affect.');

  const scale = SEVERITY_SCALE[severity];
  const span = definition.targetCount.max - definition.targetCount.min;
  const wanted = Math.max(1, Math.round((definition.targetCount.min + rng.next() * span) * scale));

  const pool = [...candidates];
  const targetIds: string[] = [];
  while (targetIds.length < Math.min(wanted, pool.length)) {
    const index = rng.int(0, pool.length);
    const [picked] = pool.splice(index, 1);
    if (picked) targetIds.push(picked);
  }

  return ok({
    id: `incident-${definition.id}-${request.nowTick}`,
    definitionId: definition.id,
    siteId: request.siteId,
    severity,
    warnedTick: request.nowTick,
    impactTick: request.nowTick + definition.warningTicks,
    endsTick: request.nowTick + definition.warningTicks + definition.durationTicks,
    targetIds,
    responseKind: null,
    responseProgress: 0,
    resolved: false,
  });
}

/** Chance per tick that an incident is scheduled at all, before season pressure. */
export const BASE_INCIDENT_CHANCE_PER_TICK = 1 / (60 * 150);

export function incidentChancePerTick(season: Season, stage: number): number {
  return BASE_INCIDENT_CHANCE_PER_TICK * seasonDefinition(season).eventPressure * (1 + stage * 0.1);
}

export function responseFor(
  definition: IncidentDefinition,
  responseKind: string,
): IncidentResponse | undefined {
  return definition.responses.find((response) => response.kind === responseKind);
}

/** Work required for the chosen response, scaled by severity. */
export function requiredWork(
  definition: IncidentDefinition,
  responseKind: string,
  severity: IncidentSeverity,
): number {
  const response = responseFor(definition, responseKind);
  if (!response) return 0;
  return Math.ceil(response.workUnits * SEVERITY_SCALE[severity]);
}

export function isMitigated(instance: IncidentInstanceState): boolean {
  const definition = getIncident(instance.definitionId);
  if (!definition || !instance.responseKind) return false;
  return (
    instance.responseProgress >= requiredWork(definition, instance.responseKind, instance.severity)
  );
}

/**
 * The multiplier finally applied to everything this incident targeted.
 *
 * Partial credit is deliberate: a player who watered four of six marked beds
 * before the drought landed should be four-sixths better off, or the response
 * becomes all-or-nothing and they will stop trying once they are behind.
 */
export function resolvedMultiplier(instance: IncidentInstanceState): number {
  const definition = getIncident(instance.definitionId);
  if (!definition) return 1;
  if (!instance.responseKind) return definition.unmitigatedMultiplier;

  const response = responseFor(definition, instance.responseKind);
  if (!response) return definition.unmitigatedMultiplier;

  const required = requiredWork(definition, instance.responseKind, instance.severity);
  if (required <= 0) return response.mitigatedMultiplier;

  const ratio = Math.min(1, instance.responseProgress / required);
  return (
    definition.unmitigatedMultiplier +
    (response.mitigatedMultiplier - definition.unmitigatedMultiplier) * ratio
  );
}

/** Applies one unit of response work. Work after the impact still counts, at half rate. */
export function applyResponseWork(
  instance: IncidentInstanceState,
  responseKind: string,
  nowTick: Ticks,
  units = 1,
): Result<IncidentInstanceState> {
  const definition = getIncident(instance.definitionId);
  if (!definition) return ruleViolation('That incident no longer exists.');
  if (instance.resolved) return ruleViolation('That is already dealt with.');
  if (!responseFor(definition, responseKind)) {
    return ruleViolation('That is not a way to answer this.');
  }
  if (instance.responseKind && instance.responseKind !== responseKind) {
    return ruleViolation('You have already committed to a different response.');
  }

  const phase = incidentPhase(instance, nowTick);
  if (phase === 'over') return ruleViolation('It is too late to do anything about that.');

  const credited = phase === 'active' ? units * 0.5 : units;
  return ok({
    ...instance,
    responseKind,
    responseProgress: instance.responseProgress + credited,
  });
}

export function cooldownUntil(definition: IncidentDefinition, nowTick: Ticks): Ticks {
  return nowTick + definition.cooldownTicks;
}
