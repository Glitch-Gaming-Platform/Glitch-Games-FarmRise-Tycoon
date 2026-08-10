/**
 * Primitive wire schemas shared by every route.
 *
 * Every one of these has an explicit upper bound. Unbounded strings and
 * unbounded arrays are how a validation layer becomes a denial-of-service
 * vector, so "no max" is treated as a review blocker.
 */
import { z } from 'zod';
import {
  asOrderId,
  asPlotId,
  cents,
  type Cents,
  type OrderId,
  type PlotId,
} from '../domain/ids.js';

export const idStringSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_:-]+$/, {
    message: 'Ids may only contain letters, numbers, underscore, colon and hyphen.',
  });

export const plotIdSchema = idStringSchema.transform((value): PlotId => asPlotId(value));
export const orderIdSchema = idStringSchema.transform((value): OrderId => asOrderId(value));

/** Money on the wire is always an integer count of cents. */
export const centsSchema = z
  .number()
  .int({ message: 'Money must be an integer number of cents.' })
  .min(0)
  .max(1_000_000_000)
  .transform((value): Cents => cents(value));

export const tickSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const quantitySchema = z.number().int().min(1).max(100_000);

/**
 * Idempotency key. Any request that moves money carries one, so a retry after a
 * dropped response cannot pay the player twice.
 */
export const idempotencyKeySchema = z.string().min(8).max(128);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(256).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;
