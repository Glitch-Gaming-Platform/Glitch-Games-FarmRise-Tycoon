/**
 * The music bed: a warm, slow, rustic loop generated from a fixed seed.
 *
 * Design intent, from the game's tone: unhurried, major, acoustic, and
 * emphatically NOT driving. This is a game about waiting for things to grow
 * and making an occasional careful decision, so the music has to be
 * comfortable to leave on for twenty minutes. It sits well under the sound
 * effects and never competes with the event warning.
 *
 * Structure: 8 bars at 72 BPM in C major, I - vi - IV - V, looping. Three
 * layers - a plucked bass, a pentatonic marimba arpeggio, and a soft pad.
 * The arpeggio order is seeded rather than fixed so the loop is less
 * obviously a loop, but pentatonic means every possible ordering is
 * consonant.
 */
import {
  adsr,
  mix,
  note,
  percussive,
  render,
  shaped,
  sine,
  triangle,
  type Voice,
} from './synth.js';
import { DEFAULT_MUSIC_ID } from './musicIds.js';

const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 8;
export const MUSIC_LOOP_SECONDS = BAR * BARS;

/** I - vi - IV - V in C, two bars each. Semitone offsets from A4. */
const PROGRESSION = [
  { root: -9, triad: [-9, -5, -2] }, // C  major
  { root: -12, triad: [-12, -9, -5] }, // A  minor
  { root: -4, triad: [-4, 0, 3] }, // F  major
  { root: -2, triad: [-2, 2, 5] }, // G  major
] as const;

/** Pentatonic degrees available to the arpeggio, relative to the bar's root. */
const ARPEGGIO_STEPS = [0, 3, 7, 10, 12, 15] as const;

interface Note {
  readonly at: number;
  readonly freq: number;
  readonly duration: number;
  readonly gain: number;
  readonly timbre: 'pluck' | 'pad' | 'bass';
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function composeNotes(seed: number): Note[] {
  const random = seededRandom(seed);
  const notes: Note[] = [];

  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = PROGRESSION[Math.floor(bar / 2) % PROGRESSION.length]!;
    const barStart = bar * BAR;

    // Bass on beats 1 and 3. Two notes a bar is what makes it feel unhurried;
    // four would start to push.
    for (const beat of [0, 2]) {
      notes.push({
        at: barStart + beat * BEAT,
        freq: note(chord.root - 12),
        duration: BEAT * 1.8,
        gain: 0.5,
        timbre: 'bass',
      });
    }

    // Pad: the triad, sustained across the whole bar, very quiet.
    for (const semitone of chord.triad) {
      notes.push({
        at: barStart,
        freq: note(semitone),
        duration: BAR * 0.98,
        gain: 0.13,
        timbre: 'pad',
      });
    }

    // Arpeggio: eighth notes, with rests. The rests matter more than the
    // notes - a continuous arpeggio becomes wallpaper within a minute.
    for (let eighth = 0; eighth < 8; eighth += 1) {
      if (random() < 0.32) continue;
      const step = ARPEGGIO_STEPS[Math.floor(random() * ARPEGGIO_STEPS.length)]!;
      notes.push({
        at: barStart + eighth * (BEAT / 2),
        freq: note(chord.root + step + 12),
        duration: BEAT * 0.9,
        gain: 0.22 + random() * 0.1,
        timbre: 'pluck',
      });
    }
  }
  return notes;
}

function voiceFor(entry: Note): Voice {
  switch (entry.timbre) {
    case 'bass':
      return mix(
        [shaped(triangle(entry.freq), percussive(entry.duration * 0.45)), 0.9],
        [shaped(sine(entry.freq * 2), percussive(entry.duration * 0.2)), 0.25],
      );
    case 'pad':
      // Slow attack and a detuned partial: enough movement to sound alive,
      // not enough to draw attention.
      return mix(
        [shaped(sine(entry.freq), adsr(0.6, 0.4, 0.75, 0.9, entry.duration)), 0.7],
        [shaped(sine(entry.freq * 1.005), adsr(0.8, 0.4, 0.6, 0.9, entry.duration)), 0.4],
      );
    case 'pluck':
    default:
      return mix(
        [shaped(sine(entry.freq), percussive(entry.duration * 0.28)), 1.0],
        [shaped(sine(entry.freq * 3.99), percussive(entry.duration * 0.09)), 0.28],
      );
  }
}

/**
 * Renders the loop.
 *
 * The whole loop is summed in one pass rather than per-note-mixed, which
 * keeps it to a single allocation of roughly 26 seconds of mono float
 * samples (about 4.7 MB at 44.1 kHz). That is paid once per session.
 */
export function renderMusicLoop(sampleRate: number, seed = 0x5eed): Float32Array<ArrayBuffer> {
  const notes = composeNotes(seed);
  const voices = notes.map((entry) => ({ entry, voice: voiceFor(entry) }));

  const composite: Voice = (t: number) => {
    let sum = 0;
    for (const { entry, voice } of voices) {
      if (t < entry.at || t > entry.at + entry.duration) continue;
      sum += voice(t - entry.at) * entry.gain;
    }
    return sum;
  };

  return render(composite, {
    duration: MUSIC_LOOP_SECONDS,
    sampleRate,
    // Quieter than the effects on purpose: the bed must never mask the event
    // warning, which is the one sound carrying gameplay information.
    normaliseTo: 0.55,
  });
}

/** Kept as an alias for the fallback renderer and older imports. */
export const MUSIC_ID = DEFAULT_MUSIC_ID;

export interface ProceduralMusicOptions {
  readonly id?: string;
  readonly sampleRate?: number;
  readonly seed?: number;
}

export function registerProceduralMusic(
  context: AudioContext,
  register: (id: string, buffer: AudioBuffer) => void,
  options: ProceduralMusicOptions = {},
): void {
  const sampleRate = options.sampleRate ?? context.sampleRate;
  const samples = renderMusicLoop(sampleRate, options.seed);
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  register(options.id ?? MUSIC_ID, buffer);
}
