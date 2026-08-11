/**
 * Where goods physically are.
 *
 * Once hauling exists there is no single inventory. A harvest lands in the
 * field it grew in, a barn holds what was carried home, a cold store holds what
 * is being saved for a fussy buyer, and each of those is a place with a
 * position, a capacity and its own average quality
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §33.5).
 */
import {
  applySpoilage,
  blendQuality,
  decayQuality,
  getItem,
  loadWeight,
  ok,
  removeItemsFromStores,
  ruleViolation,
  totalUnits,
  YARD_STORE_ID,
  type Inventory,
  type Result,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';

export interface StoreState {
  readonly id: string;
  readonly buildingId: string | null;
  readonly tileX: number;
  readonly tileZ: number;
  capacity: number;
  preserving: boolean;
  items: Inventory;
  quality: Record<string, number>;
  spoilageRemainder: Record<string, number>;
}

export interface StoreModelEvents extends Record<string, unknown> {
  'store:changed': { storeId: string };
  'store:full': { storeId: string; itemId: string; spilled: number };
  'store:spoiled': { storeId: string; lost: number; items: Inventory; emptied: boolean };
}

export class StoreModel {
  readonly events = new EventBus<StoreModelEvents>();
  readonly #stores = new Map<string, StoreState>();

  get stores(): readonly StoreState[] {
    return [...this.#stores.values()];
  }

  get(storeId: string): StoreState | undefined {
    return this.#stores.get(storeId);
  }

  add(store: StoreState): void {
    this.#stores.set(store.id, store);
    this.events.emit('store:changed', { storeId: store.id });
  }

  remove(storeId: string): void {
    this.#stores.delete(storeId);
  }

  /** The nearest store within range of a tile, preferring a preserving one. */
  nearest(tileX: number, tileZ: number, maxTiles = 2): StoreState | undefined {
    return this.#nearest(tileX, tileZ, maxTiles, () => true);
  }

  /** Nearest physical pile, preferred over an adjacent yard during pickup. */
  nearestStack(tileX: number, tileZ: number, maxTiles = 2): StoreState | undefined {
    return this.#nearest(
      tileX,
      tileZ,
      maxTiles,
      (store) =>
        store.id.startsWith('stack-') &&
        Object.values(store.items).some((quantity) => quantity > 0),
    );
  }

  /** Nearest yard/building store; field piles are not valid deposit targets. */
  nearestStored(tileX: number, tileZ: number, maxTiles = 2): StoreState | undefined {
    return this.#nearest(tileX, tileZ, maxTiles, (store) => !store.id.startsWith('stack-'));
  }

  #nearest(
    tileX: number,
    tileZ: number,
    maxTiles: number,
    include: (store: StoreState) => boolean,
  ): StoreState | undefined {
    let best: StoreState | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const store of this.#stores.values()) {
      if (!include(store)) continue;
      const distance = Math.abs(store.tileX - tileX) + Math.abs(store.tileZ - tileZ);
      if (distance > maxTiles) continue;
      const score = distance - (store.preserving ? 0.5 : 0);
      if (score < bestScore) {
        best = store;
        bestScore = score;
      }
    }
    return best;
  }

  /** Total units of an item held across every store on the site. */
  totalOf(itemId: string): number {
    let total = 0;
    for (const store of this.#stores.values()) total += store.items[itemId] ?? 0;
    return total;
  }

  /** Combined contents, for the market screen and milestone counting. */
  combined(): Inventory {
    return this.#combined(() => true);
  }

  /** Goods that have actually been collected into the yard or a building. */
  storedCombined(): Inventory {
    return this.#combined((store) => !store.id.startsWith('stack-'));
  }

  /** Total stored units, excluding piles still waiting in the field. */
  storedTotalOf(itemId: string): number {
    let total = 0;
    for (const store of this.#stores.values()) {
      if (store.id.startsWith('stack-')) continue;
      total += store.items[itemId] ?? 0;
    }
    return total;
  }

  /** Mean quality across collected storage only. */
  storedQualityOf(itemId: string): number {
    return this.#qualityOf(itemId, (store) => !store.id.startsWith('stack-'));
  }

  #combined(include: (store: StoreState) => boolean): Inventory {
    const combined: Record<string, number> = {};
    for (const store of this.#stores.values()) {
      if (!include(store)) continue;
      for (const [itemId, quantity] of Object.entries(store.items)) {
        combined[itemId] = (combined[itemId] ?? 0) + quantity;
      }
    }
    return combined;
  }

  totalCapacity(): number {
    return [...this.#stores.values()]
      .filter((store) => store.id === YARD_STORE_ID || store.buildingId !== null)
      .reduce((sum, store) => sum + store.capacity, 0);
  }

  totalUsed(): number {
    return [...this.#stores.values()].reduce((sum, store) => sum + loadWeight(store.items), 0);
  }

  /** Mean quality of an item across every store holding it. */
  qualityOf(itemId: string): number {
    return this.#qualityOf(itemId, () => true);
  }

  #qualityOf(itemId: string, include: (store: StoreState) => boolean): number {
    let quantity = 0;
    let weighted = 0;
    for (const store of this.#stores.values()) {
      if (!include(store)) continue;
      const held = store.items[itemId] ?? 0;
      if (held <= 0) continue;
      quantity += held;
      weighted += held * (store.quality[itemId] ?? 1);
    }
    return quantity > 0 ? weighted / quantity : 1;
  }

  /**
   * Puts goods into a specific store, clamping to capacity.
   *
   * Overflow is reported rather than rejected: a full barn should take what it
   * can and tell the player what it could not, because a refused deposit while
   * standing in front of the door reads as a bug.
   */
  deposit(
    storeId: string,
    itemId: string,
    quantity: number,
    quality = 1,
  ): { stored: number; spilled: number } {
    const store = this.#stores.get(storeId);
    if (!store || quantity <= 0) return { stored: 0, spilled: Math.max(0, quantity) };

    // Room is measured in storage units and processed goods weigh more than
    // one, so the number of *items* that fit is the free weight divided by the
    // item's weight. Treating them as interchangeable let a barn hold 100
    // cheeses in 120 units of space, which the server then refused to save.
    const weight = getItem(itemId)?.storageWeight ?? 1;
    const room = Math.max(0, store.capacity - loadWeight(store.items));
    const stored = Math.max(0, Math.min(quantity, Math.floor(room / weight)));
    const spilled = quantity - stored;

    if (stored > 0) {
      const existing = store.items[itemId] ?? 0;
      store.quality = {
        ...store.quality,
        [itemId]: blendQuality(existing, store.quality[itemId] ?? 1, stored, quality),
      };
      store.items = { ...store.items, [itemId]: existing + stored };
      this.events.emit('store:changed', { storeId });
    }
    if (spilled > 0) this.events.emit('store:full', { storeId, itemId, spilled });
    return { stored, spilled };
  }

  /** Takes goods out of a specific store. */
  withdraw(storeId: string, itemId: string, quantity: number): Result<{ quality: number }> {
    const store = this.#stores.get(storeId);
    if (!store) return ruleViolation('There is no store there.');
    const held = store.items[itemId] ?? 0;
    if (held < quantity) return ruleViolation(`Only ${held} ${itemId} here.`);

    store.items = { ...store.items, [itemId]: held - quantity };
    this.events.emit('store:changed', { storeId });
    return ok({ quality: store.quality[itemId] ?? 1 });
  }

  /**
   * Takes goods from anywhere on the site.
   *
   * Used by selling and by processing, both of which are "the farm has this"
   * questions rather than "this building has this" questions. Draws from the
   * least fresh store first, so the good stuff is what survives to a contract.
   */
  withdrawAnywhere(itemId: string, quantity: number): Result<{ quality: number }> {
    return this.#withdrawFrom(itemId, quantity, () => true);
  }

  /** Takes collected goods only; field piles must be picked up before sale. */
  withdrawStoredAnywhere(itemId: string, quantity: number): Result<{ quality: number }> {
    return this.#withdrawFrom(itemId, quantity, (store) => !store.id.startsWith('stack-'));
  }

  #withdrawFrom(
    itemId: string,
    quantity: number,
    include: (store: StoreState) => boolean,
  ): Result<{ quality: number }> {
    const before = this.stores.filter(include);
    const result = removeItemsFromStores(before, itemId, quantity);
    if (!result.ok) return result;

    for (const [index, next] of result.value.stores.entries()) {
      const current = before[index];
      if (!current || current.items[itemId] === next.items[itemId]) continue;
      current.items = { ...next.items };
      this.events.emit('store:changed', { storeId: current.id });
    }
    return ok({ quality: result.value.quality });
  }

  /**
   * Applies spoilage and freshness decay to every store.
   *
   * A pile left in the field decays far faster than the same goods in a barn,
   * which is the entire argument for walking back with them.
   */
  advance(
    dtTicks: number,
    storedMultiplier: number,
    fieldMultiplier = storedMultiplier,
    protectedFieldItems: readonly string[] = [],
  ): number {
    let lost = 0;
    const protectedItems = new Set(protectedFieldItems);
    for (const store of this.#stores.values()) {
      const inTheOpen = store.buildingId === null && store.id.startsWith('stack-');
      const ratePerDay = inTheOpen ? fieldMultiplier : storedMultiplier;
      const decayItems =
        inTheOpen && protectedItems.size > 0
          ? Object.fromEntries(
              Object.entries(store.items).filter(([itemId]) => !protectedItems.has(itemId)),
            )
          : store.items;
      const outcome = applySpoilage(
        decayItems,
        ratePerDay,
        dtTicks,
        store.spoilageRemainder,
        store.preserving,
      );
      store.spoilageRemainder = { ...outcome.remainder };
      if (outcome.lost > 0) {
        const lostItems: Record<string, number> = {};
        for (const [itemId, before] of Object.entries(decayItems)) {
          const itemLost = before - (outcome.items[itemId] ?? 0);
          if (itemLost > 0) lostItems[itemId] = itemLost;
        }
        store.items = { ...store.items, ...outcome.items };
        lost += outcome.lost;
        this.events.emit('store:spoiled', {
          storeId: store.id,
          lost: outcome.lost,
          items: lostItems,
          emptied: totalUnits(store.items) <= 0,
        });
        this.events.emit('store:changed', { storeId: store.id });
      }
      for (const itemId of Object.keys(store.items)) {
        if ((store.items[itemId] ?? 0) <= 0) continue;
        if (inTheOpen && protectedItems.has(itemId)) continue;
        store.quality = {
          ...store.quality,
          [itemId]: decayQuality(store.quality[itemId] ?? 1, itemId, dtTicks, store.preserving),
        };
      }
    }
    return lost;
  }

  toSaveState(): StoreState[] {
    return this.stores.map((store) => ({
      ...store,
      items: { ...store.items },
      quality: { ...store.quality },
      spoilageRemainder: { ...store.spoilageRemainder },
    }));
  }
}
