import { describe, expect, it } from 'vitest';
import { cents } from '@farmrise/shared';
import { EventBus } from '../../src/engine/core/EventBus.js';
import type { AudioSystem, PlayOptions } from '../../src/engine/audio/AudioSystem.js';
import { SOUND } from '../../src/assets/audio/soundIds.js';
import { bindSceneAudio, bindStateAudio } from '../../src/bootstrap/bindAudio.js';
import type { FarmScene } from '../../src/game/scenes/FarmScene.js';
import type { FarmWorldEvents } from '../../src/game/world/FarmWorld.js';
import type { InteractionEvents } from '../../src/game/systems/InteractionController.js';
import type { EventDirectorEvents } from '../../src/game/events/EventDirector.js';
import type { EnemyDirectorEvents } from '../../src/game/enemies/EnemyDirector.js';
import type { PlayerControllerEvents } from '../../src/game/player/PlayerController.js';
import { GameStateMachine } from '../../src/game/states/GameStateMachine.js';

interface PlayedSound {
  readonly id: string;
  readonly options: PlayOptions;
}

describe('audio bindings', () => {
  it('maps every scene-level action and notice event to its designed cue', () => {
    const played: PlayedSound[] = [];
    const audio = fakeAudio(played);
    const world = new EventBus<FarmWorldEvents>();
    const interaction = new EventBus<InteractionEvents>();
    const events = new EventBus<EventDirectorEvents>();
    const enemies = new EventBus<EnemyDirectorEvents>();
    const player = new EventBus<PlayerControllerEvents>();
    const scene = {
      world: { events: world },
      interaction: { events: interaction },
      eventDirector: { events },
      enemyDirector: { events: enemies },
      playerController: { events: player },
    } as unknown as FarmScene;

    const unsubscribe = bindSceneAudio(scene, audio);
    interaction.emit('interaction:performed', { plotId: 'plot-1', action: 'plant' });
    interaction.emit('interaction:performed', { plotId: 'plot-1', action: 'tend' });
    interaction.emit('interaction:performed', { plotId: 'plot-1', action: 'harvest' });
    interaction.emit('interaction:refused', { reason: 'Not ready.' });
    interaction.emit('interaction:crop-selected', { cropId: 'corn' });
    world.emit('world:sold', {
      itemId: 'wheat',
      quantity: 1,
      payout: cents(100),
      viaContract: false,
    });
    world.emit('world:sold', {
      itemId: 'corn',
      quantity: 2,
      payout: cents(500),
      viaContract: true,
    });
    world.emit('world:sold', {
      itemId: 'pumpkin',
      quantity: 10,
      payout: cents(8_000),
      viaContract: true,
    });
    world.emit('world:building-placed', { kind: 'road', tileX: 2, tileZ: 3 });
    world.emit('world:building-completed', { kind: 'road', tileX: 2, tileZ: 3 });
    world.emit('world:animal-purchased', { species: 'chicken', count: 1 });
    world.emit('world:land-purchased', { parcels: 2 });
    world.emit('world:storage-full', { itemId: 'wheat', spilled: 1 });
    world.emit('world:produce', { itemId: 'egg', quantity: 2 });
    player.emit('player:stepped', { sprinting: false });
    player.emit('player:stepped', { sprinting: true });
    enemies.emit('enemy:scared-off', { remaining: 1 });
    enemies.emit('enemy:raid-succeeded', { losses: 1 });
    enemies.emit('enemy:spawned', { count: 3 });
    events.emit('event:warned', {
      kind: 'drought',
      message: 'Dry weather incoming.',
      ticksUntilImpact: 60,
      targets: ['plot-1'],
    });
    events.emit('event:started', { kind: 'drought', mitigated: false });
    events.emit('event:started', { kind: 'drought', mitigated: true });
    events.emit('event:started', { kind: 'fox_raid', mitigated: false });
    events.emit('event:mitigated', { kind: 'drought' });

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
    interaction.emit('interaction:performed', { plotId: 'plot-1', action: 'harvest' });
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
