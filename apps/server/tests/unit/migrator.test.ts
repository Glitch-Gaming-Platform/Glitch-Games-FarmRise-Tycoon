/**
 * The migration runner, against a throwaway on-disk database.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { appliedMigrations, discoverMigrations, migrateDown, migrateUp } from '@/db/migrator';

let dir: string;
let migrations: string;
let raw: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'farmrise-mig-'));
  migrations = join(dir, 'migrations');
  mkdirSync(migrations);
  raw = new Database(join(dir, 'test.sqlite'));
});

afterEach(() => {
  raw.close();
  rmSync(dir, { recursive: true, force: true });
});

function write(id: string, up: string, down?: string): void {
  writeFileSync(join(migrations, `${id}.sql`), up);
  if (down) writeFileSync(join(migrations, `${id}.down.sql`), down);
}

describe('migrator', () => {
  it('discovers migrations in filename order', () => {
    write('0002_b', 'SELECT 1;');
    write('0001_a', 'SELECT 1;');
    expect(discoverMigrations(migrations).map((m) => m.id)).toEqual(['0001_a', '0002_b']);
  });

  it('applies pending migrations and records them', () => {
    write('0001_a', 'CREATE TABLE a (id TEXT);', 'DROP TABLE a;');
    expect(migrateUp(raw, migrations)).toEqual(['0001_a']);
    expect(appliedMigrations(raw).has('0001_a')).toBe(true);
  });

  it('is idempotent', () => {
    write('0001_a', 'CREATE TABLE a (id TEXT);');
    migrateUp(raw, migrations);
    expect(migrateUp(raw, migrations)).toEqual([]);
  });

  it('rolls back the most recent migration', () => {
    write('0001_a', 'CREATE TABLE a (id TEXT);', 'DROP TABLE a;');
    write('0002_b', 'CREATE TABLE b (id TEXT);', 'DROP TABLE b;');
    migrateUp(raw, migrations);
    expect(migrateDown(raw, migrations)).toBe('0002_b');
    expect(appliedMigrations(raw).has('0002_b')).toBe(false);
    expect(appliedMigrations(raw).has('0001_a')).toBe(true);
  });

  it('refuses to roll back a migration with no down script', () => {
    write('0001_a', 'CREATE TABLE a (id TEXT);');
    migrateUp(raw, migrations);
    expect(() => migrateDown(raw, migrations)).toThrow(/no \.down\.sql/);
  });

  it('detects an edited migration that has already been applied', () => {
    write('0001_a', 'CREATE TABLE a (id TEXT);');
    migrateUp(raw, migrations);
    write('0001_a', 'CREATE TABLE a (id TEXT, extra TEXT);');
    expect(() => migrateUp(raw, migrations)).toThrow(/has changed since it was applied/);
  });

  it('leaves nothing half-applied when a migration fails', () => {
    write('0001_a', 'CREATE TABLE a (id TEXT); THIS IS NOT SQL;');
    expect(() => migrateUp(raw, migrations)).toThrow();
    expect(appliedMigrations(raw).has('0001_a')).toBe(false);
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a'")
      .all();
    expect(tables).toHaveLength(0);
  });
});
