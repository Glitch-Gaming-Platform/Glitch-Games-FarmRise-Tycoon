import { describe, expect, it } from 'vitest';
import { cents } from '@farmrise/shared';
import { inventoryRows } from '@game/items/InventoryView.js';

describe('market inventory values', () => {
  it('shows the current quality-adjusted quote rather than the registry base price', () => {
    const rows = inventoryRows({ wheat: 6 }, () => cents(67));
    expect(rows[0]).toMatchObject({ unitPrice: 67, totalValue: 402, formattedTotal: '$4.02' });
  });
});
