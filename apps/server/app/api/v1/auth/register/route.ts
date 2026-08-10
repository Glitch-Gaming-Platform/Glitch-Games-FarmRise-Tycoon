/**
 * Account creation.
 *
 * Rate limited harder than a normal route: automated sign-up is how a service
 * acquires a spam problem, and legitimate humans register roughly once.
 */
import { registerRequestSchema } from '@farmrise/shared';
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';
import { buildRefreshCookie } from '@/auth/cookies';

export const dynamic = 'force-dynamic';

export const POST = createRoute({
  name: 'auth.register',
  auth: 'none',
  rateLimitPerMinute: 5,
  bodySchema: registerRequestSchema,
  handler: async ({ body, context }) => {
    const session = await getServices().auth.register(body, context.userAgent);
    return {
      status: 201,
      // The refresh token goes out as an httpOnly cookie and is never included
      // in the JSON body, so client-side script can never read it.
      headers: { 'set-cookie': buildRefreshCookie(session.refreshToken) },
      data: {
        user: session.user,
        accessToken: session.accessToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      },
    };
  },
});
