/**
 * SQLite connection.
 *
 * The PRAGMAs are not optional dressing:
 *   foreign_keys=ON  - SQLite ignores foreign keys unless you ask, so every
 *                      ON DELETE CASCADE in the schema is inert without this
 *   journal_mode=WAL - readers stop blocking the writer, which is the
 *                      difference between "fine" and "locked" under concurrency
 *   busy_timeout     - wait for a lock instead of failing instantly
 *   synchronous=NORMAL - safe with WAL, and much faster than FULL
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { getEnv } from '../config/env';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

let cached: { db: Db; raw: Database.Database } | null = null;

export function resolveSqlitePath(url: string): string {
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

export function createSqliteConnection(url: string): { db: Db; raw: Database.Database } {
  const path = resolveSqlitePath(url);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  raw.pragma('synchronous = NORMAL');

  const db = drizzle(raw, { schema }) as Db;
  return { db, raw };
}

/** Process-wide connection. Next.js reuses the module across requests. */
export function getDb(): Db {
  cached ??= createSqliteConnection(getEnv().DATABASE_URL);
  return cached.db;
}

export function getRawDb(): Database.Database {
  cached ??= createSqliteConnection(getEnv().DATABASE_URL);
  return cached.raw;
}

export function closeDb(): void {
  cached?.raw.close();
  cached = null;
}
