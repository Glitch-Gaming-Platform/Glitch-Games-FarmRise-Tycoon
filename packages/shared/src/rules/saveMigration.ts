/**
 * Save-document migrations.
 *
 * A save format that changes without a migration chain silently throws away
 * careers, and "the version is unrecognised, start a new farm" is the single
 * worst thing this game can say to someone forty minutes in
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.3).
 *
 * The rules every migration keeps:
 *   - it is a pure function of the old document;
 *   - it never guesses a value that changes money without saying so below;
 *   - it is tested against a fixture captured from the shipped format, not a
 *     hand-written approximation of it;
 *   - a document it cannot migrate fails loudly with a reason, so the caller
 *     can offer recovery rather than overwriting the player's progress.
 *
 * Database migrations and save-document migrations are different systems. This
 * is the second one.
 */
import { z } from 'zod';
import {
  CAREER_SCHEMA_VERSION,
  careerSaveStateSchema,
  type CareerSaveState,
} from '../schemas/career.js';
import type { FarmSiteSaveState } from '../schemas/site.js';
import {
  legacySaveStateSchemaV1,
  SAVE_SCHEMA_VERSION_V1,
  type LegacySaveStateV1,
} from '../schemas/save.js';
import { asPlotId, cents } from '../domain/ids.js';
import {
  HOMESTEAD_PARCEL_ID,
  NORTH_FIELD_PARCEL_ID,
  PARCELS_BY_ID,
  STARTER_EXTENSION_PARCEL_ID,
  bedsForParcels,
  normalizeOwnedParcelIds,
} from '../domain/parcels.js';
import { isBuildingKind } from '../domain/buildings.js';
import { newCareer, newCareerSite, STARTER_SITE_ID, YARD_STORE_ID } from './newCareer.js';
import { ok, ruleViolation, type Result } from './result.js';
import { emptyPlot } from './growth.js';

/** Tile offset applied to v1 coordinates: the 16x16 farm became the middle of a 32x32 estate. */
export const V1_TILE_OFFSET = 8;

/**
 * The parcel a v1 save's second land purchase becomes.
 *
 * v1 stored `landParcels` as a count with no identity, so there is exactly one
 * defensible reading: the player bought the only parcel the build offered, and
 * that parcel is the North Field.
 */
export const V1_SECOND_PARCEL_ID = NORTH_FIELD_PARCEL_ID;

export interface MigrationNote {
  readonly field: string;
  readonly reason: string;
}

export interface MigrationOutcome {
  readonly state: CareerSaveState;
  readonly fromVersion: number;
  readonly notes: readonly MigrationNote[];
}

function readVersion(document: unknown): number | null {
  const parsed = z.object({ schemaVersion: z.number() }).safeParse(document);
  return parsed.success ? parsed.data.schemaVersion : null;
}

/**
 * v1 -> v2.
 *
 * The shape of the loss is worth stating plainly: v1 did not record who trusted
 * the player, what they had chosen to specialise in, or which incident was
 * pending, because none of those existed. Those fields start empty, and the
 * career resumes at stage 0 with whatever land, buildings, animals and money
 * the player actually had.
 */
export function migrateV1ToV2(legacy: LegacySaveStateV1, careerId: string): MigrationOutcome {
  const notes: MigrationNote[] = [];
  const base = newCareer({ careerId, seed: legacy.rngState });
  const site = newCareerSite(legacy.rngState);

  const ownedParcelIds = [HOMESTEAD_PARCEL_ID];
  if (legacy.landParcels > 1) {
    ownedParcelIds.push(STARTER_EXTENSION_PARCEL_ID, V1_SECOND_PARCEL_ID);
    notes.push({
      field: 'sites[0].ownedParcelIds',
      reason:
        'v1 counted parcels without naming them. The only purchasable parcel in that build is the North Field, so the count is resolved to it.',
    });
  }

  const bedIds = new Set(
    ownedParcelIds.flatMap((id) => (PARCELS_BY_ID[id]?.beds ?? []).map((bed) => bed.id)),
  );

  const plots: FarmSiteSaveState['plots'] = legacy.plots
    .filter((plot) => bedIds.has(plot.id as string))
    .map((plot) => ({
      id: asPlotId(plot.id as string),
      cropId: plot.cropId as string | null,
      grownTicks: plot.grownTicks,
      tendCount: plot.tendCount,
      water: plot.water,
      irrigated: plot.irrigated,
      diseased: plot.diseased,
      eventMultiplier: plot.eventMultiplier,
      // v1 had no soil model. Starting at full fertility is the only choice that
      // cannot retroactively punish a player for how they farmed before it existed.
      soil: 1,
      quality: 1,
      previousCropId: null,
    }));
  const migratedPlotIds = new Set(plots.map((plot) => String(plot.id)));
  for (const bed of bedsForParcels(ownedParcelIds)) {
    if (!migratedPlotIds.has(bed.id)) plots.push(emptyPlot(asPlotId(bed.id)));
  }

  if (plots.length !== legacy.plots.length) {
    notes.push({
      field: 'sites[0].plots',
      reason: 'Plots that do not correspond to a bed on an owned parcel were dropped.',
    });
  }

  const migratedSite = {
    ...site,
    ownedParcelIds,
    lastSimulatedTick: legacy.tick,
    plots: plots.length > 0 ? plots : site.plots,
    buildings: legacy.buildings
      .filter((building) => isBuildingKind(building.kind))
      .map((building, index) => ({
        id: `building-v1-${index}`,
        kind: building.kind,
        tileX: building.tileX + V1_TILE_OFFSET,
        tileZ: building.tileZ + V1_TILE_OFFSET,
        rotation: 0,
        remainingBuildTicks: building.remainingBuildTicks,
        broken: false,
      })),
    animals: legacy.animals.map((group, index) => ({
      id: `animals-v1-${index}`,
      species: group.species,
      count: group.count,
      cycleTicks: group.cycleTicks,
      tileX: site.animals[0]?.tileX ?? 19,
      tileZ: site.animals[0]?.tileZ ?? 16,
      sheltered: false,
    })),
    stores: [
      {
        ...(site.stores[0] ?? {
          id: YARD_STORE_ID,
          buildingId: null,
          tileX: 19,
          tileZ: 16,
          capacity: 60,
          preserving: false,
          quality: {},
          spoilageRemainder: {},
        }),
        // v1 held one global inventory with no location. It lands in the yard
        // store, which is where a v1 player would have imagined it was.
        items: { ...legacy.inventory },
        quality: {},
        spoilageRemainder: {},
      },
    ],
  };

  notes.push({
    field: 'buildings[].tileX/tileZ',
    reason: `v1 tiles were on a 16x16 grid; the estate is 32x32 with the homestead offset by ${V1_TILE_OFFSET}.`,
  });
  notes.push({
    field: 'buyers',
    reason: 'v1 had one buyer and no trust model, so every relationship starts at zero.',
  });

  const state: CareerSaveState = {
    ...base,
    tick: legacy.tick,
    onboardingCompleted: true,
    balance: cents(legacy.balance),
    sites: [migratedSite],
    activeSiteId: STARTER_SITE_ID,
    statistics: {
      ...base.statistics,
      peakBalance: legacy.balance,
    },
  };

  return { state, fromVersion: SAVE_SCHEMA_VERSION_V1, notes };
}

/**
 * Applies estate-table compatibility changes that do not alter the save wire
 * shape. The current one preserves North Field ownership after its adjoining
 * three-bed tutorial strip became a separately purchasable parcel.
 */
export function normalizeEstateLayout(state: CareerSaveState): MigrationOutcome {
  const notes: MigrationNote[] = [];
  let changed = false;
  const sites = state.sites.map((site) => {
    const legacyNorthSplit =
      site.ownedParcelIds.includes(NORTH_FIELD_PARCEL_ID) &&
      !site.ownedParcelIds.includes(STARTER_EXTENSION_PARCEL_ID);
    const ownedParcelIds = normalizeOwnedParcelIds(site.ownedParcelIds);
    const ownedChanged =
      ownedParcelIds.length !== site.ownedParcelIds.length ||
      ownedParcelIds.some((id, index) => id !== site.ownedParcelIds[index]);
    const existingPlots = new Set(site.plots.map((plot) => String(plot.id)));
    const missingPlots = legacyNorthSplit
      ? bedsForParcels(ownedParcelIds)
          .filter((bed) => !existingPlots.has(bed.id))
          .map((bed) => emptyPlot(asPlotId(bed.id)))
      : [];

    if (!ownedChanged && missingPlots.length === 0) return site;
    changed = true;
    if (legacyNorthSplit) {
      notes.push({
        field: `sites.${site.id}.ownedParcelIds`,
        reason:
          'The original North Field included the new Starter Extension strip, so existing ownership keeps both parcels.',
      });
    }
    if (missingPlots.length > 0) {
      notes.push({
        field: `sites.${site.id}.plots`,
        reason: `${missingPlots.length} empty crop beds were added for the current estate layout.`,
      });
    }
    return {
      ...site,
      ownedParcelIds: [...ownedParcelIds],
      plots: [...site.plots, ...missingPlots],
    };
  });

  return {
    state: changed ? { ...state, sites } : state,
    fromVersion: CAREER_SCHEMA_VERSION,
    notes,
  };
}

/**
 * Reads any supported save document and returns the current one.
 *
 * The caller keeps the original document until the migrated one has been
 * written successfully; this function never mutates its input.
 */
export function migrateSave(document: unknown, careerId: string): Result<MigrationOutcome> {
  const version = readVersion(document);
  if (version === null) {
    return ruleViolation('This file does not look like a FarmRise save.');
  }

  if (version === CAREER_SCHEMA_VERSION) {
    const parsed = careerSaveStateSchema.safeParse(document);
    if (!parsed.success) {
      return ruleViolation(`Save is version ${version} but does not match the schema.`);
    }
    return ok(normalizeEstateLayout(parsed.data));
  }

  if (version === SAVE_SCHEMA_VERSION_V1) {
    const parsed = legacySaveStateSchemaV1.safeParse(document);
    if (!parsed.success) {
      return ruleViolation('This version 1 save is damaged and cannot be upgraded safely.');
    }
    const outcome = migrateV1ToV2(parsed.data, careerId);
    const normalized = normalizeEstateLayout(outcome.state);
    const revalidated = careerSaveStateSchema.safeParse(normalized.state);
    if (!revalidated.success) {
      return ruleViolation('Upgrading this save produced an invalid career document.');
    }
    return ok({
      ...outcome,
      state: revalidated.data,
      notes: [...outcome.notes, ...normalized.notes],
    });
  }

  if (version > CAREER_SCHEMA_VERSION) {
    return ruleViolation(
      `This save was made by a newer version of the game (format ${version}). Update to open it.`,
    );
  }

  return ruleViolation(`Save format ${version} is no longer supported.`);
}
