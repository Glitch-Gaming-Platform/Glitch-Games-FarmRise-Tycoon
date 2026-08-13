import { describe, expect, it } from 'vitest';
import { STARTER_SHELTER_ID, requireCrop, type IncidentInstance } from '@farmrise/shared';
import type { InputSystem } from '@engine/input/InputSystem.js';
import { IncidentDirector } from '@game/events/IncidentDirector.js';
import { Player } from '@game/player/Player.js';
import { PlayerController } from '@game/player/PlayerController.js';
import { InteractionController } from '@game/systems/InteractionController.js';
import { plant } from '@game/world/FarmCommands.js';
import { shelterDoorPoint } from '@game/world/collisionProfiles.js';
import { chickenPose, createChickenPose } from '@game/animals/chickenMotion.js';
import { cowPose, createCowPose } from '@game/animals/cowMotion.js';
import { createSheepPose, sheepPose } from '@game/animals/sheepMotion.js';
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

    expect(labels).toEqual(['Plant Wheat', 'Tend', 'Harvest Wheat']);
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
    expect(plotPrompts).toEqual([{ label: 'Plant Wheat', secondary: 'Choose seed' }]);

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

  it('selects an explicit current-season seed and rejects a stale seasonal choice', () => {
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
    const interaction = new InteractionController(
      career,
      player,
      new PlayerController(player, world, world.physics, input),
      new IncidentDirector(career),
      input,
    );
    const selected: string[] = [];
    interaction.events.on('interaction:crop-selected', ({ cropId }) => selected.push(cropId));

    expect(interaction.seedSelectionTargetId()).toBe(placement.id);
    expect(interaction.selectCrop('radish')).toEqual({ ok: true, value: undefined });
    expect(interaction.selectedCropId).toBe('radish');
    expect(selected).toEqual(['radish']);

    const unavailable = interaction.selectCrop('tomato');
    expect(unavailable.ok).toBe(false);
    expect(interaction.selectedCropId).toBe('radish');
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
    world.carry.pickUp('wheat', 3, 1);
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
    expect(world.carry.items).toMatchObject({ wheat: 3, pea: 5 });
    expect(incidents.mostUrgent?.responseProgress).toBe(0);
  });

  it('picks up an old harvest before tending the new crop growing underneath it', () => {
    const career = makeCareer();
    const world = career.world;
    const placement = world.fields.placements[0]!;
    plant(career, placement.id, 'corn');
    world.dropAt(placement.tileX, placement.tileZ, 'cranberry', 4, 1);
    world.carry.pickUp('wheat', 2, 1);
    const at = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    const player = new Player(at.x, at.z);
    let presses = 1;
    const input = {
      wasPressed: (action: GameAction) => action === 'interact' && presses-- > 0,
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
    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Pick up 4 Cranberries', 'Tend']);
    expect(world.carry.items).toMatchObject({ wheat: 2, cranberry: 4 });
    expect(world.getPlot(placement.id)?.cropId).toBe('corn');
  });

  it('offers Harvest instead of drought tending when the targeted crop is already mature', () => {
    const career = makeCareer();
    const world = career.world;
    const placement = world.fields.placements[0]!;
    plant(career, placement.id, 'wheat');
    const plot = world.getPlot(placement.id)!;
    world.setPlot(placement.id, {
      ...plot,
      grownTicks: requireCrop('wheat').growthTicks,
      water: 0.1,
    });
    career.setIncidents([
      {
        id: 'drought-ready-crop',
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

    expect(labels).toEqual(['Harvest Wheat']);
    expect(world.getPlot(placement.id)?.cropId).toBeNull();
    expect(incidents.mostUrgent?.responseProgress).toBe(0);
  });

  it('warns once on entering a pickup range with a full pack and resets after space is freed', () => {
    const career = makeCareer();
    const world = career.world;
    const drop = world.level.animalProductDrop;
    world.dropAt(drop.tileX, drop.tileZ, 'eggs', 3, 1);
    world.carry.pickUp('wheat', world.carry.capacity);
    const at = world.grid.tileToWorld(drop.tileX, drop.tileZ);
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
    const messages: string[] = [];
    const notices: Array<string | null> = [];
    interaction.events.on('interaction:refused', ({ reason }) => messages.push(reason));
    interaction.events.on('interaction:prompt', ({ notice }) => notices.push(notice));

    interaction.fixedUpdate(STEP);
    interaction.fixedUpdate(STEP);
    expect(messages).toEqual(["You can't carry anymore. Store some items first."]);
    expect(notices).toEqual(["You can't carry anymore. Store some items first."]);

    world.carry.drain();
    interaction.fixedUpdate(STEP);
    world.carry.pickUp('wheat', world.carry.capacity);
    interaction.fixedUpdate(STEP);
    expect(messages).toHaveLength(2);
    expect(notices).toEqual([
      "You can't carry anymore. Store some items first.",
      null,
      "You can't carry anymore. Store some items first.",
    ]);
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
    expect(interaction.proximityMeters().some((meter) => meter.kind === 'water')).toBe(false);
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

  it('keeps the full-pack warning beside Tend while goods remain on the crop tile', () => {
    const { career, world, placement, interaction } = setUp();
    plant(career, placement.id, 'corn');
    world.dropAt(placement.tileX, placement.tileZ, 'pea', 5, 1);
    world.carry.pickUp('wheat', world.carry.capacity);
    const prompts: Array<{ label: string | null; notice: string | null }> = [];
    interaction.events.on('interaction:prompt', ({ label, notice }) =>
      prompts.push({ label, notice }),
    );

    interaction.fixedUpdate(STEP);

    expect(prompts).toEqual([
      {
        label: 'Tend',
        notice: "You can't carry anymore. Store some items first.",
      },
    ]);
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

  it('shows a nearby storage building capacity, free space and every stored item', () => {
    const { world, player, interaction } = setUp();
    world.structures.add({
      id: 'building-test-barn',
      kind: 'barn',
      tileX: 10,
      tileZ: 18,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: false,
    });
    world.stores.add({
      id: 'store-building-test-barn',
      buildingId: 'building-test-barn',
      tileX: 10,
      tileZ: 18,
      capacity: 120,
      preserving: false,
      items: { wheat: 12, cheese: 4, eggs: 3 },
      quality: { wheat: 1, cheese: 1, eggs: 1 },
      spoilageRemainder: {},
    });
    const at = world.grid.tileToWorld(11, 18);
    player.position.x = at.x;
    player.position.z = at.z;

    const meters = interaction.proximityMeters();
    const storage = meters.find((meter) => meter.kind === 'storage');

    expect(storage?.label).toBe('Barn storage');
    expect(storage?.detail).toBe('23/120 used · 97 until full');
    expect(storage?.contents).toEqual(['4 Cheese', '3 Eggs', '12 Wheat']);
    expect(storage?.value).toBeCloseTo(97 / 120);
    expect(storage?.urgent).toBe(false);
    expect(meters.find((meter) => meter.kind === 'freshness')?.target).toEqual(storage?.target);

    const store = world.stores.get('store-building-test-barn')!;
    store.items = {};
    const empty = interaction.proximityMeters().find((meter) => meter.kind === 'storage');
    expect(empty?.detail).toBe('0/120 used · 120 until full');
    expect(empty?.contents).toEqual([]);

    store.items = { wheat: 120 };
    const full = interaction.proximityMeters().find((meter) => meter.kind === 'storage');
    expect(full?.detail).toBe('Full · 120/120 used');
    expect(full?.value).toBe(0);
    expect(full?.urgent).toBe(true);

    const far = world.grid.tileToWorld(2, 2);
    player.position.x = far.x;
    player.position.z = far.z;
    expect(interaction.proximityMeters().some((meter) => meter.kind === 'storage')).toBe(false);
  });

  it('shows local shelter slots only while the player is beside that shelter', () => {
    const { world, player, interaction } = setUp();
    world.livestock.hydrate([
      {
        id: 'animals-sheep-capacity',
        species: 'sheep',
        shelterId: STARTER_SHELTER_ID,
        count: 1,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
    ]);

    const far = world.grid.tileToWorld(2, 2);
    player.position.x = far.x;
    player.position.z = far.z;
    expect(interaction.proximityMeters().some((meter) => meter.kind === 'shelter')).toBe(false);

    const nearby = world.grid.tileToWorld(world.level.shelter.tileX + 2, world.level.shelter.tileZ);
    player.position.x = nearby.x;
    player.position.z = nearby.z;
    const available = interaction.proximityMeters().find((meter) => meter.kind === 'shelter');
    expect(available?.target).toEqual({ kind: 'shelter', id: STARTER_SHELTER_ID });
    expect(available?.label).toBe('Starter Shelter capacity');
    expect(available?.detail).toBe('2/4 slots used · 2 available');
    expect(available?.value).toBe(0.5);
    expect(available?.urgent).toBe(false);

    world.livestock.add('sheep', 1, world.shelters.get(STARTER_SHELTER_ID)!);
    const full = interaction.proximityMeters().find((meter) => meter.kind === 'shelter');
    expect(full?.detail).toBe('Full · 4/4 slots used');
    expect(full?.value).toBe(0);
    expect(full?.urgent).toBe(true);
  });

  it('keeps storage details visible while a broken building owns the Repair prompt', () => {
    const { world, player, interaction } = setUp();
    world.structures.add({
      id: 'building-broken-barn',
      kind: 'barn',
      tileX: 10,
      tileZ: 18,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: true,
    });
    world.stores.add({
      id: 'store-building-broken-barn',
      buildingId: 'building-broken-barn',
      tileX: 10,
      tileZ: 18,
      capacity: 120,
      preserving: false,
      items: { wheat: 20 },
      quality: { wheat: 1 },
      spoilageRemainder: {},
    });
    const at = world.grid.tileToWorld(10, 18);
    player.position.x = at.x;
    player.position.z = at.z;
    const prompts: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => prompts.push(label));

    interaction.fixedUpdate(STEP);

    expect(prompts).toEqual(['Repair Barn']);
    expect(interaction.proximityMeters().map((meter) => meter.kind)).toEqual([
      'freshness',
      'storage',
    ]);
  });

  it('does not show storage capacity before the building has finished construction', () => {
    const { world, player, interaction } = setUp();
    world.structures.add({
      id: 'building-unfinished-barn',
      kind: 'barn',
      tileX: 10,
      tileZ: 18,
      rotation: 0,
      remainingBuildTicks: 10,
      broken: false,
    });
    world.stores.add({
      id: 'store-building-unfinished-barn',
      buildingId: 'building-unfinished-barn',
      tileX: 10,
      tileZ: 18,
      capacity: 120,
      preserving: false,
      items: {},
      quality: {},
      spoilageRemainder: {},
    });
    const at = world.grid.tileToWorld(10, 18);
    player.position.x = at.x;
    player.position.z = at.z;

    expect(interaction.proximityMeters().some((meter) => meter.kind === 'storage')).toBe(false);
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

  it('explains hen feed and egg output when the player walks beside a chicken', () => {
    const { career, world, player, interaction } = setUp();
    world.stores.withdrawStoredAnywhere('corn', world.stores.storedTotalOf('corn'));
    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const pose = chickenPose(
      shelter,
      0,
      world.livestock.countOf('chicken'),
      0,
      0,
      1,
      createChickenPose(),
    );
    player.position.x = pose.x;
    player.position.z = pose.z;

    const animal = interaction.proximityMeters().find((meter) => meter.kind === 'animal');
    expect(animal?.label).toBe('2 Hens make 8 Eggs');
    expect(animal?.detail).toBe('Store 2 Corn each cycle · 0/2 stored');
    expect(animal?.urgent).toBe(true);
    expect(animal?.target.kind).toBe('animal');
    void career;
  });

  it('explains cow feed and milk output when the player walks beside a cow', () => {
    const { world, player, interaction } = setUp();
    world.livestock.hydrate([
      {
        id: 'animals-cows',
        species: 'cow',
        shelterId: 'shelter-starter',
        count: 1,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
    ]);
    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const pose = cowPose(shelter, 0, 1, 0, 1, createCowPose());
    player.position.x = pose.x;
    player.position.z = pose.z;

    const animal = interaction.proximityMeters().find((meter) => meter.kind === 'animal');
    expect(animal?.label).toBe('1 Dairy cow makes 6 Milk');
    expect(animal?.detail).toBe('Store 3 Clover each cycle · 0/3 stored');
    expect(animal?.urgent).toBe(true);
  });

  it('explains the longer sheep feed and wool cycle beside the flock', () => {
    const { world, player, interaction } = setUp();
    world.livestock.hydrate([
      {
        id: 'animals-sheep',
        species: 'sheep',
        shelterId: STARTER_SHELTER_ID,
        count: 1,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
    ]);
    world.stores.withdrawStoredAnywhere('corn', world.stores.storedTotalOf('corn'));
    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const pose = sheepPose(shelter, 0, 1, 0, 1, createSheepPose());
    player.position.x = pose.x;
    player.position.z = pose.z;

    const animal = interaction.proximityMeters().find((meter) => meter.kind === 'animal');
    expect(animal?.label).toBe('1 Sheep makes 4 Wool');
    expect(animal?.detail).toBe('Store 2 Corn each cycle · 0/2 stored');
    expect(animal?.urgent).toBe(true);
  });
});
