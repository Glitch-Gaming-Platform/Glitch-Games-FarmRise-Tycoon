/**
 * Forwards the game's analytics stream to Glitch behavioural events.
 *
 * The game emits one typed analytics stream through AnalyticsClient.
 * Rather than instrumenting gameplay a second time for Glitch, this subscribes
 * to that one stream and translates. Adding a game event automatically makes
 * it visible in Glitch, and there is exactly one place where the two
 * vocabularies meet.
 *
 * Glitch models an event as (step_key, action_key): WHERE the player was and
 * WHAT they did there. Ordered step_keys become funnels in the dashboard, so
 * the step names below are chosen to read as a journey rather than as a
 * feature list.
 */
import type { Unsubscribe } from '@engine/core/types.js';
import type { AnalyticsClient } from '@analytics/AnalyticsClient.js';
import type { AnalyticsEventName } from '@analytics/events.js';
import type { GlitchPlatform } from '@platform/glitch/GlitchPlatform.js';

interface Mapping {
  readonly step: string;
  readonly stepLabel: string;
  readonly action: string;
  readonly actionLabel: string;
}

/**
 * Every analytics event, mapped.
 *
 * Labels are sent because Glitch treats them as canonical per title and uses
 * them in reports; a dashboard reading `farm / crop_harvested` is far less
 * useful to a marketer than `The Farm / Harvested a crop`.
 */
const MAP = {
  session_start: {
    step: 'boot',
    stepLabel: 'Launch',
    action: 'session_start',
    actionLabel: 'Session started',
  },
  scene_ready: {
    step: 'boot',
    stepLabel: 'Launch',
    action: 'scene_ready',
    actionLabel: 'Farm loaded',
  },
  screen_viewed: {
    step: 'navigation',
    stepLabel: 'Navigation',
    action: 'screen_viewed',
    actionLabel: 'Viewed a screen',
  },
  visibility_changed: {
    step: 'session',
    stepLabel: 'Play Session',
    action: 'visibility_changed',
    actionLabel: 'Changed page visibility',
  },
  consent_updated: {
    step: 'privacy',
    stepLabel: 'Privacy Choice',
    action: 'consent_updated',
    actionLabel: 'Updated analytics choice',
  },

  onboarding_start: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'start',
    actionLabel: 'Onboarding started',
  },
  onboarding_beat_start: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'beat_start',
    actionLabel: 'Tutorial step shown',
  },
  onboarding_beat_complete: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'beat_complete',
    actionLabel: 'Tutorial step completed',
  },
  onboarding_hint_shown: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'hint_shown',
    actionLabel: 'Tutorial hint shown',
  },
  onboarding_skipped: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'skipped',
    actionLabel: 'Tutorial skipped',
  },
  onboarding_complete: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'complete',
    actionLabel: 'Onboarding completed',
  },

  first_input: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'first_input',
    actionLabel: 'First input',
  },
  first_meaningful_action: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'first_meaningful_action',
    actionLabel: 'First real action',
  },
  first_feedback: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'first_feedback',
    actionLabel: 'First feedback seen',
  },
  first_success: {
    step: 'onboarding',
    stepLabel: 'New Player Onboarding',
    action: 'first_success',
    actionLabel: 'First success',
  },

  crop_planted: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'crop_planted',
    actionLabel: 'Planted a crop',
  },
  crop_selected: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'crop_selected',
    actionLabel: 'Selected a crop',
  },
  crop_tended: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'crop_tended',
    actionLabel: 'Tended a crop',
  },
  crop_harvested: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'crop_harvested',
    actionLabel: 'Harvested a crop',
  },
  cycle_completed: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'cycle_completed',
    actionLabel: 'Completed a production cycle',
  },
  storage_overflowed: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'storage_overflowed',
    actionLabel: 'Storage overflowed',
  },
  goods_hauled: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'goods_hauled',
    actionLabel: 'Hauled goods',
  },
  goods_spoiled: {
    step: 'friction',
    stepLabel: 'Friction',
    action: 'goods_spoiled',
    actionLabel: 'Goods spoiled',
  },
  carrier_changed: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'carrier_changed',
    actionLabel: 'Changed carrier',
  },

  goods_sold: {
    step: 'market',
    stepLabel: 'The Market',
    action: 'goods_sold',
    actionLabel: 'Sold goods',
  },
  animal_product_collected: {
    step: 'farm',
    stepLabel: 'Working the Farm',
    action: 'animal_product_collected',
    actionLabel: 'Collected animal produce',
  },

  building_placed: {
    step: 'reinvest',
    stepLabel: 'Reinvesting',
    action: 'building_placed',
    actionLabel: 'Placed a building',
  },
  building_completed: {
    step: 'reinvest',
    stepLabel: 'Reinvesting',
    action: 'building_completed',
    actionLabel: 'Building finished',
  },
  land_purchased: {
    step: 'reinvest',
    stepLabel: 'Reinvesting',
    action: 'land_purchased',
    actionLabel: 'Bought the neighbouring parcel',
  },
  animal_purchased: {
    step: 'reinvest',
    stepLabel: 'Reinvesting',
    action: 'animal_purchased',
    actionLabel: 'Bought livestock',
  },
  panel_viewed: {
    step: 'navigation',
    stepLabel: 'Navigation',
    action: 'panel_viewed',
    actionLabel: 'Opened or closed a panel',
  },
  setting_changed: {
    step: 'settings',
    stepLabel: 'Settings',
    action: 'setting_changed',
    actionLabel: 'Changed a setting',
  },
  career_action_completed: {
    step: 'reinvest',
    stepLabel: 'Reinvesting',
    action: 'career_action_completed',
    actionLabel: 'Completed a career action',
  },
  processing_completed: {
    step: 'production',
    stepLabel: 'Processing',
    action: 'processing_completed',
    actionLabel: 'Processing completed',
  },
  worker_task_completed: {
    step: 'production',
    stepLabel: 'Processing',
    action: 'worker_task_completed',
    actionLabel: 'Worker completed a task',
  },
  save_completed: {
    step: 'save',
    stepLabel: 'Saving',
    action: 'save_completed',
    actionLabel: 'Saved progress',
  },
  save_failed: {
    step: 'save',
    stepLabel: 'Saving',
    action: 'save_failed',
    actionLabel: 'Save failed',
  },
  account_action: {
    step: 'account',
    stepLabel: 'Account',
    action: 'account_action',
    actionLabel: 'Account action',
  },
  milestone_claimed: {
    step: 'progression',
    stepLabel: 'Career Progression',
    action: 'milestone_claimed',
    actionLabel: 'Claimed a milestone',
  },
  milestone_ready: {
    step: 'progression',
    stepLabel: 'Career Progression',
    action: 'milestone_ready',
    actionLabel: 'Milestone became ready',
  },
  unlock_granted: {
    step: 'progression',
    stepLabel: 'Career Progression',
    action: 'unlock_granted',
    actionLabel: 'Feature unlocked',
  },
  town_grew: {
    step: 'progression',
    stepLabel: 'Career Progression',
    action: 'town_grew',
    actionLabel: 'Town grew',
  },
  town_project_completed: {
    step: 'progression',
    stepLabel: 'Career Progression',
    action: 'town_project_completed',
    actionLabel: 'Town project completed',
  },
  contract_failed: {
    step: 'market',
    stepLabel: 'The Market',
    action: 'contract_failed',
    actionLabel: 'Contract failed',
  },
  career_restructured: {
    step: 'progression',
    stepLabel: 'Career Progression',
    action: 'career_restructured',
    actionLabel: 'Restructured the farm',
  },
  specialization_chosen: {
    step: 'progression',
    stepLabel: 'Career Progression',
    action: 'specialization_chosen',
    actionLabel: 'Chose a specialization',
  },

  farm_event_warned: {
    step: 'setback',
    stepLabel: 'Weather and Threats',
    action: 'event_warned',
    actionLabel: 'Setback warned',
  },
  farm_event_prevented: {
    step: 'setback',
    stepLabel: 'Weather and Threats',
    action: 'event_prevented',
    actionLabel: 'Setback prevented',
  },
  farm_event_impacted: {
    step: 'setback',
    stepLabel: 'Weather and Threats',
    action: 'event_impacted',
    actionLabel: 'Setback landed',
  },
  building_broken: {
    step: 'setback',
    stepLabel: 'Weather and Threats',
    action: 'building_broken',
    actionLabel: 'Building broke',
  },
  building_repaired: {
    step: 'setback',
    stepLabel: 'Weather and Threats',
    action: 'building_repaired',
    actionLabel: 'Building repaired',
  },
  fox_scared_off: {
    step: 'setback',
    stepLabel: 'Weather and Threats',
    action: 'fox_scared_off',
    actionLabel: 'Scared off a fox',
  },
  animal_lost: {
    step: 'setback',
    stepLabel: 'Weather and Threats',
    action: 'animal_lost',
    actionLabel: 'Lost livestock',
  },

  action_refused: {
    step: 'friction',
    stepLabel: 'Friction',
    action: 'action_refused',
    actionLabel: 'Action refused',
  },
  animal_hungry: {
    step: 'friction',
    stepLabel: 'Friction',
    action: 'animal_hungry',
    actionLabel: 'Livestock lacked feed',
  },
  idle_detected: {
    step: 'friction',
    stepLabel: 'Friction',
    action: 'idle_detected',
    actionLabel: 'Player went idle',
  },
  runtime_error: {
    step: 'reliability',
    stepLabel: 'Reliability',
    action: 'runtime_error',
    actionLabel: 'Runtime error captured',
  },
  performance_sample: {
    step: 'performance',
    stepLabel: 'Performance',
    action: 'performance_sample',
    actionLabel: 'Performance sampled',
  },
  performance_overrun: {
    step: 'performance',
    stepLabel: 'Performance',
    action: 'performance_overrun',
    actionLabel: 'Simulation fell behind',
  },

  run_completed: {
    step: 'outcome',
    stepLabel: 'Season Outcome',
    action: 'run_completed',
    actionLabel: 'Season ended',
  },
  session_end: {
    step: 'outcome',
    stepLabel: 'Season Outcome',
    action: 'session_end',
    actionLabel: 'Session ended',
  },
} satisfies Record<AnalyticsEventName, Mapping>;

/**
 * Strips anything that could identify a person before it leaves the game.
 *
 * Our own analytics payloads already contain no PII, but this layer sends to
 * a third party, so the guarantee is enforced here rather than assumed.
 */
function safeMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/email|name|token|password|user_id|anon/i.test(key)) continue;
    if (typeof value === 'string' && value.length > 120) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
  }
  return out;
}

export function bindGlitchAnalytics(
  analytics: AnalyticsClient,
  glitch: GlitchPlatform,
): Unsubscribe {
  return analytics.events.on('recorded', (event) => {
    const mapping = MAP[event.name];
    if (!mapping) return;
    glitch.events.track({
      step_key: mapping.step,
      step_label: mapping.stepLabel,
      action_key: mapping.action,
      event_label: mapping.actionLabel,
      metadata: {
        ...safeMetadata(event.payload),
        event_id: `${analytics.context.sessionId}:${event.seq}`,
        session_ms: event.at,
        app_version: analytics.context.appVersion,
        protocol_version: analytics.context.protocolVersion,
        build_type: analytics.context.buildType,
        platform: analytics.context.platform,
        device_type: analytics.context.deviceType,
        operating_system: analytics.context.operatingSystem,
        input_method: analytics.context.inputMethod,
        locale: analytics.context.locale,
      },
    });
  });
}

/** Exported for the test that asserts every analytics event is accounted for. */
export const GLITCH_EVENT_MAP = MAP;
