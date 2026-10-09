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
import { createPostgresRepositories } from './postgres/index';
import { getPostgresPool } from '../db/postgres';
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
      cached = createPostgresRepositories(getPostgresPool());
      break;
    default:
      throw new Error(`Unsupported DATABASE_DRIVER "${String(env.DATABASE_DRIVER)}".`);
  }
  return cached;
}

/** Test seam: lets a test swap in fakes without touching env. */
export function setRepositories(repositories: Repositories | null): void {
  cached = repositories;
}
