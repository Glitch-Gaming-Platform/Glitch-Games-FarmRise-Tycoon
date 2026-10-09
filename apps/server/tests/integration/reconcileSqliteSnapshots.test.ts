import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { reconcile } from '../../scripts/import-sqlite-snapshots';

const schema = readFileSync(resolve(__dirname, '../../src/db/migrations/0001_init.sql'), 'utf8');

describe('Safe reconciliation of independent SQLite online-backup snapshots', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'farmrise-reconcile-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  function snapshot(label: string, userId: string, saveRevision: number) {
    const path = resolve(dir, label + '.sqlite');
    const db = new Database(path);
    db.exec(schema);
    db.prepare(
      `INSERT INTO users (id,email,display_name,password_hash,created_at,updated_at)
      VALUES (?,?,?, 'hash',1,2)`,
    ).run(userId, userId + '@example.test', 'QA player');
    db.prepare(
      `INSERT INTO saves (id,user_id,revision,state,created_at,updated_at)
      VALUES (?,?,?,'{"level":2}',1,2)`,
    ).run('save-' + userId, userId, saveRevision);
    db.close();
    return path;
  }
  it('merges disjoint players without losing saves', () => {
    const r = reconcile(
      [snapshot('replica-a', 'player1', 0), snapshot('replica-b', 'player2', 1)],
      2,
    );
    expect(r.report).toMatchObject({
      replicas: 2,
      conflictCount: 0,
      approvedForImport: true,
      rows: { users: 2, saves: 2 },
    });
  });
  it('deduplicates byte-identical repeated accounts and saves', () => {
    const r = reconcile(
      [snapshot('replica-a', 'player1', 0), snapshot('replica-b', 'player1', 0)],
      2,
    );
    expect(r.report).toMatchObject({
      conflictCount: 0,
      approvedForImport: true,
      rows: { users: 1, saves: 1 },
      identicalRowsCollapsed: { users: 1, saves: 1 },
    });
  });
  it('blocks divergent saves instead of choosing newest and discarding old data', () => {
    const r = reconcile(
      [snapshot('replica-a', 'player1', 0), snapshot('replica-b', 'player1', 3)],
      2,
    );
    expect(r.report.approvedForImport).toBe(false);
    expect(r.report.conflictCount).toBe(1);
    expect(JSON.stringify(r.report)).not.toContain('player1');
  });
  it('blocks missing replica and duplicate backup paths', () => {
    const a = snapshot('replica-a', 'player1', 0);
    expect(() => reconcile([a], 2)).toThrow(/EVERY running replica/);
    expect(() => reconcile([a, a], 2)).toThrow(/distinct/);
  });
  it('blocks corrupt SQLite instead of importing partial saves', () => {
    const a = snapshot('replica-a', 'player1', 0);
    const b = snapshot('replica-b', 'player2', 0);
    const bytes = readFileSync(b);
    rmSync(b);
    require('node:fs').writeFileSync(b, bytes.subarray(0, 40));
    expect(() => reconcile([a, b], 2)).toThrow();
  });
});
