/**
 * Sign out. Revokes the stored session so the refresh token is genuinely dead,
 * and clears the cookie. Requires a valid access token so that a random
 * cross-site POST cannot log a player out.
 */
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';
import { buildClearedRefreshCookie } from '@/auth/cookies';

export const dynamic = 'force-dynamic';

export const POST = createRoute({
  name: 'auth.logout',
  auth: 'required',
  handler: async ({ user }) => {
    await getServices().auth.logout(user?.sessionId ?? null);
    return {
      headers: { 'set-cookie': buildClearedRefreshCookie() },
      data: { signedOut: true },
    };
  },
});
