/**
 * Carrying things around.
 *
 * Hauling is the first post-parcel bottleneck (docs/PROGRESSION_GAMEPLAY_PLAN.md
 * §27.3). Before it exists, a harvest teleports into a global inventory. After
 * it exists, a harvest lands *where it grew*, and the player has to decide
 * whether to walk it back now, leave it to spoil slowly, or spend money on
 * something that carries more.
 *
 * That single change makes distance matter, which retroactively gives roads,
 * barn placement and the second parcel a real cost.
 */
import { cents, type Cents } from './ids.js';
import { GAME_DAY_TICKS, secondsToTicks, type Ticks } from './time.js';

/** Units the player can carry in their arms, with no equipment at all. */
export const BASE_CARRY_CAPACITY = 8;

export type CarrierKind = 'arms' | 'handcart' | 'wagon';

export interface CarrierDefinition {
  readonly id: CarrierKind;
  readonly displayName: string;
  readonly capacity: number;
  readonly purchaseCost: Cents;
  /** Movement speed multiplier while loaded. Capacity is paid for in speed. */
  readonly loadedSpeedMultiplier: number;
  /** Ticks to load or unload one unit. */
  readonly transferTicksPerUnit: Ticks;
  /** Career unlock required before this can be bought. */
  readonly requiresUnlock: string | null;
  readonly description: string;
}

export const CARRIERS: Readonly<Record<CarrierKind, CarrierDefinition>> = Object.freeze({
  arms: {
    id: 'arms',
    displayName: 'Your arms',
    capacity: BASE_CARRY_CAPACITY,
    purchaseCost: cents(0),
    loadedSpeedMultiplier: 0.88,
    transferTicksPerUnit: secondsToTicks(0.12),
    requiresUnlock: null,
    description: 'Eight units, and you walk a little slower with them.',
  },
  handcart: {
    id: 'handcart',
    displayName: 'Handcart',
    capacity: 30,
    purchaseCost: cents(3_200),
    loadedSpeedMultiplier: 0.7,
    transferTicksPerUnit: secondsToTicks(0.08),
    requiresUnlock: 'handcart',
    description:
      'Nearly four times the load, at the price of walking slowly and never running with it.',
  },
  wagon: {
    id: 'wagon',
    displayName: 'Delivery wagon',
    capacity: 90,
    purchaseCost: cents(14_000),
    loadedSpeedMultiplier: 0.62,
    transferTicksPerUnit: secondsToTicks(0.05),
    requiresUnlock: 'scheduled_delivery',
    description: 'Takes a whole contract to town in one trip, and takes its time doing it.',
  },
});

export function getCarrier(id: string): CarrierDefinition | undefined {
  return (CARRIERS as Record<string, CarrierDefinition>)[id];
}

/**
 * How fast goods spoil, as a multiplier on each item's own decay rate.
 *
 * These are deliberately multipliers rather than daily fractions of their own.
 * Every item already states how perishable it is (`freshnessDecayPerDay`:
 * milk 0.18, wheat 0.03), and an environment is a *modifier* of that, not a
 * second independent rate. Treating both as per-day fractions and multiplying
 * them produced 0.02 x 0.03 = 0.0006 - six hundredths of one percent a day -
 * which meant nothing ever spoiled anywhere and the entire reason to walk a
 * harvest home quietly stopped existing.
 */
export const STORED_SPOILAGE_MULTIPLIER = 1;

/**
 * A pile left in the open decays six times as fast as the same goods in a barn.
 *
 * Six is the ratio the original constants implied (0.12 against 0.02) and it is
 * the number that makes the trade legible: wheat left out overnight loses a
 * fifth of itself, which is a reason to come back for it rather than a
 * punishment for being on the far side of the estate when it ripened.
 */
export const FIELD_SPOILAGE_MULTIPLIER = 6;

/**
 * Fraction of a pile lost over a span of ticks.
 *
 * Clamped at 1: no environment may destroy more than everything, which keeps a
 * very perishable good in a very bad place from producing a negative pile.
 */
export function spoilageForTicks(rate: number, dtTicks: Ticks): number {
  return (Math.min(1, Math.max(0, rate)) * dtTicks) / GAME_DAY_TICKS;
}

/**
 * Where hauled goods can be dropped.
 *
 * A loading pad is cheap and exists so a distant parcel has somewhere to stage
 * a harvest; it holds goods but does not stop them spoiling.
 */
export const LOADING_PAD_CAPACITY = 60;
