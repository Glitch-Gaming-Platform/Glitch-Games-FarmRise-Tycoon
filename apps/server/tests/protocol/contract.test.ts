/**
 * Contract tests.
 *
 * The client validates every response against a shared zod schema. These tests
 * assert that what the server actually emits satisfies those schemas, so the
 * two halves cannot drift apart without a red test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  apiResponseSchema,
  authSessionSchema,
  listOrdersResponseSchema,
  saveEnvelopeSchema,
  tradeResultSchema,
} from '@farmrise/shared';
import { POST as register } from '@app/api/v1/auth/register/route';
import { GET as getSave } from '@app/api/v1/save/route';
import { GET as listOrders } from '@app/api/v1/market/orders/route';
import { POST as spotSell } from '@app/api/v1/market/spot-sell/route';
import { PUT as putSave } from '@app/api/v1/save/route';
import { installHarness, request, signUp, teardownHarness, type Harness } from '../routes/setup';
import { withActiveStoreItems } from '../helpers/career';

let harness: Harness;

beforeEach(() => {
  harness = installHarness();
});
afterEach(teardownHarness);

describe('response contracts', () => {
  it('register matches authSessionSchema', async () => {
    const response = await register(
      request('/api/v1/auth/register', {
        method: 'POST',
        json: {
          email: 'contract@example.com',
          displayName: 'Contract',
          password: 'a-sufficiently-long-password',
        },
      }),
    );
    const parsed = apiResponseSchema(authSessionSchema).safeParse(await response.json());
    expect(parsed.success).toBe(true);
  });

  it('save matches saveEnvelopeSchema', async () => {
    const token = (await signUp(harness)).accessToken;
    const response = await getSave(request('/api/v1/save', { token }));
    const parsed = apiResponseSchema(saveEnvelopeSchema).safeParse(await response.json());
    expect(parsed.success).toBe(true);
  });

  it('market orders match listOrdersResponseSchema', async () => {
    const token = (await signUp(harness)).accessToken;
    const response = await listOrders(request('/api/v1/market/orders', { token }));
    const parsed = apiResponseSchema(listOrdersResponseSchema).safeParse(await response.json());
    expect(parsed.success).toBe(true);
  });

  it('spot sell matches tradeResultSchema', async () => {
    const session = await signUp(harness);
    const token = session.accessToken;
    const save = await harness.services.saves.load(session.user.id);
    await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token,
        json: {
          expectedRevision: save.revision,
          state: withActiveStoreItems(save.state, { wheat: 10 }, save.state.tick + 600),
        },
      }),
    );

    const response = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: { idempotencyKey: 'contract-key-1234', itemId: 'wheat', quantity: 2 },
      }),
    );
    const parsed = apiResponseSchema(tradeResultSchema).safeParse(await response.json());
    expect(parsed.success).toBe(true);
  });

  it('errors match the failure envelope', async () => {
    const response = await getSave(request('/api/v1/save'));
    const payload = (await response.json()) as {
      ok: boolean;
      error: { code: string; requestId: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('UNAUTHENTICATED');
    expect(payload.error.requestId).toBeTruthy();
  });
}, 40_000);
