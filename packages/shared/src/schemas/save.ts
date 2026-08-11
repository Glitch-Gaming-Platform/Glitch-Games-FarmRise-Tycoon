/**
 * Save-game wire format.
 *
 * The save is the player's entire persistent career, so it is treated as
 * untrusted input in both directions. The server stores it, versions it, and
 * re-validates it against the shared rules before accepting a write (see
 * docs/NETWORKING.md, "Server-authoritative validation").
 *
 * Version 1 described a single sitting on a single farm. It is retained here in
 * full because migration fixtures must keep parsing against the exact shape
 * that shipped - a migration tested only against a hand-written approximation
 * of the old format is not tested (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.3).
 *
 * The *current* save is the career document in ./career.ts. The aliases at the
 * bottom of this file are what every caller should use.
 */
import { z } from 'zod';
import { centsSchema, idStringSchema, plotIdSchema, tickSchema } from './common.js';
import {
  CAREER_SCHEMA_VERSION,
  careerEnvelopeSchema,
  careerSaveStateSchema,
  putCareerRequestSchema,
  type CareerEnvelope,
  type CareerSaveState,
  type PutCareerRequest,
} from './career.js';

// -- version 1, frozen -----------------------------------------------------

export const SAVE_SCHEMA_VERSION_V1 = 1;

export const legacyPlotStateSchemaV1 = z.object({
  id: plotIdSchema,
  /** Not enumerated: v1 fixtures must keep parsing even if a crop is renamed. */
  cropId: idStringSchema.nullable(),
  grownTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  tendCount: z.number().int().min(0).max(64),
  water: z.number().min(0).max(1),
  irrigated: z.boolean(),
  diseased: z.boolean(),
  eventMultiplier: z.number().min(0).max(2),
});

export const legacyPlacedBuildingSchemaV1 = z.object({
  kind: z.enum(['barn', 'irrigation', 'road', 'fence']),
  tileX: z.number().int().min(0).max(255),
  tileZ: z.number().int().min(0).max(255),
  remainingBuildTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const legacyAnimalStateSchemaV1 = z.object({
  species: z.enum(['chicken']),
  count: z.number().int().min(0).max(500),
  cycleTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const legacyInventorySchemaV1 = z
  .record(idStringSchema, z.number().int().min(0).max(1_000_000))
  .refine((value) => Object.keys(value).length <= 64, {
    message: 'Inventory may not contain more than 64 distinct items.',
  });

export const legacySaveStateSchemaV1 = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION_V1),
  tick: tickSchema,
  balance: centsSchema,
  plots: z.array(legacyPlotStateSchemaV1).max(256),
  buildings: z.array(legacyPlacedBuildingSchemaV1).max(512),
  animals: z.array(legacyAnimalStateSchemaV1).max(16),
  inventory: legacyInventorySchemaV1,
  landParcels: z.number().int().min(1).max(8),
  rngState: z.number().int().min(0),
});
export type LegacySaveStateV1 = z.infer<typeof legacySaveStateSchemaV1>;

// -- current ---------------------------------------------------------------

export const SAVE_SCHEMA_VERSION = CAREER_SCHEMA_VERSION;

export const saveStateSchema = careerSaveStateSchema;
export type SaveState = CareerSaveState;

export const saveEnvelopeSchema = careerEnvelopeSchema;
export type SaveEnvelope = CareerEnvelope;

export const putSaveRequestSchema = putCareerRequestSchema;
export type PutSaveRequest = PutCareerRequest;

/** Every schema version this build knows how to read. */
export const SUPPORTED_SAVE_VERSIONS: readonly number[] = Object.freeze([
  SAVE_SCHEMA_VERSION_V1,
  CAREER_SCHEMA_VERSION,
]);
