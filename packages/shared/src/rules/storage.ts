/**
 * Storage rules. Capacity is what forces the "sell now or hold for a better
 * order" decision, so it lives in shared code and is enforced server-side.
 */
import { BARN_CAPACITY_UNITS, BASE_STORAGE_UNITS } from '../domain/buildings.js';
import { getItem } from '../domain/items.js';
import { ruleViolation, ok, type Result } from './result.js';

export type Inventory = Readonly<Record<string, number>>;

/** The subset of a localized store needed by inventory-wide rules. */
export interface InventoryStore {
  readonly items: Inventory;
  readonly quality?: Readonly<Record<string, number>>;
}

export function storageCapacity(completedBarns: number): number {
  return BASE_STORAGE_UNITS + Math.max(0, completedBarns) * BARN_CAPACITY_UNITS;
}

export function storageUsed(inventory: Inventory): number {
  let used = 0;
  for (const [itemId, quantity] of Object.entries(inventory)) {
    const weight = getItem(itemId)?.storageWeight ?? 1;
    used += Math.max(0, quantity) * weight;
  }
  return used;
}

export function canStore(
  inventory: Inventory,
  itemId: string,
  quantity: number,
  capacity: number,
): boolean {
  const weight = getItem(itemId)?.storageWeight ?? 1;
  return storageUsed(inventory) + quantity * weight <= capacity;
}

/**
 * Adds items, clamping to capacity. Overflow is dropped rather than rejected:
 * losing surplus is a legible consequence, whereas a failed harvest would feel
 * like a bug.
 */
export function addItems(
  inventory: Inventory,
  itemId: string,
  quantity: number,
  capacity: number,
): { inventory: Inventory; stored: number; spilled: number } {
  const weight = getItem(itemId)?.storageWeight ?? 1;
  const free = Math.max(0, capacity - storageUsed(inventory));
  const stored = Math.max(0, Math.min(quantity, Math.floor(free / weight)));
  const spilled = Math.max(0, quantity - stored);
  return {
    inventory: { ...inventory, [itemId]: (inventory[itemId] ?? 0) + stored },
    stored,
    spilled,
  };
}

export function removeItems(
  inventory: Inventory,
  itemId: string,
  quantity: number,
): Result<Inventory> {
  const held = inventory[itemId] ?? 0;
  if (quantity <= 0) return ruleViolation('Quantity must be positive.');
  if (held < quantity)
    return ruleViolation(`Not enough ${itemId}: have ${held}, need ${quantity}.`);
  return ok({ ...inventory, [itemId]: held - quantity });
}

/** Combines inventories without erasing where the goods actually live. */
export function combineInventories(inventories: readonly Inventory[]): Inventory {
  const combined: Record<string, number> = {};
  for (const inventory of inventories) {
    for (const [itemId, quantity] of Object.entries(inventory)) {
      combined[itemId] = (combined[itemId] ?? 0) + Math.max(0, quantity);
    }
  }
  return combined;
}

export function combineStoreInventories(stores: readonly InventoryStore[]): Inventory {
  return combineInventories(stores.map((store) => store.items));
}

/**
 * Removes goods across localized stores, consuming the lowest-quality stock
 * first. The browser model and authoritative server both call this rule so a
 * sale cannot choose a different batch depending on where it was executed.
 */
export function removeItemsFromStores<T extends InventoryStore>(
  stores: readonly T[],
  itemId: string,
  quantity: number,
): Result<{ stores: readonly T[]; quality: number }> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return ruleViolation('Quantity must be a positive whole number.');
  }

  const held = stores.reduce((sum, store) => sum + (store.items[itemId] ?? 0), 0);
  if (held < quantity) {
    return ruleViolation(`Need ${quantity} ${itemId}, holding ${held}.`);
  }

  const next = stores.map((store) => ({ ...store, items: { ...store.items } })) as T[];
  const order = next
    .map((store, index) => ({ store, index }))
    .filter(({ store }) => (store.items[itemId] ?? 0) > 0)
    .sort((a, b) => (a.store.quality?.[itemId] ?? 1) - (b.store.quality?.[itemId] ?? 1));

  let remaining = quantity;
  let weightedQuality = 0;
  for (const { store, index } of order) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, store.items[itemId] ?? 0);
    weightedQuality += taken * (store.quality?.[itemId] ?? 1);
    next[index] = {
      ...store,
      items: { ...store.items, [itemId]: (store.items[itemId] ?? 0) - taken },
    } as T;
    remaining -= taken;
  }

  return ok({ stores: next, quality: weightedQuality / quantity });
}
