import type { AnalyticsClient } from '@analytics/AnalyticsClient.js';
import type { Engine } from '@engine/core/Engine.js';
import type { Unsubscribe } from '@engine/core/types.js';
import type { RendererSystem } from '@engine/render/RendererSystem.js';
import type { GameStateMachine } from '@game/states/GameStateMachine.js';
import type { SaveDirector } from '@platform/save/SaveDirector.js';

export interface RuntimeAnalyticsOptions {
  readonly analytics: AnalyticsClient;
  readonly machine: GameStateMachine;
  readonly saves: SaveDirector;
  readonly engine: Engine;
  readonly renderer: RendererSystem;
  readonly quality: string;
  readonly document?: Document;
  readonly window?: Window & typeof globalThis;
  readonly now?: () => number;
  readonly performanceIntervalMs?: number;
  readonly idleAfterMs?: number;
  readonly idleCheckIntervalMs?: number;
}

/** App-wide telemetry that does not belong to one loaded FarmScene. */
export function bindRuntimeAnalytics(options: RuntimeAnalyticsOptions): Unsubscribe {
  const doc = options.document ?? document;
  const win = options.window ?? window;
  const now = options.now ?? (() => Date.now());
  const subscriptions: Unsubscribe[] = [];
  let backgroundedAt: number | null = doc.visibilityState === 'hidden' ? now() : null;
  let lastActivityAt = now();
  let idleReported = false;

  subscriptions.push(
    options.machine.events.on('state:changed', ({ from, to, reason }) =>
      options.analytics.track('screen_viewed', {
        screen: to,
        previous: from ?? 'none',
        reason: reason ?? 'state_change',
      }),
    ),
    options.saves.events.on('save:written', ({ tiers }) =>
      options.analytics.track('save_completed', { tiers: tiers.join(',') || 'none' }),
    ),
    options.saves.events.on('save:error', ({ tier }) =>
      options.analytics.track('save_failed', { tier, reasonCode: 'write_failed' }),
    ),
    options.engine.events.on('engine:overrun', ({ droppedSteps }) =>
      options.analytics.track('performance_overrun', {
        phase: options.machine.current ?? 'boot',
        droppedSteps,
      }),
    ),
    options.engine.events.on('engine:system-error', () =>
      options.analytics.track('runtime_error', { area: 'engine', code: 'system_disabled' }),
    ),
  );

  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') {
      backgroundedAt = now();
      options.analytics.track('visibility_changed', { state: 'backgrounded', backgroundMs: 0 });
      return;
    }
    const backgroundMs = backgroundedAt === null ? 0 : Math.max(0, now() - backgroundedAt);
    backgroundedAt = null;
    lastActivityAt = now();
    idleReported = false;
    options.analytics.track('visibility_changed', { state: 'resumed', backgroundMs });
  };
  const onActivity = (): void => {
    lastActivityAt = now();
    idleReported = false;
  };
  const onWindowError = (): void =>
    options.analytics.track('runtime_error', { area: 'window', code: 'uncaught_error' });
  const onUnhandledRejection = (): void =>
    options.analytics.track('runtime_error', { area: 'promise', code: 'unhandled_rejection' });

  doc.addEventListener('visibilitychange', onVisibility);
  for (const type of ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'] as const) {
    win.addEventListener(type, onActivity, { passive: true });
  }
  win.addEventListener('error', onWindowError);
  win.addEventListener('unhandledrejection', onUnhandledRejection);

  const idleAfterMs = options.idleAfterMs ?? 60_000;
  const idleCheckIntervalMs = options.idleCheckIntervalMs ?? 15_000;
  const idleTimer =
    idleCheckIntervalMs > 0
      ? setInterval(() => {
          if (doc.visibilityState === 'hidden' || idleReported) return;
          const idleMs = now() - lastActivityAt;
          if (idleMs < idleAfterMs) return;
          idleReported = true;
          options.analytics.track('idle_detected', {
            seconds: Math.floor(idleMs / 1000),
            phase: options.machine.current ?? 'boot',
          });
        }, idleCheckIntervalMs)
      : null;

  const performanceIntervalMs = options.performanceIntervalMs ?? 60_000;
  const performanceTimer =
    performanceIntervalMs > 0
      ? setInterval(() => {
          if (doc.visibilityState === 'hidden' || options.machine.current !== 'playing') return;
          const stats = options.renderer.stats;
          options.analytics.track('performance_sample', {
            phase: 'playing',
            fps: Math.round(options.engine.loop.fps),
            drawCalls: stats.drawCalls,
            triangles: stats.triangles,
            quality: options.quality,
          });
        }, performanceIntervalMs)
      : null;

  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
    if (idleTimer) clearInterval(idleTimer);
    if (performanceTimer) clearInterval(performanceTimer);
    doc.removeEventListener('visibilitychange', onVisibility);
    for (const type of ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'] as const) {
      win.removeEventListener(type, onActivity);
    }
    win.removeEventListener('error', onWindowError);
    win.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
