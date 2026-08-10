/**
 * Open market orders for the signed-in player.
 *
 * Orders are generated server-side from a private seed. The client cannot
 * request a reroll: calling this repeatedly returns the same window's orders.
 */
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';

export const dynamic = 'force-dynamic';

export const GET = createRoute({
  name: 'market.orders',
  auth: 'required',
  handler: async ({ user }) => ({ data: await getServices().market.listOrders(user!.id) }),
});
