import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EMPTY_POINTER } from '@engine/input/PointerState.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import { TileFlag } from '@engine/physics/TileGrid.js';
import type { GameAction } from '@game/GameActions.js';
import { Player } from '@game/player/Player.js';
import { PlacementController } from '@game/systems/PlacementController.js';
import { fundedCareer } from '../helpers/career.js';

function cameraAt(x = 0, z = 0): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(x, 10, z + 10);
  camera.lookAt(x, 0, z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function inputHarness() {
  const pressed = new Set<GameAction>();
  const input = {
    pointer: { ...EMPTY_POINTER, ndcX: 0, ndcY: 0 },
    wasPressed: (action: GameAction) => pressed.has(action),
  } as unknown as InputSystem<GameAction>;
  return { input, pressed };
}

describe('PlacementController', () => {
  it('keeps placing the selected item until the player cancels', () => {
    const career = fundedCareer();
    const world = career.world;
    const camera = cameraAt();
    const { input, pressed } = inputHarness();
    const placement = new PlacementController(career, input, camera, new Player(20, 20));
    const startingBuildings = world.buildings.length;

    placement.begin('road');
    pressed.add('interact');
    placement.fixedUpdate(0);

    expect(placement.active).toBe(true);
    expect(world.buildings).toHaveLength(startingBuildings + 1);
    expect(world.buildings.at(-1)?.kind).toBe('road');

    camera.position.x += world.grid.tileSize;
    camera.lookAt(world.grid.tileSize, 0, 0);
    camera.updateMatrixWorld(true);
    placement.fixedUpdate(1);

    expect(placement.active).toBe(true);
    expect(world.buildings).toHaveLength(startingBuildings + 2);

    pressed.clear();
    pressed.add('cancel');
    placement.fixedUpdate(2);
    expect(placement.active).toBe(false);
  });

  it('rotates the preview and persists the rotated footprint', () => {
    const career = fundedCareer();
    career.grant(['hauling']);
    const world = career.world;
    const { input, pressed } = inputHarness();
    const placement = new PlacementController(career, input, cameraAt(), new Player(20, 20));

    placement.begin('loading_pad');
    const tile = placement.tile;
    pressed.add('rotatePlacement');
    placement.fixedUpdate(0);
    expect(placement.rotation).toBe(1);

    pressed.clear();
    pressed.add('interact');
    placement.fixedUpdate(1);

    expect(world.buildings.at(-1)).toMatchObject({ kind: 'loading_pad', rotation: 1 });
    expect(world.grid.hasFlag(tile.x, tile.z + 1, TileFlag.Occupied)).toBe(true);
    expect(world.grid.hasFlag(tile.x + 1, tile.z, TileFlag.Occupied)).toBe(false);
  });

  it('refuses a footprint that would trap the player inside the new structure', () => {
    const career = fundedCareer();
    const { input, pressed } = inputHarness();
    const placement = new PlacementController(career, input, cameraAt(), new Player(0, 0));
    const refused: string[] = [];
    placement.events.on('placement:refused', ({ reason }) => refused.push(reason));
    const startingBuildings = career.world.buildings.length;

    placement.begin('barn');
    pressed.add('interact');
    placement.fixedUpdate(0);

    expect(career.world.buildings).toHaveLength(startingBuildings);
    expect(placement.active).toBe(true);
    expect(refused).toEqual(['Move the farmer clear of that footprint.']);
  });

  it('ends a continuous run when the next copy is unaffordable', () => {
    const career = fundedCareer(400);
    const { input, pressed } = inputHarness();
    const placement = new PlacementController(career, input, cameraAt(), new Player(20, 20));
    const refused: string[] = [];
    placement.events.on('placement:refused', ({ reason }) => refused.push(reason));

    placement.begin('road');
    pressed.add('interact');
    placement.fixedUpdate(0);

    expect(career.world.buildings.at(-1)?.kind).toBe('road');
    expect(placement.active).toBe(false);
    expect(refused).toEqual(['Not enough money to place another road.']);
  });
});
