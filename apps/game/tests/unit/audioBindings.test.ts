import { describe, expect, it, vi } from 'vitest';
import { MILESTONES, cents, getIncident, type IncidentInstance } from '@farmrise/shared';
import { EventBus } from '../../src/engine/core/EventBus.js';
import type { AudioSystem, PlayOptions } from '../../src/engine/audio/AudioSystem.js';
import { SOUND } from '../../src/assets/audio/soundIds.js';
import { bindSceneAudio, bindStateAudio, prepareAudio } from '../../src/bootstrap/bindAudio.js';
import type { FarmScene } from '../../src/game/scenes/FarmScene.js';
import type { FarmWorldEvents } from '../../src/game/world/FarmWorld.js';
import type { InteractionEvents } from '../../src/game/systems/InteractionController.js';
import type { SessionEvents } from '../../src/game/systems/SessionController.js';
import type { IncidentDirectorEvents } from '../../src/game/events/IncidentDirector.js';
import type { EnemyDirectorEvents } from '../../src/game/enemies/EnemyDirector.js';
import type { PlayerControllerEvents } from '../../src/game/player/PlayerController.js';
import type { ProcessingModelEvents } from '../../src/game/world/models/ProcessingModel.js';
import type { CareerEvents } from '../../src/game/career/Career.js';
import type { CareerDirectorEvents } from '../../src/game/career/CareerDirector.js';
import { GameStateMachine } from '../../src/game/states/GameStateMachine.js';
import { DEFAULT_MUSIC_ID } from '../../src/assets/audio/musicIds.js';
import type { AssetLoader } from '../../src/assets/loaders/AssetLoader.js';

interface PlayedSound {
  readonly id: string;
  readonly options: PlayOptions;
}

describe('audio bindings', () => {
  it('does not fetch the large generated music file in low-memory mode', () => {
    const load = vi.fn(async (_id: string) => new ArrayBuffer(0));
    const audio = { events: new EventBus(), unregister: vi.fn() } as unknown as AudioSystem;
    const release = vi.fn();

    const prepared = prepareAudio(audio, { load, release } as unknown as AssetLoader, {
      lowMemoryMusic: true,
    });

    expect(load.mock.calls.map(([id]) => id)).not.toContain(DEFAULT_MUSIC_ID);
    prepared.dispose();
  });

  it('preserves generated music loading for the desktop profile', () => {
    const load = vi.fn(async (_id: string) => new ArrayBuffer(0));
    const audio = { events: new EventBus(), unregister: vi.fn() } as unknown as AudioSystem;
    const release = vi.fn();

    const prepared = prepareAudio(audio, { load, release } as unknown as AssetLoader);

    expect(load.mock.calls.map(([id]) => id)).toContain(DEFAULT_MUSIC_ID);
    prepared.dispose();
  });

  it('maps every scene-level action and notice event to its designed cue', () => {
    const played: PlayedSound[] = [];
    const fixture = createSceneAudioFixture(played);
    const { world, interaction, session, enemies, player, processing, carry } = fixture;

    interaction.emit('interaction:performed', { target: 'plot-1', action: 'plant' });
    interaction.emit('interaction:performed', { target: 'plot-1', action: 'tend' });
    interaction.emit('interaction:performed', { target: 'plot-1', action: 'harvest' });
    interaction.emit('interaction:performed', { target: 'stack-1', action: 'collect' });
    interaction.emit('interaction:performed', { target: 'store-1', action: 'deposit' });
    interaction.emit('interaction:performed', { target: 'mill-1', action: 'repair' });
    interaction.emit('interaction:performed', {
      target: 'incident-1',
      action: 'respond',
      responseKind: 'move_animals',
    });
    interaction.emit('interaction:performed', {
      target: 'incident-2',
      action: 'respond',
      responseKind: 'repair',
    });
    interaction.emit('interaction:performed', {
      target: 'incident-3',
      action: 'respond',
      responseKind: 'haul_to_shelter',
    });
    interaction.emit('interaction:performed', {
      target: 'incident-4',
      action: 'respond',
      responseKind: 'unload_processor',
    });
    interaction.emit('interaction:refused', { reason: 'Not ready.' });
    interaction.emit('interaction:crop-selected', { cropId: 'corn' });
    session.emit('session:sold', {
      itemId: 'wheat',
      quantity: 1,
      payout: cents(100),
      viaContract: false,
    });
    session.emit('session:sold', {
      itemId: 'corn',
      quantity: 2,
      payout: cents(500),
      viaContract: true,
    });
    session.emit('session:sold', {
      itemId: 'pumpkin',
      quantity: 10,
      payout: cents(8_000),
      viaContract: true,
    });
    session.emit('session:hauled', { stored: 4, refused: 0 });
    session.emit('session:hauled', { stored: 0, refused: 0 });
    session.emit('session:responded', { incidentId: 'incident-1', response: 'pay' });
    session.emit('session:career-changed', { action: 'acceptContract' });
    session.emit('session:career-changed', { action: 'queueProcessing' });
    world.emit('world:building-placed', { kind: 'road', tileX: 2, tileZ: 3 });
    world.emit('world:building-completed', { kind: 'road', tileX: 2, tileZ: 3 });
    world.emit('world:animal-purchased', { species: 'chicken', count: 1 });
    world.emit('world:animal-purchased', { species: 'sheep', count: 1 });
    world.emit('world:animal-purchased', { species: 'cow', count: 1 });
    world.emit('world:parcel-acquired', {
      parcelId: 'parcel-north-field',
      displayName: 'North Field',
      bedCount: 8,
    });
    world.emit('world:storage-full', { itemId: 'wheat', spilled: 1 });
    world.emit('world:goods-spoiled', {
      storeId: 'stack-1',
      items: { wheat: 1 },
      lost: 1,
      emptied: false,
      inTheOpen: true,
    });
    world.emit('world:animal-hungry', {
      species: 'sheep',
      feedItemId: 'corn',
      needed: 2,
      available: 0,
    });
    world.emit('world:animal-lost', { species: 'cow', count: 1, remaining: 0 });
    world.emit('world:produce', { itemId: 'eggs', quantity: 2 });
    world.emit('world:produce', { itemId: 'wool', quantity: 4 });
    world.emit('world:produce', { itemId: 'milk', quantity: 6 });
    world.emit('world:produce', { itemId: 'flour', quantity: 2 });
    processing.emit('processing:queued', {
      processorId: 'processor-1',
      recipeId: 'recipe-flour',
      batches: 1,
    });
    processing.emit('processing:completed', {
      processorId: 'processor-1',
      itemId: 'flour',
      quantity: 2,
    });
    player.emit('player:stepped', { sprinting: false });
    carry.carrier = 'handcart';
    player.emit('player:stepped', { sprinting: true });
    enemies.emit('enemy:scared-off', { remaining: 1 });
    enemies.emit('enemy:raid-succeeded', { losses: 1 });
    enemies.emit('enemy:spawned', { count: 3 });

    expect(played.map(({ id }) => id)).toEqual([
      SOUND.plant,
      SOUND.tend,
      SOUND.harvest,
      SOUND.pickup,
      SOUND.deposit,
      SOUND.repair,
      SOUND.shooAnimals,
      SOUND.repair,
      SOUND.deposit,
      SOUND.pickup,
      SOUND.uiDeny,
      SOUND.uiClick,
      SOUND.sellSpot,
      SOUND.sellContract,
      SOUND.coinBig,
      SOUND.deposit,
      SOUND.pickup,
      SOUND.eventPrevented,
      SOUND.uiConfirm,
      SOUND.buildPlace,
      SOUND.buildComplete,
      SOUND.chicken,
      SOUND.sheep,
      SOUND.cow,
      SOUND.goalReached,
      SOUND.uiDeny,
      SOUND.uiDeny,
      'animal.sheep_2',
      SOUND.raidLoss,
      'animal.hen_2',
      'animal.sheep_3',
      'animal.cow_2',
      SOUND.processingStart,
      SOUND.processingComplete,
      SOUND.footstep,
      SOUND.cartRoll,
      SOUND.foxFlee,
      SOUND.foxAlert,
    ]);

    fixture.unsubscribe();
    interaction.emit('interaction:performed', { target: 'plot-1', action: 'harvest' });
    expect(played).toHaveLength(38);
  });

  it('gives every implemented incident a distinct warning and impact identity', () => {
    const played: PlayedSound[] = [];
    const fixture = createSceneAudioFixture(played);
    const { incidents } = fixture;
    const drought = getIncident('incident-drought')!;
    const foxRaid = getIncident('incident-fox-raid')!;
    const axle = getIncident('incident-cart-axle')!;
    const road = getIncident('incident-blocked-road')!;
    const blight = getIncident('incident-blight')!;
    const processor = getIncident('incident-processor-breakdown')!;
    const cold = getIncident('incident-cold-snap')!;
    const baseIncident: IncidentInstance = {
      id: 'audio-incident',
      definitionId: drought.id,
      siteId: 'site-millbrook',
      severity: 'minor',
      warnedTick: 0,
      impactTick: 60,
      endsTick: 120,
      targetIds: ['plot-1'],
      responseKind: null,
      responseProgress: 0,
      resolved: false,
      appliedMultiplier: null,
    };

    for (const definition of [drought, foxRaid, axle, road, blight, processor, cold]) {
      const instance = { ...baseIncident, definitionId: definition.id };
      incidents.emit('incident:warned', { instance, definition });
      incidents.emit('incident:impact', {
        instance: { ...instance, appliedMultiplier: definition.unmitigatedMultiplier },
        definition,
      });
    }
    incidents.emit('incident:impact', {
      instance: {
        ...baseIncident,
        responseKind: 'pay',
        responseProgress: 1,
        appliedMultiplier: 0.9,
      },
      definition: drought,
    });
    incidents.emit('incident:impact', {
      instance: { ...baseIncident, definitionId: foxRaid.id, appliedMultiplier: 0.4 },
      definition: foxRaid,
    });
    incidents.emit('incident:resolved', {
      instance: { ...baseIncident, responseKind: 'pay', responseProgress: 1, resolved: true },
      definition: drought,
      mitigated: true,
      reimbursed: 0,
    });

    expect(played.map(({ id }) => id)).toEqual([
      SOUND.droughtWarning,
      SOUND.droughtImpact,
      SOUND.foxRaidWarning,
      SOUND.cartAxleWarning,
      SOUND.cartAxleImpact,
      SOUND.roadWashoutWarning,
      SOUND.roadWashoutImpact,
      SOUND.blightWarning,
      SOUND.blightImpact,
      SOUND.processorBreakdownWarning,
      SOUND.processorBreakdownImpact,
      SOUND.coldSnapWarning,
      SOUND.coldSnapImpact,
      SOUND.eventPrevented,
      SOUND.eventPrevented,
    ]);
    expect(played.find(({ id }) => id === SOUND.droughtWarning)?.options.bus).toBe('ui');
    expect(new Set(played.slice(0, 13).map(({ id }) => id)).size).toBe(13);
    fixture.unsubscribe();
  });

  it('sounds seasonal and long-horizon career events without adding continuous chatter', () => {
    const played: PlayedSound[] = [];
    const fixture = createSceneAudioFixture(played);
    const milestone = MILESTONES[0]!;

    fixture.career.emit('career:season-changed', {
      season: 'summer',
      date: { year: 1, season: 'summer', day: 1, seasonTicks: 0 },
    });
    fixture.careerDirector.emit('career:milestone-claimed', { milestone });
    fixture.careerDirector.emit('career:project-completed', {
      projectId: 'project-market-road',
      displayName: 'Market Road',
    });
    fixture.careerDirector.emit('career:contract-failed', {
      contractId: 'contract-1',
      buyerId: 'buyer-market-stall',
    });
    fixture.careerDirector.emit('career:warning', { message: 'Costs are rising.' });
    fixture.careerDirector.emit('career:restructured', { explanation: 'Loan terms changed.' });

    expect(played.map(({ id }) => id)).toEqual([
      SOUND.seasonTransition,
      SOUND.goalReached,
      SOUND.buildComplete,
      SOUND.uiDeny,
      SOUND.uiDeny,
      SOUND.runFail,
    ]);
    fixture.unsubscribe();
  });

  it('covers keyboard-driven pause and scene-ready transitions', () => {
    const played: PlayedSound[] = [];
    const machine = new GameStateMachine();
    const unsubscribe = bindStateAudio(machine, fakeAudio(played));

    machine.events.emit('state:changed', { from: 'playing', to: 'paused' });
    machine.events.emit('state:changed', { from: 'paused', to: 'playing' });
    machine.events.emit('state:changed', { from: 'loading', to: 'playing' });

    expect(played.map(({ id }) => id)).toEqual([SOUND.uiOpen, SOUND.uiConfirm, SOUND.uiConfirm]);
    unsubscribe();
  });
});

function fakeAudio(played: PlayedSound[]): AudioSystem {
  return {
    play(id: string, options: PlayOptions = {}) {
      played.push({ id, options });
      return { stop: () => {} };
    },
  } as unknown as AudioSystem;
}

function createSceneAudioFixture(played: PlayedSound[]) {
  const world = new EventBus<FarmWorldEvents>();
  const interaction = new EventBus<InteractionEvents>();
  const incidents = new EventBus<IncidentDirectorEvents>();
  const session = new EventBus<SessionEvents>();
  const enemies = new EventBus<EnemyDirectorEvents>();
  const player = new EventBus<PlayerControllerEvents>();
  const processing = new EventBus<ProcessingModelEvents>();
  const career = new EventBus<CareerEvents>();
  const careerDirector = new EventBus<CareerDirectorEvents>();
  const carry = { carrier: 'arms' };
  const scene = {
    world: { events: world, processing: { events: processing }, carry },
    interaction: { events: interaction },
    incidents: { events: incidents },
    session: { events: session },
    enemyDirector: { events: enemies },
    playerController: { events: player },
    career: { events: career },
    careerDirector: { events: careerDirector },
  } as unknown as FarmScene;

  return {
    world,
    interaction,
    incidents,
    session,
    enemies,
    player,
    processing,
    career,
    careerDirector,
    carry,
    unsubscribe: bindSceneAudio(scene, fakeAudio(played)),
  };
}
