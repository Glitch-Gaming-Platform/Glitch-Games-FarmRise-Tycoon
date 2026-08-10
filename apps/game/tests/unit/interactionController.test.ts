import { describe, expect, it } from 'vitest';
import { requireCrop } from '@farmrise/shared';
import type { InputSystem } from '@engine/input/InputSystem.js';
import { FarmWorld } from '@game/world/FarmWorld.js';
import { STARTER_FARM } from '@game/world/levels/starterFarm.js';
import { Player } from '@game/player/Player.js';
import { PlayerController } from '@game/player/PlayerController.js';
import { InteractionController } from '@game/systems/InteractionController.js';
import { plant } from '@game/world/FarmCommands.js';
import type { GameAction } from '@game/GameActions.js';

const STEP = { stepSeconds: 1 / 60, tick: 0 };

describe('InteractionController prompts', () => {
  it('refreshes when a plot changes from empty to growing to harvestable', () => {
    const world = new FarmWorld(STARTER_FARM, 42);
    const placement = STARTER_FARM.plots[0]!;
    const position = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    const player = new Player(position.x, position.z);
    const input = {
      wasPressed: () => false,
      isDown: () => false,
      axis: () => 0,
    } as unknown as InputSystem<GameAction>;
    const playerController = new PlayerController(player, world, world.physics, input);
    const interaction = new InteractionController(world, player, playerController, input);
    const labels: Array<string | null> = [];
    interaction.events.on('interaction:prompt', ({ label }) => labels.push(label));

    interaction.fixedUpdate(STEP);
    plant(world, placement.id, 'wheat');
    interaction.fixedUpdate(STEP);
    const plot = world.getPlot(placement.id)!;
    world.setPlot(placement.id, { ...plot, grownTicks: requireCrop('wheat').growthTicks });
    interaction.fixedUpdate(STEP);

    expect(labels).toEqual(['Plant Wheat', 'Tend', 'Harvest']);
  });
});
