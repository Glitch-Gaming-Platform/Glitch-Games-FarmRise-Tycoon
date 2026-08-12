import type { AnalyticsSink } from './AnalyticsClient.js';
import type { AnalyticsContext, AnalyticsEventName, RecordedEvent } from './events.js';

const GOOGLE_SCRIPT_ID = 'farmrise-google-analytics';
const CLARITY_SCRIPT_ID = 'farmrise-clarity';
const GLITCH_SCRIPT_ID = 'farmrise-glitch-web-analytics';
const GLITCH_SCRIPT_URL = 'https://api.glitch.fun/js/game-analytics.js';

export interface WebAnalyticsConfig {
  readonly googleMeasurementId: string | null;
  readonly clarityProjectId: string | null;
  readonly glitchTitleId: string;
  readonly glitchTrackingToken: string | null;
}

export interface WebAnalyticsEnvironment {
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_CLARITY_PROJECT_ID?: string;
  readonly VITE_GLITCH_TITLE_ID?: string;
  readonly VITE_GLITCH_WEB_TRACKING_TOKEN?: string;
  readonly VITE_ANALYTICS_TEST_MODE?: string;
}

interface GlitchWebTracker {
  init(titleId: string, trackingToken: string, options: Record<string, unknown>): void;
  trackEvent(
    category: string,
    name: string,
    data: Record<string, unknown>,
    conversionEvent?: boolean,
  ): void;
  trackPageview(data: Record<string, unknown>): void;
  flush(): void;
  sendToConversionApis(enabled: boolean): void;
}

type AnalyticsWindow = Window &
  typeof globalThis & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
    GameAnalyticsTracker?: GlitchWebTracker;
  };

interface PendingGlitchCall {
  readonly kind: 'event' | 'pageview';
  readonly category?: string;
  readonly name?: string;
  readonly data: Record<string, unknown>;
  readonly conversion?: boolean;
}

const EVENT_CATEGORIES: Readonly<Record<AnalyticsEventName, string>> = {
  session_start: 'session',
  session_end: 'session',
  scene_ready: 'performance',
  screen_viewed: 'navigation',
  visibility_changed: 'session',
  consent_updated: 'privacy',
  onboarding_start: 'onboarding',
  onboarding_beat_start: 'onboarding',
  onboarding_beat_complete: 'onboarding',
  onboarding_hint_shown: 'onboarding',
  onboarding_skipped: 'onboarding',
  onboarding_complete: 'onboarding',
  first_input: 'onboarding',
  first_meaningful_action: 'onboarding',
  first_feedback: 'onboarding',
  first_success: 'onboarding',
  crop_planted: 'core_loop',
  crop_selected: 'core_loop',
  crop_tended: 'core_loop',
  crop_harvested: 'core_loop',
  goods_sold: 'economy',
  building_placed: 'economy',
  building_completed: 'progression',
  land_purchased: 'economy',
  goods_hauled: 'core_loop',
  goods_spoiled: 'economy',
  carrier_changed: 'core_loop',
  animal_purchased: 'economy',
  animal_product_collected: 'core_loop',
  cycle_completed: 'core_loop',
  panel_viewed: 'navigation',
  setting_changed: 'settings',
  career_action_completed: 'progression',
  processing_completed: 'progression',
  worker_task_completed: 'progression',
  save_completed: 'save',
  save_failed: 'error',
  account_action: 'account',
  milestone_claimed: 'achievement',
  milestone_ready: 'achievement',
  unlock_granted: 'progression',
  town_grew: 'progression',
  town_project_completed: 'progression',
  contract_failed: 'economy',
  career_restructured: 'progression',
  specialization_chosen: 'progression',
  farm_event_warned: 'challenge',
  farm_event_prevented: 'challenge',
  farm_event_impacted: 'challenge',
  building_broken: 'challenge',
  building_repaired: 'challenge',
  fox_scared_off: 'challenge',
  animal_hungry: 'challenge',
  animal_lost: 'challenge',
  action_refused: 'friction',
  storage_overflowed: 'friction',
  idle_detected: 'engagement',
  runtime_error: 'error',
  performance_sample: 'performance',
  performance_overrun: 'performance',
  run_completed: 'outcome',
};

const CONVERSION_EVENTS = new Set<AnalyticsEventName>([
  'account_action',
  'onboarding_complete',
  'first_success',
  'goods_sold',
  'land_purchased',
  'milestone_claimed',
  'run_completed',
]);

export function resolveWebAnalyticsConfig(
  production: boolean,
  environment: WebAnalyticsEnvironment = viteEnvironment(),
  testModeRequested = false,
): WebAnalyticsConfig | null {
  if (!production) return null;
  const googleMeasurementId = clean(environment.VITE_GA_MEASUREMENT_ID);
  const clarityProjectId = clean(environment.VITE_CLARITY_PROJECT_ID);
  const testMode = environment.VITE_ANALYTICS_TEST_MODE === '1' && testModeRequested;
  const glitchTrackingToken =
    clean(environment.VITE_GLITCH_WEB_TRACKING_TOKEN) ?? (testMode ? 'analytics-test-token' : null);
  if (!googleMeasurementId && !clarityProjectId && !glitchTrackingToken) return null;
  return {
    googleMeasurementId,
    clarityProjectId,
    glitchTitleId:
      clean(environment.VITE_GLITCH_TITLE_ID) ?? '9a698a9d-1b27-4c78-9256-0f458368737d',
    glitchTrackingToken,
  };
}

export class WebAnalytics implements AnalyticsSink {
  readonly id = 'web-providers';
  readonly #pendingGlitch: PendingGlitchCall[] = [];
  #started = false;

  constructor(
    private readonly config: WebAnalyticsConfig,
    private readonly win: AnalyticsWindow = window as AnalyticsWindow,
    private readonly doc: Document = document,
  ) {}

  start(context: AnalyticsContext, explicitConsent = false): void {
    if (this.#started) return;
    this.#started = true;
    this.#startGoogle(context);
    this.#startClarity(explicitConsent);
    this.#startGlitch();
    this.trackPageview('launch');
  }

  deliver(events: readonly RecordedEvent[], context: AnalyticsContext): void {
    if (!this.#started) return;
    for (const event of events) {
      const data = {
        ...event.payload,
        event_id: `${context.sessionId}:${event.seq}`,
        session_ms: event.at,
        app_version: context.appVersion,
        build_type: context.buildType,
        platform: context.platform,
        device_type: context.deviceType,
        operating_system: context.operatingSystem,
        input_method: context.inputMethod,
        locale: context.locale,
      };
      const conversion = isConversion(event);

      this.#safe(() => this.win.gtag?.('event', event.name, data));
      this.#safe(() => this.win.clarity?.('event', event.name));
      this.#glitch({
        kind: 'event',
        category: EVENT_CATEGORIES[event.name],
        name: event.name,
        data,
        conversion,
      });

      if (event.name === 'screen_viewed')
        this.trackPageview(String(event.payload['screen'] ?? 'game'));
    }
  }

  trackPageview(screen: string): void {
    if (!this.#started) return;
    const location = privacySafePageLocation(this.win.location.href);
    const title = this.doc.title.slice(0, 255);
    this.#safe(() =>
      this.win.gtag?.('event', 'page_view', {
        page_location: location,
        page_title: title,
        screen_name: screen,
      }),
    );
    this.#safe(() => this.win.clarity?.('set', 'screen', screen));
    this.#glitch({ kind: 'pageview', data: { route: location, screen, page_title: title } });
  }

  flush(): void {
    this.#safe(() => this.win.GameAnalyticsTracker?.flush());
  }

  revokeConsent(): void {
    this.#safe(() =>
      this.win.gtag?.('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      }),
    );
    this.#safe(() =>
      this.win.clarity?.('consentv2', {
        ad_Storage: 'denied',
        analytics_Storage: 'denied',
      }),
    );
    this.#safe(() => this.win.GameAnalyticsTracker?.sendToConversionApis(false));
    clearCookie(this.doc, 'device_id');
    clearCookie(this.doc, 'session_id');
  }

  #startGoogle(context: AnalyticsContext): void {
    const id = this.config.googleMeasurementId;
    if (!id) return;
    this.win.dataLayer ??= [];
    this.win.gtag ??= (...args: unknown[]) => this.win.dataLayer?.push(args);
    this.win.gtag('js', new Date());
    this.win.gtag('config', id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      app_version: context.appVersion,
    });
    loadScript(
      this.doc,
      GOOGLE_SCRIPT_ID,
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
    );
  }

  #startClarity(explicitConsent: boolean): void {
    const id = this.config.clarityProjectId;
    if (!id) return;
    this.win.clarity ??= Object.assign(
      (...args: unknown[]) => {
        this.win.clarity!.q ??= [];
        this.win.clarity!.q!.push(args);
      },
      { q: [] as unknown[][] },
    );
    if (explicitConsent) {
      this.win.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    }
    loadScript(this.doc, CLARITY_SCRIPT_ID, `https://www.clarity.ms/tag/${encodeURIComponent(id)}`);
  }

  #startGlitch(): void {
    const token = this.config.glitchTrackingToken;
    if (!token) return;
    loadScript(this.doc, GLITCH_SCRIPT_ID, GLITCH_SCRIPT_URL, () => {
      const tracker = this.win.GameAnalyticsTracker;
      if (!tracker) return;
      tracker.init(this.config.glitchTitleId, token, {
        trackUser: true,
        fingerprintUser: false,
        cookieUser: true,
        sendToConversionApis: false,
        trackClicks: true,
        trackScroll: true,
        trackErrors: true,
        trackPerformance: true,
      });
      tracker.sendToConversionApis(false);
      for (const call of this.#pendingGlitch.splice(0)) this.#sendGlitch(call, tracker);
    });
  }

  #glitch(call: PendingGlitchCall): void {
    if (!this.config.glitchTrackingToken) return;
    const tracker = this.win.GameAnalyticsTracker;
    if (tracker) {
      this.#sendGlitch(call, tracker);
      return;
    }
    this.#pendingGlitch.push(call);
    if (this.#pendingGlitch.length > 200) this.#pendingGlitch.shift();
  }

  #sendGlitch(call: PendingGlitchCall, tracker: GlitchWebTracker): void {
    this.#safe(() => {
      if (call.kind === 'pageview') tracker.trackPageview(call.data);
      else tracker.trackEvent(call.category!, call.name!, call.data, call.conversion ?? false);
    });
  }

  #safe(action: () => void): void {
    try {
      action();
    } catch {
      // A blocked or malfunctioning provider must be invisible to gameplay.
    }
  }
}

export function privacySafePageLocation(input: string): string {
  try {
    const url = new URL(input);
    const allowed = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (key.startsWith('utm_') || key === 'short_link_click_id') allowed.set(key, value);
    }
    url.search = allowed.toString();
    url.hash = '';
    return url.toString();
  } catch {
    return '/';
  }
}

export function safeReferrerHost(input: string): string {
  try {
    return input ? new URL(input).host.slice(0, 160) : '';
  } catch {
    return '';
  }
}

function isConversion(event: RecordedEvent): boolean {
  if (!CONVERSION_EVENTS.has(event.name)) return false;
  if (event.name !== 'account_action') return true;
  return event.payload['outcome'] === 'succeeded';
}

function loadScript(
  doc: Document,
  id: string,
  src: string,
  onLoad?: () => void,
): HTMLScriptElement {
  const existing = doc.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    if (onLoad) existing.addEventListener('load', onLoad, { once: true });
    return existing;
  }
  const script = doc.createElement('script');
  script.id = id;
  script.src = src;
  script.async = true;
  if (onLoad) script.addEventListener('load', onLoad, { once: true });
  doc.head.appendChild(script);
  return script;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function viteEnvironment(): WebAnalyticsEnvironment {
  return (import.meta as unknown as { env?: WebAnalyticsEnvironment }).env ?? {};
}

function clearCookie(doc: Document, name: string): void {
  doc.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`;
}
