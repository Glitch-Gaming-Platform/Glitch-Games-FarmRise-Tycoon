/** PostgreSQL connection pool for the durable, tenant-isolated server mode. */
import { Pool } from 'pg';
import { getEnv } from '../config/env';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (pool) return pool;
  const env = getEnv();
  if (env.DATABASE_DRIVER !== 'postgres' || !/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL)) {
    throw new Error('Postgres requires a postgres:// or postgresql:// DATABASE_URL.');
  }
  // TLS settings are governed by the connection URL and Azure Postgres config.
  // Never silently disable certificate verification here.
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: 'farmrise-game-server',
  });
  pool.on('error', (error) => {
    console.error('Postgres idle connection failed', error.message);
  });
  return pool;
}

export async function closePostgresPool(): Promise<void> {
  if (!pool) return;
  const old = pool;
  pool = null;
  await old.end();
}
