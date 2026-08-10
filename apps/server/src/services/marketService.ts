/**
 * Market orders and selling.
 *
 * This is the file that makes the economy server-authoritative. Note the shape
 * of every method: the client names an *intent* (fulfil this order, sell this
 * many of this item) and the server computes the money from its own stored
 * state. There is no code path anywhere that accepts a client-supplied price,
 * payout or balance.
 *
 * Order generation uses a server-side seed derived from the user id and a
 * rotation window. The seed never leaves the server, so a client cannot predict
 * or farm favourable orders.
 */
import {
  DEFAULT_BUYER_ID,
  ITEMS,
  cents,
  createRng,
  seedFromString,
  spotPriceFor,
  validateFulfilment,
  validateSpotSale,
  type Cents,
  type MarketOrderWire,
  type SaveState,
} from '@farmrise/shared';
import { newId } from '../db/ids';
import { HttpError } from '../http/errors';
import { serverTick } from '../domain/serverClock';
import type { MarketOrderRecord, Repositories } from '../repositories/ports';
import type { SaveService } from './saveService';

/** How many open orders a player should have available at any time. */
const TARGET_OPEN_ORDERS = 3;
/** Orders are regenerated on this cadence, in ticks (~10 in-game minutes). */
const ORDER_WINDOW_TICKS = 60 * 600;

export interface TradeOutcome {
  readonly payout: Cents;
  readonly balance: Cents;
  readonly saveRevision: number;
}

export class MarketService {
  constructor(
    private readonly repositories: Repositories,
    private readonly saves: SaveService,
  ) {}

  /**
   * Returns the player's open orders, topping them up if the buyer should have
   * posted more by now. Also retires anything past its deadline, so an expired
   * order can never be fulfilled by a slow client.
   */
  async listOrders(userId: string): Promise<{ orders: MarketOrderWire[]; serverTick: number }> {
    const tick = serverTick();
    await this.repositories.market.expireOverdue(userId, tick);

    let open = await this.repositories.market.listOpenForUser(userId);
    if (open.length < TARGET_OPEN_ORDERS) {
      const generated = this.#generateOrders(userId, tick, TARGET_OPEN_ORDERS - open.length);
      await this.repositories.market.insertMany(generated);
      open = await this.repositories.market.listOpenForUser(userId);
    }

    return { orders: open.map(toWire), serverTick: tick };
  }

  async fulfilOrder(userId: string, orderId: string): Promise<TradeOutcome> {
    const tick = serverTick();
    const order = await this.repositories.market.findForUser(userId, orderId);
    if (!order) throw HttpError.notFound('That order does not exist.');

    const save = await this.repositories.saves.findByUserId(userId);
    if (!save) throw HttpError.notFound('No save to trade from.');

    const check = validateFulfilment(toDomainOrder(order), save.state.inventory, tick);
    if (!check.ok) throw HttpError.ruleViolation(check.reason);

    // Claim the order first. If this returns false another request already took
    // it, and we must not pay twice.
    const claimed = await this.repositories.market.markFulfilled(userId, orderId, Date.now());
    if (!claimed) throw HttpError.conflict('That order has already been fulfilled.');

    const { envelope, state } = await this.saves.applyTradeResult(userId, (current) => ({
      ...current,
      balance: cents(current.balance + check.value.payout),
      inventory: check.value.inventory,
    }));

    await this.repositories.ledger.append({
      userId,
      kind: 'order_fulfilled',
      amount: check.value.payout,
      balanceAfter: state.balance,
      metadata: { orderId, itemId: order.itemId, quantity: order.quantity },
    });

    return { payout: check.value.payout, balance: state.balance, saveRevision: envelope.revision };
  }

  async spotSell(userId: string, itemId: string, quantity: number): Promise<TradeOutcome> {
    if (!ITEMS[itemId]) throw HttpError.badRequest(`"${itemId}" is not a tradeable item.`);

    const save = await this.repositories.saves.findByUserId(userId);
    if (!save) throw HttpError.notFound('No save to trade from.');

    const check = validateSpotSale(itemId, quantity, save.state.inventory);
    if (!check.ok) throw HttpError.ruleViolation(check.reason);

    const { envelope, state } = await this.saves.applyTradeResult(userId, (current) => ({
      ...current,
      balance: cents(current.balance + check.value.payout),
      inventory: check.value.inventory,
    }));

    await this.repositories.ledger.append({
      userId,
      kind: 'spot_sale',
      amount: check.value.payout,
      balanceAfter: state.balance,
      metadata: { itemId, quantity },
    });

    return { payout: check.value.payout, balance: state.balance, saveRevision: envelope.revision };
  }

  /**
   * Deterministic per-user order generation.
   *
   * The seed combines a server-only salt, the user id and the current window,
   * so orders are stable within a window (a refresh does not reroll them into
   * something better) but unpredictable to the client.
   */
  #generateOrders(userId: string, tick: number, count: number): MarketOrderRecord[] {
    const window = Math.floor(tick / ORDER_WINDOW_TICKS);
    const rng = createRng(seedFromString(`farmrise-orders:${userId}:${window}`));
    const itemIds = Object.keys(ITEMS);
    const now = Date.now();

    return Array.from({ length: count }, () => {
      const itemId = rng.pick(itemIds);
      const spot = spotPriceFor(itemId);
      // Contracts pay 15-45% over spot. That premium is the reason to accept a
      // deadline instead of selling on the spot market.
      const premium = 1.15 + rng.next() * 0.3;
      const quantity = 4 + rng.int(0, 9);

      return {
        id: newId('ord'),
        userId,
        buyerId: DEFAULT_BUYER_ID,
        itemId,
        quantity,
        unitPrice: Math.round(spot * premium),
        // Deadlines land between 5 and 15 in-game minutes out.
        deadlineTick: tick + 60 * (300 + rng.int(0, 600)),
        status: 'open' as const,
        createdAt: now,
        fulfilledAt: null,
      };
    });
  }
}

function toWire(order: MarketOrderRecord): MarketOrderWire {
  return {
    id: order.id as MarketOrderWire['id'],
    buyerId: order.buyerId,
    itemId: order.itemId,
    quantity: order.quantity,
    unitPrice: cents(order.unitPrice),
    deadlineTick: order.deadlineTick,
    status: order.status,
  };
}

function toDomainOrder(order: MarketOrderRecord) {
  return {
    id: order.id as MarketOrderWire['id'],
    buyerId: order.buyerId,
    itemId: order.itemId,
    quantity: order.quantity,
    unitPrice: cents(order.unitPrice),
    deadlineTick: order.deadlineTick,
    status: order.status,
  };
}

/** Convenience for tests and the seed script. */
export function emptyInventory(state: SaveState): boolean {
  return Object.values(state.inventory).every((quantity) => quantity === 0);
}
