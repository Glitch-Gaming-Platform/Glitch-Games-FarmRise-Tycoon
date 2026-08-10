/**
 * A small forward/backward migration runner.
 *
 * Written by hand rather than using drizzle-kit's generator because the
 * requirement here is explicit, reviewable SQL with a matching rollback for
 * every change. The rules:
 *   - files are named NNNN_name.sql, applied in filename order
 *   - each may have a matching NNNN_name.down.sql; a migration without one is
 *     allowed but reported, so "this is irreversible" is a conscious decision
 *   - each migration runs inside a transaction, so a failure leaves nothing
 *     half-applied
 *   - applied migrations are recorded with a checksum, so editing a migration
 *     that has already run is detected instead of silently diverging
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

export interface MigrationFile {
  readonly id: string;
  readonly upPath: string;
  readonly downPath: string | null;
}

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  applied_at  INTEGER NOT NULL
);`;

export function discoverMigrations(directory: string): MigrationFile[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql') && !name.endsWith('.down.sql'))
    .sort()
    .map((name) => {
      const id = name.replace(/\.sql$/, '');
      const downPath = join(directory, `${id}.down.sql`);
      return {
        id,
        upPath: join(directory, name),
        downPath: existsSync(downPath) ? downPath : null,
      };
    });
}

export function appliedMigrations(raw: Database.Database): Map<string, string> {
  raw.exec(TABLE_SQL);
  const rows = raw.prepare('SELECT id, checksum FROM schema_migrations').all() as {
    id: string;
    checksum: string;
  }[];
  return new Map(rows.map((row) => [row.id, row.checksum]));
}

export function migrateUp(raw: Database.Database, directory: string): string[] {
  const applied = appliedMigrations(raw);
  const pending: string[] = [];

  for (const migration of discoverMigrations(directory)) {
    const sql = readFileSync(migration.upPath, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = applied.get(migration.id);

    if (existing) {
      if (existing !== checksum) {
        throw new Error(
          `Migration "${migration.id}" has changed since it was applied. Never edit an applied migration - add a new one instead.`,
        );
      }
      continue;
    }

    const run = raw.transaction(() => {
      raw.exec(sql);
      raw
        .prepare('INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)')
        .run(migration.id, checksum, Date.now());
    });
    run();
    pending.push(migration.id);
  }

  return pending;
}

/** Rolls back the most recently applied migration. */
export function migrateDown(raw: Database.Database, directory: string): string | null {
  const applied = appliedMigrations(raw);
  const migrations = discoverMigrations(directory).filter((migration) => applied.has(migration.id));
  const last = migrations.at(-1);
  if (!last) return null;
  if (!last.downPath) {
    throw new Error(
      `Migration "${last.id}" has no .down.sql and cannot be rolled back automatically.`,
    );
  }

  const sql = readFileSync(last.downPath, 'utf8');
  const run = raw.transaction(() => {
    raw.exec(sql);
    raw.prepare('DELETE FROM schema_migrations WHERE id = ?').run(last.id);
  });
  run();
  return last.id;
}
