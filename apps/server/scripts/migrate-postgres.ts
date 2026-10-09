/** Explicit operator migration. Never auto-imports customer SQLite data. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const file = resolve(__dirname, '../src/db/postgres-migrations/0001_init.sql');
const sql = readFileSync(file, 'utf8');
const id = '0001_init';
const checksum = createHash('sha256').update(sql).digest('hex');
const url = process.env.DATABASE_URL ?? '';
if (!/^postgres(?:ql)?:\/\//i.test(url)) {
  throw new Error('DATABASE_URL must be a private PostgreSQL connection string.');
}
if (process.env.FARMRISE_ALLOW_POSTGRES_MIGRATION !== 'yes') {
  throw new Error('Migration requires explicit FARMRISE_ALLOW_POSTGRES_MIGRATION=yes.');
}
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10_000, max: 1 });
  try {
    const client = await pool.connect();
    try {
      // Tenant migration must not overlap with another schema migrator.
      await client.query('SELECT pg_advisory_lock(169947771)');
      await client.query(`CREATE TABLE IF NOT EXISTS migration_history (
      id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      const prior = await client.query<{ checksum: string }>(
        'SELECT checksum FROM migration_history WHERE id = $1',
        [id],
      );
      if (prior.rows.length > 0 && prior.rows[0]?.checksum !== checksum) {
        throw new Error(
          'Applied PostgreSQL migration checksum changed. Stop and inspect schema drift.',
        );
      }
      if (!prior.rows.length) {
        await client.query(sql);
        await client.query('INSERT INTO migration_history(id, checksum) VALUES($1,$2)', [
          id,
          checksum,
        ]);
      }
      console.log('FARMRISE_POSTGRES_SCHEMA_VERIFIED', id);
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock(169947771)');
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Farmrise PostgreSQL schema migration failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  process.exitCode = 1;
});
