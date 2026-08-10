/**
 * Save routes: ownership, concurrency and validation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode, type SaveEnvelope } from '@farmrise/shared';
import { GET as getSave, PUT as putSave } from '@app/api/v1/save/route';
import { installHarness, readBody, request, signUp, teardownHarness, type Harness } from './setup';

let harness: Harness;
let token: string;

beforeEach(async () => {
  harness = installHarness();
  token = (await signUp(harness)).accessToken;
});
afterEach(teardownHarness);

async function loadSave(): Promise<SaveEnvelope> {
  const response = await getSave(request('/api/v1/save', { token }));
  return (await readBody<{ data: SaveEnvelope }>(response)).data;
}

describe('GET /save', () => {
  it('rejects anonymous callers', async () => {
    expect((await getSave(request('/api/v1/save'))).status).toBe(401);
  });

  it('creates a starting save on first load', async () => {
    const save = await loadSave();
    expect(save.revision).toBe(0);
    expect(save.state.balance).toBeGreaterThan(0);
  });

  it('is not cacheable', async () => {
    const response = await getSave(request('/api/v1/save', { token }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns each player their own save', async () => {
    const mine = await loadSave();
    const other = await signUp(harness, 'other@example.com');
    const theirs = await getSave(request('/api/v1/save', { token: other.accessToken }));
    const theirSave = (await readBody<{ data: SaveEnvelope }>(theirs)).data;
    expect(theirSave.saveId).not.toBe(mine.saveId);
  });
});

describe('PUT /save', () => {
  it('accepts a plausible write and bumps the revision', async () => {
    const save = await loadSave();
    const response = await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token,
        json: {
          expectedRevision: save.revision,
          state: { ...save.state, tick: save.state.tick + 600 },
        },
      }),
    );
    expect(response.status).toBe(200);
    const updated = (await readBody<{ data: SaveEnvelope }>(response)).data;
    expect(updated.revision).toBe(save.revision + 1);
  });

  it('rejects a stale revision instead of clobbering', async () => {
    const save = await loadSave();
    await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token,
        json: { expectedRevision: save.revision, state: save.state },
      }),
    );

    const second = await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token,
        json: { expectedRevision: save.revision, state: save.state },
      }),
    );
    expect(second.status).toBe(409);
    const payload = await readBody<{ error: { code: string } }>(second);
    expect(payload.error.code).toBe(ErrorCode.STALE_WRITE);
  });

  it('rejects an impossible balance', async () => {
    const save = await loadSave();
    const response = await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token,
        json: {
          expectedRevision: save.revision,
          state: { ...save.state, tick: save.state.tick + 10, balance: 999_999_999 },
        },
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a malformed save before it reaches the rules', async () => {
    const save = await loadSave();
    const response = await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token,
        json: { expectedRevision: save.revision, state: { ...save.state, balance: 'lots' } },
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a write from another player for the same revision', async () => {
    // There is no way to address someone else's save: the id comes from the
    // token. This asserts the absence of that capability.
    const other = await signUp(harness, 'other@example.com');
    const mine = await loadSave();
    const response = await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token: other.accessToken,
        json: { expectedRevision: mine.revision, state: mine.state },
      }),
    );
    // Succeeds against THEIR OWN save, and leaves mine untouched.
    expect(response.status).toBe(200);
    const stillMine = await loadSave();
    expect(stillMine.revision).toBe(mine.revision);
  });
}, 40_000);
