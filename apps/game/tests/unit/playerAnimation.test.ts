import { describe, expect, it } from 'vitest';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { PhysicsPort } from '@engine/physics/PhysicsPort.js';
import type { FarmWorld } from '../../src/game/world/FarmWorld.js';
import type { GameAction } from '../../src/game/GameActions.js';
import { Player } from '../../src/game/player/Player.js';
import { PlayerActionEffects } from '../../src/game/player/PlayerActionEffects.js';
import { PlayerController } from '../../src/game/player/PlayerController.js';
import { PlayerToolView } from '../../src/game/player/PlayerToolView.js';

const context: FixedUpdateContext = {
  stepSeconds: 1 / 60,
  tick: 1,
};

const renderContext: RenderContext = {
  deltaSeconds: 1 / 60,
  alpha: 0.5,
  elapsedSeconds: 1,
};

function makeController(actions: Partial<Record<GameAction, boolean>>): {
  player: Player;
  controller: PlayerController;
} {
  const player = new Player(0, 0);
  const world = {} as FarmWorld;
  const input = {
    axis: ({ negative, positive }: { negative: GameAction; positive: GameAction }) =>
      Number(Boolean(actions[positive])) - Number(Boolean(actions[negative])),
    isDown: (action: GameAction) => Boolean(actions[action]),
  } as InputSystem<GameAction>;
  const physics = {
    traversalCostAt: () => 1,
    moveCharacter: (body: Player, dx: number, dz: number) => {
      body.position.x += dx;
      body.position.z += dz;
    },
  } as unknown as PhysicsPort;

  return { player, controller: new PlayerController(player, world, physics, input) };
}

describe('player animation state', () => {
  it('marks walking and sprinting with distinct locomotion intensities', () => {
    const walking = makeController({ moveForward: true });
    walking.controller.fixedUpdate(context);
    expect(walking.player.activity).toBe('walking');
    expect(walking.player.locomotionIntensity).toBe(1);

    const sprinting = makeController({ moveForward: true, sprint: true });
    sprinting.controller.fixedUpdate(context);
    expect(sprinting.player.activity).toBe('walking');
    expect(sprinting.player.locomotionIntensity).toBe(sprinting.player.sprintMultiplier);
  });

  it('returns to a still pose when movement stops or work begins', () => {
    const moving = makeController({ moveRight: true });
    moving.controller.fixedUpdate(context);
    expect(moving.player.locomotionIntensity).toBe(1);

    const idle = makeController({});
    idle.player.activity = 'walking';
    idle.player.locomotionIntensity = 1;
    idle.controller.fixedUpdate(context);
    expect(idle.player.activity).toBe('idle');
    expect(idle.player.locomotionIntensity).toBe(0);

    moving.player.beginWork(6, 'harvest');
    expect(moving.player.activity).toBe('working');
    expect(moving.player.locomotionIntensity).toBe(0);
    expect(moving.player.workAction).toBe('harvest');
    expect(moving.player.workProgress).toBe(0);

    moving.player.tickWork(3);
    expect(moving.player.workProgress).toBe(0.5);
    moving.player.tickWork(3);
    expect(moving.player.workAction).toBeNull();
    expect(moving.player.workProgress).toBe(0);
  });

  it('presents a readable authored tool and accent for every work verb', () => {
    const view = new PlayerToolView(null);
    const wateringCan = view.object.getObjectByName('FarmTool_WateringCan');
    const waterStream = view.object.getObjectByName('FarmTool_WaterStream');
    const sickle = view.object.getObjectByName('FarmTool_Sickle');
    const harvestArc = view.object.getObjectByName('FarmTool_HarvestArc');
    const trowel = view.object.getObjectByName('FarmTool_Trowel');

    view.sync('plant', 0.5, 1);
    expect(trowel?.visible).toBe(true);
    expect(wateringCan?.visible).toBe(false);

    view.sync('tend', 0.5, 1.2);
    expect(wateringCan?.visible).toBe(true);
    expect(waterStream?.visible).toBe(true);
    expect(trowel?.visible).toBe(false);

    view.sync('harvest', 0.5, 1.4);
    expect(sickle?.visible).toBe(true);
    expect(harvestArc?.visible).toBe(true);
    expect(wateringCan?.visible).toBe(false);

    view.sync(null, 0, 1.6);
    expect(sickle?.visible).toBe(false);
    expect(harvestArc?.visible).toBe(false);
    view.dispose();
  });

  it('never exposes a black first frame for watering or harvesting particles', () => {
    for (const action of ['tend', 'harvest'] as const) {
      const effects = new PlayerActionEffects();
      const colours = effects.object.instanceColor;
      expect(colours).not.toBeNull();
      for (let index = 0; index < (colours?.count ?? 0); index += 1) {
        expect(colours?.getX(index)).toBe(1);
        expect(colours?.getY(index)).toBe(1);
        expect(colours?.getZ(index)).toBe(1);
      }

      effects.trigger(action, 0);
      effects.update(renderContext, 0, 0);
      expect(effects.object.visible).toBe(true);
      const activeColours = Array.from(
        { length: colours?.count ?? 0 },
        (_, index) =>
          (colours?.getX(index) ?? 0) + (colours?.getY(index) ?? 0) + (colours?.getZ(index) ?? 0),
      );
      expect(Math.min(...activeColours)).toBeGreaterThan(0);
      effects.dispose();
    }
  });
});
