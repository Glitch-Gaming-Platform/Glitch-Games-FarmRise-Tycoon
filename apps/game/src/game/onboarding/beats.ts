/**
 * The first-session beat table.
 *
 * One concept per beat, each taught by DOING it, each completed by the
 * player performing the real action in the real game. There is no tutorial
 * level and no sandbox: every beat below is satisfied by the same command
 * the rest of the game uses.
 *
 * Copy rules, enforced by a unit test:
 *   - title <= 34 characters
 *   - body  <= 110 characters, and no more than two sentences
 *   - never explains a control the player has already used
 *
 * Ordering rationale: the player reaches a satisfying, self-directed action
 * (planting) inside the first ~20 seconds, gets a visible result (a crop
 * growing) immediately, and does not meet a single number-heavy system until
 * they have already earned money once.
 */

/** HUD elements are revealed as they become meaningful, not all at once. */
export type HudFeature = 'money' | 'seed' | 'ready' | 'storage' | 'objective' | 'warning';

export interface OnboardingContext {
  readonly nowMs: number;
  readonly hasMoved: boolean;
  readonly plotInReach: string | null;
  readonly plantedPlots: number;
  readonly tendCount: number;
  readonly cropsHarvested: number;
  readonly salesMade: number;
  readonly reinvestments: number;
  readonly warningActive: boolean;
  readonly eventsResolved: number;
  readonly marketOpen: boolean;
  readonly buildOpen: boolean;
}

export interface Beat {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly key?: string;
  /** HUD features this beat unlocks when it STARTS. */
  readonly reveals?: readonly HudFeature[];
  /** True once the player has done the thing. */
  readonly isDone: (context: OnboardingContext) => boolean;
  /**
   * True if the player already did this before being asked. Such a beat is
   * skipped and reported as mastery rather than shown - telling an
   * experienced player to do what they just did is how tutorials become
   * insulting.
   */
  readonly alreadySatisfied?: (context: OnboardingContext) => boolean;
  /** A firmer nudge if the beat stalls. Shown once. */
  readonly hint?: { readonly afterMs: number; readonly body: string };
  /**
   * Event-driven beats wait for the world rather than for the previous beat.
   * The setback beat only appears when a warning actually fires.
   */
  readonly waitsFor?: (context: OnboardingContext) => boolean;
}

export const BEATS: readonly Beat[] = [
  {
    id: 'move',
    title: 'Walk to the soil plots',
    body: 'Use W, A, S and D to walk over to one of the brown plots of land.',
    key: 'W A S D',
    isDone: (c) => c.hasMoved && c.plotInReach !== null,
    alreadySatisfied: (c) => c.plantedPlots > 0,
    hint: {
      afterMs: 12_000,
      body: 'Keep walking toward a brown plot until the Plant Wheat prompt appears.',
    },
  },
  {
    id: 'plant',
    title: 'Put something in the ground',
    body: 'When Plant Wheat appears, press E to sow your first crop.',
    key: 'E',
    reveals: ['seed', 'money'],
    isDone: (c) => c.plantedPlots > 0,
    hint: {
      afterMs: 14_000,
      body: 'Press E while standing on a bed. Q swaps which seed you carry.',
    },
  },
  {
    id: 'tend',
    title: 'Look after it',
    body: 'Press E on the planted plot again to water it.',
    key: 'E',
    isDone: (c) => c.tendCount > 0,
    alreadySatisfied: (c) => c.cropsHarvested > 0,
    hint: { afterMs: 16_000, body: 'Press E on the same bed again to water it while it grows.' },
  },
  {
    id: 'harvest',
    title: 'Watch it ripen',
    body: 'Your first watered crop ripens quickly. When it turns gold or orange, press E to harvest it.',
    key: 'E',
    reveals: ['ready', 'storage'],
    isDone: (c) => c.cropsHarvested > 0,
    hint: {
      afterMs: 8_000,
      body: 'When the crop turns gold or orange and the prompt says Harvest, press E.',
    },
  },
  {
    id: 'sell',
    title: 'Turn crops into money',
    body: 'Press M or click Market, then choose Sell all beside the crop you harvested.',
    key: 'M',
    isDone: (c) => c.salesMade > 0,
    hint: {
      afterMs: 18_000,
      body: 'Press M or click Market. Contracts pay more than selling on the spot.',
    },
  },
  {
    id: 'reinvest',
    title: 'Spend it on the farm',
    body: 'Press B or click Build, then buy a hen or place a building on open ground.',
    key: 'B',
    reveals: ['objective'],
    isDone: (c) => c.reinvestments > 0,
    hint: {
      afterMs: 22_000,
      body: 'Press B or click Build. A barn holds more; irrigation loses less to drought.',
    },
  },
  {
    id: 'setback',
    title: 'Something is coming',
    body: 'You have a moment before it lands. Pay to prevent it, or take the hit.',
    key: 'F',
    reveals: ['warning'],
    // Waits for the world, not for the player: this beat only exists once a
    // warning is actually on screen, so it can never teach a mechanic the
    // player is not currently looking at.
    waitsFor: (c) => c.warningActive,
    isDone: (c) => !c.warningActive || c.eventsResolved > 0,
    hint: {
      afterMs: 10_000,
      body: 'Press F to spend money preventing it. Doing nothing is also a valid choice.',
    },
  },
  {
    id: 'goal',
    title: 'The field next door',
    body: 'Keep growing and selling. At $150, press B or click Build to buy the neighbouring parcel.',
    reveals: ['objective'],
    // Completes on the next tick: this beat is a hand-off, not a task, so
    // onboarding ends with the player already inside the repeatable loop.
    isDone: () => true,
    // Explicitly never skipped for mastery. Without this the adaptive check
    // would see isDone() === true and skip the one beat whose entire job is
    // to state the goal - leaving the player with no idea what they are
    // playing toward.
    alreadySatisfied: () => false,
  },
];

export const ALL_HUD_FEATURES: readonly HudFeature[] = [
  'money',
  'seed',
  'ready',
  'storage',
  'objective',
  'warning',
];
