/**
 * Save load and write.
 *
 * The user id always comes from the verified access token. There is no route
 * anywhere that takes a user id as input, which is what makes it structurally
 * impossible to read or write someone else's save.
 */
import { putSaveRequestSchema } from '@farmrise/shared';
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';

export const dynamic = 'force-dynamic';

export const GET = createRoute({
  name: 'save.get',
  auth: 'required',
  handler: async ({ user }) => ({ data: await getServices().saves.load(user!.id) }),
});

export const PUT = createRoute({
  name: 'save.put',
  auth: 'required',
  // Autosave runs every 30 seconds, so 60/min leaves generous headroom for
  // manual saves while still bounding write amplification from a bad client.
  rateLimitPerMinute: 60,
  bodySchema: putSaveRequestSchema,
  handler: async ({ user, body }) => ({
    data: await getServices().saves.write(user!.id, body.expectedRevision, body.state),
  }),
});
