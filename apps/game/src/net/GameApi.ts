/**
 * Typed calls for the game's own routes.
 *
 * Note what this client cannot express: there is no "set my balance" and no
 * "credit me N cents". The only money-moving calls are intents - fulfil this
 * order, sell this many of this item - and the server decides the amount. That
 * asymmetry is the whole point of the networking design.
 */
import {
  Routes,
  listOrdersResponseSchema,
  saveEnvelopeSchema,
  tradeResultSchema,
  type ListOrdersResponse,
  type SaveEnvelope,
  type SaveState,
  type TradeResult,
} from '@farmrise/shared';
import { newIdempotencyKey, type HttpTransport } from './transport/HttpTransport.js';

export class GameApi {
  constructor(private readonly transport: HttpTransport) {}

  loadSave(signal?: AbortSignal): Promise<SaveEnvelope> {
    return this.transport.request(Routes.save(), { schema: saveEnvelopeSchema, signal });
  }

  /**
   * Writes the save. `expectedRevision` is the optimistic-concurrency token: if
   * another tab or device wrote in the meantime the server returns STALE_WRITE
   * and the caller must reload rather than clobber.
   */
  putSave(expectedRevision: number, state: SaveState, signal?: AbortSignal): Promise<SaveEnvelope> {
    return this.transport.request(Routes.save(), {
      method: 'PUT',
      body: { expectedRevision, state },
      schema: saveEnvelopeSchema,
      signal,
    });
  }

  listOrders(signal?: AbortSignal): Promise<ListOrdersResponse> {
    return this.transport.request(Routes.marketOrders(), {
      schema: listOrdersResponseSchema,
      signal,
    });
  }

  fulfilOrder(
    orderId: string,
    clientTick: number,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<TradeResult> {
    return this.transport.request(Routes.marketFulfill(orderId), {
      method: 'POST',
      body: { idempotencyKey, clientTick },
      schema: tradeResultSchema,
    });
  }

  spotSell(
    itemId: string,
    quantity: number,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<TradeResult> {
    return this.transport.request(Routes.marketSpotSell(), {
      method: 'POST',
      body: { idempotencyKey, itemId, quantity },
      schema: tradeResultSchema,
    });
  }
}
