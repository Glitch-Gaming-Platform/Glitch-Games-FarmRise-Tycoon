/**
 * Storage rules. Capacity is what forces the "sell now or hold for a better
 * order" decision, so it lives in shared code and is enforced server-side.
 */
import { BARN_CAPACITY_UNITS, BASE_STORAGE_UNITS } from '../domain/buildings.js';
import { getItem } from '../domain/items.js';
import { ruleViolation, ok, type Result } from './result.js';

export type Inventory = Readonly<Record<string, number>>;

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
