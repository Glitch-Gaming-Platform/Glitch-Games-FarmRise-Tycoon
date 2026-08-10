/**
 * Shared harness for route tests.
 *
 * Route handlers are plain functions of Request -> Response, so they can be
 * exercised directly with no HTTP server and no Next runtime. That keeps these
 * tests fast enough to run on every save while still covering the real
 * middleware chain: protocol check, rate limit, auth, validation.
 */
import { PROTOCOL_HEADER, PROTOCOL_VERSION } from '@farmrise/shared';
import { createMemoryRepositories } from '@/repositories/memory/index';
import { createServices, setServices, type Services } from '@/services/container';
import { setRepositories } from '@/repositories/container';
import { resetEnvCache } from '@/config/env';
import { rateLimiter } from '@/http/rateLimit';

export interface Harness {
  readonly services: Services;
  readonly repositories: ReturnType<typeof createMemoryRepositories>;
}

export function installHarness(): Harness {
  resetEnvCache();
  rateLimiter.reset();
  const repositories = createMemoryRepositories();
  const services = createServices(repositories);
  setRepositories(repositories);
  setServices(services);
  return { services, repositories };
}

export function teardownHarness(): void {
  setRepositories(null);
  setServices(null);
  rateLimiter.reset();
}

export function request(
  path: string,
  init: RequestInit & { token?: string; json?: unknown } = {},
): Request {
  const headers = new Headers(init.headers);
  headers.set(PROTOCOL_HEADER, PROTOCOL_VERSION);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.json !== undefined) headers.set('content-type', 'application/json');

  return new Request(`http://localhost${path}`, {
    ...init,
    headers,
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
}

export async function readBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function signUp(harness: Harness, email = 'player@example.com') {
  const session = await harness.services.auth.register(
    { email, displayName: 'Player', password: 'a-sufficiently-long-password' },
    'test',
  );
  return session;
}
