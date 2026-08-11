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
import { ANIMALS, getItem, type BuildingKind } from '@farmrise/shared';
import type { FarmScene } from '@game/scenes/FarmScene.js';
import type { SessionController } from '@game/systems/SessionController.js';
import { buildCostFor } from '@game/world/FarmCommands.js';

export function bindAnalytics(
  scene: FarmScene,
  session: SessionController,
  analytics: AnalyticsClient,
): Unsubscribe {
  const career = scene.career;
  const world = scene.world;
  const interaction = scene.interaction;
  const incidents = scene.incidents;
  const careerDirector = scene.careerDirector;
  const enemies = scene.enemyDirector;
  if (!career || !world || !interaction || !incidents || !careerDirector) {
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
    interaction.events.on('interaction:performed', ({ action, target }) => {
      analytics.trackOnce('first_input', { ms: analytics.elapsedMs(), action });
      if (action === 'plant') {
        firstMeaningful('plant');
        firstFeedback('crop_appeared');
        analytics.track('crop_planted', {
          cropId: interaction.selectedCropId,
          plotId: target,
          balance: career.balance,
          cycle,
        });
      } else if (action === 'tend') {
        analytics.track('crop_tended', { plotId: target });
      }
    }),
    interaction.events.on('interaction:refused', ({ reason }) =>
      analytics.track('action_refused', { action: 'interact', reason }),
    ),

    world.events.on('world:harvested', ({ itemId, quantity, carried }) => {
      cycle += 1;
      firstSuccess('harvest');
      // `spilled` now means "left in the field because your hands were full",
      // which is the number that says whether hauling is the live bottleneck.
      analytics.track('crop_harvested', {
        cropId: itemId,
        quantity,
        spilled: quantity - carried,
        cycle,
      });
      analytics.track('cycle_completed', {
        cycle,
        elapsedMs: analytics.elapsedMs(),
        balance: career.balance,
      });
    }),
    world.events.on('world:storage-full', ({ itemId, spilled }) =>
      analytics.track('storage_overflowed', { itemId, spilled }),
    ),
    world.events.on('world:building-placed', ({ kind }) =>
      analytics.track('building_placed', {
        kind,
        cost: buildCostFor(career, kind as BuildingKind),
        balance: career.balance,
      }),
    ),
    world.events.on('world:building-completed', ({ kind }) =>
      analytics.track('building_completed', { kind }),
    ),
    world.events.on('world:parcel-acquired', ({ parcelId }) =>
      analytics.track('land_purchased', {
        parcels: world.parcels.count,
        parcelId,
        elapsedMs: analytics.elapsedMs(),
      }),
    ),
    session.events.on('session:hauled', ({ stored, refused }) =>
      analytics.track('goods_hauled', { stored, refused, carrier: world.carry.carrier }),
    ),
    world.events.on('world:stack-collected', ({ items }) => {
      for (const [itemId, quantity] of Object.entries(items)) {
        if (quantity <= 0 || getItem(itemId)?.category !== 'animal_product') continue;
        analytics.track('animal_product_collected', {
          itemId,
          quantity,
          carrier: world.carry.carrier,
        });
      }
    }),
    world.events.on('world:animal-purchased', ({ species, count }) =>
      analytics.track('animal_purchased', {
        species,
        count,
        cost: ANIMALS[species].purchaseCost * count,
        balance: career.balance,
      }),
    ),
    world.events.on('world:animal-hungry', ({ species, feedItemId, needed, available }) =>
      analytics.track('animal_hungry', { species, feedItemId, needed, available }),
    ),
    world.events.on('world:animal-lost', ({ species, count, remaining }) =>
      analytics.track('animal_lost', { species, count, remaining }),
    ),

    session.events.on('session:sold', ({ itemId, quantity, payout, viaContract }) => {
      firstSuccess('sale');
      analytics.track('goods_sold', {
        itemId,
        quantity,
        payout,
        viaContract,
        balance: career.balance,
      });
    }),
    session.events.on('session:refused', ({ action, reason }) =>
      analytics.track('action_refused', { action, reason }),
    ),
    session.events.on('session:responded', ({ response }) =>
      analytics.track('farm_event_prevented', { kind: response, cost: 0 }),
    ),

    // --- progression funnel ------------------------------------------------
    careerDirector.events.on('career:season-review', ({ summary }) =>
      analytics.track('run_completed', {
        outcome: summary.outcome,
        elapsedMs: analytics.elapsedMs(),
        cyclesCompleted: summary.cyclesCompleted,
        finalBalance: summary.finalBalance,
        peakBalance: summary.peakBalance,
        cropsHarvested: summary.cropsHarvested,
        eventsSurvived: summary.incidentsSurvived,
        eventsPrevented: summary.incidentsMitigated,
        buildingsBuilt: summary.buildingsBuilt,
      }),
    ),
    careerDirector.events.on('career:milestone-claimed', ({ milestone }) =>
      analytics.track('milestone_claimed', {
        milestoneId: milestone.id,
        stage: milestone.advancesToStage,
        elapsedMs: analytics.elapsedMs(),
      }),
    ),
    careerDirector.events.on('career:restructured', () =>
      analytics.track('career_restructured', { elapsedMs: analytics.elapsedMs() }),
    ),
    career.events.on('career:specialization-chosen', ({ specialization }) =>
      analytics.track('specialization_chosen', { specialization }),
    ),

    incidents.events.on('incident:warned', ({ instance, definition }) =>
      analytics.track('farm_event_warned', {
        kind: definition.id,
        targets: instance.targetIds.length,
        balance: career.balance,
      }),
    ),
    incidents.events.on('incident:impact', ({ instance, definition }) =>
      analytics.track('farm_event_impacted', {
        kind: definition.id,
        mitigated: instance.responseProgress > 0,
      }),
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
