/** Real PostgreSQL conformance tests, only against explicitly named local QA database. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { SaveState } from '@farmrise/shared';
import { createPostgresRepositories } from '../../src/repositories/postgres/index';

const url = process.env.FARMRISE_TEST_POSTGRES_URL;
const safe = (() => {
  if (!url) return false;
  try {
    const p = new URL(url);
    return p.hostname === '127.0.0.1' && p.pathname === '/farmrise_qa' && p.port === '15438';
  } catch {
    return false;
  }
})();
const suite = safe ? describe : describe.skip;

suite('Postgres repositories, disposable local database only', () => {
  const pool = new Pool({ connectionString: url, max: 3 });
  const repo = createPostgresRepositories(pool);
  const state = { crops: [], inventory: {} } as unknown as SaveState;
  const userId = 'usr-pgtest-1';

  beforeAll(async () => {
    await pool.query('TRUNCATE TABLE users CASCADE');
  });
  afterAll(async () => {
    await pool.end();
  });

  it('preserves unique email and cross-user access', async () => {
    const u = {
      id: userId,
      email: 'pg@example.test',
      displayName: 'Test',
      passwordHash: 'test-only',
    };
    expect((await repo.users.create(u))?.id).toBe(userId);
    expect(await repo.users.create({ ...u, id: 'another-id' })).toBeNull();
    expect((await repo.users.findByEmail(u.email))?.id).toBe(userId);
    expect(await repo.users.findById('not-a-user')).toBeNull();
  });

  it('uses atomic save revisions across concurrent requests and never overwrites', async () => {
    const [a, b] = await Promise.all([
      repo.saves.createIfMissing(userId, state),
      repo.saves.createIfMissing(userId, state),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.revision).toBe(0);
    const results = await Promise.all([
      repo.saves.updateIfRevisionMatches(userId, 0, state),
      repo.saves.updateIfRevisionMatches(userId, 0, state),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repo.saves.findByUserId(userId))?.revision).toBe(1);
  });

  it('rotates refresh sessions once and supports full revocation', async () => {
    const s = await repo.sessions.create({
      id: 'ses-qa',
      userId,
      expiresAt: Date.now() + 600_000,
      userAgent: 'qa',
    });
    expect(s.generation).toBe(0);
    const [a, b] = await Promise.all([
      repo.sessions.rotate(s.id, 0),
      repo.sessions.rotate(s.id, 0),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await repo.sessions.revokeAllForUser(userId);
    expect((await repo.sessions.findById(s.id))?.revokedAt).toBeTypeOf('number');
  });

  it('guarantees idempotency and one-time market settlement', async () => {
    const [a, b] = await Promise.all([
      repo.idempotency.remember(userId, 'idem-1', 'test', { ok: true }),
      repo.idempotency.remember(userId, 'idem-1', 'test', { ok: false }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((await repo.idempotency.find(userId, 'idem-1'))?.route).toBe('test');
    const now = Date.now();
    await repo.market.insertMany([
      {
        id: 'ord-1',
        userId,
        buyerId: 'buyer-qa',
        itemId: 'corn',
        quantity: 2,
        unitPrice: 15,
        deadlineTick: 100,
        status: 'open',
        createdAt: now,
        fulfilledAt: null,
      },
    ]);
    expect(await repo.market.listOpenForUser(userId)).toHaveLength(1);
    const [one, two] = await Promise.all([
      repo.market.markFulfilled(userId, 'ord-1', now),
      repo.market.markFulfilled(userId, 'ord-1', now),
    ]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(await repo.market.listOpenForUser(userId)).toHaveLength(0);
  });

  it('stores ledger cents and JSON payload losslessly', async () => {
    const e = await repo.ledger.append({
      userId,
      kind: 'sale',
      amount: 250,
      balanceAfter: 12345,
      metadata: { item: 'corn' },
    });
    const entries = await repo.ledger.listRecent(userId, 10);
    expect(entries.find((entry) => entry.id === e.id)).toMatchObject({
      amount: 250,
      balanceAfter: 12345,
      metadata: { item: 'corn' },
    });
  });
});
