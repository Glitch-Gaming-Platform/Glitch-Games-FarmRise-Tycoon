import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsClient, createMemorySink, isSafePayload } from '@analytics/AnalyticsClient.js';
import { AnalyticsConsent, ANALYTICS_CONSENT_KEY } from '@analytics/consent.js';
import {
  WebAnalytics,
  privacySafePageLocation,
  resolveWebAnalyticsConfig,
} from '@analytics/WebAnalytics.js';
import type { AnalyticsContext } from '@analytics/events.js';
import { EventBus } from '@engine/core/EventBus.js';
import { bindRuntimeAnalytics } from '../../src/bootstrap/bindRuntimeAnalytics.js';

const context: AnalyticsContext = {
  anonId: 'anonymous',
  sessionId: 'session-1',
  protocolVersion: '1.0',
  appVersion: '1.2.3',
  buildType: 'production',
  platform: 'web',
  deviceType: 'desktop',
  operatingSystem: 'MacOS',
  inputMethod: 'keyboard_mouse',
  locale: 'en-US',
};

beforeEach(() => {
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  localStorage.clear();
  delete (window as unknown as Record<string, unknown>)['dataLayer'];
  delete (window as unknown as Record<string, unknown>)['gtag'];
  delete (window as unknown as Record<string, unknown>)['clarity'];
  delete (window as unknown as Record<string, unknown>)['GameAnalyticsTracker'];
});

describe('production gating and consent', () => {
  it('never configures providers outside production', () => {
    expect(
      resolveWebAnalyticsConfig(false, {
        VITE_GA_MEASUREMENT_ID: 'G-TEST',
        VITE_CLARITY_PROJECT_ID: 'clarity',
        VITE_GLITCH_WEB_TRACKING_TOKEN: 'token',
      }),
    ).toBeNull();
  });

  it('keeps the analytics test mode isolated behind both build and query gates', () => {
    expect(resolveWebAnalyticsConfig(true, { VITE_ANALYTICS_TEST_MODE: '1' })).toBeNull();
    expect(
      resolveWebAnalyticsConfig(true, { VITE_ANALYTICS_TEST_MODE: '1' }, true)?.glitchTrackingToken,
    ).toBe('analytics-test-token');
  });

  it('starts default-on and persists an explicit choice', async () => {
    const consent = new AnalyticsConsent(localStorage);
    expect(consent.granted).toBe(true);
    expect(consent.explicit).toBe(false);
    consent.decide(true, 'banner');

    expect(consent.explicit).toBe(true);
    expect(JSON.parse(localStorage.getItem(ANALYTICS_CONSENT_KEY)!)).toMatchObject({
      version: '1.0',
      state: 'granted',
    });
  });

  it('retains no payloads while disabled', () => {
    const client = new AnalyticsClient({ context, enabled: false, flushIntervalMs: 0 });
    client.track('crop_tended', { plotId: 'p1' });
    expect(client.buffered).toHaveLength(0);
    expect(client.trackOnce('first_input', { ms: 1, action: 'move' })).toBe(false);
  });
});

describe('provider bridge', () => {
  it('loads scripts only after start and maps one event to every configured provider', async () => {
    const analytics = new WebAnalytics({
      googleMeasurementId: 'G-TEST',
      clarityProjectId: 'clarity-test',
      glitchTitleId: 'title-1',
      glitchTrackingToken: 'web-token',
    });
    expect(document.head.querySelectorAll('script')).toHaveLength(0);

    const glitch = {
      init: vi.fn(),
      trackEvent: vi.fn(),
      trackPageview: vi.fn(),
      flush: vi.fn(),
      sendToConversionApis: vi.fn(),
    };
    (window as unknown as { GameAnalyticsTracker: typeof glitch }).GameAnalyticsTracker = glitch;
    analytics.start(context);
    document.getElementById('farmrise-glitch-web-analytics')?.dispatchEvent(new Event('load'));

    const client = new AnalyticsClient({ context, flushIntervalMs: 0 });
    const memory = createMemorySink();
    client.addSink(analytics);
    client.addSink(memory);
    client.track('onboarding_complete', { durationMs: 1000, beatsShown: 5, hintsShown: 1 });
    await client.flush();

    expect(document.getElementById('farmrise-google-analytics')).not.toBeNull();
    expect(document.getElementById('farmrise-clarity')).not.toBeNull();
    expect(glitch.init).toHaveBeenCalledWith(
      'title-1',
      'web-token',
      expect.objectContaining({ fingerprintUser: false, sendToConversionApis: false }),
    );
    expect(glitch.trackEvent).toHaveBeenCalledWith(
      'onboarding',
      'onboarding_complete',
      expect.objectContaining({ event_id: 'session-1:0', app_version: '1.2.3' }),
      true,
    );
    expect(memory.all).toHaveLength(1);
  });

  it('removes launch identity from provider page locations while preserving campaigns', () => {
    expect(
      privacySafePageLocation(
        'https://game.example/play?install_id=secret&user_install_id=local&utm_source=newsletter&utm_campaign=launch#debug',
      ),
    ).toBe('https://game.example/play?utm_source=newsletter&utm_campaign=launch');
  });

  it('rejects nested, secret, non-finite and oversized payloads', () => {
    expect(isSafePayload({ cropId: 'wheat', quantity: 2 })).toBe(true);
    expect(isSafePayload({ password: 'nope' })).toBe(false);
    expect(isSafePayload({ nested: { unsafe: true } })).toBe(false);
    expect(isSafePayload({ value: Number.NaN })).toBe(false);
    expect(isSafePayload({ value: 'x'.repeat(161) })).toBe(false);
  });
});

describe('runtime coverage', () => {
  it('records navigation, saves, engine failures and overruns without raw errors', () => {
    const client = new AnalyticsClient({ context, batchSize: 100, flushIntervalMs: 0 });
    const machineEvents = new EventBus<{
      'state:changed': { from: 'menu' | null; to: 'playing'; reason?: string };
    }>();
    const saveEvents = new EventBus<{
      'save:written': { tiers: readonly ['local']; at: number };
      'save:error': { tier: 'local'; reason: string };
    }>();
    const engineEvents = new EventBus<{
      'engine:overrun': { droppedSteps: number };
      'engine:system-error': { systemId: string; phase: 'update'; error: unknown };
    }>();
    const unbind = bindRuntimeAnalytics({
      analytics: client,
      machine: {
        current: 'playing',
        events: machineEvents,
      } as never,
      saves: { events: saveEvents } as never,
      engine: {
        events: engineEvents,
        loop: { fps: 60 },
      } as never,
      renderer: { stats: { drawCalls: 10, triangles: 20, programs: 1 } } as never,
      quality: 'ultra',
      performanceIntervalMs: 0,
      idleCheckIntervalMs: 0,
    });

    machineEvents.emit('state:changed', { from: 'menu', to: 'playing', reason: 'menu-play' });
    saveEvents.emit('save:written', { tiers: ['local'], at: 1 });
    saveEvents.emit('save:error', { tier: 'local', reason: 'sensitive internal detail' });
    engineEvents.emit('engine:overrun', { droppedSteps: 3 });
    engineEvents.emit('engine:system-error', {
      systemId: 'private-system-name',
      phase: 'update',
      error: new Error('private stack'),
    });
    unbind();

    expect(client.buffered.map((event) => event.name)).toEqual([
      'screen_viewed',
      'save_completed',
      'save_failed',
      'performance_overrun',
      'runtime_error',
    ]);
    expect(JSON.stringify(client.buffered)).not.toContain('sensitive internal detail');
    expect(JSON.stringify(client.buffered)).not.toContain('private-system-name');
  });
});
