/**
 * The full event catalogue.
 *
 * The first playable had one event at a time with a single boolean mitigation.
 * Progression needs events that target specific things the player owns, offer a
 * real response task rather than a payment, and persist across a reload so a
 * disaster cannot be re-rolled by refreshing (docs/PROGRESSION_GAMEPLAY_PLAN.md
 * §40).
 *
 * The contract every incident keeps, at every stage:
 *   warned -> understandable -> targeted -> preventable or mitigable -> recoverable.
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

export type IncidentTargetKind =
  'plots' | 'animals' | 'carried_goods' | 'stored_goods' | 'processor' | 'worker' | 'contract';

/** What the player physically does to mitigate. 'pay' is the fallback, never the only option. */
export type IncidentResponseKind =
  'pay' | 'tend_targets' | 'haul_to_shelter' | 'repair' | 'move_animals' | 'unload_processor';

export interface IncidentResponse {
  readonly kind: IncidentResponseKind;
  readonly displayName: string;
  /** Units of work needed. One tend, one repair action and so on. */
  readonly workUnits: number;
  readonly cost: Cents;
  /** Multiplier applied when this response is completed in time. */
  readonly mitigatedMultiplier: number;
  readonly hint: string;
}

export interface IncidentDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly target: IncidentTargetKind;
  readonly warningTicks: Ticks;
  readonly durationTicks: Ticks;
  /** Career stage at which this incident becomes eligible. */
  readonly minimumStage: number;
  /** Weight in the eligible pool. Common incidents are the teachable ones. */
  readonly weight: number;
  /** Ticks before this specific incident may fire again. */
  readonly cooldownTicks: Ticks;
  /** Multiplier applied to affected assets when nothing is done. */
  readonly unmitigatedMultiplier: number;
  /** How many distinct assets it hits. Severity scales this. */
  readonly targetCount: { readonly min: number; readonly max: number };
  readonly responses: readonly IncidentResponse[];
  readonly warningText: string;
  readonly impactText: string;
  readonly recoveryText: string;
}

export const INCIDENTS: readonly IncidentDefinition[] = Object.freeze([
  {
    id: 'incident-drought',
    displayName: 'Drought',
    target: 'plots',
    warningTicks: secondsToTicks(45),
    durationTicks: secondsToTicks(120),
    minimumStage: 0,
    weight: 30,
    cooldownTicks: secondsToTicks(420),
    unmitigatedMultiplier: 0.35,
    targetCount: { min: 2, max: 6 },
    responses: [
      {
        kind: 'pay',
        displayName: 'Hire a water carter',
        workUnits: 0,
        cost: cents(1_200),
        mitigatedMultiplier: 0.9,
        hint: 'Costs money you might rather spend on irrigation that would have prevented this.',
      },
      {
        kind: 'tend_targets',
        displayName: 'Water the marked beds',
        workUnits: 3,
        cost: cents(0),
        mitigatedMultiplier: 0.85,
        hint: 'Free, but you have to be standing at each marked bed before it lands.',
      },
    ],
    warningText: 'Dry spell forecast. Thirsty plots without irrigation will suffer.',
    impactText: 'The ground has cracked. Marked beds are losing yield.',
    recoveryText: 'Rain at last. The beds will recover what they can.',
  },
  {
    id: 'incident-fox-raid',
    displayName: 'Fox raid',
    target: 'animals',
    warningTicks: secondsToTicks(25),
    durationTicks: secondsToTicks(40),
    minimumStage: 0,
    weight: 25,
    cooldownTicks: secondsToTicks(300),
    unmitigatedMultiplier: 0.4,
    targetCount: { min: 1, max: 3 },
    responses: [
      {
        kind: 'pay',
        displayName: 'Post a night watch',
        workUnits: 0,
        cost: cents(600),
        mitigatedMultiplier: 0.95,
        hint: 'Reliable and dull. A fence would have made this permanent.',
      },
      {
        kind: 'move_animals',
        displayName: 'Drive the animals in',
        workUnits: 2,
        cost: cents(0),
        mitigatedMultiplier: 0.9,
        hint: 'Walk to the shelter and shut them in yourself.',
      },
    ],
    warningText: 'Foxes spotted near the treeline. Unfenced animals are exposed.',
    impactText: 'Something got into the pen.',
    recoveryText: 'The foxes have moved on.',
  },
  {
    id: 'incident-cart-axle',
    displayName: 'Broken cart axle',
    target: 'carried_goods',
    warningTicks: secondsToTicks(30),
    durationTicks: secondsToTicks(90),
    minimumStage: 1,
    weight: 22,
    cooldownTicks: secondsToTicks(480),
    unmitigatedMultiplier: 0.5,
    targetCount: { min: 1, max: 1 },
    responses: [
      {
        kind: 'repair',
        displayName: 'Repair the axle',
        workUnits: 3,
        cost: cents(400),
        mitigatedMultiplier: 1,
        hint: 'Stand at the cart and work on it. Costs parts, saves the load.',
      },
      {
        kind: 'haul_to_shelter',
        displayName: 'Carry the load in by hand',
        workUnits: 2,
        cost: cents(0),
        mitigatedMultiplier: 0.8,
        hint: 'Slow, free, and you keep most of what was on the cart.',
      },
    ],
    warningText: 'The cart axle is groaning. A full load will finish it.',
    impactText: 'The axle went. Whatever was on the cart is in the mud.',
    recoveryText: 'The cart rolls again.',
  },
  {
    id: 'incident-blocked-road',
    displayName: 'Road washed out',
    target: 'contract',
    warningTicks: secondsToTicks(60),
    durationTicks: secondsToTicks(180),
    minimumStage: 1,
    weight: 18,
    cooldownTicks: secondsToTicks(600),
    unmitigatedMultiplier: 0.6,
    targetCount: { min: 1, max: 1 },
    responses: [
      {
        kind: 'pay',
        displayName: 'Pay for the long way round',
        workUnits: 0,
        cost: cents(1_800),
        mitigatedMultiplier: 1,
        hint: 'The delivery arrives on time and your margin does not.',
      },
      {
        kind: 'repair',
        displayName: 'Clear the washout',
        workUnits: 4,
        cost: cents(0),
        mitigatedMultiplier: 0.95,
        hint: 'Go and dig it out. Costs you the time you were going to spend harvesting.',
      },
    ],
    warningText: 'The Millbrook road is flooding. A delivery due soon may not get through.',
    impactText: 'The road is impassable and a contract is at risk.',
    recoveryText: 'The road is open again.',
  },
  {
    id: 'incident-blight',
    displayName: 'Blight',
    target: 'plots',
    warningTicks: secondsToTicks(50),
    durationTicks: secondsToTicks(150),
    minimumStage: 2,
    weight: 20,
    cooldownTicks: secondsToTicks(600),
    unmitigatedMultiplier: 0.25,
    targetCount: { min: 2, max: 8 },
    responses: [
      {
        kind: 'tend_targets',
        displayName: 'Treat the infected beds',
        workUnits: 4,
        cost: cents(300),
        mitigatedMultiplier: 0.8,
        hint: 'Treat each marked bed before it spreads to its neighbours.',
      },
      {
        kind: 'pay',
        displayName: 'Call the plant doctor',
        workUnits: 0,
        cost: cents(3_400),
        mitigatedMultiplier: 0.9,
        hint: 'Expensive, immediate, and it does nothing for your soil.',
      },
    ],
    warningText: 'Blight reported on neighbouring farms. Dense plantings are most at risk.',
    impactText: 'Leaves are curling on the marked beds.',
    recoveryText: 'The blight has burned itself out.',
  },
  {
    id: 'incident-processor-breakdown',
    displayName: 'Processor breakdown',
    target: 'processor',
    warningTicks: secondsToTicks(40),
    durationTicks: secondsToTicks(200),
    minimumStage: 2,
    weight: 20,
    cooldownTicks: secondsToTicks(540),
    unmitigatedMultiplier: 0,
    targetCount: { min: 1, max: 1 },
    responses: [
      {
        kind: 'repair',
        displayName: 'Strip and repair it',
        workUnits: 5,
        cost: cents(900),
        mitigatedMultiplier: 1,
        hint: 'Stand at the machine and work. Every tick it is down, the queue is not moving.',
      },
      {
        kind: 'unload_processor',
        displayName: 'Save the batch',
        workUnits: 2,
        cost: cents(0),
        mitigatedMultiplier: 0.5,
        hint: 'Pull the input back out before it spoils, and accept the downtime.',
      },
    ],
    warningText: 'The machine is running hot. It will seize if it is not looked at.',
    impactText: 'It has seized. Nothing is processing.',
    recoveryText: 'Running sweetly again.',
  },
  {
    id: 'incident-cold-snap',
    displayName: 'Cold snap',
    target: 'stored_goods',
    warningTicks: secondsToTicks(55),
    durationTicks: secondsToTicks(160),
    minimumStage: 3,
    weight: 16,
    cooldownTicks: secondsToTicks(720),
    unmitigatedMultiplier: 0.65,
    targetCount: { min: 1, max: 2 },
    responses: [
      {
        kind: 'haul_to_shelter',
        displayName: 'Move the stock inside',
        workUnits: 4,
        cost: cents(0),
        mitigatedMultiplier: 0.95,
        hint: 'Haul what is staged outside into a barn before the frost.',
      },
      {
        kind: 'pay',
        displayName: 'Buy covers',
        workUnits: 0,
        cost: cents(2_200),
        mitigatedMultiplier: 0.85,
        hint: 'Instant, and it does not help the stock you left in the field.',
      },
    ],
    warningText: 'Hard frost tonight. Anything staged outside will take damage.',
    impactText: 'Frost has got into the stores.',
    recoveryText: 'The thaw is here.',
  },
]);

export const INCIDENTS_BY_ID: Readonly<Record<string, IncidentDefinition>> = Object.freeze(
  Object.fromEntries(INCIDENTS.map((incident) => [incident.id, incident])),
);

export function getIncident(id: string): IncidentDefinition | undefined {
  return INCIDENTS_BY_ID[id];
}

/** Incident severity. Higher severity widens the target set and the damage. */
export type IncidentSeverity = 'minor' | 'moderate' | 'severe';

export const SEVERITY_SCALE: Readonly<Record<IncidentSeverity, number>> = Object.freeze({
  minor: 0.5,
  moderate: 1,
  severe: 1.5,
});

/** At most this many incidents may be live at once, whatever the stage. */
export const MAX_CONCURRENT_INCIDENTS = 2;
