/**
 * Immediate sale at the spot price.
 *
 * The client sends only "which item, how many". The price comes from the shared
 * item registry on the server side, so a modified client cannot sell wheat for
 * the price of pumpkins.
 */
import { spotSellRequestSchema, type TradeResult } from '@farmrise/shared';
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';

export const dynamic = 'force-dynamic';

export const POST = createRoute({
  name: 'market.spotSell',
  auth: 'required',
  rateLimitPerMinute: 60,
  bodySchema: spotSellRequestSchema,
  handler: async ({ user, body }) => {
    const services = getServices();
    const replayed = await services.repositories.idempotency.find(user!.id, body.idempotencyKey);
    if (replayed) return { data: replayed.response as TradeResult };

    const outcome = await services.market.spotSell(user!.id, body.itemId, body.quantity);
    await services.repositories.idempotency.remember(
      user!.id,
      body.idempotencyKey,
      'market.spotSell',
      outcome,
    );
    return { data: outcome };
  },
});
