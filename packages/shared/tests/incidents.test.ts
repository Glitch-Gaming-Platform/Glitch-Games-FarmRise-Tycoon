import { describe, expect, it } from 'vitest';
import {
  INCIDENTS,
  MAX_CONCURRENT_INCIDENTS,
  applyResponseWork,
  chooseIncident,
  cooldownUntil,
  createRng,
  eligibleIncidents,
  getIncident,
  incidentChancePerTick,
  incidentPhase,
  isMitigated,
  requiredWork,
  resolvedMultiplier,
  responseFor,
  rollSeverity,
  scheduleIncident,
  type EligibilityContext,
  type IncidentInstanceState,
} from '../src/index.js';

const DROUGHT = 'incident-drought';

const context = (overrides: Partial<EligibilityContext> = {}): EligibilityContext => ({
  stage: 0,
  nowTick: 10_000,
  season: 'summer',
  cooldowns: {},
  activeCount: 0,
  availableTargets: { plots: ['plot-1', 'plot-2', 'plot-3'] },
  ...overrides,
});

const instance = (overrides: Partial<IncidentInstanceState> = {}): IncidentInstanceState => ({
  id: 'incident-under-test',
  definitionId: DROUGHT,
  siteId: 'site-millbrook',
  severity: 'moderate',
  warnedTick: 1_000,
  impactTick: 3_700,
  endsTick: 10_900,
  targetIds: ['plot-1', 'plot-2'],
  responseKind: null,
  responseProgress: 0,
  resolved: false,
  ...overrides,
});

describe('the incident catalogue', () => {
  it('warns before every incident lands', () => {
    for (const definition of INCIDENTS) {
      expect(definition.warningTicks).toBeGreaterThan(0);
    }
  });

  it('offers at least one response that is not simply paying', () => {
    for (const definition of INCIDENTS) {
      expect(definition.responses.some((response) => response.kind !== 'pay')).toBe(true);
    }
  });

  it('always leaves the player better off for responding', () => {
    for (const definition of INCIDENTS) {
      for (const response of definition.responses) {
        expect(response.mitigatedMultiplier).toBeGreaterThan(definition.unmitigatedMultiplier);
      }
    }
  });
});

describe('eligibleIncidents', () => {
  it('offers only what the career stage has reached', () => {
    const early = eligibleIncidents(context({ stage: 0 }));
    expect(early.every((definition) => definition.minimumStage === 0)).toBe(true);
  });

  it('never offers an incident with nothing to target', () => {
    // The most common way a generic event system becomes nonsense: warning a
    // player their processor will break before they own one.
    const eligible = eligibleIncidents(context({ stage: 5, availableTargets: { processor: [] } }));
    expect(eligible.every((definition) => definition.target !== 'processor')).toBe(true);
  });

  it('respects a cooldown', () => {
    const eligible = eligibleIncidents(context({ cooldowns: { [DROUGHT]: 999_999 } }));
    expect(eligible.some((definition) => definition.id === DROUGHT)).toBe(false);
  });

  it('offers nothing once the concurrent limit is reached', () => {
    expect(eligibleIncidents(context({ activeCount: MAX_CONCURRENT_INCIDENTS }))).toHaveLength(0);
  });

  it('sets a cooldown ahead of now', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    expect(cooldownUntil(definition, 5_000)).toBeGreaterThan(5_000);
  });
});

describe('chooseIncident', () => {
  it('returns null from an empty pool', () => {
    expect(chooseIncident([], createRng(1))).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const pool = eligibleIncidents(context({ stage: 3 }));
    const first = chooseIncident(pool, createRng(99))?.id;
    const second = chooseIncident(pool, createRng(99))?.id;
    expect(first).toBe(second);
  });
});

describe('scheduleIncident', () => {
  it('refuses when there is nothing to affect', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    const result = scheduleIncident({
      definition,
      siteId: 'site',
      nowTick: 0,
      severity: 'moderate',
      candidates: [],
      rng: createRng(1),
    });
    expect(result.ok).toBe(false);
  });

  it('warns first, then lands, then ends', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    const result = scheduleIncident({
      definition,
      siteId: 'site',
      nowTick: 1_000,
      severity: 'moderate',
      candidates: ['plot-1', 'plot-2', 'plot-3', 'plot-4'],
      rng: createRng(7),
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.warnedTick).toBe(1_000);
    expect(result.value.impactTick).toBeGreaterThan(result.value.warnedTick);
    expect(result.value.endsTick).toBeGreaterThan(result.value.impactTick);
  });

  it('picks distinct targets, and never more than exist', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    const result = scheduleIncident({
      definition,
      siteId: 'site',
      nowTick: 0,
      severity: 'severe',
      candidates: ['plot-1', 'plot-2'],
      rng: createRng(3),
    });
    if (!result.ok) throw new Error(result.reason);
    expect(new Set(result.value.targetIds).size).toBe(result.value.targetIds.length);
    expect(result.value.targetIds.length).toBeLessThanOrEqual(2);
    expect(result.value.targetIds.length).toBeGreaterThan(0);
  });

  it('hits more of the farm when it is severe', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const minor = scheduleIncident({
      definition,
      siteId: 'site',
      nowTick: 0,
      severity: 'minor',
      candidates,
      rng: createRng(5),
    });
    const severe = scheduleIncident({
      definition,
      siteId: 'site',
      nowTick: 0,
      severity: 'severe',
      candidates,
      rng: createRng(5),
    });
    if (!minor.ok || !severe.ok) throw new Error('Scheduling failed.');
    expect(severe.value.targetIds.length).toBeGreaterThan(minor.value.targetIds.length);
  });
});

describe('incidentPhase', () => {
  it('moves from warning to active to over', () => {
    const live = instance();
    expect(incidentPhase(live, 2_000)).toBe('warning');
    expect(incidentPhase(live, 5_000)).toBe('active');
    expect(incidentPhase(live, 99_000)).toBe('over');
  });
});

describe('responding', () => {
  it('credits work done during the warning in full', () => {
    const result = applyResponseWork(instance(), 'tend_targets', 2_000, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseProgress).toBe(1);
    expect(result.value.responseKind).toBe('tend_targets');
  });

  it('still credits work done after impact, at half rate', () => {
    const result = applyResponseWork(instance(), 'tend_targets', 5_000, 1);
    if (!result.ok) throw new Error(result.reason);
    // Arriving late must beat not arriving, or a player who is losing stops
    // trying altogether.
    expect(result.value.responseProgress).toBeGreaterThan(0);
    expect(result.value.responseProgress).toBeLessThan(1);
  });

  it('refuses work once the incident is over', () => {
    expect(applyResponseWork(instance(), 'tend_targets', 99_000).ok).toBe(false);
  });

  it('refuses a response the incident does not offer', () => {
    expect(applyResponseWork(instance(), 'repair', 2_000).ok).toBe(false);
  });

  it('refuses to switch response half way through', () => {
    const started = instance({ responseKind: 'tend_targets', responseProgress: 1 });
    expect(applyResponseWork(started, 'pay', 2_000).ok).toBe(false);
  });

  it('scales the work needed with severity', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    expect(requiredWork(definition, 'tend_targets', 'severe')).toBeGreaterThan(
      requiredWork(definition, 'tend_targets', 'minor'),
    );
  });

  it('finds the response by kind', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    expect(responseFor(definition, 'tend_targets')?.kind).toBe('tend_targets');
    expect(responseFor(definition, 'repair')).toBeUndefined();
  });
});

describe('resolvedMultiplier', () => {
  it('is the full damage when nothing was done', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    expect(resolvedMultiplier(instance())).toBe(definition.unmitigatedMultiplier);
  });

  it('gives partial credit for partial work', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    const required = requiredWork(definition, 'tend_targets', 'moderate');
    const half = resolvedMultiplier(
      instance({ responseKind: 'tend_targets', responseProgress: required / 2 }),
    );
    expect(half).toBeGreaterThan(definition.unmitigatedMultiplier);
    expect(half).toBeLessThan(responseFor(definition, 'tend_targets')?.mitigatedMultiplier ?? 1);
  });

  it('reaches the mitigated value once the work is finished', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    const required = requiredWork(definition, 'tend_targets', 'moderate');
    const done = instance({ responseKind: 'tend_targets', responseProgress: required });
    expect(isMitigated(done)).toBe(true);
    expect(resolvedMultiplier(done)).toBeCloseTo(
      responseFor(definition, 'tend_targets')?.mitigatedMultiplier ?? 0,
      5,
    );
  });

  it('never rewards more than finishing the job', () => {
    const definition = getIncident(DROUGHT);
    if (!definition) throw new Error('Missing drought definition.');
    const overdone = instance({ responseKind: 'tend_targets', responseProgress: 999 });
    expect(resolvedMultiplier(overdone)).toBeCloseTo(
      responseFor(definition, 'tend_targets')?.mitigatedMultiplier ?? 0,
      5,
    );
  });
});

describe('pressure', () => {
  it('is higher in the seasons the design says are dangerous', () => {
    expect(incidentChancePerTick('summer', 0)).toBeGreaterThan(incidentChancePerTick('spring', 0));
  });

  it('rises with the career stage, because the player has more answers', () => {
    expect(incidentChancePerTick('summer', 4)).toBeGreaterThan(incidentChancePerTick('summer', 0));
  });

  it('rolls a severity band deterministically', () => {
    expect(rollSeverity(createRng(11), 0)).toBe(rollSeverity(createRng(11), 0));
  });
});
