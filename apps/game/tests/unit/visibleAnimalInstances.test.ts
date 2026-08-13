import { describe, expect, it } from 'vitest';
import { visibleAnimalCountForGroup } from '@game/animals/visibleAnimalInstances.js';
import type { AnimalGroup } from '@game/world/models/AnimalModel.js';

function group(id: string, count: number): AnimalGroup {
  return {
    id,
    species: 'chicken',
    shelterId: `shelter-${id}`,
    count,
    cycleTicks: 0,
    tileX: 0,
    tileZ: 0,
    sheltered: false,
  };
}

describe('visible animal instance allocation', () => {
  it('keeps every non-empty shelter represented before distributing the remaining cap', () => {
    const groups = [group('large', 100), group('small', 1)];
    expect(visibleAnimalCountForGroup(groups, 'chicken', 'large', 64)).toBe(63);
    expect(visibleAnimalCountForGroup(groups, 'chicken', 'small', 64)).toBe(1);
  });

  it('uses stable group order when there are more shelters than visible instances', () => {
    const groups = Array.from({ length: 18 }, (_, index) => group(`group-${index}`, 1));
    const visible = groups.map((entry) =>
      visibleAnimalCountForGroup(groups, 'chicken', entry.id, 16),
    );
    expect(visible.slice(0, 16)).toEqual(Array(16).fill(1));
    expect(visible.slice(16)).toEqual([0, 0]);
  });
});
