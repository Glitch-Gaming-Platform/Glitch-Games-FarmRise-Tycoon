import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EMPTY_POINTER } from '@engine/input/PointerState.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { GameAction } from '@game/GameActions.js';
import { PlacementController } from '@game/systems/PlacementController.js';
import { FarmWorld } from '@game/world/FarmWorld.js';
import { STARTER_FARM } from '@game/world/levels/starterFarm.js';

describe('PlacementController', () => {
  it('commits a valid click during the fixed step that owns the input edge', () => {
    const world = new FarmWorld(STARTER_FARM, 42);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const input = {
      pointer: { ...EMPTY_POINTER, ndcX: 0, ndcY: 0 },
      wasPressed: (action: GameAction) => action === 'interact',
    } as unknown as InputSystem<GameAction>;
    const placement = new PlacementController(world, input, camera);
    const startingBuildings = world.buildings.length;

    placement.begin('road', 0);
    placement.fixedUpdate(200);

    expect(placement.active).toBe(false);
    expect(world.buildings).toHaveLength(startingBuildings + 1);
    expect(world.buildings.at(-1)?.kind).toBe('road');
  });
});
