/**
 * Disruptive farm events - first playable scope is exactly two.
 *
 * Both follow the same contract, which is what makes them "recoverable
 * disruption" rather than a random punishment:
 *   1. a warning fires warningTicks before impact
 *   2. the player can pay to prevent, act to mitigate, or accept the loss
 *   3. the damage is visible on specific assets, not an invisible tax
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

export type FarmEventKind = 'drought' | 'fox_raid';

export interface FarmEventDefinition {
  readonly id: FarmEventKind;
  readonly displayName: string;
  /** How long the player is warned before impact. */
  readonly warningTicks: Ticks;
  /** How long the effect lasts once it lands. */
  readonly durationTicks: Ticks;
  /** Cost of the pre-emptive countermeasure. */
  readonly preventionCost: Cents;
  /** Yield or stock multiplier applied to affected assets when unmitigated. */
  readonly unmitigatedMultiplier: number;
  /** Multiplier when the player took the active response in time. */
  readonly mitigatedMultiplier: number;
  readonly targets: 'crops' | 'animals';
  readonly warningText: string;
}

export const FARM_EVENTS: Readonly<Record<FarmEventKind, FarmEventDefinition>> = Object.freeze({
  drought: {
    id: 'drought',
    displayName: 'Drought',
    warningTicks: secondsToTicks(45),
    durationTicks: secondsToTicks(120),
    preventionCost: cents(1200),
    unmitigatedMultiplier: 0.35,
    mitigatedMultiplier: 0.85,
    targets: 'crops',
    warningText: 'Dry spell forecast. Thirsty plots without irrigation will suffer.',
  },
  fox_raid: {
    id: 'fox_raid',
    displayName: 'Fox raid',
    warningTicks: secondsToTicks(25),
    durationTicks: secondsToTicks(40),
    preventionCost: cents(600),
    unmitigatedMultiplier: 0.4,
    mitigatedMultiplier: 0.95,
    targets: 'animals',
    warningText: 'Foxes spotted near the treeline. Unfenced animals are exposed.',
  },
});
