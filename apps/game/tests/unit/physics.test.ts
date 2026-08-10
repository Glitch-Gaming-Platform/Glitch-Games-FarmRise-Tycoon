/**
 * Grid, collision and pathfinding. All deterministic and all runnable in Node,
 * which is the point of choosing a grid over a rigid-body engine.
 */
import { describe, expect, it } from 'vitest';
import { TileFlag, TileGrid } from '@engine/physics/TileGrid.js';
import { GridPhysics } from '@engine/physics/GridPhysics.js';
import { findPath, pathCost } from '@engine/physics/pathfinding.js';

describe('TileGrid', () => {
  it('round-trips tile and world coordinates', () => {
    const grid = new TileGrid(16, 16, 2);
    for (const [x, z] of [
      [0, 0],
      [8, 8],
      [15, 15],
    ] as const) {
      const world = grid.tileToWorld(x, z);
      expect(grid.worldToTile(world.x, world.z)).toEqual({ x, z });
    }
  });

  it('treats out-of-bounds as blocked', () => {
    const grid = new TileGrid(4, 4);
    expect(grid.hasFlag(-1, 0, TileFlag.Blocked)).toBe(true);
    expect(grid.hasFlag(4, 0, TileFlag.Blocked)).toBe(true);
  });

  it('refuses placement on an occupied footprint', () => {
    const grid = new TileGrid(8, 8);
    grid.setFlag(2, 2, TileFlag.Occupied, true);
    expect(grid.canPlace(1, 1, 2, 2)).toBe(false);
    expect(grid.canPlace(4, 4, 2, 2)).toBe(true);
  });

  it('rejects non-integer dimensions', () => {
    expect(() => new TileGrid(1.5, 4)).toThrow();
  });
});

describe('GridPhysics', () => {
  it('moves a body through open ground', () => {
    const grid = new TileGrid(16, 16, 2);
    const physics = new GridPhysics(grid);
    const body = { position: { x: 0, z: 0 }, radius: 0.4 };
    physics.moveCharacter(body, 1, 0);
    expect(body.position.x).toBeCloseTo(1);
  });

  it('stops at a blocked tile but still slides along it', () => {
    const grid = new TileGrid(16, 16, 2);
    // Block the tile immediately to the +x side of the origin.
    const tile = grid.worldToTile(2, 0);
    grid.setFlag(tile.x, tile.z, TileFlag.Blocked, true);
    const physics = new GridPhysics(grid);
    const body = { position: { x: 0.5, z: 0 }, radius: 0.4 };

    const result = physics.moveCharacter(body, 2, 1);
    expect(result.collided).toBe(true);
    expect(body.position.x).toBeCloseTo(0.5); // blocked on x
    expect(body.position.z).toBeCloseTo(1); // but free on z
  });

  it('cannot leave the grid', () => {
    const grid = new TileGrid(4, 4, 2);
    const physics = new GridPhysics(grid);
    const body = { position: { x: 0, z: 0 }, radius: 0.4 };
    physics.moveCharacter(body, 1000, 1000);
    expect(Math.abs(body.position.x)).toBeLessThan(4);
  });

  it('reports a cheaper surface on roads', () => {
    const grid = new TileGrid(8, 8, 2);
    grid.setFlag(4, 4, TileFlag.Road, true);
    const physics = new GridPhysics(grid, { roadMultiplier: 0.5 });
    const road = grid.tileToWorld(4, 4);
    expect(physics.traversalCostAt(road.x, road.z)).toBe(0.5);
    const plain = grid.tileToWorld(0, 0);
    expect(physics.traversalCostAt(plain.x, plain.z)).toBe(1);
  });

  it('uses a sub-tile static raster for precise prop collision', () => {
    const grid = new TileGrid(16, 16, 2);
    grid.blockWorldRect(0, 0, 3.2, 2.4);
    const physics = new GridPhysics(grid);

    expect(physics.isBlockedWorld(0, 0)).toBe(true);
    expect(physics.isBlockedWorld(2.1, 0)).toBe(false);
    expect(physics.isBlockedWorld(0, 1.8)).toBe(false);
  });

  it('rasterises thin rotated colliders without blocking their whole tile', () => {
    const grid = new TileGrid(16, 16, 2);
    grid.blockWorldRect(0, 0, 2, 0.2, Math.PI / 4);
    const physics = new GridPhysics(grid);

    expect(physics.isBlockedWorld(0, 0)).toBe(true);
    expect(physics.isBlockedWorld(0.7, -0.7)).toBe(false);
  });

  it('stops a character at a nearby moving actor collider', () => {
    const grid = new TileGrid(16, 16, 2);
    const physics = new GridPhysics(grid);
    physics.setDynamicColliders([{ id: 'chicken-0', x: 1.2, z: 0, radius: 0.28 }]);
    const body = {
      collisionId: 'player',
      position: { x: 0, z: 0 },
      radius: 0.45,
    };

    let collided = false;
    for (let step = 0; step < 20; step += 1) {
      collided ||= physics.moveCharacter(body, 0.1, 0).collided;
    }

    expect(collided).toBe(true);
    expect(body.position.x).toBeLessThanOrEqual(0.5);
  });

  it('ignores a moving body own registered collider', () => {
    const grid = new TileGrid(16, 16, 2);
    const physics = new GridPhysics(grid);
    physics.setDynamicColliders([{ id: 'fox-0', x: 0, z: 0, radius: 0.35 }]);
    const fox = {
      collisionId: 'fox-0',
      position: { x: 0, z: 0 },
      radius: 0.35,
    };

    expect(physics.moveCharacter(fox, 0.5, 0).collided).toBe(false);
    expect(fox.position.x).toBeCloseTo(0.5);
  });

  it('lets a player escape when a moving animal wanders into their space', () => {
    const grid = new TileGrid(16, 16, 2);
    const physics = new GridPhysics(grid);
    physics.setDynamicColliders([{ id: 'chicken-0', x: 0, z: 0, radius: 0.28 }]);
    const player = {
      collisionId: 'player',
      position: { x: 0, z: 0 },
      radius: 0.45,
    };

    expect(physics.moveCharacter(player, 0.1, 0).collided).toBe(false);
    expect(player.position.x).toBeCloseTo(0.1);
  });
});

describe('findPath', () => {
  it('finds a straight path across open ground', () => {
    const grid = new TileGrid(10, 10);
    const path = findPath(grid, { x: 0, z: 0 }, { x: 5, z: 0 });
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ x: 5, z: 0 });
  });

  it('routes around a wall', () => {
    const grid = new TileGrid(10, 10);
    for (let z = 0; z < 9; z += 1) grid.setFlag(5, z, TileFlag.Blocked, true);
    const path = findPath(grid, { x: 0, z: 0 }, { x: 9, z: 0 });
    expect(path).not.toBeNull();
    expect(path?.some((step) => step.x === 5 && step.z === 9)).toBe(true);
  });

  it('returns null when the goal is walled in', () => {
    const grid = new TileGrid(10, 10);
    for (const [x, z] of [
      [8, 9],
      [9, 8],
      [8, 8],
    ] as const) {
      grid.setFlag(x, z, TileFlag.Blocked, true);
    }
    expect(findPath(grid, { x: 0, z: 0 }, { x: 9, z: 9 })).toBeNull();
  });

  it('returns null when the goal itself is blocked', () => {
    const grid = new TileGrid(10, 10);
    grid.setFlag(5, 5, TileFlag.Blocked, true);
    expect(findPath(grid, { x: 0, z: 0 }, { x: 5, z: 5 })).toBeNull();
  });

  it('prefers roads, which is what makes building one an economic decision', () => {
    const grid = new TileGrid(12, 3);
    for (let x = 0; x < 12; x += 1) grid.setFlag(x, 1, TileFlag.Road, true);

    const path = findPath(grid, { x: 0, z: 1 }, { x: 11, z: 1 }, { allowDiagonal: false });
    expect(path).not.toBeNull();
    const roadCost = pathCost(grid, path ?? []);

    const bare = new TileGrid(12, 3);
    const barePath = findPath(bare, { x: 0, z: 1 }, { x: 11, z: 1 }, { allowDiagonal: false });
    expect(roadCost).toBeLessThan(pathCost(bare, barePath ?? []));
  });

  it('does not cut diagonally through a corner', () => {
    const grid = new TileGrid(5, 5);
    grid.setFlag(1, 0, TileFlag.Blocked, true);
    grid.setFlag(0, 1, TileFlag.Blocked, true);
    const path = findPath(grid, { x: 0, z: 0 }, { x: 1, z: 1 });
    // (0,0) is boxed in diagonally; the only legal move would be through a corner.
    expect(path).toBeNull();
  });
});
