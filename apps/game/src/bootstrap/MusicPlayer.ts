/**
 * Owns the long-form music bed: lazy loading, selection, rotation and cleanup.
 *
 * The engine audio system remains unaware of FarmRise's catalog. This
 * bootstrap-layer class is the deliberate meeting point between stable music
 * ids, asset loading, saved preferences and generic AudioSystem playback.
 */
import { registerProceduralMusic } from '@assets/audio/proceduralMusic.js';
import {
  ALL_MUSIC_IDS,
  DEFAULT_MUSIC_ID,
  MUSIC_TRACKS,
  type MusicId,
} from '@assets/audio/musicIds.js';
import type { AssetLoader } from '@assets/loaders/AssetLoader.js';
import type { AudioHandle, AudioSystem } from '@engine/audio/AudioSystem.js';
import { EventBus } from '@engine/core/EventBus.js';
import type { Disposable } from '@engine/core/types.js';

const PLAYS_BEFORE_ROTATION = 5;
const DESKTOP_MUSIC_VOLUME = 0.9;
const PROCEDURAL_SEED_STEP = 0x1f123bb5;

export interface MusicPlayerEvents extends Record<string, unknown> {
  'music:track-changed': { trackId: MusicId };
}

export interface MusicPlayerOptions {
  readonly initialTrack?: MusicId;
  readonly disabledTracks?: readonly MusicId[];
  /** Avoids decoding a roughly 92 MB four-minute stereo buffer on mobile. */
  readonly lowMemory?: boolean;
}

interface MusicLoadResult {
  readonly data: ArrayBuffer | null;
  readonly error: unknown | null;
}

export class MusicPlayer implements Disposable {
  readonly events = new EventBus<MusicPlayerEvents>();

  readonly #audio: AudioSystem;
  readonly #assets: AssetLoader;
  readonly #options: MusicPlayerOptions;
  readonly #disabled = new Set<MusicId>();
  readonly #loads = new Map<MusicId, Promise<MusicLoadResult>>();
  #selectedTrack: MusicId;
  #context: AudioContext | null = null;
  #handle: AudioHandle | null = null;
  #bufferTrack: MusicId | null = null;
  #switchGeneration = 0;
  #disposed = false;

  constructor(audio: AudioSystem, assets: AssetLoader, options: MusicPlayerOptions = {}) {
    this.#audio = audio;
    this.#assets = assets;
    this.#options = options;
    for (const id of options.disabledTracks ?? []) {
      if (ALL_MUSIC_IDS.includes(id)) this.#disabled.add(id);
    }

    const requested = options.initialTrack ?? DEFAULT_MUSIC_ID;
    if (this.#disabled.size === ALL_MUSIC_IDS.length) this.#disabled.delete(requested);
    this.#selectedTrack = this.#disabled.has(requested) ? this.#firstEnabled() : requested;

    if (!options.lowMemory) void this.#load(this.#selectedTrack);
  }

  get selectedTrack(): MusicId {
    return this.#selectedTrack;
  }

  get disabledTracks(): readonly MusicId[] {
    return ALL_MUSIC_IDS.filter((id) => this.#disabled.has(id));
  }

  /** Called once after the browser has unlocked the shared AudioContext. */
  unlock(context: AudioContext): void {
    if (this.#disposed || this.#context) return;
    this.#context = context;
    void this.#switchTo(this.#selectedTrack);
  }

  select(trackId: MusicId): void {
    if (this.#disposed || this.#disabled.has(trackId)) return;
    if (trackId === this.#selectedTrack && this.#handle) return;
    this.#selectedTrack = trackId;
    this.events.emit('music:track-changed', { trackId });
    if (!this.#options.lowMemory) void this.#load(trackId);
    if (this.#context) void this.#switchTo(trackId);
  }

  setEnabled(trackId: MusicId, enabled: boolean): void {
    if (this.#disposed) return;
    if (enabled) {
      this.#disabled.delete(trackId);
      return;
    }

    const enabledCount = ALL_MUSIC_IDS.length - this.#disabled.size;
    if (enabledCount <= 1 || this.#disabled.has(trackId)) return;
    this.#disabled.add(trackId);
    if (trackId === this.#selectedTrack) this.select(this.#nextEnabled(trackId));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#switchGeneration += 1;
    this.#handle?.stop(0.2);
    this.#handle = null;
    for (const id of ALL_MUSIC_IDS) {
      this.#audio.unregister(id);
      this.#assets.release(id);
    }
    this.#loads.clear();
    this.#bufferTrack = null;
    this.#context = null;
    this.events.clear();
  }

  async #switchTo(trackId: MusicId): Promise<void> {
    const context = this.#context;
    if (!context || this.#disposed) return;
    const generation = ++this.#switchGeneration;

    this.#handle?.stop(0.2);
    this.#handle = null;
    this.#releaseBuffer();

    try {
      registerProceduralMusic(context, (id, buffer) => this.#audio.registerBuffer(id, buffer), {
        id: trackId,
        sampleRate: this.#options.lowMemory
          ? Math.min(22_050, context.sampleRate)
          : context.sampleRate,
        seed: this.#proceduralSeed(trackId),
      });
      this.#bufferTrack = trackId;
    } catch (error) {
      console.warn(`[audio] procedural music "${trackId}" failed`, error);
    }

    if (!this.#options.lowMemory) {
      const { data, error } = await this.#load(trackId);
      if (!this.#isCurrent(trackId, generation)) {
        this.#discardStale(trackId);
        return;
      }
      if (data) {
        try {
          await this.#audio.registerClip(trackId, data);
        } catch (decodeError) {
          console.warn(`[audio] music "${trackId}" failed to decode; using fallback`, decodeError);
        }
      } else if (error) {
        console.warn(`[audio] music "${trackId}" failed to load; using fallback`, error);
      }
    }

    if (!this.#isCurrent(trackId, generation)) {
      this.#discardStale(trackId);
      return;
    }
    this.#handle = this.#audio.play(trackId, {
      bus: 'music',
      volume: DESKTOP_MUSIC_VOLUME,
      repeatCount: PLAYS_BEFORE_ROTATION,
      onEnded: () => {
        if (!this.#isCurrent(trackId, generation)) return;
        this.#handle = null;
        this.select(this.#nextEnabled(trackId));
      },
    });

    const nextTrack = this.#nextEnabled(trackId);
    if (!this.#options.lowMemory && nextTrack !== trackId) void this.#load(nextTrack);
  }

  #load(trackId: MusicId): Promise<MusicLoadResult> {
    const existing = this.#loads.get(trackId);
    if (existing) return existing;
    const load = this.#assets
      .load<ArrayBuffer>(trackId)
      .then((data) => ({ data, error: null }))
      .catch((error: unknown) => ({ data: null, error }));
    this.#loads.set(trackId, load);
    return load;
  }

  #releaseBuffer(): void {
    const trackId = this.#bufferTrack;
    if (!trackId) return;
    this.#audio.unregister(trackId);
    this.#assets.release(trackId);
    this.#loads.delete(trackId);
    this.#bufferTrack = null;
  }

  #discardStale(trackId: MusicId): void {
    if (this.#bufferTrack === trackId) return;
    this.#audio.unregister(trackId);
    this.#assets.release(trackId);
    this.#loads.delete(trackId);
  }

  #isCurrent(trackId: MusicId, generation: number): boolean {
    return (
      !this.#disposed && generation === this.#switchGeneration && trackId === this.#selectedTrack
    );
  }

  #firstEnabled(): MusicId {
    return MUSIC_TRACKS.find(({ id }) => !this.#disabled.has(id))?.id ?? DEFAULT_MUSIC_ID;
  }

  #nextEnabled(after: MusicId): MusicId {
    return nextEnabledTrack(after, this.#disabled);
  }

  #proceduralSeed(trackId: MusicId): number {
    const index = Math.max(0, ALL_MUSIC_IDS.indexOf(trackId));
    return (0x5eed + Math.imul(index, PROCEDURAL_SEED_STEP)) >>> 0;
  }
}

function nextEnabledTrack(after: MusicId, disabled: ReadonlySet<MusicId>): MusicId {
  const startIndex = ALL_MUSIC_IDS.indexOf(after);
  for (let offset = 1; offset <= ALL_MUSIC_IDS.length; offset += 1) {
    const id = ALL_MUSIC_IDS[(startIndex + offset) % ALL_MUSIC_IDS.length];
    if (id && !disabled.has(id)) return id;
  }
  return after;
}
