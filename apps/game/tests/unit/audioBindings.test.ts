import { describe, expect, it, vi } from 'vitest';
import { cents, getIncident, type IncidentInstance } from '@farmrise/shared';
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
    const audio = fakeAudio(played);
    const world = new EventBus<FarmWorldEvents>();
    const interaction = new EventBus<InteractionEvents>();
    const incidents = new EventBus<IncidentDirectorEvents>();
    const session = new EventBus<SessionEvents>();
    const enemies = new EventBus<EnemyDirectorEvents>();
    const player = new EventBus<PlayerControllerEvents>();
    const scene = {
      world: { events: world },
      interaction: { events: interaction },
      incidents: { events: incidents },
      session: { events: session },
      enemyDirector: { events: enemies },
      playerController: { events: player },
    } as unknown as FarmScene;

    const unsubscribe = bindSceneAudio(scene, audio);
    interaction.emit('interaction:performed', { target: 'plot-1', action: 'plant' });
    interaction.emit('interaction:performed', { target: 'plot-1', action: 'tend' });
    interaction.emit('interaction:performed', { target: 'plot-1', action: 'harvest' });
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
    world.emit('world:building-placed', { kind: 'road', tileX: 2, tileZ: 3 });
    world.emit('world:building-completed', { kind: 'road', tileX: 2, tileZ: 3 });
    world.emit('world:animal-purchased', { species: 'chicken', count: 1 });
    world.emit('world:parcel-acquired', {
      parcelId: 'parcel-north-field',
      displayName: 'North Field',
      bedCount: 8,
    });
    world.emit('world:storage-full', { itemId: 'wheat', spilled: 1 });
    world.emit('world:produce', { itemId: 'egg', quantity: 2 });
    player.emit('player:stepped', { sprinting: false });
    player.emit('player:stepped', { sprinting: true });
    enemies.emit('enemy:scared-off', { remaining: 1 });
    enemies.emit('enemy:raid-succeeded', { losses: 1 });
    enemies.emit('enemy:spawned', { count: 3 });
    const drought = getIncident('incident-drought')!;
    const foxRaid = getIncident('incident-fox-raid')!;
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
    incidents.emit('incident:warned', { instance: baseIncident, definition: drought });
    incidents.emit('incident:impact', {
      instance: { ...baseIncident, appliedMultiplier: 0.35 },
      definition: drought,
    });
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
      SOUND.plant,
      SOUND.tend,
      SOUND.harvest,
      SOUND.uiDeny,
      SOUND.uiClick,
      SOUND.sellSpot,
      SOUND.sellContract,
      SOUND.coinBig,
      SOUND.buildPlace,
      SOUND.buildComplete,
      SOUND.chicken,
      SOUND.goalReached,
      SOUND.uiDeny,
      SOUND.chicken,
      SOUND.footstep,
      SOUND.footstep,
      SOUND.foxFlee,
      SOUND.raidLoss,
      SOUND.foxAlert,
      SOUND.eventWarning,
      SOUND.eventImpact,
      SOUND.eventPrevented,
      SOUND.eventPrevented,
    ]);
    expect(played.find(({ id }) => id === SOUND.eventWarning)?.options.bus).toBe('ui');
    expect(played.filter(({ id }) => id === SOUND.eventImpact)).toHaveLength(1);

    unsubscribe();
    interaction.emit('interaction:performed', { target: 'plot-1', action: 'harvest' });
    expect(played).toHaveLength(23);
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
