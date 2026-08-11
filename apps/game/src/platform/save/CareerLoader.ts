/**
 * Chooses which career to resume, and upgrades it if it is old.
 *
 * Before this existed the game read the best save, then built a brand-new
 * starter farm anyway - so a player who had bought land, built a barn and
 * survived a drought was handed a fresh field on their next visit
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.1).
 *
 * The order here is deliberate: read, migrate, validate, and only then let the
 * scene build a world from it. A document that fails any of those steps must
 * produce a *recovery decision*, never a silent new farm, because silently
 * replacing a career is indistinguishable from deleting it.
 */
import { migrateSave, type CareerSaveState, type MigrationNote } from '@farmrise/shared';
import type { SaveDirector, SaveTier } from './SaveDirector.js';

export type CareerLoadOutcome =
  | {
      readonly kind: 'resume';
      readonly state: CareerSaveState;
      readonly tier: SaveTier;
      readonly migratedFrom: number | null;
      readonly notes: readonly MigrationNote[];
    }
  | { readonly kind: 'new' }
  | { readonly kind: 'unreadable'; readonly reason: string; readonly tier: SaveTier };

export async function loadCareer(saves: SaveDirector): Promise<CareerLoadOutcome> {
  const best = await saves.loadBestDocument();
  if (!best) return { kind: 'new' };
  if ('error' in best) return { kind: 'unreadable', reason: best.error, tier: best.tier };

  const migrated = migrateSave(best.document, best.careerId);
  if (!migrated.ok) {
    if (best.tier === 'cloud') saves.blockCloudWrites();
    return { kind: 'unreadable', reason: migrated.reason, tier: best.tier };
  }

  return {
    kind: 'resume',
    state: migrated.value.state,
    tier: best.tier,
    migratedFrom:
      migrated.value.fromVersion === migrated.value.state.schemaVersion
        ? null
        : migrated.value.fromVersion,
    notes: migrated.value.notes,
  };
}
