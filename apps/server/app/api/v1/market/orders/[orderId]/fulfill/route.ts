/**
 * Fulfil a contract.
 *
 * Two protections stack here:
 *   - the idempotency key, so a retry after a dropped response replays the
 *     stored result instead of paying again
 *   - the conditional UPDATE inside markFulfilled, so two simultaneous requests
 *     cannot both claim the same order
 *
 * The payout is computed by the server from its own stored inventory and the
 * stored order. Nothing in the request body influences the amount.
 */
import { fulfilOrderRequestSchema, type TradeResult } from '@farmrise/shared';
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';
import { HttpError } from '@/http/errors';

export const dynamic = 'force-dynamic';

export const POST = createRoute({
  name: 'market.fulfil',
  auth: 'required',
  rateLimitPerMinute: 60,
  bodySchema: fulfilOrderRequestSchema,
  handler: async ({ user, body, params }) => {
    const orderId = params['orderId'];
    if (!orderId) throw HttpError.badRequest('Missing order id.');

    const services = getServices();
    const replayed = await services.repositories.idempotency.find(user!.id, body.idempotencyKey);
    if (replayed) return { data: replayed.response as TradeResult };

    const outcome = await services.market.fulfilOrder(user!.id, orderId);
    await services.repositories.idempotency.remember(
      user!.id,
      body.idempotencyKey,
      'market.fulfil',
      outcome,
    );
    return { data: outcome };
  },
});
