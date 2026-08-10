/**
 * Liveness probe. Unauthenticated by design, and deliberately says nothing
 * about the database, version or environment - a health endpoint is the first
 * thing scanned, and it should not be a source of fingerprinting.
 */
import { PROTOCOL_VERSION } from '@farmrise/shared';
import { createRoute } from '@/http/route';

export const dynamic = 'force-dynamic';

export const GET = createRoute({
  name: 'health',
  auth: 'none',
  rateLimitPerMinute: 120,
  handler: async () => ({ data: { status: 'ok', protocol: PROTOCOL_VERSION } }),
});
