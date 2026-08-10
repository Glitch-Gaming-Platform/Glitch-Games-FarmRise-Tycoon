/**
 * Web Audio wrapper with named buses.
 *
 * Two browser realities shape this file:
 *  1. An AudioContext created before a user gesture starts suspended. So the
 *     context is created lazily and resumed on the first interaction, and every
 *     play() before that is a no-op rather than an exception.
 *  2. Volume must be applied on a GainNode per bus, not per source, so a
 *     settings slider can duck all music without touching in-flight sounds.
 */
import { SystemPriority, type EngineSystem, type SystemInitContext } from '../core/System.js';
import { createServiceToken } from '../core/ServiceContainer.js';
import { EventBus } from '../core/EventBus.js';
import type { Disposable } from '../core/types.js';

export interface AudioSystemEvents extends Record<string, unknown> {
  /**
   * Fires once, when the browser has allowed audio to start. Anything that
   * needs an AudioContext - decoding a clip, synthesising a buffer - must
   * wait for this rather than assuming one exists, because a context created
   * before a user gesture starts suspended.
   */
  'audio:unlocked': { sampleRate: number };
}

export type AudioBus = 'master' | 'music' | 'sfx' | 'ui';

export interface PlayOptions {
  readonly bus?: Exclude<AudioBus, 'master'>;
  readonly volume?: number;
  readonly loop?: boolean;
  readonly playbackRate?: number;
  /** Detune in cents, randomised per call to stop repeated sounds fatiguing. */
  readonly detuneJitter?: number;
}

export interface AudioHandle {
  stop(fadeSeconds?: number): void;
}

export const AudioToken = createServiceToken<AudioSystem>('AudioSystem');

const NOOP_HANDLE: AudioHandle = { stop: () => {} };

export class AudioSystem implements EngineSystem, Disposable {
  readonly id = 'audio';
  readonly priority = SystemPriority.Audio;
  readonly events = new EventBus<AudioSystemEvents>();

  #context: AudioContext | null = null;
  readonly #gains = new Map<AudioBus, GainNode>();
  readonly #buffers = new Map<string, AudioBuffer>();
  readonly #volumes = new Map<AudioBus, number>([
    ['master', 0.8],
    ['music', 0.5],
    ['sfx', 0.9],
    ['ui', 0.7],
  ]);
  #muted = false;
  #unlockBound = false;

  init(context: SystemInitContext): void {
    context.services.provide(AudioToken, this);
    this.#bindUnlock();
  }

  get context(): AudioContext | null {
    return this.#context;
  }

  get unlocked(): boolean {
    return this.#context?.state === 'running';
  }

  /** Decodes and stores a clip. Called by the asset loader, not by game code. */
  async registerClip(id: string, data: ArrayBuffer): Promise<void> {
    const ctx = this.#ensureContext();
    if (!ctx) return;
    this.#buffers.set(id, await ctx.decodeAudioData(data));
  }

  registerBuffer(id: string, buffer: AudioBuffer): void {
    this.#buffers.set(id, buffer);
  }

  has(id: string): boolean {
    return this.#buffers.has(id);
  }

  play(id: string, options: PlayOptions = {}): AudioHandle {
    const ctx = this.#context;
    const buffer = this.#buffers.get(id);
    if (!ctx || ctx.state !== 'running' || !buffer) return NOOP_HANDLE;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.playbackRate.value = options.playbackRate ?? 1;
    if (options.detuneJitter) {
      source.detune.value = (Math.random() * 2 - 1) * options.detuneJitter;
    }

    const gain = ctx.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain).connect(this.#busGain(options.bus ?? 'sfx'));
    source.start();

    return {
      stop: (fadeSeconds = 0.05) => {
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + fadeSeconds);
        source.stop(now + fadeSeconds);
      },
    };
  }

  setVolume(bus: AudioBus, volume: number): void {
    const clamped = Math.min(1, Math.max(0, volume));
    this.#volumes.set(bus, clamped);
    const gain = this.#gains.get(bus);
    if (gain && this.#context) {
      // A short ramp instead of a jump: setting gain instantaneously produces
      // an audible click.
      gain.gain.setTargetAtTime(
        this.#muted && bus === 'master' ? 0 : clamped,
        this.#context.currentTime,
        0.02,
      );
    }
  }

  getVolume(bus: AudioBus): number {
    return this.#volumes.get(bus) ?? 1;
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    this.setVolume('master', this.#volumes.get('master') ?? 0.8);
  }

  get muted(): boolean {
    return this.#muted;
  }

  dispose(): void {
    this.events.clear();
    this.#unbindUnlock();
    void this.#context?.close();
    this.#context = null;
    this.#gains.clear();
    this.#buffers.clear();
  }

  #ensureContext(): AudioContext | null {
    if (this.#context) return this.#context;
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.#context = ctx;

    const master = ctx.createGain();
    master.gain.value = this.#volumes.get('master') ?? 0.8;
    master.connect(ctx.destination);
    this.#gains.set('master', master);

    for (const bus of ['music', 'sfx', 'ui'] as const) {
      const gain = ctx.createGain();
      gain.gain.value = this.#volumes.get(bus) ?? 1;
      gain.connect(master);
      this.#gains.set(bus, gain);
    }
    return ctx;
  }

  #busGain(bus: AudioBus): GainNode {
    const gain = this.#gains.get(bus);
    if (!gain) throw new Error(`Audio bus "${bus}" does not exist.`);
    return gain;
  }

  #unlock = (): void => {
    const ctx = this.#ensureContext();
    void ctx?.resume().then(() => {
      if (ctx.state === 'running' && !this.#announced) {
        this.#announced = true;
        this.events.emit('audio:unlocked', { sampleRate: ctx.sampleRate });
      }
    });
    if (ctx?.state === 'running') {
      this.#unbindUnlock();
      if (!this.#announced) {
        this.#announced = true;
        this.events.emit('audio:unlocked', { sampleRate: ctx.sampleRate });
      }
    }
  };
  #announced = false;

  #bindUnlock(): void {
    if (this.#unlockBound || typeof document === 'undefined') return;
    this.#unlockBound = true;
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      document.addEventListener(type, this.#unlock, { once: false, passive: true });
    }
  }

  #unbindUnlock(): void {
    if (!this.#unlockBound || typeof document === 'undefined') return;
    this.#unlockBound = false;
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      document.removeEventListener(type, this.#unlock);
    }
  }
}
