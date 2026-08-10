/**
 * The current user. Reads the id from the verified token, never from a query
 * parameter - "GET /me?id=..." is how horizontal privilege escalation happens.
 */
import { createRoute } from '@/http/route';
import { getServices } from '@/services/container';
import { toPublicUser } from '@/services/authService';
import { HttpError } from '@/http/errors';

export const dynamic = 'force-dynamic';

export const GET = createRoute({
  name: 'auth.me',
  auth: 'required',
  handler: async ({ user }) => {
    const record = await getServices().repositories.users.findById(user!.id);
    if (!record) throw HttpError.unauthenticated();
    return { data: toPublicUser(record) };
  },
});
