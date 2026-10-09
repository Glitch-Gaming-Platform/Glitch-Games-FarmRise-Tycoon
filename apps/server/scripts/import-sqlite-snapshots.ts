/**
 * Farmrise offline replica reconciliation and lossless PostgreSQL import.
 * Only accepts coherent SQLite online-backup snapshots, never a live WAL file.
 * Dry-run by default. Do not discard ANY source replica on conflict.
 * The tool never prints player IDs, emails, save JSON, tokens or source paths.
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';

const TABLES = [
  'users',
  'sessions',
  'saves',
  'market_orders',
  'idempotency_keys',
  'ledger_entries',
] as const;
type TableName = (typeof TABLES)[number];
type Entry = Record<string, unknown>;
const JSON_COLS: Partial<Record<TableName, string[]>> = {
  saves: ['state'],
  idempotency_keys: ['response'],
  ledger_entries: ['metadata'],
};
const KEY_COLS: Record<TableName, string[]> = {
  users: ['id'],
  sessions: ['id'],
  saves: ['id'],
  market_orders: ['id'],
  idempotency_keys: ['id'],
  ledger_entries: ['id'],
};
const COLUMNS: Record<TableName, string[]> = {
  users: ['id', 'email', 'display_name', 'password_hash', 'created_at', 'updated_at'],
  sessions: ['id', 'user_id', 'generation', 'expires_at', 'revoked_at', 'user_agent', 'created_at'],
  saves: ['id', 'user_id', 'revision', 'state', 'created_at', 'updated_at'],
  market_orders: [
    'id',
    'user_id',
    'buyer_id',
    'item_id',
    'quantity',
    'unit_price',
    'deadline_tick',
    'status',
    'created_at',
    'fulfilled_at',
  ],
  idempotency_keys: ['id', 'user_id', 'key', 'route', 'response', 'created_at'],
  ledger_entries: ['id', 'user_id', 'kind', 'amount', 'balance_after', 'metadata', 'created_at'],
};
function canonical(data: Entry): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))),
  );
}
function digest(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
function hiddenKey(id: string): string {
  return digest(id).slice(0, 16);
}

export function reconcile(paths: string[], expectedReplicas: number) {
  if (expectedReplicas < 1 || paths.length !== expectedReplicas) {
    throw new Error('Require one independent offline backup for EVERY running replica.');
  }
  const distinctPaths = new Set(paths.map((p) => realpathSync(p)));
  if (distinctPaths.size !== expectedReplicas) throw new Error('Snapshot paths must be distinct.');
  const data = Object.fromEntries(TABLES.map((t) => [t, new Map<string, Entry>()])) as Record<
    TableName,
    Map<string, Entry>
  >;
  const contentHashes: string[] = [];
  const duplicates: Record<string, number> = {};
  const conflicts: { table: string; keyHash: string }[] = [];
  for (const path of paths) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || !/\.(sqlite|db)$/i.test(path)) {
      throw new Error(
        'Require a regular .sqlite or .db backup file, not a live DB path or symlink.',
      );
    }
    contentHashes.push(digest(readFileSync(path)));
    const sqlite = new Database(path, { readonly: true, fileMustExist: true });
    try {
      sqlite.pragma('query_only = ON');
      if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new Error('A source snapshot failed SQLite integrity_check.');
      }
      if ((sqlite.pragma('foreign_key_check') as unknown[]).length) {
        throw new Error('A source snapshot has broken foreign keys.');
      }
      for (const table of TABLES) {
        const info = sqlite.pragma(`table_info(${table})`) as { name: string }[];
        if (!info.length || COLUMNS[table].some((column) => !info.some((c) => c.name === column))) {
          throw new Error(`Schema mismatch in ${table}.`);
        }
        const rows = sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Entry[];
        for (const row of rows) {
          const key = String(row[KEY_COLS[table][0]!]);
          const old = data[table].get(key);
          if (old) {
            if (canonical(old) === canonical(row)) duplicates[table] = (duplicates[table] || 0) + 1;
            else conflicts.push({ table, keyHash: hiddenKey(key) });
          } else {
            for (const col of JSON_COLS[table] || []) {
              if (row[col] != null) {
                if (typeof row[col] !== 'string')
                  throw new Error(`Invalid JSON source type in ${table}.`);
                try {
                  JSON.parse(row[col] as string);
                } catch {
                  throw new Error(`Invalid JSON in ${table}.`);
                }
              }
            }
            data[table].set(key, row);
          }
        }
      }
    } finally {
      sqlite.close();
    }
  }
  // Detect cross-replica unique-key collisions even where PKs differ.
  function unique(table: TableName, columns: string[]) {
    const seen = new Map<string, string>();
    for (const [key, row] of data[table]) {
      const indexKey = JSON.stringify(columns.map((c) => row[c]));
      if (seen.has(indexKey) && seen.get(indexKey) !== key) {
        conflicts.push({ table, keyHash: hiddenKey(indexKey) });
      } else seen.set(indexKey, key);
    }
  }
  unique('users', ['email']);
  unique('saves', ['user_id']);
  unique('idempotency_keys', ['user_id', 'key']);
  // A game save is only valid when its parent account is in the final import.
  for (const table of TABLES.filter((n) => n !== 'users')) {
    for (const row of data[table].values()) {
      if (!data.users.has(String(row.user_id))) {
        conflicts.push({ table, keyHash: hiddenKey(String(row.id)) });
      }
    }
  }
  return {
    data,
    report: {
      replicas: expectedReplicas,
      snapshotHashes: contentHashes,
      rows: Object.fromEntries(TABLES.map((t) => [t, data[t].size])),
      identicalRowsCollapsed: duplicates,
      conflicts: conflicts.slice(0, 100),
      conflictCount: conflicts.length,
      approvedForImport: conflicts.length === 0,
    },
  };
}

export async function importIntoPostgres(
  data: Record<TableName, Map<string, Entry>>,
  snapshotHashes: string[],
) {
  const url = process.env.DATABASE_URL || '';
  if (!/^postgres(?:ql)?:\/\//i.test(url)) throw new Error('DATABASE_URL must be PostgreSQL');
  if (
    process.env.FARMRISE_DATA_IMPORT_APPROVED !== 'yes' ||
    process.env.FARMRISE_WRITES_FROZEN !== 'yes' ||
    process.env.FARMRISE_BACKUPS_VERIFIED !== 'yes'
  ) {
    throw new Error('Missing explicit import, source write-freeze or backup approval.');
  }
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(169947773)');
      const migrated = await db.query('SELECT id FROM migration_history WHERE id=$1', [
        '0001_init',
      ]);
      if (!migrated.rows.length)
        throw new Error('Postgres schema must be explicitly migrated first.');
      // Refuse importing on a database that already contains data, never overwrite or merge silently.
      for (const table of TABLES) {
        const result = await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
        if (result.rows.length)
          throw new Error('Target PostgreSQL database contains existing customer data.');
      }
      for (const table of TABLES) {
        const rows = [...data[table].values()];
        const cols = COLUMNS[table];
        for (let start = 0; start < rows.length; start += 200) {
          const batch = rows.slice(start, start + 200);
          const params: unknown[] = [];
          const placeholders = batch.map((row) => {
            const begin = params.length;
            for (const col of cols) params.push(row[col] ?? null);
            return (
              '(' +
              cols
                .map(
                  (c, i) =>
                    '$' + (begin + i + 1) + (JSON_COLS[table]?.includes(c) ? '::jsonb' : ''),
                )
                .join(',') +
              ')'
            );
          });
          await db.query(
            `INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders.join(',')}`,
            params,
          );
        }
      }
      await db.query(`CREATE TABLE IF NOT EXISTS import_runs (
        id text PRIMARY KEY, source_hashes jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now())`);
      await db.query('INSERT INTO import_runs(id,source_hashes) VALUES($1,$2::jsonb)', [
        digest(snapshotHashes.join('|')),
        JSON.stringify(snapshotHashes),
      ]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const expected = Number(
    args.find((s) => s.startsWith('--expected-replicas='))?.split('=')[1] || 0,
  );
  const paths = args.filter((s) => !s.startsWith('--'));
  const { data, report } = reconcile(paths, expected);
  // Redacted, no user IDs, credentials, emails or save JSON.
  console.log('FARMRISE_SNAPSHOT_RECONCILIATION', JSON.stringify(report));
  if (!report.approvedForImport)
    throw new Error('Replica data diverged: DO NOT import, cut traffic or retire a replica.');
  if (apply) {
    await importIntoPostgres(data, report.snapshotHashes);
    console.log('FARMRISE_SQLITE_TO_POSTGRES_IMPORT_VERIFIED');
  }
}
if (require.main === module) {
  main().catch((e: unknown) => {
    console.error('FARMRISE_IMPORT_BLOCKED', e instanceof Error ? e.message : 'Unknown error');
    process.exitCode = 1;
  });
}
