/**
 * Read-only projections of the inventory for the UI.
 *
 * The UI must never index into the raw inventory record: putting the shaping
 * here means "what does the player have, and what is it worth?" has one
 * implementation that the HUD, the sell panel and tests all share.
 */
import {
  formatCents,
  getItem,
  spotPriceFor,
  storageUsed,
  type Cents,
  type Inventory,
} from '@farmrise/shared';

export interface InventoryRow {
  readonly itemId: string;
  readonly displayName: string;
  readonly quantity: number;
  readonly unitPrice: Cents;
  readonly totalValue: Cents;
  readonly formattedTotal: string;
}

export function inventoryRows(
  inventory: Inventory,
  quote: (itemId: string) => Cents = spotPriceFor,
): InventoryRow[] {
  return Object.entries(inventory)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => {
      const unitPrice = quote(itemId);
      const totalValue = (unitPrice * quantity) as Cents;
      return {
        itemId,
        displayName: getItem(itemId)?.displayName ?? itemId,
        quantity,
        unitPrice,
        totalValue,
        formattedTotal: formatCents(totalValue),
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

export function storageSummary(inventory: Inventory, capacity: number) {
  const used = storageUsed(inventory);
  return {
    used,
    capacity,
    fraction: capacity > 0 ? used / capacity : 0,
    full: used >= capacity,
  };
}
