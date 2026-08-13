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
import { FARM_ANIMAL_SOUND_VARIANTS, type FarmAnimalSoundId } from './animalSoundVariants.js';

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

export type RuntimeSoundId = SoundId | FarmAnimalSoundId;

const RECIPES: Partial<Record<RuntimeSoundId, Recipe>> = {
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
  [SOUND.cartRoll]: {
    duration: 0.24,
    build: (sr) =>
      mix(
        [shaped(texture(19, 720, sr), adsr(0.01, 0.04, 0.35, 0.16, 0.24)), 0.55],
        [shaped(sweptSine(190, 145, 0.2, 0.25), percussive(0.08)), 0.35],
      ),
  },
  [SOUND.pickup]: {
    duration: 0.34,
    build: (sr) =>
      mix(
        [shaped(texture(73, 1800, sr), adsr(0.01, 0.05, 0.3, 0.2, 0.34)), 0.55],
        [delayed(marimba(note(-12), 0.12), 0.12), 0.45],
      ),
  },
  [SOUND.deposit]: {
    duration: 0.35,
    build: (sr) =>
      mix(
        [shaped(sine(105), percussive(0.08)), 0.7],
        [shaped(texture(79, 1150, sr), percussive(0.045)), 0.5],
        [delayed(marimba(note(-17), 0.13), 0.08), 0.45],
      ),
  },
  [SOUND.shooAnimals]: {
    duration: 0.6,
    build: (sr) =>
      mix(
        [shaped(texture(83, 3600, sr), percussive(0.025)), 0.7],
        [delayed(shaped(texture(89, 3400, sr), percussive(0.025)), 0.16), 0.65],
        [delayed(shaped(texture(97, 900, sr), percussive(0.045)), 0.3), 0.55],
      ),
  },
  [SOUND.repair]: {
    duration: 0.75,
    build: (sr) =>
      mix(
        [shaped(texture(101, 2100, sr), percussive(0.025)), 0.55],
        [delayed(shaped(sine(310), percussive(0.04)), 0.12), 0.45],
        [delayed(marimba(note(-5), 0.2), 0.34), 0.7],
        [delayed(shaped(texture(103, 1600, sr), percussive(0.02)), 0.48), 0.45],
      ),
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

  [SOUND.processingStart]: {
    duration: 0.85,
    build: (sr) =>
      mix(
        [shaped(texture(107, 1500, sr), percussive(0.035)), 0.5],
        [
          delayed(shaped(sweptSine(90, 165, 0.5, 0.55), adsr(0.02, 0.12, 0.45, 0.5, 0.72)), 0.08),
          0.55,
        ],
        [delayed(marimba(note(-12), 0.2), 0.2), 0.45],
      ),
  },
  [SOUND.processingComplete]: {
    duration: 0.85,
    build: (sr) =>
      mix(
        [shaped(sweptSine(170, 80, 0.45, 0.5), adsr(0.01, 0.1, 0.35, 0.45, 0.6)), 0.45],
        [delayed(shaped(texture(109, 1200, sr), percussive(0.05)), 0.38), 0.55],
        [delayed(marimba(note(4), 0.22), 0.48), 0.65],
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

  [SOUND.droughtWarning]: {
    duration: 1.25,
    build: (sr) =>
      mix(
        [shaped(texture(113, 900, sr), adsr(0.08, 0.25, 0.35, 0.75, 1.25)), 0.55],
        [delayed(shaped(sweptSine(155, 120, 0.45, 0.5), percussive(0.18)), 0.42), 0.38],
      ),
  },
  [SOUND.droughtImpact]: {
    duration: 1.0,
    build: (sr) =>
      mix(
        [shaped(texture(127, 1100, sr), adsr(0.01, 0.12, 0.3, 0.65, 1)), 0.75],
        [shaped(sine(68), percussive(0.12)), 0.45],
      ),
  },
  [SOUND.foxRaidWarning]: {
    duration: 0.9,
    build: (sr) =>
      mix(
        [shaped(sweptSine(820, 540, 0.16, 0.45), percussive(0.06)), 0.58],
        [delayed(shaped(texture(131, 2400, sr), percussive(0.025)), 0.28), 0.45],
        [delayed(shaped(texture(137, 1500, sr), adsr(0.01, 0.06, 0.22, 0.38, 0.55)), 0.34), 0.35],
      ),
  },
  [SOUND.cartAxleWarning]: {
    duration: 1.1,
    build: (sr) =>
      mix(
        [shaped(sweptSine(210, 125, 0.7, 0.45), adsr(0.04, 0.18, 0.35, 0.6, 1.05)), 0.48],
        [shaped(texture(139, 1000, sr), adsr(0.02, 0.18, 0.25, 0.65, 1.1)), 0.4],
      ),
  },
  [SOUND.cartAxleImpact]: {
    duration: 1.1,
    build: (sr) =>
      mix(
        [shaped(texture(149, 2300, sr), percussive(0.035)), 0.65],
        [shaped(sine(82), percussive(0.1)), 0.75],
        [delayed(shaped(texture(151, 850, sr), adsr(0.01, 0.08, 0.3, 0.55, 0.75)), 0.14), 0.55],
      ),
  },
  [SOUND.roadWashoutWarning]: {
    duration: 1.25,
    build: (sr) =>
      mix(
        [shaped(texture(157, 2600, sr), adsr(0.08, 0.22, 0.45, 0.72, 1.25)), 0.5],
        [delayed(shaped(texture(163, 1200, sr), percussive(0.045)), 0.48), 0.4],
        [delayed(shaped(texture(167, 1100, sr), percussive(0.04)), 0.7), 0.35],
      ),
  },
  [SOUND.roadWashoutImpact]: {
    duration: 1.35,
    build: (sr) =>
      mix(
        [shaped(texture(173, 3000, sr), adsr(0.02, 0.16, 0.5, 0.8, 1.35)), 0.65],
        [shaped(sweptSine(95, 48, 0.9, 0.6), percussive(0.24)), 0.48],
      ),
  },
  [SOUND.blightWarning]: {
    duration: 1.0,
    build: (sr) =>
      mix(
        [shaped(texture(179, 3300, sr), adsr(0.02, 0.12, 0.3, 0.58, 1)), 0.48],
        [delayed(shaped(texture(181, 4800, sr), percussive(0.025)), 0.42), 0.45],
      ),
  },
  [SOUND.blightImpact]: {
    duration: 1.05,
    build: (sr) =>
      mix(
        [shaped(texture(191, 4200, sr), adsr(0.01, 0.09, 0.28, 0.7, 1.05)), 0.6],
        [delayed(shaped(texture(193, 2500, sr), percussive(0.035)), 0.16), 0.45],
        [delayed(shaped(texture(197, 2400, sr), percussive(0.035)), 0.36), 0.4],
      ),
  },
  [SOUND.processorBreakdownWarning]: {
    duration: 1.1,
    build: (sr) =>
      mix(
        [shaped(sweptSine(380, 245, 0.65, 0.55), adsr(0.02, 0.14, 0.32, 0.65, 1.05)), 0.48],
        [shaped(texture(199, 1800, sr), adsr(0.01, 0.09, 0.25, 0.7, 1.1)), 0.5],
      ),
  },
  [SOUND.processorBreakdownImpact]: {
    duration: 1.2,
    build: (sr) =>
      mix(
        [shaped(texture(211, 2500, sr), percussive(0.04)), 0.7],
        [shaped(sine(76), percussive(0.1)), 0.65],
        [delayed(shaped(sweptSine(250, 55, 0.7, 0.6), percussive(0.2)), 0.12), 0.48],
      ),
  },
  [SOUND.coldSnapWarning]: {
    duration: 1.2,
    build: (sr) =>
      mix(
        [shaped(texture(223, 5000, sr), adsr(0.06, 0.22, 0.3, 0.7, 1.2)), 0.38],
        [delayed(bell(note(24), 0.35), 0.38), 0.32],
        [delayed(bell(note(28), 0.28), 0.58), 0.26],
      ),
  },
  [SOUND.coldSnapImpact]: {
    duration: 1.1,
    build: (sr) =>
      mix(
        [shaped(texture(227, 5200, sr), percussive(0.05)), 0.65],
        [shaped(sweptSine(180, 75, 0.65, 0.4), percussive(0.16)), 0.38],
        [delayed(shaped(texture(229, 3100, sr), adsr(0.01, 0.08, 0.25, 0.55, 0.8)), 0.12), 0.4],
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
  [FARM_ANIMAL_SOUND_VARIANTS.hen[1]]: {
    duration: 0.45,
    build: () =>
      mix(
        [shaped(sweptSine(700, 850, 0.08), percussive(0.035)), 0.6],
        [delayed(shaped(sweptSine(820, 560, 0.12), percussive(0.055)), 0.08), 0.58],
        [delayed(shaped(sweptSine(740, 920, 0.07), percussive(0.035)), 0.22), 0.5],
      ),
  },
  [FARM_ANIMAL_SOUND_VARIANTS.hen[2]]: {
    duration: 0.38,
    build: () =>
      mix(
        [shaped(sweptSine(590, 720, 0.06), percussive(0.03)), 0.55],
        [delayed(shaped(sweptSine(680, 520, 0.09), percussive(0.05)), 0.11), 0.55],
      ),
  },
  [SOUND.sheep]: {
    duration: 0.65,
    build: () =>
      mix(
        [shaped(sweptSine(390, 520, 0.18, 0.6), adsr(0.015, 0.08, 0.42, 0.38, 0.62)), 0.6],
        [shaped(sweptSine(195, 260, 0.2, 0.55), adsr(0.015, 0.08, 0.35, 0.38, 0.62)), 0.35],
      ),
  },
  [FARM_ANIMAL_SOUND_VARIANTS.sheep[1]]: {
    duration: 0.58,
    build: () =>
      mix(
        [shaped(sweptSine(440, 590, 0.16, 0.58), adsr(0.01, 0.07, 0.4, 0.32, 0.56)), 0.62],
        [shaped(sweptSine(220, 295, 0.18, 0.52), adsr(0.01, 0.07, 0.3, 0.32, 0.56)), 0.3],
      ),
  },
  [FARM_ANIMAL_SOUND_VARIANTS.sheep[2]]: {
    duration: 0.7,
    build: () =>
      mix(
        [shaped(sweptSine(330, 410, 0.22, 0.64), adsr(0.02, 0.1, 0.38, 0.4, 0.68)), 0.6],
        [shaped(sweptSine(165, 205, 0.22, 0.58), adsr(0.02, 0.1, 0.3, 0.4, 0.68)), 0.32],
      ),
  },
  [SOUND.cow]: {
    duration: 1.0,
    build: () =>
      mix(
        [shaped(sweptSine(125, 105, 0.75, 0.45), adsr(0.04, 0.16, 0.5, 0.62, 1)), 0.72],
        [shaped(sweptSine(250, 210, 0.72, 0.4), adsr(0.04, 0.16, 0.38, 0.62, 1)), 0.28],
      ),
  },
  [FARM_ANIMAL_SOUND_VARIANTS.cow[1]]: {
    duration: 0.82,
    build: () =>
      mix(
        [shaped(sweptSine(145, 125, 0.6, 0.48), adsr(0.03, 0.14, 0.45, 0.48, 0.8)), 0.7],
        [shaped(sweptSine(290, 250, 0.58, 0.42), adsr(0.03, 0.14, 0.32, 0.48, 0.8)), 0.26],
      ),
  },
  [FARM_ANIMAL_SOUND_VARIANTS.cow[2]]: {
    duration: 0.9,
    build: (sr) =>
      mix(
        [shaped(sweptSine(112, 96, 0.68, 0.42), adsr(0.04, 0.16, 0.46, 0.5, 0.88)), 0.62],
        [delayed(shaped(texture(239, 650, sr), percussive(0.12)), 0.58), 0.28],
      ),
  },
  // Runtime fallbacks only: shipped dog recordings replace these after preload.
  [FARM_ANIMAL_SOUND_VARIANTS.dog[0]]: {
    duration: 0.38,
    build: (sr) =>
      mix(
        [shaped(sweptSine(190, 118, 0.22, 0.58), adsr(0.008, 0.05, 0.42, 0.22, 0.36)), 0.72],
        [shaped(texture(251, 1200, sr), percussive(0.11)), 0.34],
      ),
  },
  [FARM_ANIMAL_SOUND_VARIANTS.dog[1]]: {
    duration: 0.72,
    build: (sr) =>
      mix(
        [shaped(sweptSine(175, 112, 0.18, 0.52), percussive(0.11)), 0.65],
        [shaped(texture(257, 1050, sr), percussive(0.1)), 0.28],
        [delayed(shaped(sweptSine(185, 120, 0.18, 0.48), percussive(0.11)), 0.34), 0.6],
      ),
  },
  [FARM_ANIMAL_SOUND_VARIANTS.dog[2]]: {
    duration: 0.86,
    build: (sr) =>
      mix(
        [shaped(sweptSine(430, 520, 0.62, 0.22), adsr(0.04, 0.16, 0.32, 0.42, 0.82)), 0.5],
        [delayed(shaped(texture(263, 1800, sr), percussive(0.18)), 0.58), 0.18],
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

  [SOUND.seasonTransition]: {
    duration: 1.5,
    build: (sr) =>
      mix(
        [shaped(texture(233, 3100, sr), adsr(0.08, 0.25, 0.25, 0.9, 1.5)), 0.3],
        [delayed(marimba(note(0), 0.34), 0.2), 0.65],
        [delayed(marimba(note(4), 0.38), 0.42), 0.65],
        [delayed(marimba(note(9), 0.46), 0.66), 0.7],
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
export function renderSound(id: RuntimeSoundId, sampleRate: number): Float32Array<ArrayBuffer> {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`No synthesis recipe for sound "${id}".`);
  return render(recipe.build(sampleRate), { duration: recipe.duration, sampleRate });
}

export const ALL_SOUND_IDS = Object.keys(RECIPES) as RuntimeSoundId[];

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
