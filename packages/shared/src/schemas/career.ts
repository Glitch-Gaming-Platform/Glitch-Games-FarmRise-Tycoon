/**
 * The career save document.
 *
 * The first playable persisted a single sitting: one farm, one balance, one
 * RNG cursor. A career persists a *history* - who trusts you, what you chose to
 * become, which disaster is already on its way and cannot be dodged by
 * reloading (docs/PROGRESSION_GAMEPLAY_PLAN.md §33).
 *
 * Two rules govern every field here:
 *   1. If losing it would let a player redo a decision, it is persisted.
 *   2. If it is a fraction the simulation would otherwise round away, it is
 *      persisted, because rounding at a save boundary is free money.
 */
import { z } from 'zod';
import { centsSchema, idStringSchema, tickSchema } from './common.js';
import { farmSiteSchema, farmSiteSchemaV2 } from './site.js';
import { BUYER_IDS } from '../domain/buyers.js';
import { SPECIALIZATION_IDS } from '../domain/specializations.js';

export const CAREER_SCHEMA_VERSION = 3;
export const CAREER_SCHEMA_VERSION_V2 = 2;

const buyerIdSchema = z.enum(BUYER_IDS as [string, ...string[]]);

export const buyerRelationshipSchema = z.object({
  trust: z.number().min(0).max(100),
  deliveries: z.number().int().min(0).max(1_000_000),
  failures: z.number().int().min(0).max(1_000_000),
  /** Career tick of the most recent completed delivery. */
  lastDeliveryTick: tickSchema.nullable().default(null),
});
export type BuyerRelationship = z.infer<typeof buyerRelationshipSchema>;

export const acceptedContractSchema = z.object({
  id: idStringSchema,
  buyerId: buyerIdSchema,
  itemId: idStringSchema,
  quantity: z.number().int().min(1).max(100_000),
  delivered: z.number().int().min(0).max(100_000),
  unitPrice: centsSchema,
  minimumQuality: z.number().min(0).max(1).default(0),
  acceptedTick: tickSchema,
  deadlineTick: tickSchema,
  /** A standing contract re-arms on its cadence instead of closing. */
  recurringEveryTicks: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  status: z.enum(['open', 'fulfilled', 'failed', 'cancelled']),
});
export type AcceptedContract = z.infer<typeof acceptedContractSchema>;

export const loanSchema = z.object({
  id: idStringSchema,
  principal: centsSchema,
  outstanding: centsSchema,
  /** Interest charged per in-game day, as a fraction of the outstanding balance. */
  dailyRate: z.number().min(0).max(0.2),
  takenTick: tickSchema,
  /** Reason it exists. A forced restructuring loan is not the same as a chosen one. */
  origin: z.enum(['chosen', 'restructure']),
});
export type LoanSaveState = z.infer<typeof loanSchema>;

export const insuranceSchema = z.object({
  policyId: idStringSchema,
  premiumPerDay: centsSchema,
  /** Fraction of an incident's losses reimbursed, 0..1. */
  coverage: z.number().min(0).max(1),
  startedTick: tickSchema,
  claimsMade: z.number().int().min(0).max(10_000),
});

/** A scheduled or live incident, persisted so a reload cannot re-roll it. */
export const incidentInstanceSchema = z.object({
  id: idStringSchema,
  definitionId: idStringSchema,
  siteId: idStringSchema,
  severity: z.enum(['minor', 'moderate', 'severe']),
  /** Career tick the warning was issued. */
  warnedTick: tickSchema,
  /** Career tick the effect lands. */
  impactTick: tickSchema,
  /** Career tick the effect ends. */
  endsTick: tickSchema,
  /** Exact entities affected. Ids, never coordinates. */
  targetIds: z.array(idStringSchema).max(64),
  /** Work completed toward the chosen response. */
  responseKind: idStringSchema.nullable().default(null),
  responseProgress: z.number().min(0).max(64).default(0),
  resolved: z.boolean().default(false),
  /** Multiplier finally applied. Recorded so the summary can explain itself. */
  appliedMultiplier: z.number().min(0).max(2).nullable().default(null),
});
export type IncidentInstance = z.infer<typeof incidentInstanceSchema>;

export const careerStatisticsSchema = z.object({
  lifetimeEarned: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  lifetimeSpent: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  peakBalance: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  cropsHarvested: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  cyclesCompleted: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  goodsHauled: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  goodsProcessed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  contractsCompleted: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  contractsFailed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  incidentsSurvived: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  incidentsMitigated: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  buildingsBuilt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  itemsSold: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  seasonsCompleted: z.number().int().min(0).max(100_000),
  restructures: z.number().int().min(0).max(10_000),
});
export type CareerStatistics = z.infer<typeof careerStatisticsSchema>;

/**
 * Separate RNG cursors per system.
 *
 * One shared stream means scheduling an incident would shift the disease roll
 * of every plot, so a save could be nudged by doing something unrelated. Named
 * streams keep each system's sequence its own (§33.1).
 */
export const rngStreamsSchema = z.object({
  incidents: z.number().int().min(0),
  market: z.number().int().min(0),
  disease: z.number().int().min(0),
  quality: z.number().int().min(0),
});
export type RngStreams = z.infer<typeof rngStreamsSchema>;

export const careerSaveStateSchema = z.object({
  schemaVersion: z.literal(CAREER_SCHEMA_VERSION),
  careerId: idStringSchema,
  /** Client version that created this career. Diagnostics only. */
  createdWithVersion: z.string().max(32).default('0.1.0'),
  seed: z.number().int().min(0),
  /** Monotonic career tick. The calendar is derived from it. */
  tick: tickSchema,
  /** Whether the first-session teaching sequence has been completed or skipped. */
  onboardingCompleted: z.boolean().default(true),

  stage: z.number().int().min(0).max(5),
  unlocks: z.array(idStringSchema).max(64),
  specialization: z
    .enum(SPECIALIZATION_IDS as [string, ...string[]])
    .nullable()
    .default(null),
  completedMilestoneIds: z.array(idStringSchema).max(32),

  balance: centsSchema,
  /**
   * Fractional interest and insurance premium carried between ticks.
   *
   * Both accrue at well under a cent per tick, so flooring the charge without
   * carrying the remainder meant a loan quietly cost nothing at all. Persisting
   * it is the same rule as every other accumulator: a fraction rounded away at
   * a save boundary is free money (§33.8).
   */
  financeRemainder: z.number().min(0).max(1).default(0),
  loans: z.array(loanSchema).max(8),
  insurance: insuranceSchema.nullable().default(null),

  buyers: z.record(buyerIdSchema, buyerRelationshipSchema),
  contracts: z.array(acceptedContractSchema).max(64),

  town: z.object({
    prosperity: z.number().min(0).max(1_000_000),
    completedProjectIds: z.array(idStringSchema).max(32),
    activeProject: z
      .object({
        id: idStringSchema,
        remainingTicks: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
        contributedItems: z.record(idStringSchema, z.number().int().min(0).max(100_000)),
      })
      .nullable()
      .default(null),
  }),

  sites: z.array(farmSiteSchema).min(1).max(4),
  /** Site the player is currently standing on. */
  activeSiteId: idStringSchema,

  incidents: z.array(incidentInstanceSchema).max(8),
  /** Career tick each incident definition may next be scheduled. */
  incidentCooldowns: z.record(idStringSchema, tickSchema),

  statistics: careerStatisticsSchema,
  rng: rngStreamsSchema,
});
export type CareerSaveState = z.infer<typeof careerSaveStateSchema>;

/** Frozen version-2 career shape, retained only for deterministic migration. */
export const careerSaveStateSchemaV2 = careerSaveStateSchema.extend({
  schemaVersion: z.literal(CAREER_SCHEMA_VERSION_V2),
  sites: z.array(farmSiteSchemaV2).min(1).max(4),
});
export type CareerSaveStateV2 = z.infer<typeof careerSaveStateSchemaV2>;

export const careerEnvelopeSchema = z.object({
  saveId: z.string(),
  /** Optimistic concurrency token. A write with a stale revision is rejected. */
  revision: z.number().int().min(0),
  updatedAt: z.number().int(),
  state: careerSaveStateSchema,
});
export type CareerEnvelope = z.infer<typeof careerEnvelopeSchema>;

export const putCareerRequestSchema = z.object({
  /** Revision the client believes it is updating. Must match the stored value. */
  expectedRevision: z.number().int().min(0),
  state: careerSaveStateSchema,
});
export type PutCareerRequest = z.infer<typeof putCareerRequestSchema>;
