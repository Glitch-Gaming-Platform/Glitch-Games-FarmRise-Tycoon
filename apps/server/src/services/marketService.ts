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
  combineStoreInventories,
  cents,
  createRng,
  getBuyer,
  marketItemIdsForSeason,
  projectDeliveryBonus,
  qualityPriceMultiplier,
  recordDelivery,
  removeItemsFromStores,
  seedFromString,
  seasonAt,
  spotPriceFor,
  validateFulfilment,
  validateSpotSale,
  type Cents,
  type FarmSiteSaveState,
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
      const save = await this.repositories.saves.findByUserId(userId);
      const itemIds = marketItemIdsForSeason(save ? seasonAt(save.state.tick) : 'spring');
      const generated = this.#generateOrders(
        userId,
        tick,
        TARGET_OPEN_ORDERS - open.length,
        itemIds,
      );
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

    const check = validateFulfilment(toDomainOrder(order), inventoryFor(save.state), tick);
    if (!check.ok) throw HttpError.ruleViolation(check.reason);

    // Claim the order first. If this returns false another request already took
    // it, and we must not pay twice.
    const claimed = await this.repositories.market.markFulfilled(userId, orderId, Date.now());
    if (!claimed) throw HttpError.conflict('That order has already been fulfilled.');

    const { envelope, state } = await this.saves.applyTradeResult(userId, (current) =>
      applySale(current, order.itemId, order.quantity, check.value.payout, order.buyerId),
    );

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

    const check = validateSpotSale(itemId, quantity, inventoryFor(save.state));
    if (!check.ok) throw HttpError.ruleViolation(check.reason);

    let payout = check.value.payout;
    const { envelope, state } = await this.saves.applyTradeResult(userId, (current) => {
      const withdrawal = withdrawFromActiveSite(current, itemId, quantity);
      payout = cents(
        spotPriceFor(itemId) *
          quantity *
          qualityPriceMultiplier(withdrawal.quality) *
          projectDeliveryBonus(current.town.completedProjectIds),
      );
      return creditSale(withdrawal.state, payout, quantity);
    });

    await this.repositories.ledger.append({
      userId,
      kind: 'spot_sale',
      amount: payout,
      balanceAfter: state.balance,
      metadata: { itemId, quantity },
    });

    return { payout, balance: state.balance, saveRevision: envelope.revision };
  }

  /**
   * Deterministic per-user order generation.
   *
   * The seed combines a server-only salt, the user id and the current window,
   * so orders are stable within a window (a refresh does not reroll them into
   * something better) but unpredictable to the client.
   */
  #generateOrders(
    userId: string,
    tick: number,
    count: number,
    itemIds: readonly string[],
  ): MarketOrderRecord[] {
    const window = Math.floor(tick / ORDER_WINDOW_TICKS);
    const rng = createRng(seedFromString(`farmrise-orders:${userId}:${window}`));
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
  return state.sites.every((site) =>
    [
      ...site.stores.map((store) => store.items),
      site.carried.items,
      ...site.processors.map((processor) => processor.held),
      ...site.workers.map((worker) => worker.carrying),
    ].every((inventory) => Object.values(inventory).every((quantity) => quantity === 0)),
  );
}

function activeSite(state: SaveState): FarmSiteSaveState {
  const site = state.sites.find((entry) => entry.id === state.activeSiteId);
  if (!site) throw HttpError.ruleViolation('The active farm site does not exist.');
  return site;
}

function inventoryFor(state: SaveState) {
  return combineStoreInventories(activeSite(state).stores);
}

function withdrawFromActiveSite(
  state: SaveState,
  itemId: string,
  quantity: number,
): { state: SaveState; quality: number } {
  const site = activeSite(state);
  const result = removeItemsFromStores(site.stores, itemId, quantity);
  if (!result.ok) throw HttpError.ruleViolation(result.reason);
  const nextSite: FarmSiteSaveState = { ...site, stores: [...result.value.stores] };
  return {
    quality: result.value.quality,
    state: {
      ...state,
      sites: state.sites.map((entry) => (entry.id === site.id ? nextSite : entry)),
    },
  };
}

function creditSale(state: SaveState, payout: Cents, quantity: number): SaveState {
  const balance = cents(state.balance + payout);
  return {
    ...state,
    balance,
    statistics: {
      ...state.statistics,
      lifetimeEarned: state.statistics.lifetimeEarned + payout,
      peakBalance: Math.max(state.statistics.peakBalance, balance),
      itemsSold: state.statistics.itemsSold + quantity,
    },
  };
}

function applySale(
  state: SaveState,
  itemId: string,
  quantity: number,
  payout: Cents,
  buyerId?: string,
): SaveState {
  const withdrawn = withdrawFromActiveSite(state, itemId, quantity);
  let next = creditSale(withdrawn.state, payout, quantity);
  const buyer = buyerId ? getBuyer(buyerId) : undefined;
  if (!buyer) return next;

  const relationship = next.buyers[buyer.id] ?? {
    trust: 0,
    deliveries: 0,
    failures: 0,
    lastDeliveryTick: null,
  };
  next = {
    ...next,
    buyers: {
      ...next.buyers,
      [buyer.id]: {
        ...recordDelivery(buyer.id, relationship),
        lastDeliveryTick: next.tick,
      },
    },
    statistics: {
      ...next.statistics,
      contractsCompleted: next.statistics.contractsCompleted + 1,
    },
  };
  return next;
}
