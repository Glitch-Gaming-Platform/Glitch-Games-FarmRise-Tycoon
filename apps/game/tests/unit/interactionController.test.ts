import { describe, expect, it } from 'vitest';
import { requireCrop, type IncidentInstance } from '@farmrise/shared';
import type { InputSystem } from '@engine/input/InputSystem.js';
import { IncidentDirector } from '@game/events/IncidentDirector.js';
import { Player } from '@game/player/Player.js';
import { PlayerController } from '@game/player/PlayerController.js';
import { InteractionController } from '@game/systems/InteractionController.js';
import { plant } from '@game/world/FarmCommands.js';
import { shelterDoorPoint } from '@game/world/collisionProfiles.js';
import type { GameAction } from '@game/GameActions.js';
import { makeCareer } from '../helpers/career.js';

const STEP = { stepSeconds: 1 / 60, tick: 0 };

describe('InteractionController prompts', () => {
  it('refreshes when a plot changes from empty to growing to harvestable', () => {
    const career = makeCareer();
    const world = career.world;
    const placement = world.fields.placements[0]!;
    const position = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    const player = new Player(position.x, position.z);
    const input = {
      wasPressed: () => false,
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const playerController = new PlayerController(player, world, world.physics, input);
    const interaction = new InteractionController(
      career,
      player,
      playerController,
      new IncidentDirector(career),
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);
    plant(career, placement.id, 'wheat');
    interaction.fixedUpdate(STEP);
    const plot = world.getPlot(placement.id)!;
    world.setPlot(placement.id, { ...plot, grownTicks: requireCrop('wheat').growthTicks });
    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Plant Wheat', 'Tend', 'Harvest']);
  });

  it('deposits a carried load instead of offering an overlapping empty plot', () => {
    const career = makeCareer();
    const world = career.world;
    const position = world.grid.tileToWorld(18, 15);
    const player = new Player(position.x, position.z);
    const input = {
      wasPressed: (action: GameAction) => action === 'interact',
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    world.carry.pickUp('wheat', 1);

    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      new IncidentDirector(career),
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Put down (1)']);
    expect(world.carry.isEmpty).toBe(true);
    expect(world.stores.totalOf('wheat')).toBe(1);
    expect(player.workAction).toBe('transfer');
  });

  it('collects the exact field stack named by the prompt at the edge of interaction range', () => {
    const career = makeCareer();
    const world = career.world;
    world.dropAt(19, 17, 'eggs', 3, 1);
    const position = world.grid.tileToWorld(18, 18);
    const player = new Player(position.x, position.z);
    const input = {
      wasPressed: (action: GameAction) => action === 'interact',
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;

    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      new IncidentDirector(career),
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Pick up 3 Eggs']);
    expect(world.carry.items.eggs).toBe(3);
    expect(player.workAction).toBe('transfer');
  });

  it('keeps a fox response at the shelter instead of masking a crop plot', () => {
    const career = makeCareer();
    const world = career.world;
    const incident: IncidentInstance = {
      id: 'fox-test',
      definitionId: 'incident-fox-raid',
      siteId: world.id,
      severity: 'minor',
      warnedTick: 0,
      impactTick: 600,
      endsTick: 1_200,
      targetIds: ['animals-hens'],
      responseKind: null,
      responseProgress: 0,
      resolved: false,
      appliedMultiplier: null,
    };
    career.setIncidents([incident]);
    const input = {
      wasPressed: () => false,
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const incidents = new IncidentDirector(career);

    const plot = world.fields.placements[0]!;
    const plotAt = world.grid.tileToWorld(plot.tileX, plot.tileZ);
    const plotPlayer = new Player(plotAt.x, plotAt.z);
    const plotInteraction = new InteractionController(
      career,
      plotPlayer,
      new PlayerController(plotPlayer, world, world.physics, input),
      incidents,
      input,
    );
    const plotPrompts: Array<{ label: string | null; secondary: string | null }> = [];
    plotInteraction.events.on('interaction:prompt', ({ label, secondaryLabel }) =>
      plotPrompts.push({ label, secondary: secondaryLabel }),
    );
    plotInteraction.fixedUpdate(STEP);
    expect(plotPrompts).toEqual([{ label: 'Plant Wheat', secondary: 'Change seed' }]);

    const door = shelterDoorPoint(world.grid, world.level.shelter.tileX, world.level.shelter.tileZ);
    const shelterPlayer = new Player(door.x, door.z);
    const shelterInteraction = new InteractionController(
      career,
      shelterPlayer,
      new PlayerController(shelterPlayer, world, world.physics, input),
      incidents,
      input,
    );
    const shelterLabels: Array<string | null> = [];
    shelterInteraction.events.on('interaction:prompt', ({ label }) => shelterLabels.push(label));
    shelterInteraction.fixedUpdate(STEP);
    expect(shelterLabels).toEqual(['Drive the animals in']);
  });

  it('lets the egg basket win over a simultaneous fox response at the shelter', () => {
    const career = makeCareer();
    const world = career.world;
    const drop = world.level.animalProductDrop;
    world.dropAt(drop.tileX, drop.tileZ, 'eggs', 8, 1);
    career.setIncidents([
      {
        id: 'fox-with-eggs',
        definitionId: 'incident-fox-raid',
        siteId: world.id,
        severity: 'minor',
        warnedTick: 0,
        impactTick: 600,
        endsTick: 1_200,
        targetIds: ['animals-hens'],
        responseKind: null,
        responseProgress: 0,
        resolved: false,
        appliedMultiplier: null,
      },
    ]);
    const at = world.grid.tileToWorld(drop.tileX, drop.tileZ);
    const player = new Player(at.x, at.z);
    const input = {
      wasPressed: (action: GameAction) => action === 'interact',
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const incidents = new IncidentDirector(career);
    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      incidents,
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Pick up 8 Eggs']);
    expect(world.carry.items.eggs).toBe(8);
    expect(incidents.mostUrgent?.responseProgress).toBe(0);
  });

  it('lets a harvested crop pile win over a simultaneous drought response', () => {
    const career = makeCareer();
    const world = career.world;
    const placement = world.fields.placements[0]!;
    world.dropAt(placement.tileX, placement.tileZ, 'pea', 5, 1);
    career.setIncidents([
      {
        id: 'drought-with-peas',
        definitionId: 'incident-drought',
        siteId: world.id,
        severity: 'minor',
        warnedTick: 0,
        impactTick: 600,
        endsTick: 1_200,
        targetIds: [placement.id],
        responseKind: null,
        responseProgress: 0,
        resolved: false,
        appliedMultiplier: null,
      },
    ]);
    const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    const player = new Player(at.x, at.z);
    const input = {
      wasPressed: (action: GameAction) => action === 'interact',
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const incidents = new IncidentDirector(career);
    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      incidents,
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Pick up 5 Peas']);
    expect(world.carry.items.pea).toBe(5);
    expect(incidents.mostUrgent?.responseProgress).toBe(0);
  });

  it('shelters animals when the response completes and removes the stale prompt', () => {
    const career = makeCareer();
    const world = career.world;
    career.setIncidents([
      {
        id: 'fox-test',
        definitionId: 'incident-fox-raid',
        siteId: world.id,
        severity: 'minor',
        warnedTick: 0,
        impactTick: 600,
        endsTick: 1_200,
        targetIds: ['animals-hens'],
        responseKind: null,
        responseProgress: 0,
        resolved: false,
        appliedMultiplier: null,
      },
    ]);
    const input = {
      wasPressed: () => false,
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const incidents = new IncidentDirector(career);
    const door = shelterDoorPoint(world.grid, world.level.shelter.tileX, world.level.shelter.tileZ);
    const player = new Player(door.x, door.z);
    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      incidents,
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);
    let attempts = 0;
    while (!world.livestock.get('animals-hens')?.sheltered && attempts < 4) {
      expect(incidents.respond('fox-test', 'move_animals').ok).toBe(true);
      attempts += 1;
    }
    interaction.fixedUpdate(STEP);

    expect(world.livestock.get('animals-hens')?.sheltered).toBe(true);
    expect(labels).toEqual(['Drive the animals in', null]);
  });

  it('offers road clearance at the named town route instead of nowhere', () => {
    const career = makeCareer();
    const world = career.world;
    career.setIncidents([
      {
        id: 'road-test',
        definitionId: 'incident-blocked-road',
        siteId: world.id,
        severity: 'minor',
        warnedTick: 0,
        impactTick: 600,
        endsTick: 1_200,
        targetIds: ['contract-test'],
        responseKind: null,
        responseProgress: 0,
        resolved: false,
        appliedMultiplier: null,
      },
    ]);
    const input = {
      wasPressed: () => false,
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const gate = world.grid.tileToWorld(world.level.townGate.tileX, world.level.townGate.tileZ);
    const player = new Player(gate.x, gate.z);
    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      new IncidentDirector(career),
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Clear the washout']);
  });
});

describe('proximity meters', () => {
  const setUp = () => {
    const career = makeCareer();
    const world = career.world;
    const placement = world.fields.placements[0]!;
    const position = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    const player = new Player(position.x, position.z);
    const input = {
      wasPressed: () => false,
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const playerController = new PlayerController(player, world, world.physics, input);
    const interaction = new InteractionController(
      career,
      player,
      playerController,
      new IncidentDirector(career),
      input,
    );
    return { career, world, placement, player, interaction };
  };

  it('shows nothing for a bed with nothing in it', () => {
    const { interaction } = setUp();
    expect(interaction.proximityMeters()).toHaveLength(0);
  });

  it('shows water and harvest countdown meters once something is growing there', () => {
    const { career, placement, interaction } = setUp();
    plant(career, placement.id, 'corn');

    const meters = interaction.proximityMeters();
    expect(meters).toHaveLength(2);
    expect(meters[0]?.kind).toBe('water');
    expect(meters[0]?.target).toEqual({ kind: 'plot', id: placement.id });
    expect(meters[0]?.value).toBeCloseTo(1, 5);
    expect(meters[0]?.urgent).toBe(false);
    expect(meters[1]?.kind).toBe('growth');
    expect(meters[1]?.detail).toMatch(/ready in/i);
    expect(meters[1]?.value).toBe(0);
  });

  it('falls and turns urgent as the bed dries out', () => {
    const { career, world, placement, interaction } = setUp();
    plant(career, placement.id, 'corn');
    const plot = world.getPlot(placement.id)!;
    world.setPlot(placement.id, { ...plot, water: 0.2 });

    const meter = interaction.proximityMeters()[0];
    expect(meter?.value).toBeCloseTo(0.2, 5);
    expect(meter?.urgent).toBe(true);
    expect(meter?.detail).toMatch(/thirsty/i);
  });

  it('reports an irrigated bed as handled rather than counting down', () => {
    const { career, world, placement, interaction } = setUp();
    plant(career, placement.id, 'corn');
    const plot = world.getPlot(placement.id)!;
    world.setPlot(placement.id, { ...plot, water: 0.1, irrigated: true });

    const meter = interaction.proximityMeters()[0];
    expect(meter?.value).toBe(1);
    expect(meter?.detail).toMatch(/irrigated/i);
    expect(meter?.urgent).toBe(false);
  });

  it('changes the harvest countdown to ready now at maturity', () => {
    const { career, world, placement, interaction } = setUp();
    plant(career, placement.id, 'wheat');
    const plot = world.getPlot(placement.id)!;
    world.setPlot(placement.id, {
      ...plot,
      grownTicks: requireCrop('wheat').growthTicks,
    });

    const growth = interaction.proximityMeters().find((meter) => meter.kind === 'growth');
    expect(growth?.value).toBe(1);
    expect(growth?.detail).toBe('Ready now');
    expect(growth?.urgent).toBe(true);
  });

  it('shows a freshness meter for a pile left in the field', () => {
    const { career, world, placement, player, interaction } = setUp();
    world.dropAt(placement.tileX, placement.tileZ, 'pea', 5, 1);
    const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    player.position.x = at.x;
    player.position.z = at.z;

    const freshness = interaction.proximityMeters().find((meter) => meter.kind === 'freshness');
    expect(freshness).toBeDefined();
    expect(freshness?.target.kind).toBe('store');
    expect(freshness?.value).toBeLessThan(1);
    expect(freshness?.label).toBe('5 Peas freshness');
    expect(freshness?.detail).toMatch(/1 spoils in .*left in field/i);
    void career;
  });

  it('keeps crop status visible while a nearby store owns the E action', () => {
    const { career, world, placement, interaction } = setUp();
    plant(career, placement.id, 'corn');
    world.stores.add({
      id: 'store-near-plot',
      buildingId: null,
      tileX: placement.tileX + 1,
      tileZ: placement.tileZ,
      capacity: 60,
      preserving: false,
      items: {},
      quality: {},
      spoilageRemainder: {},
    });
    world.carry.pickUp('wheat', 1);

    const meters = interaction.proximityMeters();

    expect(meters.map((meter) => meter.kind)).toEqual(['water', 'growth']);
  });

  it('keeps crop status visible while an incident response owns the E action', () => {
    const career = makeCareer();
    const world = career.world;
    const placement = world.fields.placements[0]!;
    plant(career, placement.id, 'corn');
    career.setIncidents([
      {
        id: 'drought-over-crop',
        definitionId: 'incident-drought',
        siteId: world.id,
        severity: 'minor',
        warnedTick: 0,
        impactTick: 600,
        endsTick: 1_200,
        targetIds: [placement.id],
        responseKind: null,
        responseProgress: 0,
        resolved: false,
        appliedMultiplier: null,
      },
    ]);
    const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    const player = new Player(at.x, at.z);
    const input = {
      wasPressed: () => false,
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      new IncidentDirector(career),
      input,
    );
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Water the marked beds']);
    expect(interaction.proximityMeters().map((meter) => meter.kind)).toEqual(['water', 'growth']);
  });
});
