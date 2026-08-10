/**
 * Every tradeable unit in the game. Crops become items on harvest; animals
 * produce items on each cycle. Keeping one registry means storage, orders and
 * the inventory UI never have to special-case "is this a crop or a good?".
 */
import { cents, type Cents } from './ids.js';
import { CROPS } from './crops.js';
import { ANIMALS } from './animals.js';

export type ItemCategory = 'crop' | 'animal_product';

export interface ItemDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly category: ItemCategory;
  /** Spot price the buyer pays with no active order. */
  readonly spotUnitPrice: Cents;
  /** Storage units consumed per item unit. */
  readonly storageWeight: number;
}

function buildItemRegistry(): Readonly<Record<string, ItemDefinition>> {
  const registry: Record<string, ItemDefinition> = {};
  for (const crop of Object.values(CROPS)) {
    registry[crop.id] = {
      id: crop.id,
      displayName: crop.displayName,
      category: 'crop',
      spotUnitPrice: crop.baseUnitPrice,
      storageWeight: 1,
    };
  }
  for (const animal of Object.values(ANIMALS)) {
    registry[animal.producesItemId] = {
      id: animal.producesItemId,
      displayName: 'Eggs',
      category: 'animal_product',
      spotUnitPrice: animal.produceUnitPrice,
      storageWeight: 1,
    };
  }
  return Object.freeze(registry);
}

export const ITEMS = buildItemRegistry();

export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id];
}

export function spotPriceFor(itemId: string): Cents {
  return ITEMS[itemId]?.spotUnitPrice ?? cents(0);
}
