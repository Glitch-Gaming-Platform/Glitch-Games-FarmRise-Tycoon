import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STARTER_COMMUNITY_PROJECT_ID, type IncidentInstance } from '@farmrise/shared';
import { InputSystem } from '@engine/input/InputSystem.js';
import { ServiceContainer } from '@engine/core/ServiceContainer.js';
import { CareerDirector } from '@game/career/CareerDirector.js';
import { IncidentDirector } from '@game/events/IncidentDirector.js';
import { DEFAULT_BINDINGS, type GameAction } from '@game/GameActions.js';
import { Player } from '@game/player/Player.js';
import { PlayerController } from '@game/player/PlayerController.js';
import { SessionController } from '@game/systems/SessionController.js';
import {
  addToYard,
  depositCarriedAtYard,
  fundedCareer,
  growAndHarvest,
} from '../helpers/career.js';

const STEP = { stepSeconds: 1 / 60, tick: 0 };

function makeSession(contractsUnlocked = true, skipOnboarding = true) {
  const career = fundedCareer(100_000);
  if (contractsUnlocked) career.grant(['contracts']);
  const world = career.world;
  const spawn = world.grid.tileToWorld(world.level.spawn.tileX, world.level.spawn.tileZ);
  const player = new Player(spawn.x, spawn.z);
  const target = document.createElement('div');
  document.body.append(target);
  const input = new InputSystem<GameAction>({ target, bindings: DEFAULT_BINDINGS });
  input.init({ services: new ServiceContainer() });
  const playerController = new PlayerController(player, world, world.physics, input);
  const incidents = new IncidentDirector(career);
  const careerDirector = new CareerDirector(career);
  const session = new SessionController(
    career,
    player,
    playerController,
    incidents,
    careerDirector,
    input,
    new THREE.PerspectiveCamera(),
    { skipOnboarding, now: () => 0 },
  );
  return { career, world, player, session, incidents, careerDirector, input, target };
}

let harness: ReturnType<typeof makeSession>;
beforeEach(() => {
  harness = makeSession();
});

describe('the physical core loop', () => {
  it('persists tutorial completion in the career that is uploaded to cloud save', () => {
    const fresh = makeSession(true, false);
    expect(fresh.career.onboardingCompleted).toBe(false);
    fresh.session.skipOnboarding();
    expect(fresh.career.toSaveState().onboardingCompleted).toBe(true);
  });

  it('keeps contract offers hidden until the milestone unlocks them', () => {
    const locked = makeSession(false);
    expect(locked.session.contracts).toHaveLength(0);
  });

  it('grows into carried goods, hauls them to a store, then sells them', () => {
    const { career, session, world } = harness;
    const startingBalance = career.balance;
    const harvested = growAndHarvest(career);
    expect(harvested).toBeGreaterThan(0);
    expect(world.carry.used).toBeGreaterThan(0);

    const stored = depositCarriedAtYard(career);
    expect(stored).toBeGreaterThan(0);
    session.sell('wheat', stored);

    expect(world.stores.totalOf('wheat')).toBe(0);
    expect(career.balance).toBeGreaterThan(startingBalance);
    expect(career.statistics.itemsSold).toBe(stored);
  });

  it('pays more for fresh high-quality produce than a weathered batch', () => {
    const fresh = makeSession();
    const weathered = makeSession();
    fresh.world.stores.deposit('store-yard', 'wheat', 1, 1);
    weathered.world.stores.deposit('store-yard', 'wheat', 1, 0.2);
    let freshPayout = 0;
    let weatheredPayout = 0;
    fresh.session.events.on('session:sold', ({ payout }) => {
      freshPayout = payout;
    });
    weathered.session.events.on('session:sold', ({ payout }) => {
      weatheredPayout = payout;
    });

    fresh.session.sell('wheat', 1);
    weathered.session.sell('wheat', 1);

    expect(freshPayout).toBeGreaterThan(weatheredPayout);
  });

  it('accepts an offline buyer offer and completes it from localized storage', () => {
    const { career, session } = harness;
    const entry = session.contracts[0];
    expect(entry).toBeDefined();
    addToYard(career, entry!.offer.itemId, entry!.offer.quantity);
    const before = career.balance;

    session.accept(entry!.offer.id);
    expect(career.contracts.some((contract) => contract.id === entry!.offer.id)).toBe(true);
    session.deliver(entry!.offer.id, entry!.offer.quantity);

    expect(career.balance).toBeGreaterThan(before);
    expect(career.statistics.contractsCompleted).toBe(1);
    expect(career.relationship(entry!.offer.buyerId).deliveries).toBe(1);
  });

  it('refuses a delivery that the farm cannot cover without removing stock', () => {
    const { career, session } = harness;
    const entry = session.contracts[0]!;
    const stockBefore = career.world.stores.totalOf(entry.offer.itemId);
    session.accept(entry.offer.id);
    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));
    session.deliver(entry.offer.id, entry.offer.quantity);
    expect(refusals).toHaveLength(1);
    expect(career.world.stores.totalOf(entry.offer.itemId)).toBe(stockBefore);
  });
});

describe('progression remains continuous', () => {
  it('keeps the tutorial extension locked until eggs have been physically handled', () => {
    const { career, world, session } = makeSession(true, false);
    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));
    session.fixedUpdate(STEP);

    session.purchaseLand('parcel-starter-extension');
    expect(world.parcels.owns('parcel-starter-extension')).toBe(false);
    expect(refusals.at(-1)).toMatch(/Collect the eggs/i);

    world.carry.pickUp('eggs', 1);
    session.purchaseLand('parcel-starter-extension');
    expect(world.parcels.owns('parcel-starter-extension')).toBe(true);
    expect(career.balance).toBe(98_000);
  });

  it('opens the three-bed extension before the North Field without ending the career', () => {
    const { career, session } = harness;
    const before = career.world.parcels.count;
    session.purchaseLand('parcel-north-field');
    expect(career.world.parcels.count).toBe(before);
    session.purchaseLand('parcel-starter-extension');
    expect(career.world.parcels.count).toBe(before + 1);
    expect(
      career.world.fields.placements.filter((plot) => /^plot-n[567]$/.test(plot.id)),
    ).toHaveLength(3);
    session.purchaseLand('parcel-north-field');
    expect(career.world.parcels.count).toBe(before + 2);
    expect(career.world.fields.placements.some((plot) => plot.id === 'plot-n1')).toBe(true);
    expect(session.summary().outcome).toBe('season');
  });

  it('offers the onboarding community project only after the Starter Extension', () => {
    const { career, session } = harness;
    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));

    session.fundTownProject(STARTER_COMMUNITY_PROJECT_ID);
    expect(career.town.activeProject).toBeNull();
    expect(refusals.at(-1)).toMatch(/Starter Extension/i);

    session.purchaseLand('parcel-starter-extension');
    session.fundTownProject(STARTER_COMMUNITY_PROJECT_ID);
    expect(career.town.activeProject?.id).toBe(STARTER_COMMUNITY_PROJECT_ID);
    expect(career.balance).toBe(98_000);
  });

  it('buys livestock only while shelter space remains', () => {
    const { career, session } = harness;
    const before = career.world.livestock.totalCount();
    session.purchaseAnimal('chicken');
    expect(career.world.livestock.totalCount()).toBe(before + 1);
    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));
    for (let index = 0; index < 20; index += 1) session.purchaseAnimal('chicken');
    expect(refusals.length).toBeGreaterThan(0);
  });

  it('reports career statistics instead of a terminal win or loss', () => {
    const { career, session } = harness;
    growAndHarvest(career);
    const summary = session.summary();
    expect(summary.cropsHarvested).toBeGreaterThan(0);
    expect(summary.cyclesCompleted).toBeGreaterThan(0);
    expect(summary.stage).toBe(career.stage);
  });
});

describe('incident response and panels', () => {
  it('routes a warned response through the session and charges its real cost', () => {
    const { career, session, incidents } = harness;
    const incident: IncidentInstance = {
      id: 'session-drought',
      definitionId: 'incident-drought',
      siteId: career.world.id,
      severity: 'minor',
      warnedTick: career.tick,
      impactTick: career.tick + 100,
      endsTick: career.tick + 200,
      targetIds: [career.world.fields.placements[0]!.id],
      responseKind: null,
      responseProgress: 0,
      resolved: false,
      appliedMultiplier: null,
    };
    career.setIncidents([incident]);
    const responses: string[] = [];
    session.events.on('session:responded', ({ response }) => responses.push(response));
    const before = career.balance;

    session.respondToIncident('pay');

    expect(responses).toEqual(['pay']);
    expect(career.balance).toBeLessThan(before);
    expect(incidents.mostUrgent?.responseKind).toBe('pay');
  });

  it('does not perform a physical incident response remotely through Protect', () => {
    const { career, session, incidents } = harness;
    career.setIncidents([
      {
        id: 'session-cart-axle',
        definitionId: 'incident-cart-axle',
        siteId: career.world.id,
        severity: 'minor',
        warnedTick: career.tick,
        impactTick: career.tick + 100,
        endsTick: career.tick + 200,
        targetIds: ['carried'],
        responseKind: null,
        responseProgress: 0,
        resolved: false,
        appliedMultiplier: null,
      },
    ]);
    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));

    session.respondToIncident();

    expect(refusals).toContain('Go to the marked problem and use Work to answer it.');
    expect(incidents.mostUrgent?.responseKind).toBeNull();
  });

  it('opens, toggles, and prevents placement and a panel coexisting', () => {
    const { session } = harness;
    session.togglePanel('market');
    expect(session.panel).toBe('market');
    session.togglePanel('market');
    expect(session.panel).toBe('none');

    session.chooseBuilding('road');
    expect(session.placement.active).toBe(true);
    session.openPanel('build');
    expect(session.placement.active).toBe(false);
    expect(session.panel).toBe('build');
    session.openPanel('career');
    expect(session.panel).toBe('career');
    session.openPanel('town');
    expect(session.panel).toBe('town');
  });

  it('keeps contract offers refreshing on the career clock', () => {
    const { career, session } = harness;
    const firstIds = session.contracts.map((entry) => entry.offer.id);
    career.advance(60 * 300);
    session.fixedUpdate(STEP);
    expect(session.contracts.length).toBeGreaterThan(0);
    expect(session.contracts.map((entry) => entry.offer.id)).not.toEqual(firstIds);
  });
});
