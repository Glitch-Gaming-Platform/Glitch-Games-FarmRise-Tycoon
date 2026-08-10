/**
 * Sign in. The tight rate limit is the primary defence against credential
 * stuffing; the constant-time behaviour in AuthService is the defence against
 * account enumeration.
 */
import { loginRequestSchema } from '@farmrise/shared';
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';
import { buildRefreshCookie } from '@/auth/cookies';

export const dynamic = 'force-dynamic';

export const POST = createRoute({
  name: 'auth.login',
  auth: 'none',
  rateLimitPerMinute: 10,
  bodySchema: loginRequestSchema,
  handler: async ({ body, context }) => {
    const session = await getServices().auth.login(body, context.userAgent);
    return {
      headers: { 'set-cookie': buildRefreshCookie(session.refreshToken) },
      data: {
        user: session.user,
        accessToken: session.accessToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      },
    };
  },
});
