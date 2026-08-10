/**
 * Records the analytics funnel.
 *
 * A sink, not a source: it subscribes to buses the game already emits on and
 * translates them into events. Gameplay code contains no analytics calls at
 * all, which is what stops instrumentation rotting as features change - a
 * removed event bus breaks the build here rather than silently producing an
 * empty funnel.
 */
import type { Unsubscribe } from '@engine/core/types.js';
import type { AnalyticsClient } from '@analytics/AnalyticsClient.js';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';

export function bindAnalytics(
  scene: FarmScene,
  session: SessionController,
  analytics: AnalyticsClient,
): Unsubscribe {
  const world = scene.world;
  const interaction = scene.interaction;
  const eventDirector = scene.eventDirector;
  const enemies = scene.enemyDirector;
  if (!world || !interaction || !eventDirector) {
    throw new Error('bindAnalytics requires a loaded FarmScene.');
  }

  const subscriptions: Unsubscribe[] = [];
  let cycle = 0;

  /**
   * The four onboarding health metrics. Each fires at most once, because a
   * median "time to first success" computed over repeated successes is
   * meaningless.
   */
  const firstMeaningful = (action: string) =>
    analytics.trackOnce('first_meaningful_action', { ms: analytics.elapsedMs(), action });
  const firstFeedback = (kind: string) =>
    analytics.trackOnce('first_feedback', { ms: analytics.elapsedMs(), kind });
  const firstSuccess = (kind: string) =>
    analytics.trackOnce('first_success', { ms: analytics.elapsedMs(), kind });

  subscriptions.push(
    interaction.events.on('interaction:performed', ({ action, plotId }) => {
      analytics.trackOnce('first_input', { ms: analytics.elapsedMs(), action });
      if (action === 'plant') {
        firstMeaningful('plant');
        firstFeedback('crop_appeared');
        analytics.track('crop_planted', {
          cropId: interaction.selectedCropId,
          plotId,
          balance: world.balance,
          cycle,
        });
      } else if (action === 'tend') {
        analytics.track('crop_tended', { plotId });
      }
    }),
    interaction.events.on('interaction:refused', ({ reason }) =>
      analytics.track('action_refused', { action: 'interact', reason }),
    ),

    world.events.on('world:harvested', ({ itemId, quantity, spilled }) => {
      cycle += 1;
      firstSuccess('harvest');
      analytics.track('crop_harvested', { cropId: itemId, quantity, spilled, cycle });
      analytics.track('cycle_completed', {
        cycle,
        elapsedMs: analytics.elapsedMs(),
        balance: world.balance,
      });
    }),
    world.events.on('world:storage-full', ({ itemId, spilled }) =>
      analytics.track('storage_overflowed', { itemId, spilled }),
    ),
    world.events.on('world:building-placed', ({ kind }) =>
      analytics.track('building_placed', { kind, cost: 0, balance: world.balance }),
    ),
    world.events.on('world:building-completed', ({ kind }) =>
      analytics.track('building_completed', { kind }),
    ),
    world.events.on('world:land-purchased', ({ parcels }) =>
      analytics.track('land_purchased', { parcels, elapsedMs: analytics.elapsedMs() }),
    ),

    session.events.on('session:sold', ({ itemId, quantity, payout, viaContract }) => {
      firstSuccess('sale');
      analytics.track('goods_sold', {
        itemId,
        quantity,
        payout,
        viaContract,
        balance: world.balance,
      });
    }),
    session.events.on('session:refused', ({ action, reason }) =>
      analytics.track('action_refused', { action, reason }),
    ),
    session.events.on('session:prevented', ({ kind, cost }) =>
      analytics.track('farm_event_prevented', { kind, cost }),
    ),
    session.events.on('session:outcome', ({ summary }) =>
      analytics.track('run_completed', {
        outcome: summary.outcome === 'expanded' ? 'expanded' : 'bankrupt',
        elapsedMs: analytics.elapsedMs(),
        cyclesCompleted: summary.cyclesCompleted,
        finalBalance: summary.finalBalance,
        peakBalance: summary.peakBalance,
        cropsHarvested: summary.cropsHarvested,
        eventsSurvived: summary.eventsSurvived,
        eventsPrevented: summary.eventsPrevented,
        buildingsBuilt: summary.buildingsBuilt,
      }),
    ),

    eventDirector.events.on('event:warned', ({ kind, targets }) =>
      analytics.track('farm_event_warned', {
        kind,
        targets: targets.length,
        balance: world.balance,
      }),
    ),
    eventDirector.events.on('event:started', ({ kind, mitigated }) =>
      analytics.track('farm_event_impacted', { kind, mitigated }),
    ),

    // --- onboarding funnel ------------------------------------------------
    session.onboarding.events.on('onboarding:started', ({ adaptive }) =>
      analytics.track('onboarding_start', { adaptive }),
    ),
    session.onboarding.events.on('onboarding:beat', ({ beat, index }) =>
      analytics.track('onboarding_beat_start', { beat: beat.id, index }),
    ),
    session.onboarding.events.on('onboarding:beat-complete', ({ beat, index, durationMs, hints }) =>
      analytics.track('onboarding_beat_complete', {
        beat: beat.id,
        index,
        durationMs,
        hintsShown: hints,
      }),
    ),
    session.onboarding.events.on('onboarding:hint', ({ beat, attempt }) =>
      analytics.track('onboarding_hint_shown', { beat: beat.id, attempt }),
    ),
    session.onboarding.events.on('onboarding:skipped', ({ beat, index, reason }) =>
      analytics.track('onboarding_skipped', { beat: beat?.id ?? 'none', index, reason }),
    ),
    session.onboarding.events.on('onboarding:complete', ({ durationMs, beatsShown, hints }) =>
      analytics.track('onboarding_complete', { durationMs, beatsShown, hintsShown: hints }),
    ),
  );

  if (enemies) {
    subscriptions.push(
      enemies.events.on('enemy:scared-off', ({ remaining }) =>
        analytics.track('fox_scared_off', { remaining }),
      ),
    );
  }

  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}
