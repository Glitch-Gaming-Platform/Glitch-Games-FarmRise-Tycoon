/**
 * Connects game events to sound, and owns the music bed.
 *
 * This is the audio equivalent of bindHud: the simulation emits events and
 * knows nothing about audio, the audio system plays buffers and knows nothing
 * about farms, and this file is the deliberate meeting point.
 *
 * File bytes are prefetched before the first gesture, then decoded after the
 * browser unlocks its AudioContext. Procedural buffers are registered first as
 * a fallback; decoded ElevenLabs clips replace them under the same ids.
 */
import type { Unsubscribe } from '@engine/core/types.js';
import type { AudioSystem } from '@engine/audio/AudioSystem.js';
import type { AssetLoader } from '@assets/loaders/AssetLoader.js';
import { SOUND } from '@assets/audio/soundIds.js';
import { ALL_SOUND_IDS, registerProceduralSfx } from '@assets/audio/proceduralSfx.js';
import { registerProceduralMusic } from '@assets/audio/proceduralMusic.js';
import { DEFAULT_MUSIC_ID } from '@assets/audio/musicIds.js';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { GameStateMachine } from '@game/states/GameStateMachine.js';

/**
 * Renders and registers all audio once the context is live.
 *
 * Returns immediately; registration happens on the unlock event. Callers must
 * not assume audio is available on the next line.
 */
export function prepareAudio(audio: AudioSystem, assets: AssetLoader): Unsubscribe {
  let done = false;
  let disposed = false;
  let music: ReturnType<AudioSystem['play']> | null = null;

  // Fetching does not require an AudioContext, so start it while the player is
  // reading the menu. Catch here to prevent optional preloads becoming
  // unhandled rejections before the first gesture.
  const sfxLoads = new Map(
    ALL_SOUND_IDS.map((id) => [
      id,
      assets
        .load<ArrayBuffer>(id)
        .then((data) => ({ data, error: null }))
        .catch((error: unknown) => ({ data: null, error })),
    ]),
  );
  const musicLoad = assets
    .load<ArrayBuffer>(DEFAULT_MUSIC_ID)
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));

  const unsubscribe = audio.events.on('audio:unlocked', () => {
    if (done) return;
    done = true;
    const context = audio.context;
    if (!context) return;
    try {
      registerProceduralSfx(context, (id, buffer) => audio.registerBuffer(id, buffer));
      registerProceduralMusic(context, (id, buffer) => audio.registerBuffer(id, buffer));
    } catch (error) {
      // Audio is never allowed to break the game.
      console.warn('[audio] procedural registration failed', error);
    }

    // Start the real music as soon as its decode completes. If fetching or
    // decoding failed, the procedural buffer registered above has the same id.
    void musicLoad.then(async ({ data, error }) => {
      if (data) {
        try {
          await audio.registerClip(DEFAULT_MUSIC_ID, data);
        } catch (decodeError) {
          console.warn('[audio] music decode failed; using procedural fallback', decodeError);
        }
      } else if (error) {
        console.warn('[audio] music preload failed; using procedural fallback', error);
      }
      if (!disposed) {
        music = audio.play(DEFAULT_MUSIC_ID, { bus: 'music', loop: true, volume: 0.9 });
      }
    });

    // Effect decoding can finish behind the music. The first interaction may
    // use the procedural fallback; every later play resolves to the real clip.
    for (const [id, load] of sfxLoads) {
      void load.then(async ({ data, error }) => {
        if (!data) {
          if (error) console.warn(`[audio] optional clip "${id}" failed to load`, error);
          return;
        }
        try {
          await audio.registerClip(id, data);
        } catch (decodeError) {
          console.warn(`[audio] optional clip "${id}" failed to decode`, decodeError);
        }
      });
    }
  });

  return () => {
    disposed = true;
    music?.stop(0.2);
    unsubscribe();
  };
}

/**
 * Subscribes to a loaded scene and plays the right sound at the right moment.
 *
 * Every mapping below is a design decision about what deserves a sound.
 * Things that happen constantly (a tick, a frame, a plot growing) get none;
 * things the player CAUSED or must NOTICE get one.
 */
export function bindSceneAudio(scene: FarmScene, audio: AudioSystem): Unsubscribe {
  const world = scene.world;
  const interaction = scene.interaction;
  const eventDirector = scene.eventDirector;
  const enemies = scene.enemyDirector;
  const playerController = scene.playerController;
  if (!world || !interaction || !eventDirector || !playerController) {
    throw new Error('bindSceneAudio requires a loaded FarmScene.');
  }

  const play = (id: string, volume = 1) => audio.play(id, { bus: 'sfx', volume, detuneJitter: 25 });
  const subscriptions: Unsubscribe[] = [];

  subscriptions.push(
    interaction.events.on('interaction:performed', ({ action }) => {
      if (action === 'plant') play(SOUND.plant);
      else if (action === 'tend') play(SOUND.tend);
      else if (action === 'harvest') play(SOUND.harvest);
    }),
    // A refusal gets the soft deny, never a harsh buzzer: the player is
    // usually exploring, and exploring must not feel punished.
    interaction.events.on('interaction:refused', () => play(SOUND.uiDeny, 0.7)),
    interaction.events.on('interaction:crop-selected', () => play(SOUND.uiClick, 0.6)),

    world.events.on('world:sold', ({ viaContract, payout }) => {
      if (payout >= 8_000) play(SOUND.coinBig);
      else play(viaContract ? SOUND.sellContract : SOUND.sellSpot);
    }),
    world.events.on('world:building-completed', () => play(SOUND.buildComplete)),
    world.events.on('world:building-placed', () => play(SOUND.buildPlace)),
    world.events.on('world:animal-purchased', () => play(SOUND.chicken, 0.55)),
    world.events.on('world:land-purchased', () => play(SOUND.goalReached)),
    world.events.on('world:storage-full', () => play(SOUND.uiDeny, 0.6)),
    world.events.on('world:produce', () => play(SOUND.chicken, 0.5)),

    // The warning is the most important sound in the game: it is the only
    // cue that a decision window has opened. It gets the ui bus, which is
    // not ducked, and full volume.
    eventDirector.events.on('event:warned', () =>
      audio.play(SOUND.eventWarning, { bus: 'ui', volume: 1 }),
    ),
    eventDirector.events.on('event:started', ({ kind, mitigated }) => {
      // Foxes announce their own arrival below. Layering the generic weather
      // impact over the bark made the critical alert less distinct.
      if (kind === 'drought') {
        play(mitigated ? SOUND.eventPrevented : SOUND.eventImpact, mitigated ? 0.65 : 1);
      }
    }),
    eventDirector.events.on('event:mitigated', () => play(SOUND.eventPrevented)),

    playerController.events.on('player:stepped', ({ sprinting }) =>
      audio.play(SOUND.footstep, {
        bus: 'sfx',
        volume: sprinting ? 0.58 : 0.42,
        detuneJitter: 45,
      }),
    ),
  );

  if (enemies) {
    subscriptions.push(
      enemies.events.on('enemy:spawned', () => audio.play(SOUND.foxAlert, { bus: 'ui' })),
      enemies.events.on('enemy:scared-off', () => play(SOUND.foxFlee, 0.65)),
      enemies.events.on('enemy:raid-succeeded', () => play(SOUND.raidLoss, 0.9)),
    );
  }

  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}

/** Phase-level cues, including keyboard pause/resume where no button exists. */
export function bindStateAudio(machine: GameStateMachine, audio: AudioSystem): Unsubscribe {
  return machine.events.on('state:changed', ({ from, to }) => {
    if (to === 'paused') audio.play(SOUND.uiOpen, { bus: 'ui', volume: 0.8 });
    else if (from === 'paused' && to === 'playing') {
      audio.play(SOUND.uiConfirm, { bus: 'ui', volume: 0.75 });
    } else if (from === 'loading' && to === 'playing') {
      audio.play(SOUND.uiConfirm, { bus: 'ui', volume: 0.7 });
    } else if (from === 'paused' && to === 'menu') {
      audio.play(SOUND.uiClick, { bus: 'ui', volume: 0.65 });
    }
  });
}
