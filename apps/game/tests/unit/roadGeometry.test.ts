import { describe, expect, it } from 'vitest';
import {
  createRoadGeometry,
  RoadConnection,
  roadConnectionMask,
  roadSurfaceVariant,
} from '@game/world/view/roadGeometry.js';

describe('road geometry', () => {
  it('derives straight, corner and junction connections from adjacent tiles', () => {
    const roads = [
      { tileX: 4, tileZ: 4 },
      { tileX: 4, tileZ: 3 },
      { tileX: 5, tileZ: 4 },
      { tileX: 4, tileZ: 5 },
    ];

    expect(roadConnectionMask(roads, 4, 4)).toBe(
      RoadConnection.North | RoadConnection.East | RoadConnection.South,
    );
    expect(roadConnectionMask(roads, 5, 4)).toBe(RoadConnection.West);
  });

  it('gives a crossroad more connected surface than an isolated tile', () => {
    const isolated = createRoadGeometry({ tileSize: 2, connections: 0, variant: 0 });
    const cross = createRoadGeometry({
      tileSize: 2,
      connections:
        RoadConnection.North | RoadConnection.East | RoadConnection.South | RoadConnection.West,
      variant: 0,
    });

    expect(cross.getIndex()!.count).toBeGreaterThan(isolated.getIndex()!.count);
    expect(cross.userData['roadConnectionMask']).toBe(15);
    isolated.dispose();
    cross.dispose();
  });

  it('writes deterministic palette colour and normal data', () => {
    const options = {
      tileSize: 2,
      connections: RoadConnection.North | RoadConnection.South,
      variant: roadSurfaceVariant(12, 18),
    } as const;
    const first = createRoadGeometry(options);
    const second = createRoadGeometry(options);

    expect(Array.from(first.getAttribute('position').array)).toEqual(
      Array.from(second.getAttribute('position').array),
    );
    expect(Array.from(first.getAttribute('color').array)).toEqual(
      Array.from(second.getAttribute('color').array),
    );
    expect(first.getAttribute('normal')).toBeDefined();
    expect(new Set(Array.from(first.getAttribute('color').array)).size).toBeGreaterThan(3);
    expect(first.userData['roadSurfaceStyle']).toBe('packed-earth-bands');
    first.dispose();
    second.dispose();
  });
});
