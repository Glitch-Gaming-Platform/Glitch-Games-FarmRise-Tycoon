/**
 * The analytics event schema.
 *
 * Every event exists to answer a specific question. If you cannot name the
 * question, do not add the event - an analytics funnel that measures
 * everything measures nothing, and each event is a maintenance cost forever.
 *
 * The question this whole funnel exists to answer is the core playtest
 * question from docs/game-design/mechanics-and-core-loop.md:
 *
 *   "Does choosing what to grow, responding to one warned setback, and
 *    deciding how to reinvest the resulting profit create an engaging reason
 *    to begin another production cycle?"
 *
 * Operationally that is: how many production cycles does a player VOLUNTARILY
 * start after their first sale, and where do they stop?
 *
 * Privacy: no personal data is collected. There is a random anonymous id in
 * localStorage so return visits can be distinguished from new ones, and a
 * per-session id. Neither is derived from anything about the person.
 */

export interface AnalyticsContext {
  /** Random, persisted, not derived from anything personal. */
  readonly anonId: string;
  /** Random, regenerated every launch. */
  readonly sessionId: string;
  readonly protocolVersion: string;
  readonly appVersion: string;
}

/** Discriminated by `name`. Payloads are flat and JSON-serialisable. */
export type AnalyticsEvent =
  // --- session --------------------------------------------------------
  | { name: 'session_start'; payload: { referrer: string; viewport: string; touch: boolean } }
  | { name: 'session_end'; payload: { durationMs: number; reason: 'unload' | 'manual' } }
  | { name: 'scene_ready'; payload: { loadMs: number; artLoaded: boolean } }

  // --- onboarding funnel ----------------------------------------------
  | { name: 'onboarding_start'; payload: { adaptive: boolean } }
  | { name: 'onboarding_beat_start'; payload: { beat: string; index: number } }
  | {
      name: 'onboarding_beat_complete';
      payload: { beat: string; index: number; durationMs: number; hintsShown: number };
    }
  | { name: 'onboarding_hint_shown'; payload: { beat: string; attempt: number } }
  | {
      name: 'onboarding_skipped';
      payload: { beat: string; index: number; reason: 'player' | 'mastery' };
    }
  | {
      name: 'onboarding_complete';
      payload: { durationMs: number; beatsShown: number; hintsShown: number };
    }

  // --- time-to-X, the onboarding health metrics -----------------------
  | { name: 'first_input'; payload: { ms: number; action: string } }
  | { name: 'first_meaningful_action'; payload: { ms: number; action: string } }
  | { name: 'first_feedback'; payload: { ms: number; kind: string } }
  | { name: 'first_success'; payload: { ms: number; kind: string } }

  // --- the core loop, step by step ------------------------------------
  | {
      name: 'crop_planted';
      payload: { cropId: string; plotId: string; balance: number; cycle: number };
    }
  | { name: 'crop_tended'; payload: { plotId: string } }
  | {
      name: 'crop_harvested';
      payload: { cropId: string; quantity: number; spilled: number; cycle: number };
    }
  | {
      name: 'goods_sold';
      payload: {
        itemId: string;
        quantity: number;
        payout: number;
        viaContract: boolean;
        balance: number;
      };
    }
  | { name: 'building_placed'; payload: { kind: string; cost: number; balance: number } }
  | { name: 'building_completed'; payload: { kind: string } }
  | { name: 'land_purchased'; payload: { parcels: number; elapsedMs: number } }
  | { name: 'cycle_completed'; payload: { cycle: number; elapsedMs: number; balance: number } }

  // --- the signature mechanic -----------------------------------------
  | { name: 'farm_event_warned'; payload: { kind: string; targets: number; balance: number } }
  | { name: 'farm_event_prevented'; payload: { kind: string; cost: number } }
  | { name: 'farm_event_impacted'; payload: { kind: string; mitigated: boolean } }
  | { name: 'fox_scared_off'; payload: { remaining: number } }

  // --- friction --------------------------------------------------------
  | { name: 'action_refused'; payload: { action: string; reason: string } }
  | { name: 'storage_overflowed'; payload: { itemId: string; spilled: number } }
  | { name: 'idle_detected'; payload: { seconds: number; phase: string } }

  // --- outcome ----------------------------------------------------------
  | {
      name: 'run_completed';
      payload: {
        outcome: 'expanded' | 'bankrupt' | 'quit';
        elapsedMs: number;
        cyclesCompleted: number;
        finalBalance: number;
        peakBalance: number;
        cropsHarvested: number;
        eventsSurvived: number;
        eventsPrevented: number;
        buildingsBuilt: number;
      };
    };

export type AnalyticsEventName = AnalyticsEvent['name'];

export interface RecordedEvent {
  readonly name: AnalyticsEventName;
  readonly payload: Record<string, unknown>;
  /** Milliseconds since session start. Relative, so it carries no clock data. */
  readonly at: number;
  readonly seq: number;
}

/**
 * The ordered funnel a healthy first session walks. Used by the funnel test
 * to assert ordering, and by the dashboard to compute drop-off.
 */
export const ONBOARDING_FUNNEL: readonly AnalyticsEventName[] = [
  'session_start',
  'scene_ready',
  'onboarding_start',
  'first_input',
  'first_meaningful_action',
  'first_feedback',
  'crop_planted',
  'crop_harvested',
  'first_success',
  'goods_sold',
  'onboarding_complete',
] as const;
