/**
 * Market payloads.
 *
 * Note what the client is NOT allowed to send: a price, a payout, or a new
 * balance. It sends an intent ("fulfil this order", "sell 6 wheat") and the
 * server computes the money. Any route that accepted a client-supplied payout
 * would be an open till.
 */
import { z } from 'zod';
import {
  centsSchema,
  idempotencyKeySchema,
  idStringSchema,
  orderIdSchema,
  quantitySchema,
  tickSchema,
} from './common.js';

export const marketOrderSchema = z.object({
  id: orderIdSchema,
  buyerId: idStringSchema,
  itemId: idStringSchema,
  quantity: z.number().int().min(1).max(10_000),
  unitPrice: centsSchema,
  deadlineTick: tickSchema,
  status: z.enum(['open', 'fulfilled', 'expired', 'cancelled']),
});
export type MarketOrderWire = z.infer<typeof marketOrderSchema>;

export const listOrdersResponseSchema = z.object({
  orders: z.array(marketOrderSchema).max(50),
  /** Server tick used to evaluate deadlines, so the client can align its clock. */
  serverTick: tickSchema,
});
export type ListOrdersResponse = z.infer<typeof listOrdersResponseSchema>;

export const fulfilOrderRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  /** Client's current tick, used only for diagnostics - the server trusts its own. */
  clientTick: tickSchema,
});
export type FulfilOrderRequest = z.infer<typeof fulfilOrderRequestSchema>;

export const spotSellRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  itemId: idStringSchema,
  quantity: quantitySchema,
});
export type SpotSellRequest = z.infer<typeof spotSellRequestSchema>;

export const tradeResultSchema = z.object({
  payout: centsSchema,
  balance: centsSchema,
  saveRevision: z.number().int().min(0),
});
export type TradeResult = z.infer<typeof tradeResultSchema>;
