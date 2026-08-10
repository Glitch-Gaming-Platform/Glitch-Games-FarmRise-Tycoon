/**
 * Chooses a repository implementation from configuration.
 *
 * This is the only place that knows which database is in use. Adding Postgres
 * means adding a folder under repositories/ and one case here; no service or
 * route changes.
 */
import { getEnv } from '../config/env';
import { getDb } from '../db/client';
import { createDrizzleRepositories } from './drizzle/index';
import { createMemoryRepositories } from './memory/index';
import type { Repositories } from './ports';

let cached: Repositories | null = null;

export function getRepositories(): Repositories {
  if (cached) return cached;
  const env = getEnv();

  switch (env.DATABASE_DRIVER) {
    case 'sqlite':
      cached = createDrizzleRepositories(getDb());
      break;
    case 'memory':
      cached = createMemoryRepositories();
      break;
    case 'postgres':
      throw new Error(
        'The Postgres adapter is not implemented yet. Implement repositories/postgres/ against the same ports and add a case here. See docs/BACKEND.md.',
      );
    default:
      throw new Error(`Unsupported DATABASE_DRIVER "${String(env.DATABASE_DRIVER)}".`);
  }
  return cached;
}

/** Test seam: lets a test swap in fakes without touching env. */
export function setRepositories(repositories: Repositories | null): void {
  cached = repositories;
}
