/**
 * A tiny sample-level synthesiser.
 *
 * Sounds are written directly into a Float32Array rather than built from a
 * Web Audio node graph. Three reasons:
 *   - it renders in one pass with no OfflineAudioContext, so it works in a
 *     headless test as easily as in a browser
 *   - it is deterministic, so a sound cannot drift between machines
 *   - it produces an AudioBuffer, which is exactly what AudioSystem already
 *     accepts, so real recorded files replace it with no code change
 *
 * This is not a substitute for a sound designer. It is a substitute for
 * SILENCE, which is what the slice would otherwise ship with, and silence
 * makes a game feel broken in a way missing art does not.
 */

export interface Voice {
  /** Returns a sample in roughly [-1, 1] for time `t` seconds. */
  (t: number): number;
}

const TAU = Math.PI * 2;

// --- oscillators ----------------------------------------------------------

export const sine = (freq: number) => (t: number) => Math.sin(TAU * freq * t);
export const triangle = (freq: number) => (t: number) =>
  (2 / Math.PI) * Math.asin(Math.sin(TAU * freq * t));
export const square = (freq: number) => (t: number) => (Math.sin(TAU * freq * t) >= 0 ? 1 : -1);
export const saw = (freq: number) => (t: number) => 2 * ((t * freq) % 1) - 1;

/** Deterministic value noise. Seeded so a sound is identical every run. */
export function noise(seed = 1): Voice {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

/** A frequency that glides from `from` to `to` over `duration`. */
export const sweep =
  (from: number, to: number, duration: number, shape = 1) =>
  (t: number) => {
    const p = Math.min(1, Math.max(0, t / duration)) ** shape;
    return from + (to - from) * p;
  };

export function sweptSine(from: number, to: number, duration: number, shape = 1): Voice {
  const freqAt = sweep(from, to, duration, shape);
  let phase = 0;
  let last = 0;
  return (t: number) => {
    const dt = Math.max(0, t - last);
    last = t;
    phase += TAU * freqAt(t) * dt;
    return Math.sin(phase);
  };
}

// --- envelopes ------------------------------------------------------------

/** Attack-decay-sustain-release envelope, in seconds. */
export function adsr(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  duration: number,
): (t: number) => number {
  const releaseStart = Math.max(attack + decay, duration - release);
  return (t: number) => {
    if (t < 0 || t > duration) return 0;
    if (t < attack) return attack === 0 ? 1 : t / attack;
    if (t < attack + decay) {
      return decay === 0 ? sustain : 1 - (1 - sustain) * ((t - attack) / decay);
    }
    if (t < releaseStart) return sustain;
    const remaining = duration - releaseStart;
    return remaining <= 0 ? 0 : sustain * (1 - (t - releaseStart) / remaining);
  };
}

/** Fast percussive envelope: instant attack, exponential decay. */
export const percussive = (decay: number) => (t: number) => Math.exp(-t / decay);

// --- rendering ------------------------------------------------------------

export interface RenderOptions {
  readonly duration: number;
  readonly sampleRate: number;
  /** Peak-normalise to this level. Keeps sounds at a consistent loudness. */
  readonly normaliseTo?: number;
}

/**
 * Renders a voice to a Float32Array.
 *
 * Normalisation is on by default because hand-tuned synth gains drift wildly
 * between sounds, and an inconsistent mix is more noticeable to a player
 * than any individual sound being imperfect.
 */
export function render(voice: Voice, options: RenderOptions): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.floor(options.duration * options.sampleRate));
  const data = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    const value = voice(i / options.sampleRate);
    data[i] = value;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
  }

  const target = options.normaliseTo ?? 0.85;
  if (peak > 1e-6) {
    const gain = target / peak;
    for (let i = 0; i < length; i += 1) data[i]! *= gain;
  }

  // A 3 ms fade at each end. Without it, a waveform that does not happen to
  // end at a zero crossing produces an audible click on every playback.
  const fade = Math.min(Math.floor(options.sampleRate * 0.003), Math.floor(length / 2));
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade;
    data[i]! *= k;
    data[length - 1 - i]! *= k;
  }
  return data;
}

/** Sums voices with gains. The workhorse for layered sounds. */
export function mix(...layers: readonly (readonly [Voice, number])[]): Voice {
  return (t: number) => {
    let sum = 0;
    for (const [voice, gain] of layers) sum += voice(t) * gain;
    return sum;
  };
}

/** Applies an envelope to a voice. */
export function shaped(voice: Voice, envelope: (t: number) => number): Voice {
  return (t: number) => voice(t) * envelope(t);
}

/** Delays a voice so layers can be sequenced inside one sound. */
export function delayed(voice: Voice, by: number): Voice {
  return (t: number) => (t < by ? 0 : voice(t - by));
}

/** A one-pole low-pass, for taking the edge off noise. */
export function lowpass(voice: Voice, cutoffHz: number, sampleRate: number): Voice {
  const dt = 1 / sampleRate;
  const rc = 1 / (TAU * cutoffHz);
  const alpha = dt / (rc + dt);
  let previous = 0;
  return (t: number) => {
    previous += alpha * (voice(t) - previous);
    return previous;
  };
}

/** Equal-tempered note helper. A4 = 440 Hz. */
export function note(semitonesFromA4: number): number {
  return 440 * 2 ** (semitonesFromA4 / 12);
}

/**
 * C major pentatonic, the scale the music bed uses.
 *
 * Pentatonic because no two notes in it can clash: the arpeggiator picks
 * notes at random and every possible combination is consonant, which is what
 * makes an endlessly generated bed listenable rather than grating.
 */
export const PENTATONIC = [-9, -7, -5, -2, 0, 3, 5, 7, 12, 15] as const;
