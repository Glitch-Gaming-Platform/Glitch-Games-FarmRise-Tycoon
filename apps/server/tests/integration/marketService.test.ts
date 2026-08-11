/**
 * The economy, end to end through the services.
 *
 * These are the tests that prove the server, not the client, decides how much
 * money changes hands.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { qualityPriceMultiplier, spotPriceFor } from '@farmrise/shared';
import { createMemoryRepositories } from '@/repositories/memory/index';
import { createServices, type Services } from '@/services/container';
import { resetEnvCache } from '@/config/env';
import { serverTick } from '@/domain/serverClock';
import { newId } from '@/db/ids';
import { activeInventory, withActiveStoreItems } from '../helpers/career';

let repositories: ReturnType<typeof createMemoryRepositories>;
let services: Services;
let userId: string;

beforeEach(async () => {
  resetEnvCache();
  repositories = createMemoryRepositories();
  services = createServices(repositories);
  const session = await services.auth.register(
    { email: 'trader@example.com', displayName: 'Trader', password: 'a-long-enough-password' },
    'test',
  );
  userId = session.user.id;
  const save = await services.saves.load(userId);
  // Advance the tick alongside the inventory: the plausibility check correctly
  // refuses 60 items appearing in zero elapsed ticks.
  await services.saves.write(
    userId,
    save.revision,
    withActiveStoreItems(save.state, { wheat: 40, corn: 20 }, save.state.tick + 600),
  );
});

async function openOrder(
  overrides: Partial<{
    itemId: string;
    quantity: number;
    unitPrice: number;
    deadlineTick: number;
  }> = {},
) {
  const id = newId('ord');
  await repositories.market.insertMany([
    {
      id,
      userId,
      buyerId: 'millbrook_grocers',
      itemId: overrides.itemId ?? 'wheat',
      quantity: overrides.quantity ?? 10,
      unitPrice: overrides.unitPrice ?? 90,
      deadlineTick: overrides.deadlineTick ?? serverTick() + 100_000,
      status: 'open',
      createdAt: Date.now(),
      fulfilledAt: null,
    },
  ]);
  return id;
}

describe('order listing', () => {
  it('generates orders when the player has none', async () => {
    const result = await services.market.listOrders(userId);
    expect(result.orders.length).toBeGreaterThan(0);
    expect(result.serverTick).toBeGreaterThan(0);
  });

  it('is stable across calls within a window, so refreshing cannot reroll', async () => {
    const first = await services.market.listOrders(userId);
    const second = await services.market.listOrders(userId);
    expect(second.orders.map((order) => order.id)).toEqual(first.orders.map((order) => order.id));
  });

  it('expires overdue orders instead of leaving them fulfillable', async () => {
    await openOrder({ deadlineTick: 1 });
    const result = await services.market.listOrders(userId);
    expect(result.orders.some((order) => order.deadlineTick === 1)).toBe(false);
  });
});

describe('fulfilling an order', () => {
  it('pays the contract price and removes the goods', async () => {
    const orderId = await openOrder({ quantity: 10, unitPrice: 90 });
    const before = (await services.saves.load(userId)).state;

    const outcome = await services.market.fulfilOrder(userId, orderId);

    expect(outcome.payout).toBe(900);
    expect(outcome.balance).toBe(before.balance + 900);
    const after = (await services.saves.load(userId)).state;
    expect(activeInventory(after)['wheat']).toBe(30);
  });

  it('refuses when the player does not hold enough goods', async () => {
    const orderId = await openOrder({ quantity: 1000 });
    await expect(services.market.fulfilOrder(userId, orderId)).rejects.toThrow();
  });

  it('refuses to fulfil the same order twice', async () => {
    const orderId = await openOrder();
    await services.market.fulfilOrder(userId, orderId);
    await expect(services.market.fulfilOrder(userId, orderId)).rejects.toThrow();
  });

  it('refuses another player access to the order', async () => {
    const orderId = await openOrder();
    const other = await services.auth.register(
      { email: 'thief@example.com', displayName: 'Thief', password: 'another-long-password' },
      'test',
    );
    await expect(services.market.fulfilOrder(other.user.id, orderId)).rejects.toThrow();
  });

  it('records an audit entry for every payout', async () => {
    const orderId = await openOrder();
    await services.market.fulfilOrder(userId, orderId);
    const ledger = await repositories.ledger.listRecent(userId, 10);
    expect(ledger[0]?.kind).toBe('order_fulfilled');
    expect(ledger[0]?.amount).toBeGreaterThan(0);
  });
});

describe('spot selling', () => {
  it('pays the registry price, not a client-supplied one', async () => {
    const before = (await services.saves.load(userId)).state;
    const outcome = await services.market.spotSell(userId, 'wheat', 5);
    expect(outcome.payout).toBe(Math.round(spotPriceFor('wheat') * qualityPriceMultiplier(1) * 5));
    expect(outcome.balance).toBe(before.balance + outcome.payout);
  });

  it('refuses to sell goods the player does not have', async () => {
    await expect(services.market.spotSell(userId, 'pumpkin', 1)).rejects.toThrow();
  });

  it('refuses an unknown item', async () => {
    await expect(services.market.spotSell(userId, 'gold-bar', 1)).rejects.toThrow();
  });
});

describe('idempotency', () => {
  it('remembers a key once and rejects the duplicate', async () => {
    expect(
      await repositories.idempotency.remember(userId, 'key-1', 'market.spotSell', { payout: 1 }),
    ).toBe(true);
    expect(
      await repositories.idempotency.remember(userId, 'key-1', 'market.spotSell', { payout: 1 }),
    ).toBe(false);
    expect(await repositories.idempotency.find(userId, 'key-1')).toMatchObject({
      route: 'market.spotSell',
    });
  });
}, 30_000);
