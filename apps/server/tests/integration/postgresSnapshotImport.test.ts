/** Postgres import smoke uses disposable localhost database, never production. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { reconcile, importIntoPostgres } from '../../scripts/import-sqlite-snapshots';

const url = process.env.FARMRISE_TEST_POSTGRES_IMPORT_URL;
const allowed = (() => {
  try {
    if (!url) return false;
    const parsed = new URL(url);
    return (
      parsed.hostname === '127.0.0.1' &&
      parsed.port === '15438' &&
      parsed.pathname === '/farmrise_import_qa'
    );
  } catch {
    return false;
  }
})();
(allowed ? describe : describe.skip)(
  'Postgres replica import, localhost-only disposable database',
  () => {
    const pool = new Pool({ connectionString: url });
    let dir: string;
    const originalEnv = { ...process.env };
    const schema = readFileSync(
      resolve(__dirname, '../../src/db/migrations/0001_init.sql'),
      'utf8',
    );
    let snapshots: string[] = [];
    beforeAll(async () => {
      dir = mkdtempSync(resolve(tmpdir(), 'farmrise-pg-import-test-'));
      await pool.query('TRUNCATE users CASCADE');
      await pool.query(
        'CREATE TABLE IF NOT EXISTS import_runs (id text PRIMARY KEY, source_hashes jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now())',
      );
      await pool.query('TRUNCATE import_runs');
      snapshots = [0, 1].map((i) => {
        const f = resolve(dir, `replica-${i}.sqlite`);
        const db = new Database(f);
        db.exec(schema);
        db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(
          `user-qa-${i}`,
          `${i}@example.test`,
          'Fixture',
          'hash',
          123,
          123,
        );
        db.prepare('INSERT INTO saves VALUES(?,?,?,?,?,?)').run(
          `save-qa-${i}`,
          `user-qa-${i}`,
          i,
          '{"level":2}',
          123,
          123,
        );
        db.close();
        return f;
      });
      process.env.DATABASE_URL = url;
      process.env.FARMRISE_DATA_IMPORT_APPROVED = 'yes';
      process.env.FARMRISE_WRITES_FROZEN = 'yes';
      process.env.FARMRISE_BACKUPS_VERIFIED = 'yes';
    });
    afterAll(async () => {
      for (const key of [
        'DATABASE_URL',
        'FARMRISE_DATA_IMPORT_APPROVED',
        'FARMRISE_WRITES_FROZEN',
        'FARMRISE_BACKUPS_VERIFIED',
      ]) {
        const old = originalEnv[key];
        if (old === undefined) delete process.env[key];
        else process.env[key] = old;
      }
      await pool.end();
      rmSync(dir, { recursive: true, force: true });
    });
    it('imports two disjoint replica accounts and saves transactionally', async () => {
      const { data, report } = reconcile(snapshots, 2);
      expect(report.approvedForImport).toBe(true);
      await importIntoPostgres(data, report.snapshotHashes);
      const [accounts, saves, runs] = await Promise.all([
        pool.query('SELECT count(*)::int AS count FROM users'),
        pool.query('SELECT count(*)::int AS count FROM saves'),
        pool.query('SELECT count(*)::int AS count FROM import_runs'),
      ]);
      expect(accounts.rows[0].count).toBe(2);
      expect(saves.rows[0].count).toBe(2);
      expect(runs.rows[0].count).toBe(1);
    });
    it('rejects any retry against an occupied target database', async () => {
      const { data, report } = reconcile(snapshots, 2);
      await expect(importIntoPostgres(data, report.snapshotHashes)).rejects.toThrow(
        'contains existing customer data',
      );
      const count = await pool.query('SELECT count(*)::int AS count FROM users');
      expect(count.rows[0].count).toBe(2);
    });
  },
);
