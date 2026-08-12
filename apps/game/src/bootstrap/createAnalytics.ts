import {
  AnalyticsClient,
  createConsoleSink,
  randomId,
  resolveAnonId,
} from '@analytics/AnalyticsClient.js';
import { ANALYTICS_CONSENT_VERSION, AnalyticsConsent } from '@analytics/consent.js';
import {
  WebAnalytics,
  privacySafePageLocation,
  resolveWebAnalyticsConfig,
  safeReferrerHost,
} from '@analytics/WebAnalytics.js';
import type { Unsubscribe } from '@engine/core/types.js';
import { PROTOCOL_VERSION } from '@farmrise/shared';
import { GlitchPlatform } from '@platform/glitch/GlitchPlatform.js';
import type { AnalyticsConsentBannerOptions } from '@ui/privacy/AnalyticsConsentBanner.js';
import { bindGlitchAnalytics } from './bindGlitch.js';

export interface AnalyticsRuntimeOptions {
  readonly isDev: boolean;
  readonly isProduction: boolean;
}

export interface AnalyticsRuntime {
  readonly analytics: AnalyticsClient;
  readonly glitch: GlitchPlatform | null;
  readonly privacy: AnalyticsConsentBannerOptions | null;
  activate(email: string | null, isActive: () => boolean): Promise<void>;
  setAccountEmail(email: string | null): Promise<void>;
  end(reason: 'unload' | 'manual' | 'quit'): void;
  flush(): void;
  dispose(): void;
}

/** Constructs every analytics provider and owns its consent-sensitive lifecycle. */
export function createAnalyticsRuntime(options: AnalyticsRuntimeOptions): AnalyticsRuntime {
  const consent = new AnalyticsConsent();
  const webConfig = resolveWebAnalyticsConfig(
    options.isProduction,
    undefined,
    new URLSearchParams(globalThis.location?.search ?? '').get('analytics-test') === '1',
  );
  const glitch = options.isProduction ? GlitchPlatform.create() : null;
  const consentRequired = Boolean(webConfig || glitch);
  const analytics = new AnalyticsClient({
    context: {
      anonId: resolveAnonId(options.isDev || (consentRequired && consent.granted)),
      sessionId: randomId(),
      protocolVersion: PROTOCOL_VERSION,
      appVersion: env('VITE_APP_VERSION') ?? '0.1.0',
      buildType: buildType(options.isDev),
      platform: 'web',
      deviceType: deviceType(),
      operatingSystem: operatingSystem(),
      inputMethod: inputMethod(),
      locale: globalThis.navigator?.language ?? 'unknown',
    },
    enabled: options.isDev || (options.isProduction && consentRequired && consent.granted),
  });
  if (options.isDev) analytics.addSink(createConsoleSink());

  // Glitch launch parameters were captured above. Remove player/session ids
  // before any website provider can inspect the address bar.
  if (options.isProduction && typeof history !== 'undefined' && typeof location !== 'undefined') {
    history.replaceState(history.state, '', privacySafePageLocation(location.href));
  }

  const web = webConfig ? new WebAnalytics(webConfig) : null;
  let source: 'default' | 'banner' | 'settings' | 'stored' = consent.explicit
    ? 'stored'
    : 'default';
  let activated = false;
  let glitchStarted = false;
  let unbindGlitch: Unsubscribe | null = null;

  const recordSessionStart = (): void => {
    analytics.trackOnce('session_start', {
      referrerHost: typeof document === 'undefined' ? '' : safeReferrerHost(document.referrer),
      viewport: `${globalThis.innerWidth ?? 0}x${globalThis.innerHeight ?? 0}`,
      touch: (globalThis.navigator?.maxTouchPoints ?? 0) > 0,
    });
  };

  const privacy: AnalyticsConsentBannerOptions | null = consentRequired
    ? {
        initialState: consent.state,
        onDecision(granted, decisionSource) {
          const previous = consent.state;
          const wasExplicit = consent.explicit;
          source = decisionSource;
          consent.decide(granted, decisionSource);
          if (!granted) {
            analytics.setEnabled(false);
            unbindGlitch?.();
            web?.revokeConsent();
            glitch?.dispose();
          }
          if (previous !== consent.state || !wasExplicit) globalThis.location?.reload();
        },
      }
    : null;

  return {
    analytics,
    glitch,
    privacy,
    async activate(email, isActive) {
      if (options.isDev) {
        recordSessionStart();
        return;
      }
      if (activated || !consentRequired || !consent.granted) return;
      activated = true;
      analytics.setEnabled(true);
      if (web) {
        web.start(analytics.context, consent.explicit);
        analytics.addSink(web);
      }
      if (glitch) unbindGlitch = bindGlitchAnalytics(analytics, glitch);
      analytics.track('consent_updated', { granted: true, source });
      recordSessionStart();
      if (glitch) {
        await glitch.start(email, isActive, {
          given: consent.explicit,
          version: ANALYTICS_CONSENT_VERSION,
        });
        glitchStarted = true;
      }
    },
    async setAccountEmail(email) {
      if (glitchStarted) await glitch?.setAccountEmail(email);
    },
    end(reason) {
      analytics.trackOnce('session_end', { durationMs: analytics.elapsedMs(), reason });
    },
    flush() {
      void analytics.flush();
      web?.flush();
      void glitch?.flush();
    },
    dispose() {
      unbindGlitch?.();
      web?.flush();
      glitch?.dispose();
      analytics.dispose();
    },
  };
}

function env(name: string): string | undefined {
  const source = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return source?.[name];
}

function buildType(isDev: boolean): 'production' | 'demo' | 'playtest' | 'development' {
  if (isDev) return 'development';
  const configured = env('VITE_GLITCH_BUILD_TYPE');
  return configured === 'demo' || configured === 'playtest' ? configured : 'production';
}

function deviceType(): 'desktop' | 'mobile' | 'tablet' {
  const touch = (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
  const shortest = Math.min(globalThis.screen?.width ?? 1024, globalThis.screen?.height ?? 768);
  if (touch && shortest >= 600) return 'tablet';
  return touch ? 'mobile' : 'desktop';
}

function inputMethod(): 'keyboard_mouse' | 'touch' | 'hybrid' {
  const touchPoints = globalThis.navigator?.maxTouchPoints ?? 0;
  if (touchPoints <= 0) return 'keyboard_mouse';
  return deviceType() === 'desktop' ? 'hybrid' : 'touch';
}

function operatingSystem(): string {
  const source = `${globalThis.navigator?.platform ?? ''} ${globalThis.navigator?.userAgent ?? ''}`;
  if (/iPhone|iPad|iPod/i.test(source)) return 'iOS';
  if (/Android/i.test(source)) return 'Android';
  if (/Win/i.test(source)) return 'Windows';
  if (/Mac/i.test(source)) return 'MacOS';
  if (/Linux/i.test(source)) return 'Linux';
  return 'unknown';
}
