import { describe, expect, it } from 'vitest';
import { BUILDINGS, getIncident, requireCrop, type IncidentInstance } from '@farmrise/shared';
import { IncidentDirector } from '@game/events/IncidentDirector.js';
import { Career } from '@game/career/Career.js';
import { createIncidentReviewCareer } from '@game/debug/incidentReview.js';
import { build, buyLand, harvest, plant, tend } from '@game/world/FarmCommands.js';
import { firstPlotId, fundedCareer, makeCareer } from '../helpers/career.js';

function drought(careerTick: number, targetIds: readonly string[]): IncidentInstance {
  return {
    id: `test-drought-${careerTick}`,
    definitionId: 'incident-drought',
    siteId: 'site-millbrook',
    severity: 'minor',
    warnedTick: careerTick,
    impactTick: careerTick + 5,
    endsTick: careerTick + 15,
    targetIds: [...targetIds],
    responseKind: null,
    responseProgress: 0,
    resolved: false,
    appliedMultiplier: null,
  };
}

function advance(career: ReturnType<typeof makeCareer>, director: IncidentDirector, ticks: number) {
  for (let tick = 0; tick < ticks; tick += 1) {
    career.advance(1);
    director.fixedUpdate(1);
  }
}

describe('a production cycle', () => {
  it('turns seed money into produce worth more than the seed', () => {
    const career = makeCareer();
    const startingBalance = career.balance;
    let harvested = 0;

    for (const placement of career.world.fields.placements) {
      expect(plant(career, placement.id, 'wheat').ok).toBe(true);
      expect(tend(career, placement.id).ok).toBe(true);
    }
    const afterPlanting = career.balance;
    career.advance(requireCrop('wheat').growthTicks * 2);

    for (const placement of career.world.fields.placements) {
      const result = harvest(career, placement.id);
      if (result.ok) harvested += result.value.carried + result.value.leftInField;
    }

    expect(afterPlanting).toBeLessThan(startingBalance);
    expect(harvested).toBeGreaterThan(0);
    expect(afterPlanting + harvested * requireCrop('wheat').baseUnitPrice).toBeGreaterThan(
      startingBalance,
    );
  });
});

describe('warned incidents', () => {
  it('can pause random scheduling without freezing an existing incident', () => {
    const career = fundedCareer();
    const incident = drought(career.tick, [firstPlotId(career)]);
    career.setIncidents([incident]);
    const director = new IncidentDirector(career);
    director.setRandomSchedulingEnabled(false);

    advance(career, director, 5);
    expect(career.world.getPlot(firstPlotId(career))?.eventMultiplier).toBeLessThan(1);
  });

  it('creates one fresh actionable warning for the onboarding lesson', () => {
    const career = fundedCareer();
    const director = new IncidentDirector(career);

    const warning = director.ensureOnboardingWarning();
    expect(warning?.definitionId).toBe('incident-fox-raid');
    expect(warning?.impactTick).toBeGreaterThan(career.tick);
    expect(director.mostUrgentActionable?.id).toBe(warning?.id);
    expect(director.ensureOnboardingWarning()?.id).toBe(warning?.id);

    expect(director.respond(warning!.id, 'pay').ok).toBe(true);
    expect(director.mostUrgentActionable).toBeNull();
  });

  it('persists a warning window before impact and targets only named plots', () => {
    const career = makeCareer();
    const plotId = firstPlotId(career);
    expect(plant(career, plotId, 'wheat').ok).toBe(true);
    const incident = drought(career.tick, [plotId]);
    career.setIncidents([incident]);
    const director = new IncidentDirector(career);
    const impacts: string[] = [];
    director.events.on('incident:impact', ({ instance }) => impacts.push(instance.id));

    advance(career, director, 4);
    expect(impacts).toHaveLength(0);
    expect(director.mostUrgent?.impactTick).toBeGreaterThan(career.tick);
    advance(career, director, 1);
    expect(impacts).toEqual([incident.id]);
    expect(career.world.getPlot(plotId)?.eventMultiplier).toBeLessThan(1);
  });

  it('lets the player pay during warning and records partial or complete mitigation', () => {
    const career = fundedCareer();
    const plotId = firstPlotId(career);
    career.setIncidents([drought(career.tick, [plotId])]);
    const director = new IncidentDirector(career);
    const before = career.balance;
    const result = director.respond(director.mostUrgent!.id, 'pay');
    expect(result.ok).toBe(true);
    expect(career.balance).toBe(before - getIncident('incident-drought')!.responses[0]!.cost);

    advance(career, director, 5);
    expect(career.world.getPlot(plotId)?.eventMultiplier).toBeGreaterThan(0.35);
  });

  it('refuses a response after the incident has ended', () => {
    const career = fundedCareer();
    const incident = drought(career.tick, [firstPlotId(career)]);
    career.setIncidents([incident]);
    const director = new IncidentDirector(career);
    advance(career, director, 16);
    expect(director.respond(incident.id, 'pay').ok).toBe(false);
  });

  it('leaves a damaged farm recoverable', () => {
    const career = makeCareer();
    const plotId = firstPlotId(career);
    expect(plant(career, plotId, 'wheat').ok).toBe(true);
    const plot = career.world.getPlot(plotId)!;
    career.world.setPlot(plotId, { ...plot, eventMultiplier: 0.35 });
    career.advance(requireCrop('wheat').growthTicks * 3);
    const result = harvest(career, plotId);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.carried + result.value.leftInField : 0).toBeGreaterThan(0);
  });

  it('turns an unmitigated road washout into a real contract deadline loss', () => {
    const review = createIncidentReviewCareer('incident-blocked-road').state;
    const career = Career.fromSaveState({
      ...review,
      incidents: review.incidents.map((incident) => ({
        ...incident,
        impactTick: review.tick + 1,
        endsTick: review.tick + 10,
      })),
    });
    const director = new IncidentDirector(career);
    director.setRandomSchedulingEnabled(false);
    const before = career.contracts[0]!.deadlineTick;

    advance(career, director, 1);

    expect(career.contracts[0]!.deadlineTick).toBeLessThan(before);
    expect(career.contracts[0]!.deadlineTick).toBeGreaterThan(career.tick);
  });

  it('repairs a processor at the end and lets unloading save the queued batch', () => {
    const review = createIncidentReviewCareer('incident-processor-breakdown').state;
    const career = Career.fromSaveState({
      ...review,
      incidents: review.incidents.map((incident) => ({
        ...incident,
        impactTick: review.tick + 1,
        endsTick: review.tick + 4,
      })),
    });
    const director = new IncidentDirector(career);
    director.setRandomSchedulingEnabled(false);
    const incident = career.incidents[0]!;

    advance(career, director, 1);
    expect(career.world.structures.get('building-mill')?.broken).toBe(true);
    expect(career.world.processing.processors[0]?.queue).not.toHaveLength(0);

    expect(director.respond(incident.id, 'unload_processor').ok).toBe(true);
    expect(director.respond(incident.id, 'unload_processor').ok).toBe(true);
    expect(career.world.processing.processors[0]?.queue).toHaveLength(0);

    advance(career, director, 3);
    expect(career.world.structures.get('building-mill')?.broken).toBe(false);
    expect(career.world.stores.totalOf('wheat')).toBeGreaterThan(0);
  });

  it('prevents a completed processor repair from breaking the machine', () => {
    const review = createIncidentReviewCareer('incident-processor-breakdown').state;
    const career = Career.fromSaveState({
      ...review,
      incidents: review.incidents.map((incident) => ({
        ...incident,
        impactTick: review.tick + 2,
        endsTick: review.tick + 6,
      })),
    });
    const director = new IncidentDirector(career);
    const incident = career.incidents[0]!;

    expect(director.respond(incident.id, 'repair').ok).toBe(true);
    expect(director.respond(incident.id, 'repair').ok).toBe(true);
    expect(director.respond(incident.id, 'repair').ok).toBe(true);
    advance(career, director, 2);

    expect(career.world.structures.get('building-mill')?.broken).toBe(false);
  });
});

describe('reinvestment', () => {
  it('completed irrigation marks adjacent beds as irrigated', () => {
    const career = fundedCareer();
    const placement = career.world.fields.placements[0]!;
    expect(build(career, 'irrigation', placement.tileX + 1, placement.tileZ).ok).toBe(true);
    career.advance(BUILDINGS.irrigation.buildTicks + 1);
    expect(plant(career, placement.id, 'corn').ok).toBe(true);
    expect(career.world.getPlot(placement.id)?.irrigated).toBe(true);
  });

  it('land remains a named, physical purchase instead of a run-ending counter', () => {
    const career = fundedCareer(50_000);
    const before = career.world.parcels.count;
    expect(buyLand(career, 'parcel-north-field').ok).toBe(false);
    expect(buyLand(career, 'parcel-starter-extension').ok).toBe(true);
    expect(career.world.parcels.count).toBe(before + 1);
    expect(
      career.world.fields.placements.filter((plot) => /^plot-n[567]$/.test(plot.id)),
    ).toHaveLength(3);
    expect(buyLand(career, 'parcel-north-field').ok).toBe(true);
    expect(career.world.fields.placements.some((plot) => plot.id === 'plot-n1')).toBe(true);
  });
});
