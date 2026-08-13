/**
 * One farm site, as it is persisted.
 *
 * Everything here has a stable id. Coordinates describe where an entity *is*;
 * they are never its identity, because a building that can rotate, upgrade,
 * hold stock, break down and employ someone cannot be addressed by the tile it
 * happens to stand on (docs/PROGRESSION_GAMEPLAY_PLAN.md §33.3).
 *
 * Every accumulator that would otherwise be rounded away each tick - upkeep
 * remainders, partial spoilage, partial mitigation work - is persisted, so that
 * saving and reloading cannot be used to shed a cost or repeat a benefit
 * (§33.8).
 */
import { z } from 'zod';
import { idStringSchema, plotIdSchema, tickSchema } from './common.js';
import { CROP_IDS } from '../domain/crops.js';
import { ANIMAL_SPECIES } from '../domain/animals.js';
import { BUILDING_KINDS } from '../domain/buildings.js';
import { WORKER_ROLE_IDS } from '../domain/workers.js';

const cropIdSchema = z.enum(CROP_IDS as [string, ...string[]]);
const speciesSchema = z.enum(ANIMAL_SPECIES as [string, ...string[]]);
const buildingKindSchema = z.enum(BUILDING_KINDS as [string, ...string[]]);
const workerRoleSchema = z.enum(WORKER_ROLE_IDS as [string, ...string[]]);

/** A bounded item map. Unbounded keys are how a save becomes a denial-of-service vector. */
export const inventorySchema = z
  .record(idStringSchema, z.number().min(0).max(1_000_000))
  .refine((value) => Object.keys(value).length <= 64, {
    message: 'An inventory may not contain more than 64 distinct items.',
  });

export const plotStateSchema = z.object({
  id: plotIdSchema,
  cropId: cropIdSchema.nullable(),
  grownTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  tendCount: z.number().int().min(0).max(64),
  water: z.number().min(0).max(1),
  irrigated: z.boolean(),
  diseased: z.boolean(),
  eventMultiplier: z.number().min(0).max(2),
  /** Soil nutrient of the bed this plot sits on, 0..1. */
  soil: z.number().min(0).max(1).default(1),
  /** Quality of the crop currently growing, 0..1. Decided at harvest. */
  quality: z.number().min(0).max(1).default(1),
  /** Crop grown here last cycle, so rotation can be rewarded. */
  previousCropId: cropIdSchema.nullable().default(null),
});
export type PlotSaveState = z.infer<typeof plotStateSchema>;

export const placedBuildingSchema = z.object({
  id: idStringSchema,
  kind: buildingKindSchema,
  tileX: z.number().int().min(0).max(255),
  tileZ: z.number().int().min(0).max(255),
  /** Quarter turns, 0..3. */
  rotation: z.number().int().min(0).max(3).default(0),
  /** Remaining construction ticks; 0 means complete and providing its effect. */
  remainingBuildTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  /** True while an incident has this building out of action. */
  broken: z.boolean().default(false),
});
export type PlacedBuildingSaveState = z.infer<typeof placedBuildingSchema>;

/**
 * A place goods physically are.
 *
 * Once hauling exists there is no such thing as "the" inventory: goods are in a
 * barn, on a loading pad, in the player's arms or on a cart, and moving them
 * between those places is the gameplay (§33.5).
 */
export const storeSchema = z.object({
  id: idStringSchema,
  /** Building providing this store, or null for a field stack. */
  buildingId: idStringSchema.nullable(),
  tileX: z.number().int().min(0).max(255),
  tileZ: z.number().int().min(0).max(255),
  capacity: z.number().min(0).max(100_000),
  /** True when goods here are protected from spoilage. */
  preserving: z.boolean().default(false),
  items: inventorySchema,
  /** Mean quality per item id, 0..1. */
  quality: z.record(idStringSchema, z.number().min(0).max(1)).default({}),
  /** Carried-over fractional spoilage, so reloading cannot dodge decay. */
  spoilageRemainder: z.record(idStringSchema, z.number().min(0).max(1)).default({}),
});
export type StoreSaveState = z.infer<typeof storeSchema>;

export const animalGroupSchemaV2 = z.object({
  id: idStringSchema,
  species: speciesSchema,
  count: z.number().int().min(0).max(500),
  cycleTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  /** Tile of the shelter this group belongs to. */
  tileX: z.number().int().min(0).max(255),
  tileZ: z.number().int().min(0).max(255),
  /** True while the group has been driven inside during an incident. */
  sheltered: z.boolean().default(false),
});

export const animalGroupSchema = animalGroupSchemaV2.extend({
  /** Stable inherited-shelter id or completed animal-shelter building id. */
  shelterId: idStringSchema,
});
export type AnimalGroupSaveState = z.infer<typeof animalGroupSchema>;

export const processorQueueEntrySchema = z.object({
  recipeId: idStringSchema,
  batches: z.number().int().min(1).max(64),
  /** Ticks remaining on the batch currently running. */
  remainingTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const processorSchema = z.object({
  id: idStringSchema,
  buildingId: idStringSchema,
  queue: z.array(processorQueueEntrySchema).max(16),
  /** Input taken from a store and held by the machine. */
  held: inventorySchema.default({}),
});
export type ProcessorSaveState = z.infer<typeof processorSchema>;

export const workerSchema = z.object({
  id: idStringSchema,
  role: workerRoleSchema,
  displayName: z.string().min(1).max(40),
  skill: z.number().int().min(0).max(3),
  tasksCompleted: z.number().int().min(0).max(1_000_000),
  /** Ordered task priorities. First match in range wins. */
  priorities: z.array(idStringSchema).max(8),
  /** Parcel the worker is assigned to, or null for the whole site. */
  parcelId: idStringSchema.nullable().default(null),
  hutBuildingId: idStringSchema.nullable().default(null),
  /** Progress toward the current action. */
  actionTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  carrying: inventorySchema.default({}),
});
export type WorkerSaveState = z.infer<typeof workerSchema>;

/** What the player is physically holding, and in what. */
export const carriedSchema = z.object({
  carrier: z.enum(['arms', 'handcart', 'wagon']),
  ownedCarriers: z.array(z.enum(['arms', 'handcart', 'wagon'])).max(4),
  items: inventorySchema,
  quality: z.record(idStringSchema, z.number().min(0).max(1)).default({}),
  /** Cart position, so a parked cart is where you left it. */
  cartTileX: z.number().int().min(0).max(255).nullable().default(null),
  cartTileZ: z.number().int().min(0).max(255).nullable().default(null),
});
export type CarriedSaveState = z.infer<typeof carriedSchema>;

export const farmSiteSchema = z.object({
  id: idStringSchema,
  regionId: idStringSchema,
  seed: z.number().int().min(0),
  levelId: idStringSchema,
  ownedParcelIds: z.array(idStringSchema).min(1).max(16),
  active: z.boolean().default(true),
  /** Career tick this site was last simulated to. */
  lastSimulatedTick: tickSchema,
  plots: z.array(plotStateSchema).max(256),
  buildings: z.array(placedBuildingSchema).max(512),
  stores: z.array(storeSchema).max(64),
  animals: z.array(animalGroupSchema).max(32),
  processors: z.array(processorSchema).max(32),
  workers: z.array(workerSchema).max(8),
  carried: carriedSchema,
  /** Fractional upkeep carried between ticks so rounding cannot be farmed. */
  upkeepRemainder: z.number().min(0).max(1).default(0),
  /** Fractional wages, same reasoning. */
  wageRemainder: z.number().min(0).max(1).default(0),
});
export type FarmSiteSaveState = z.infer<typeof farmSiteSchema>;

/** Frozen version-2 site shape, retained only for deterministic migration. */
export const farmSiteSchemaV2 = farmSiteSchema.extend({
  animals: z.array(animalGroupSchemaV2).max(32),
});
export type FarmSiteSaveStateV2 = z.infer<typeof farmSiteSchemaV2>;
