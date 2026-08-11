/**
 * Market routes: authorization, idempotency and the double-spend guard.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ListOrdersResponse, SaveEnvelope, TradeResult } from '@farmrise/shared';
import { GET as listOrders } from '@app/api/v1/market/orders/route';
import { POST as fulfill } from '@app/api/v1/market/orders/[orderId]/fulfill/route';
import { POST as spotSell } from '@app/api/v1/market/spot-sell/route';
import { GET as getSave, PUT as putSave } from '@app/api/v1/save/route';
import { installHarness, readBody, request, signUp, teardownHarness, type Harness } from './setup';
import { activeInventory, withActiveStoreItems } from '../helpers/career';

let harness: Harness;
let token: string;

beforeEach(async () => {
  harness = installHarness();
  const session = await signUp(harness);
  token = session.accessToken;

  // Give the player goods to trade with, through the real save route.
  const save = (
    await readBody<{ data: SaveEnvelope }>(await getSave(request('/api/v1/save', { token })))
  ).data;
  await putSave(
    request('/api/v1/save', {
      method: 'PUT',
      token,
      json: {
        expectedRevision: save.revision,
        state: withActiveStoreItems(save.state, { wheat: 40 }, save.state.tick + 600),
      },
    }),
  );
});
afterEach(teardownHarness);

const key = () => `idem-${Math.random().toString(36).slice(2)}-abcdefgh`;

describe('GET /market/orders', () => {
  it('rejects anonymous callers', async () => {
    expect((await listOrders(request('/api/v1/market/orders'))).status).toBe(401);
  });

  it('returns orders and the server tick', async () => {
    const response = await listOrders(request('/api/v1/market/orders', { token }));
    const payload = await readBody<{ data: ListOrdersResponse }>(response);
    expect(payload.data.orders.length).toBeGreaterThan(0);
    expect(payload.data.serverTick).toBeGreaterThan(0);
  });
});

describe('POST /market/spot-sell', () => {
  it('rejects anonymous callers', async () => {
    const response = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        json: { idempotencyKey: key(), itemId: 'wheat', quantity: 1 },
      }),
    );
    expect(response.status).toBe(401);
  });

  it('sells at the server-side price', async () => {
    const response = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: { idempotencyKey: key(), itemId: 'wheat', quantity: 5 },
      }),
    );
    expect(response.status).toBe(200);
    const payload = await readBody<{ data: TradeResult }>(response);
    expect(payload.data.payout).toBeGreaterThan(0);
  });

  it('ignores any extra fields a client tries to smuggle in', async () => {
    const honest = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: { idempotencyKey: key(), itemId: 'wheat', quantity: 1 },
      }),
    );
    const cheeky = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: {
          idempotencyKey: key(),
          itemId: 'wheat',
          quantity: 1,
          unitPrice: 100_000,
          payout: 500_000,
        },
      }),
    );
    const a = (await readBody<{ data: TradeResult }>(honest)).data;
    const b = (await readBody<{ data: TradeResult }>(cheeky)).data;
    expect(b.payout).toBe(a.payout);
  });

  it('replays the same result for a repeated idempotency key', async () => {
    const idempotencyKey = key();
    const first = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: { idempotencyKey, itemId: 'wheat', quantity: 3 },
      }),
    );
    const second = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: { idempotencyKey, itemId: 'wheat', quantity: 3 },
      }),
    );

    const a = (await readBody<{ data: TradeResult }>(first)).data;
    const b = (await readBody<{ data: TradeResult }>(second)).data;
    expect(b).toEqual(a); // paid once, reported twice

    const save = (
      await readBody<{ data: SaveEnvelope }>(await getSave(request('/api/v1/save', { token })))
    ).data;
    expect(activeInventory(save.state)['wheat']).toBe(37); // 40 - 3, not 40 - 6
  });

  it('rejects a quantity the player does not hold', async () => {
    const response = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: { idempotencyKey: key(), itemId: 'wheat', quantity: 9999 },
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a short idempotency key', async () => {
    const response = await spotSell(
      request('/api/v1/market/spot-sell', {
        method: 'POST',
        token,
        json: { idempotencyKey: 'abc', itemId: 'wheat', quantity: 1 },
      }),
    );
    expect(response.status).toBe(422);
  });
});

describe('POST /market/orders/:id/fulfill', () => {
  async function anOrderFor(itemId: string): Promise<string | null> {
    const payload = await readBody<{ data: ListOrdersResponse }>(
      await listOrders(request('/api/v1/market/orders', { token })),
    );
    return payload.data.orders.find((order) => order.itemId === itemId)?.id ?? null;
  }

  it('rejects an unknown order id', async () => {
    const response = await fulfill(
      request('/api/v1/market/orders/nope/fulfill', {
        method: 'POST',
        token,
        json: { idempotencyKey: key(), clientTick: 1 },
      }),
      { params: Promise.resolve({ orderId: 'nope' }) },
    );
    expect(response.status).toBe(404);
  });

  it('refuses to fulfil the same order twice', async () => {
    const orderId = await anOrderFor('wheat');
    if (!orderId) return; // this window generated no wheat order; nothing to assert

    // Make sure the player definitely holds enough for whatever the order asks.
    const save = (
      await readBody<{ data: SaveEnvelope }>(await getSave(request('/api/v1/save', { token })))
    ).data;
    await putSave(
      request('/api/v1/save', {
        method: 'PUT',
        token,
        json: {
          expectedRevision: save.revision,
          state: withActiveStoreItems(save.state, { wheat: 60 }, save.state.tick + 600),
        },
      }),
    );

    const params = { params: Promise.resolve({ orderId }) };
    const first = await fulfill(
      request(`/api/v1/market/orders/${orderId}/fulfill`, {
        method: 'POST',
        token,
        json: { idempotencyKey: key(), clientTick: 1 },
      }),
      params,
    );
    expect(first.status).toBe(200);

    const second = await fulfill(
      request(`/api/v1/market/orders/${orderId}/fulfill`, {
        method: 'POST',
        token,
        json: { idempotencyKey: key(), clientTick: 1 },
      }),
      params,
    );
    expect(second.status).toBeGreaterThanOrEqual(400);
  });
}, 40_000);
