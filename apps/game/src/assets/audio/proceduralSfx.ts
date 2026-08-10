/**
 * Every sound in SOUND_BRIEF, realised as synthesis.
 *
 * Each function is a direct attempt at the brief next to it. Where a brief
 * asks for something synthesis genuinely cannot do - a real fox bark, a
 * recorded boot on gravel - the implementation aims for the FUNCTION of the
 * sound (sharp, distant, alarming) rather than its texture, and the brief
 * stays in soundIds.ts as the target for a real recording later.
 */
import {
  adsr,
  delayed,
  lowpass,
  mix,
  noise,
  note,
  percussive,
  render,
  shaped,
  sine,
  sweptSine,
  triangle,
  type Voice,
} from './synth.js';
import { SOUND, type SoundId } from './soundIds.js';

interface Recipe {
  readonly duration: number;
  build(sampleRate: number): Voice;
}

/** A struck wooden bar: the game's signature UI timbre. */
function marimba(freq: number, decay: number): Voice {
  return mix(
    [shaped(sine(freq), percussive(decay)), 1.0],
    [shaped(sine(freq * 3.99), percussive(decay * 0.35)), 0.35],
    [shaped(sine(freq * 9.2), percussive(decay * 0.12)), 0.12],
  );
}

/** A small struck bell, brighter and longer than the marimba. */
function bell(freq: number, decay: number): Voice {
  return mix(
    [shaped(sine(freq), percussive(decay)), 1.0],
    [shaped(sine(freq * 2.76), percussive(decay * 0.6)), 0.5],
    [shaped(sine(freq * 5.4), percussive(decay * 0.3)), 0.22],
  );
}

/** Filtered noise, the basis of everything granular: soil, water, wind. */
function texture(seed: number, cutoff: number, sampleRate: number): Voice {
  return lowpass(noise(seed), cutoff, sampleRate);
}

const RECIPES: Record<SoundId, Recipe> = {
  [SOUND.uiClick]: {
    duration: 0.07,
    build: (sr) =>
      mix(
        [shaped(texture(7, 2600, sr), percussive(0.012)), 0.5],
        [shaped(sine(880), percussive(0.02)), 0.5],
      ),
  },
  [SOUND.uiConfirm]: {
    duration: 0.42,
    build: () => mix([marimba(note(4), 0.16), 0.9], [delayed(marimba(note(11), 0.2), 0.09), 0.9]),
  },
  [SOUND.uiDeny]: {
    duration: 0.3,
    // A downward bend, quiet and soft. A harsh buzzer would punish a player
    // for exploring, which is the opposite of what this game wants.
    build: () => shaped(sweptSine(220, 120, 0.28, 0.7), percussive(0.12)),
  },
  [SOUND.uiOpen]: {
    duration: 0.26,
    build: (sr) => shaped(texture(21, 3400, sr), adsr(0.02, 0.08, 0.35, 0.14, 0.26)),
  },

  [SOUND.plant]: {
    duration: 0.3,
    // Granular soil press: mid-band noise with a soft low thump under it.
    build: (sr) =>
      mix(
        [shaped(texture(3, 1500, sr), adsr(0.005, 0.06, 0.28, 0.18, 0.3)), 0.85],
        [shaped(sine(120), percussive(0.06)), 0.4],
      ),
  },
  [SOUND.tend]: {
    duration: 0.5,
    // Water: bright noise falling in brightness, with a patter tail.
    build: (sr) =>
      mix(
        [shaped(texture(11, 5200, sr), adsr(0.01, 0.1, 0.4, 0.3, 0.5)), 0.7],
        [shaped(texture(29, 1200, sr), percussive(0.22)), 0.35],
      ),
  },
  [SOUND.harvest]: {
    duration: 0.55,
    // Snap, rustle, then a small wooden knock of satisfaction.
    build: (sr) =>
      mix(
        [shaped(texture(5, 4200, sr), percussive(0.03)), 0.6],
        [delayed(shaped(texture(13, 2200, sr), adsr(0.01, 0.08, 0.3, 0.2, 0.34)), 0.05), 0.45],
        [delayed(marimba(note(7), 0.14), 0.24), 0.8],
      ),
  },
  [SOUND.footstep]: {
    duration: 0.12,
    build: (sr) => shaped(texture(17, 900, sr), percussive(0.035)),
  },

  [SOUND.buildPlace]: {
    duration: 0.28,
    build: (sr) =>
      mix(
        [shaped(sine(96), percussive(0.07)), 0.9],
        [shaped(texture(23, 1100, sr), percussive(0.03)), 0.4],
      ),
  },
  [SOUND.buildComplete]: {
    duration: 0.9,
    // Three hammer strikes, then a rising two-note chime.
    build: (sr) =>
      mix(
        [shaped(texture(31, 1400, sr), percussive(0.03)), 0.5],
        [delayed(shaped(texture(37, 1400, sr), percussive(0.03)), 0.13), 0.5],
        [delayed(shaped(texture(41, 1400, sr), percussive(0.03)), 0.26), 0.5],
        [delayed(marimba(note(4), 0.22), 0.42), 0.9],
        [delayed(marimba(note(11), 0.3), 0.56), 0.9],
      ),
  },

  [SOUND.sellSpot]: {
    duration: 0.5,
    // Three small coins into wood, slightly irregular so it sounds handled
    // rather than sequenced.
    build: () =>
      mix(
        [bell(note(19), 0.09), 0.7],
        [delayed(bell(note(24), 0.08), 0.06), 0.6],
        [delayed(bell(note(16), 0.1), 0.14), 0.55],
      ),
  },
  [SOUND.sellContract]: {
    duration: 0.75,
    // Coins, then a paper-stamp thump: heavier, more official.
    build: (sr) =>
      mix(
        [bell(note(19), 0.09), 0.6],
        [delayed(bell(note(23), 0.09), 0.07), 0.6],
        [delayed(bell(note(26), 0.1), 0.15), 0.6],
        [delayed(shaped(sine(90), percussive(0.09)), 0.34), 0.9],
        [delayed(shaped(texture(43, 1000, sr), percussive(0.04)), 0.34), 0.4],
      ),
  },
  [SOUND.coinBig]: {
    duration: 1.1,
    build: () =>
      mix(
        ...[0, 0.05, 0.11, 0.16, 0.23, 0.29, 0.36].map(
          (offset, index) => [delayed(bell(note(16 + (index % 4) * 3), 0.1), offset), 0.5] as const,
        ),
        [bell(note(4), 0.6), 0.5],
      ),
  },

  [SOUND.eventWarning]: {
    duration: 1.2,
    // Two slow hollow knocks. Uneasy, low, unmistakable - this sound is the
    // player's only cue that they have a decision window open.
    build: () =>
      mix(
        [marimba(note(-17), 0.3), 1.0],
        [delayed(marimba(note(-20), 0.34), 0.45), 0.9],
        [shaped(sine(58), adsr(0.2, 0.3, 0.25, 0.5, 1.2)), 0.3],
      ),
  },
  [SOUND.eventImpact]: {
    duration: 1.4,
    build: (sr) =>
      mix(
        [shaped(texture(53, 700, sr), adsr(0.12, 0.3, 0.45, 0.8, 1.4)), 0.8],
        [shaped(sweptSine(70, 40, 1.3, 1.4), adsr(0.05, 0.4, 0.4, 0.8, 1.4)), 0.5],
      ),
  },
  [SOUND.eventPrevented]: {
    duration: 0.6,
    build: (sr) =>
      mix(
        [shaped(texture(59, 1300, sr), percussive(0.04)), 0.5],
        [delayed(marimba(note(-5), 0.26), 0.12), 0.9],
        [delayed(marimba(note(2), 0.3), 0.22), 0.7],
      ),
  },

  [SOUND.foxAlert]: {
    duration: 0.28,
    // Thin, sharp, and pitched high enough to cut through the music bed.
    build: (sr) =>
      mix(
        [shaped(sweptSine(900, 420, 0.16, 0.6), percussive(0.05)), 0.8],
        [shaped(texture(61, 3000, sr), percussive(0.03)), 0.35],
      ),
  },
  [SOUND.foxFlee]: {
    duration: 0.55,
    build: (sr) =>
      mix(
        [shaped(sweptSine(760, 980, 0.12), percussive(0.05)), 0.55],
        [delayed(shaped(texture(67, 2400, sr), adsr(0.01, 0.08, 0.25, 0.3, 0.45)), 0.08), 0.5],
      ),
  },
  [SOUND.chicken]: {
    duration: 0.3,
    build: () =>
      mix(
        [shaped(sweptSine(620, 780, 0.06), percussive(0.03)), 0.6],
        [delayed(shaped(sweptSine(700, 500, 0.09), percussive(0.05)), 0.09), 0.6],
      ),
  },
  [SOUND.raidLoss]: {
    duration: 0.9,
    build: (sr) =>
      mix(
        [shaped(texture(71, 2800, sr), adsr(0.01, 0.08, 0.22, 0.55, 0.9)), 0.55],
        [delayed(shaped(sweptSine(760, 560, 0.11), percussive(0.05)), 0.08), 0.5],
        [delayed(shaped(sweptSine(690, 480, 0.12), percussive(0.06)), 0.28), 0.45],
      ),
  },

  [SOUND.goalReached]: {
    duration: 1.6,
    build: () =>
      mix(
        ...[0, 0.14, 0.28, 0.44].map(
          (offset, index) =>
            [delayed(marimba(note([0, 4, 7, 12][index]!), 0.4), offset), 0.85] as const,
        ),
        [delayed(bell(note(-12), 1.0), 0.44), 0.5],
      ),
  },
  [SOUND.runSuccess]: {
    duration: 2.0,
    build: () =>
      mix(
        ...[0, 0.12, 0.24, 0.4, 0.56].map(
          (offset, index) =>
            [delayed(marimba(note([0, 4, 7, 12, 16][index]!), 0.5), offset), 0.8] as const,
        ),
        [delayed(shaped(triangle(note(-12)), adsr(0.05, 0.3, 0.4, 1.0, 1.5)), 0.4), 0.35],
        [delayed(bell(note(19), 1.2), 0.56), 0.4],
      ),
  },
  [SOUND.runFail]: {
    duration: 1.8,
    // Descending minor, soft. Sympathetic rather than punishing: the design
    // pillar is recoverable disruption, and the fail sting must not read as
    // mockery.
    build: () =>
      mix(
        ...[0, 0.22, 0.44, 0.68].map(
          (offset, index) =>
            [delayed(marimba(note([7, 3, 0, -5][index]!), 0.45), offset), 0.75] as const,
        ),
        [shaped(triangle(note(-17)), adsr(0.2, 0.4, 0.3, 0.9, 1.8)), 0.3],
      ),
  },
};

/** Renders one sound to raw samples. Exported so tests can inspect it. */
export function renderSound(id: SoundId, sampleRate: number): Float32Array<ArrayBuffer> {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`No synthesis recipe for sound "${id}".`);
  return render(recipe.build(sampleRate), { duration: recipe.duration, sampleRate });
}

export const ALL_SOUND_IDS = Object.keys(RECIPES) as SoundId[];

/**
 * Renders every sound into the AudioContext.
 *
 * Roughly 12 seconds of mono audio in total, rendered once on the first user
 * gesture. Measured at well under a frame budget on a desktop; on a slow
 * device it is still a single one-off cost paid while the player is reading
 * the menu.
 */
export function registerProceduralSfx(
  context: AudioContext,
  register: (id: string, buffer: AudioBuffer) => void,
): number {
  let rendered = 0;
  for (const id of ALL_SOUND_IDS) {
    const samples = renderSound(id, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    register(id, buffer);
    rendered += 1;
  }
  return rendered;
}
