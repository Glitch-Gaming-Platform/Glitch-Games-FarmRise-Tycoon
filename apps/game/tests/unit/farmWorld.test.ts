/**
 * The farm model and the player commands. This is the closest thing the client
 * has to business logic, so it is tested without any rendering at all.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CROPS, requireCrop, storageUsed } from '@farmrise/shared';
import { FarmWorld } from '@game/world/FarmWorld.js';
import { STARTER_FARM } from '@game/world/levels/starterFarm.js';
import { build, buyAnimal, harvest, plant, tend } from '@game/world/FarmCommands.js';

let world: FarmWorld;
const firstPlot = STARTER_FARM.plots[0]!.id;

beforeEach(() => {
  world = new FarmWorld(STARTER_FARM, 1234);
});

describe('planting', () => {
  it('charges the seed cost', () => {
    const before = world.balance;
    expect(plant(world, firstPlot, 'wheat').ok).toBe(true);
    expect(world.balance).toBe(before - CROPS['wheat']!.seedCost);
  });

  it('refuses to plant twice on the same plot', () => {
    plant(world, firstPlot, 'wheat');
    expect(plant(world, firstPlot, 'corn').ok).toBe(false);
  });

  it('refuses an unknown crop', () => {
    expect(plant(world, firstPlot, 'diamonds').ok).toBe(false);
  });

  it('refuses when the player cannot afford the seed', () => {
    // Drain the wallet, then try to plant the most expensive crop.
    world.adjustBalance(-world.balance as never);
    expect(plant(world, firstPlot, 'pumpkin').ok).toBe(false);
  });
});

describe('growing and harvesting', () => {
  it('cannot harvest before the crop is ready', () => {
    plant(world, firstPlot, 'wheat');
    expect(harvest(world, firstPlot).ok).toBe(false);
  });

  it('yields goods once ready and clears the plot', () => {
    plant(world, firstPlot, 'wheat');
    world.advance(requireCrop('wheat').growthTicks * 3);

    const result = harvest(world, firstPlot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quantity).toBeGreaterThan(0);
      expect(world.inventory[result.value.itemId]).toBe(result.value.quantity);
    }
    expect(world.getPlot(firstPlot)?.cropId).toBeNull();
  });

  it('tending raises the eventual yield', () => {
    const growth = requireCrop('wheat').growthTicks * 3;

    plant(world, firstPlot, 'wheat');
    world.advance(growth);
    const untendedYield = world.previewYield(firstPlot);

    const other = new FarmWorld(STARTER_FARM, 1234);
    plant(other, firstPlot, 'wheat');
    tend(other, firstPlot);
    other.advance(growth);
    expect(other.previewYield(firstPlot)).toBeGreaterThanOrEqual(untendedYield);
  });

  it('spills produce when storage is full rather than silently exceeding it', () => {
    const capacity = world.storageCapacity;
    world.addToInventory('wheat', capacity + 50);
    expect(storageUsed(world.inventory)).toBeLessThanOrEqual(capacity);
  });
});

describe('building', () => {
  it('charges the cost and reserves the tiles', () => {
    const before = world.balance;
    const result = build(world, 'road', 10, 10);
    expect(result.ok).toBe(true);
    expect(world.balance).toBeLessThan(before);
    expect(world.buildings).toHaveLength(1);
  });

  it('refuses to build on a crop plot', () => {
    const placement = STARTER_FARM.plots[0]!;
    expect(build(world, 'barn', placement.tileX, placement.tileZ).ok).toBe(false);
  });

  it('refuses to build on top of another building', () => {
    build(world, 'road', 10, 10);
    expect(build(world, 'road', 10, 10).ok).toBe(false);
  });

  it('only takes effect once construction finishes', () => {
    const capacityBefore = world.storageCapacity;
    build(world, 'barn', 2, 10);
    expect(world.storageCapacity).toBe(capacityBefore);

    world.advance(60 * 200);
    expect(world.storageCapacity).toBeGreaterThan(capacityBefore);
  });

  it('charges upkeep once complete', () => {
    build(world, 'barn', 2, 10);
    world.advance(60 * 200);
    const afterBuild = world.balance;
    world.advance(60 * 300);
    expect(world.balance).toBeLessThan(afterBuild);
  });

  it('blocks solid structures with cheap static collision proxies', () => {
    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    expect(world.physics.isBlockedWorld(shelter.x, shelter.z)).toBe(true);

    const trough = {
      x: shelter.x - world.grid.tileSize * 0.95,
      z: shelter.z - world.grid.tileSize * 0.72,
    };
    expect(world.physics.isBlockedWorld(trough.x, trough.z)).toBe(true);

    const irrigationWorld = new FarmWorld(STARTER_FARM, 31);
    expect(build(irrigationWorld, 'irrigation', 10, 10).ok).toBe(true);
    const irrigation = irrigationWorld.grid.tileToWorld(10, 10);
    expect(irrigationWorld.physics.isBlockedWorld(irrigation.x, irrigation.z)).toBe(true);

    const fenceWorld = new FarmWorld(STARTER_FARM, 32);
    expect(build(fenceWorld, 'fence', 10, 10).ok).toBe(true);
    const fence = fenceWorld.grid.tileToWorld(10, 10);
    expect(fenceWorld.physics.isBlockedWorld(fence.x, fence.z)).toBe(true);

    const roadWorld = new FarmWorld(STARTER_FARM, 33);
    expect(build(roadWorld, 'road', 10, 10).ok).toBe(true);
    const road = roadWorld.grid.tileToWorld(10, 10);
    expect(roadWorld.physics.isBlockedWorld(road.x, road.z)).toBe(false);
  });

  it('stops the player outside the animal shelter instead of inside it', () => {
    const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
    const body = {
      position: { x: shelter.x, z: shelter.z + 3 },
      radius: 0.45,
    };
    let collided = false;
    for (let step = 0; step < 20; step += 1) {
      collided ||= world.physics.moveCharacter(body, 0, -0.2).collided;
    }
    expect(collided).toBe(true);
    expect(body.position.z).toBeGreaterThan(shelter.z + 1);
  });
});

describe('animals', () => {
  it('refuses to buy beyond shelter capacity', () => {
    expect(buyAnimal(world, 'chicken', 99).ok).toBe(false);
  });

  it('produces goods only when fed', () => {
    buyAnimal(world, 'chicken', 1);
    world.advance(60 * 200);
    expect(world.inventory['eggs'] ?? 0).toBe(0); // no feed in store

    world.addToInventory('corn', 20);
    world.advance(60 * 200);
    expect(world.inventory['eggs'] ?? 0).toBeGreaterThan(0);
  });
});

describe('save round-trip', () => {
  it('restores an equivalent world', () => {
    plant(world, firstPlot, 'corn');
    build(world, 'road', 10, 10);
    world.addToInventory('wheat', 5);
    world.advance(500);

    const state = world.toSaveState();
    const restored = FarmWorld.fromSaveState(STARTER_FARM, state);

    expect(restored.toSaveState()).toEqual(state);
    expect(restored.balance).toBe(world.balance);
    expect(restored.getPlot(firstPlot)?.cropId).toBe('corn');
  });
});
