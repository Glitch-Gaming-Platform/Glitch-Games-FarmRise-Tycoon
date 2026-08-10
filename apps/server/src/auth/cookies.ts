/**
 * Refresh-token cookie handling.
 *
 * The flags are the security control, not a formality:
 *   httpOnly  - JavaScript cannot read it, so an XSS cannot steal the session
 *   secure    - never sent over plain HTTP (relaxed in development only)
 *   sameSite  - 'lax' blocks the cookie on cross-site POSTs, which is the CSRF
 *               defence for the refresh endpoint
 *   path      - scoped to the auth routes so it is not attached to every request
 */
import { getEnv } from '../config/env';

export const REFRESH_COOKIE = 'farmrise_refresh';
const COOKIE_PATH = '/api/v1/auth';

export function buildRefreshCookie(token: string): string {
  const env = getEnv();
  const parts = [
    `${REFRESH_COOKIE}=${token}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${env.AUTH_REFRESH_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (env.isProduction) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearedRefreshCookie(): string {
  const env = getEnv();
  const parts = [
    `${REFRESH_COOKIE}=`,
    `Path=${COOKIE_PATH}`,
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (env.isProduction) parts.push('Secure');
  return parts.join('; ');
}

export function readRefreshCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return rest.join('=') || null;
  }
  return null;
}
