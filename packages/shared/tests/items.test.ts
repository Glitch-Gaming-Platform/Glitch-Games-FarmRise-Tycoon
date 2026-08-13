import { describe, expect, it } from 'vitest';
import { formatItemQuantity, itemNameForQuantity } from '../src/index.js';

describe('item quantity labels', () => {
  it('uses readable singular, plural and uncountable item names', () => {
    expect(formatItemQuantity('pea', 5)).toBe('5 Peas');
    expect(formatItemQuantity('strawberry', 2)).toBe('2 Strawberries');
    expect(formatItemQuantity('radish', 3)).toBe('3 Radishes');
    expect(formatItemQuantity('tomato', 4)).toBe('4 Tomatoes');
    expect(formatItemQuantity('eggs', 1)).toBe('1 Egg');
    expect(formatItemQuantity('eggs', 8)).toBe('8 Eggs');
    expect(itemNameForQuantity('milk', 12)).toBe('Milk');
    expect(itemNameForQuantity('wool', 4)).toBe('Wool');
  });
});
