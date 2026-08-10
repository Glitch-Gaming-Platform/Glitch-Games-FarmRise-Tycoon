/**
 * Refresh.
 *
 * Reads the refresh token from the httpOnly cookie rather than the body, so a
 * script on the page cannot initiate a refresh with a token it stole. The route
 * is `auth: 'none'` because the whole point is that the access token has
 * expired; the cookie is the credential.
 */
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';
import { buildRefreshCookie, readRefreshCookie } from '@/auth/cookies';

export const dynamic = 'force-dynamic';

export const POST = createRoute({
  name: 'auth.refresh',
  auth: 'none',
  rateLimitPerMinute: 30,
  handler: async ({ request, context }) => {
    const session = await getServices().auth.refresh(readRefreshCookie(request), context.userAgent);
    return {
      // Rotation: the old refresh token is now dead and the client gets a new one.
      headers: { 'set-cookie': buildRefreshCookie(session.refreshToken) },
      data: {
        user: session.user,
        accessToken: session.accessToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      },
    };
  },
});
