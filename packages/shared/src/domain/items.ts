/**
 * Every tradeable unit in the game. Crops become items on harvest; animals
 * produce items on each cycle; processors turn one item into another. Keeping
 * one registry means storage, orders, hauling and the inventory UI never have
 * to special-case "is this a crop, a good or a batch output?".
 *
 * Processed goods carry a much higher price *and* a much higher storage weight,
 * so value-added production competes for barn space with the raw produce that
 * made it - which is what turns a mill into a decision rather than a bonus.
 */
import { cents, type Cents } from './ids.js';
import { CROPS, getCrop, isCropPlantableInSeason } from './crops.js';
import { ANIMALS } from './animals.js';
import type { Season } from './seasons.js';

export type ItemCategory = 'crop' | 'animal_product' | 'processed';

export interface ItemDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly category: ItemCategory;
  /** Spot price the buyer pays with no active order. */
  readonly spotUnitPrice: Cents;
  /** Storage units consumed per item unit. */
  readonly storageWeight: number;
  /** Quality lost per in-game day when held outside a cold store, 0..1. */
  readonly freshnessDecayPerDay: number;
}

const PROCESSED_ITEMS: readonly ItemDefinition[] = Object.freeze([
  {
    id: 'flour',
    displayName: 'Flour',
    category: 'processed',
    spotUnitPrice: cents(160),
    storageWeight: 1.5,
    freshnessDecayPerDay: 0.02,
  },
  {
    id: 'cheese',
    displayName: 'Cheese',
    category: 'processed',
    spotUnitPrice: cents(520),
    storageWeight: 2,
    freshnessDecayPerDay: 0.06,
  },
  {
    id: 'preserves',
    displayName: 'Preserves',
    category: 'processed',
    spotUnitPrice: cents(360),
    storageWeight: 1.5,
    freshnessDecayPerDay: 0.01,
  },
]);

function buildItemRegistry(): Readonly<Record<string, ItemDefinition>> {
  const registry: Record<string, ItemDefinition> = {};
  for (const crop of Object.values(CROPS)) {
    registry[crop.id] = {
      id: crop.id,
      displayName: crop.displayName,
      category: 'crop',
      spotUnitPrice: crop.baseUnitPrice,
      storageWeight: 1,
      freshnessDecayPerDay: crop.freshnessDecayPerDay,
    };
  }
  for (const animal of Object.values(ANIMALS)) {
    registry[animal.producesItemId] = {
      id: animal.producesItemId,
      displayName: animal.produceDisplayName,
      category: 'animal_product',
      spotUnitPrice: animal.produceUnitPrice,
      storageWeight: animal.produceStorageWeight,
      freshnessDecayPerDay: animal.produceFreshnessDecayPerDay,
    };
  }
  for (const item of PROCESSED_ITEMS) {
    registry[item.id] = item;
  }
  return Object.freeze(registry);
}

export const ITEMS = buildItemRegistry();

export const ITEM_IDS = Object.keys(ITEMS) as readonly string[];

const UNCOUNTABLE_ITEM_IDS = new Set([
  'wheat',
  'corn',
  'clover',
  'milk',
  'wool',
  'flour',
  'cheese',
  'preserves',
  'garlic',
]);

export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id];
}

/** Player-facing item name with simple count-aware English inflection. */
export function itemNameForQuantity(itemId: string, quantity: number): string {
  const name = getItem(itemId)?.displayName ?? itemId;
  if (quantity === 1) return itemId === 'eggs' ? 'Egg' : name;
  if (UNCOUNTABLE_ITEM_IDS.has(itemId)) return name;
  if (name.endsWith('s')) return name;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z)$/i.test(name)) return `${name}es`;
  if (itemId === 'tomato') return `${name}es`;
  return `${name}s`;
}

export function formatItemQuantity(itemId: string, quantity: number): string {
  return `${quantity} ${itemNameForQuantity(itemId, quantity)}`;
}

export function spotPriceFor(itemId: string): Cents {
  return ITEMS[itemId]?.spotUnitPrice ?? cents(0);
}

export function isProcessedItem(itemId: string): boolean {
  return ITEMS[itemId]?.category === 'processed';
}

/** Contract pool for a season. Harvested goods remain sellable at spot year-round. */
export function marketItemIdsForSeason(season: Season): readonly string[] {
  return ITEM_IDS.filter((itemId) => {
    const crop = getCrop(itemId);
    return !crop || isCropPlantableInSeason(crop, season);
  });
}
