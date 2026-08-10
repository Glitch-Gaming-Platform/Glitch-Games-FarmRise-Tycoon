/**
 * Save-game wire format.
 *
 * The save is the player's entire persistent economy, so it is treated as
 * untrusted input in both directions. The server stores it, versions it, and
 * re-validates it against the shared rules before accepting a write (see
 * docs/NETWORKING.md, "Server-authoritative validation").
 */
import { z } from 'zod';
import { centsSchema, idStringSchema, plotIdSchema, tickSchema } from './common.js';
import { CROP_IDS } from '../domain/crops.js';

export const SAVE_SCHEMA_VERSION = 1;

export const plotStateSchema = z.object({
  id: plotIdSchema,
  cropId: z.enum(CROP_IDS as [string, ...string[]]).nullable(),
  grownTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  tendCount: z.number().int().min(0).max(64),
  water: z.number().min(0).max(1),
  irrigated: z.boolean(),
  diseased: z.boolean(),
  eventMultiplier: z.number().min(0).max(2),
});

export const placedBuildingSchema = z.object({
  kind: z.enum(['barn', 'irrigation', 'road', 'fence']),
  tileX: z.number().int().min(0).max(255),
  tileZ: z.number().int().min(0).max(255),
  /** Remaining construction ticks; 0 means complete and providing its effect. */
  remainingBuildTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const animalStateSchema = z.object({
  species: z.enum(['chicken']),
  count: z.number().int().min(0).max(500),
  cycleTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
});

/** Inventory is a bounded map so a hostile client cannot send 10k keys. */
export const inventorySchema = z
  .record(idStringSchema, z.number().int().min(0).max(1_000_000))
  .refine((value) => Object.keys(value).length <= 64, {
    message: 'Inventory may not contain more than 64 distinct items.',
  });

export const saveStateSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  /** Simulation tick this snapshot represents. Monotonic per save. */
  tick: tickSchema,
  balance: centsSchema,
  plots: z.array(plotStateSchema).max(256),
  buildings: z.array(placedBuildingSchema).max(512),
  animals: z.array(animalStateSchema).max(16),
  inventory: inventorySchema,
  /** Number of adjacent land parcels purchased. First playable allows one. */
  landParcels: z.number().int().min(1).max(8),
  /** RNG stream position, so the server can resume the same event sequence. */
  rngState: z.number().int().min(0),
});
export type SaveState = z.infer<typeof saveStateSchema>;

export const saveEnvelopeSchema = z.object({
  saveId: z.string(),
  /** Optimistic concurrency token. A write with a stale revision is rejected. */
  revision: z.number().int().min(0),
  updatedAt: z.number().int(),
  state: saveStateSchema,
});
export type SaveEnvelope = z.infer<typeof saveEnvelopeSchema>;

export const putSaveRequestSchema = z.object({
  /** Revision the client believes it is updating. Must match the stored value. */
  expectedRevision: z.number().int().min(0),
  state: saveStateSchema,
});
export type PutSaveRequest = z.infer<typeof putSaveRequestSchema>;
