/**
 * The complete core loop, headless.
 *
 * This is the test that proves the slice: plant -> tend -> harvest -> sell ->
 * reinvest -> expand, plus the two ways a run ends. It drives the real
 * SessionController against the real world model, with only input and the
 * camera stubbed - so a regression anywhere in the chain shows up here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LAND_PARCEL_COST,
  asOrderId,
  cents,
  requireCrop,
  type MarketOrder,
} from '@farmrise/shared';
import { InputSystem } from '@engine/input/InputSystem.js';
import { ServiceContainer } from '@engine/core/ServiceContainer.js';
import { FarmWorld } from '@game/world/FarmWorld.js';
import { STARTER_FARM } from '@game/world/levels/starterFarm.js';
import { Player } from '@game/player/Player.js';
import { PlayerController } from '@game/player/PlayerController.js';
import { EventDirector } from '@game/events/EventDirector.js';
import { SessionController } from '@game/systems/SessionController.js';
import { build, harvest, plant, tend } from '@game/world/FarmCommands.js';
import { DEFAULT_BINDINGS, type GameAction } from '@game/GameActions.js';

const STEP = { stepSeconds: 1 / 60, tick: 0 };

function makeSession(options: { skipOnboarding?: boolean } = {}) {
  const world = new FarmWorld(STARTER_FARM, 42);
  const spawn = world.grid.tileToWorld(STARTER_FARM.spawn.tileX, STARTER_FARM.spawn.tileZ);
  const player = new Player(spawn.x, spawn.z);
  const target = document.createElement('div');
  document.body.append(target);
  const input = new InputSystem<GameAction>({ target, bindings: DEFAULT_BINDINGS });
  input.init({ services: new ServiceContainer() });
  const controller = new PlayerController(player, world, world.physics, input);
  const director = new EventDirector(world, { graceTicks: Number.MAX_SAFE_INTEGER });
  const session = new SessionController(
    world,
    player,
    controller,
    director,
    input,
    new THREE.PerspectiveCamera(),
    { skipOnboarding: options.skipOnboarding ?? true, now: () => 0 },
  );
  return { world, player, session, director, input };
}

/** Grows a plot to harvestable and picks it. Returns the units gained. */
function growAndHarvest(world: FarmWorld, plotId: string, cropId = 'wheat'): number {
  plant(world, plotId, cropId);
  const plot = world.getPlot(plotId)!;
  world.setPlot(plotId, { ...plot, irrigated: true });
  world.advance(requireCrop(cropId).growthTicks + 5);
  const result = harvest(world, plotId);
  return result.ok ? result.value.quantity : 0;
}

let harness: ReturnType<typeof makeSession>;
beforeEach(() => {
  harness = makeSession();
});

describe('the core loop', () => {
  it('turns a planted seed into money', () => {
    const { world, session } = harness;
    const startingBalance = world.balance;

    const picked = growAndHarvest(world, STARTER_FARM.plots[0]!.id);
    expect(picked).toBeGreaterThan(0);

    session.sell('wheat', picked);

    expect(world.inventory['wheat'] ?? 0).toBe(0);
    expect(world.balance).toBeGreaterThan(startingBalance - requireCrop('wheat').seedCost);
    expect(world.stats.itemsSold).toBe(picked);
  });

  it('carries a new player from watering through selling and placed reinvestment', () => {
    const { world, player, session } = makeSession({ skipOnboarding: false });
    const plotId = STARTER_FARM.plots[0]!.id;
    const plotPosition = world.grid.tileToWorld(
      STARTER_FARM.plots[0]!.tileX,
      STARTER_FARM.plots[0]!.tileZ,
    );
    player.position.x = plotPosition.x;
    player.position.z = plotPosition.z;

    session.fixedUpdate(STEP);
    expect(session.onboarding.currentBeat?.id).toBe('plant');

    plant(world, plotId, 'wheat');
    session.fixedUpdate(STEP);
    expect(session.onboarding.currentBeat?.id).toBe('tend');

    tend(world, plotId);
    session.fixedUpdate(STEP);
    expect(session.onboarding.currentBeat?.id).toBe('harvest');

    for (let tick = 0; tick < 420 && world.readyPlotIds().length === 0; tick += 1) {
      session.fixedUpdate(STEP);
      world.advance(1);
    }
    expect(world.readyPlotIds()).toContain(plotId);

    const harvested = harvest(world, plotId);
    expect(harvested.ok).toBe(true);
    session.fixedUpdate(STEP);
    expect(session.onboarding.currentBeat?.id).toBe('sell');

    session.sell('wheat', harvested.ok ? harvested.value.quantity : 0);
    session.fixedUpdate(STEP);
    expect(session.onboarding.currentBeat?.id).toBe('reinvest');

    expect(build(world, 'road', 0, 0).ok).toBe(true);
    expect(world.stats.buildingsBuilt).toBe(0);
    session.fixedUpdate(STEP);
    expect(session.onboarding.currentBeat?.id).toBe('goal');
  });

  it('pays more for a contract than for the same goods at spot', () => {
    const { world, session } = harness;
    const picked = growAndHarvest(world, STARTER_FARM.plots[0]!.id);

    const order: MarketOrder = {
      id: asOrderId('order-1'),
      buyerId: 'millbrook_grocers',
      itemId: 'wheat',
      quantity: picked,
      unitPrice: cents(requireCrop('wheat').baseUnitPrice * 1.4),
      deadlineTick: world.tick + 100_000,
      status: 'open',
    };
    session.setContracts([order]);

    const before = world.balance;
    session.fulfil(String(order.id));
    const contractPayout = world.balance - before;

    expect(contractPayout).toBeGreaterThan(picked * requireCrop('wheat').baseUnitPrice);
    expect(session.contracts).toHaveLength(0);
  });

  it('refuses a contract the player cannot cover, without taking the goods', () => {
    const { world, session } = harness;
    growAndHarvest(world, STARTER_FARM.plots[0]!.id);
    const held = world.inventory['wheat'] ?? 0;

    session.setContracts([
      {
        id: asOrderId('big'),
        buyerId: 'millbrook_grocers',
        itemId: 'wheat',
        quantity: held + 50,
        unitPrice: cents(100),
        deadlineTick: world.tick + 10_000,
        status: 'open',
      },
    ]);

    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));
    session.fulfil('big');

    expect(refusals).toHaveLength(1);
    expect(world.inventory['wheat']).toBe(held);
  });
});

describe('reinvestment', () => {
  it('lets the player buy a hen with the shelter they have', () => {
    const { world, session } = harness;
    world.adjustBalance(cents(50_000));
    session.purchaseChicken();
    expect(world.animals.reduce((sum, group) => sum + group.count, 0)).toBeGreaterThan(0);
  });

  it('refuses a hen when there is no shelter space', () => {
    const { world, session } = harness;
    world.adjustBalance(cents(500_000));
    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));
    for (let i = 0; i < 12; i += 1) session.purchaseChicken();
    expect(refusals.length).toBeGreaterThan(0);
  });
});

describe('the success state', () => {
  it('ends the run when the neighbouring parcel is bought', () => {
    const { world, session } = harness;
    const outcomes: string[] = [];
    session.events.on('session:outcome', ({ summary }) => outcomes.push(summary.outcome));

    world.adjustBalance(LAND_PARCEL_COST);
    session.purchaseLand();
    session.fixedUpdate(STEP);

    expect(world.landParcels).toBe(2);
    expect(outcomes).toEqual(['expanded']);
    expect(session.finished).toBe(true);
  });

  it('refuses the purchase when the money is not there', () => {
    const { world, session } = harness;
    const refusals: string[] = [];
    session.events.on('session:refused', ({ reason }) => refusals.push(reason));
    session.purchaseLand();
    expect(refusals).toHaveLength(1);
    expect(world.landParcels).toBe(1);
  });

  it('reports a summary a playtester can read', () => {
    const { world, session } = harness;
    growAndHarvest(world, STARTER_FARM.plots[0]!.id);
    const summary = session.summary();
    expect(summary.cropsHarvested).toBeGreaterThan(0);
    expect(summary.cyclesCompleted).toBeGreaterThan(0);
    expect(summary.totalSpent).toBeGreaterThan(0);
  });
});

describe('the failure state', () => {
  it('ends the run only when there is genuinely no way back', () => {
    const { world, session } = harness;
    const outcomes: string[] = [];
    session.events.on('session:outcome', ({ summary }) => outcomes.push(summary.outcome));

    // Broke, but a crop is still in the ground - that is a bad run, not a
    // lost one, and the design pillar forbids calling it over.
    plant(world, STARTER_FARM.plots[0]!.id, 'wheat');
    world.adjustBalance(cents(-world.balance));
    session.fixedUpdate(STEP);
    expect(outcomes).toHaveLength(0);

    // Now clear the field as well: no money, no goods, nothing growing.
    world.setPlot(STARTER_FARM.plots[0]!.id, {
      ...world.getPlot(STARTER_FARM.plots[0]!.id)!,
      cropId: null,
    });
    session.fixedUpdate(STEP);
    expect(outcomes).toEqual(['bankrupt']);
  });

  it('does not declare bankruptcy while goods remain to sell', () => {
    const { world, session } = harness;
    const outcomes: string[] = [];
    session.events.on('session:outcome', ({ summary }) => outcomes.push(summary.outcome));

    world.addToInventory('wheat', 4);
    world.adjustBalance(cents(-world.balance));
    session.fixedUpdate(STEP);

    expect(outcomes).toHaveLength(0);
  });
});

describe('the signature mechanic', () => {
  it('lets the player pay to prevent a warned event', () => {
    // A director that will fire quickly, wired into a session so prevention
    // goes through the real player-facing command.
    const world = new FarmWorld(STARTER_FARM, 42);
    for (const placement of STARTER_FARM.plots) plant(world, placement.id, 'wheat');
    world.adjustBalance(cents(50_000));

    const spawn = world.grid.tileToWorld(STARTER_FARM.spawn.tileX, STARTER_FARM.spawn.tileZ);
    const player = new Player(spawn.x, spawn.z);
    const target = document.createElement('div');
    document.body.append(target);
    const input = new InputSystem<GameAction>({ target, bindings: DEFAULT_BINDINGS });
    input.init({ services: new ServiceContainer() });
    const director = new EventDirector(world, { graceTicks: 1, meanIntervalTicks: 120 });
    const session = new SessionController(
      world,
      player,
      new PlayerController(player, world, world.physics, input),
      director,
      input,
      new THREE.PerspectiveCamera(),
      { skipOnboarding: true, now: () => 0 },
    );

    // Drive until a warning window opens.
    for (let i = 0; i < 5_000 && director.current?.phase !== 'warning'; i += 1) {
      world.advance(1);
      director.fixedUpdate(1);
    }
    expect(director.current?.phase).toBe('warning');

    const prevented: string[] = [];
    session.events.on('session:prevented', ({ kind }) => prevented.push(kind));
    const before = world.balance;

    session.prevent();

    expect(prevented).toHaveLength(1);
    expect(world.balance).toBeLessThan(before);
    expect(director.current?.mitigated).toBe(true);
  });

  it('refuses prevention when nothing is warned', () => {
    const { session } = harness;
    const refusals: string[] = [];
    session.events.on('session:refused', ({ action }) => refusals.push(action));
    session.prevent();
    expect(refusals).toEqual(['prevent']);
  });

  it('counts survived and prevented events in the run summary', () => {
    const { world, session, director } = harness;
    // The harness director never fires on its own; emit the lifecycle the
    // session subscribes to.
    director.events.emit('event:ended', { kind: 'drought', mitigated: true });
    director.events.emit('event:ended', { kind: 'fox_raid', mitigated: false });
    void world;

    const summary = session.summary();
    expect(summary.eventsSurvived).toBe(2);
    expect(summary.eventsPrevented).toBe(1);
  });
});

describe('panels', () => {
  it('opens, toggles and closes', () => {
    const { session } = harness;
    expect(session.panel).toBe('none');
    session.togglePanel('market');
    expect(session.panel).toBe('market');
    session.togglePanel('market');
    expect(session.panel).toBe('none');
    session.openPanel('build');
    expect(session.panel).toBe('build');
  });

  it('cancels a placement when a panel opens, so two cursors never coexist', () => {
    const { session } = harness;
    session.chooseBuilding('road');
    expect(session.placement.active).toBe(true);
    session.openPanel('market');
    expect(session.placement.active).toBe(false);
  });
});
