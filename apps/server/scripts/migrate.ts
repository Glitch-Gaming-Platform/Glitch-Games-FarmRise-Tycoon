/**
 * Migration CLI.
 *
 *   npm run db:migrate    -> apply all pending migrations
 *   npm run db:rollback   -> roll back the most recent one
 *
 * Rollback exists so that a bad deploy is recoverable without hand-written SQL
 * at 2am. It only ever undoes one migration per invocation, deliberately: a
 * loop that unwinds the whole schema is a foot-gun, not a feature.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSqliteConnection } from '../src/db/client';
import { migrateDown, migrateUp } from '../src/db/migrator';
import { getEnv } from '../src/config/env';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'src', 'db', 'migrations');

const direction = process.argv[2] ?? 'up';
const { raw } = createSqliteConnection(getEnv().DATABASE_URL);

try {
  if (direction === 'up') {
    const applied = migrateUp(raw, migrationsDir);
    console.log(
      applied.length === 0 ? 'Database is up to date.' : `Applied: ${applied.join(', ')}`,
    );
  } else if (direction === 'down') {
    const reverted = migrateDown(raw, migrationsDir);
    console.log(reverted ? `Rolled back: ${reverted}` : 'Nothing to roll back.');
  } else {
    console.error(`Unknown direction "${direction}". Use "up" or "down".`);
    process.exitCode = 1;
  }
} finally {
  raw.close();
}
