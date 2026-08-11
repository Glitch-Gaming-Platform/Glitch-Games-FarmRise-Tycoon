import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { PhysicsPort } from '@engine/physics/PhysicsPort.js';
import type { FarmWorld } from '../../src/game/world/FarmWorld.js';
import type { GameAction } from '../../src/game/GameActions.js';
import { Player } from '../../src/game/player/Player.js';
import {
  ACTION_EFFECT_CONTACT,
  hasReachedActionContact,
  PlayerActionEffects,
} from '../../src/game/player/PlayerActionEffects.js';
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

function makeController(actions: Partial<Record<GameAction, boolean | number>>): {
  player: Player;
  controller: PlayerController;
} {
  const player = new Player(0, 0);
  const world = {} as FarmWorld;
  const input = {
    axis: ({ negative, positive }: { negative: GameAction; positive: GameAction }) =>
      Number(actions[positive] ?? 0) - Number(actions[negative] ?? 0),
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

    const analog = makeController({ moveForward: 0.4 });
    analog.controller.fixedUpdate(context);
    expect(analog.player.locomotionIntensity).toBeCloseTo(0.4);
    expect(Math.abs(analog.player.position.z)).toBeLessThan(Math.abs(walking.player.position.z));
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
    expect(view.supportPosition(new THREE.Vector3())).not.toBeNull();

    view.sync('harvest', 0.5, 1.4);
    expect(sickle?.visible).toBe(true);
    expect(harvestArc?.visible).toBe(true);
    expect(wateringCan?.visible).toBe(false);

    view.sync(null, 0, 1.6);
    expect(sickle?.visible).toBe(false);
    expect(harvestArc?.visible).toBe(false);
    view.dispose();
  });

  it('points the watering can spout ahead of the farmer, not across their body', () => {
    // The can is authored with its spout along local +X and the farmer faces
    // +Z, so an unrotated can pours sideways out of the right hip. The pose
    // used to yaw it by 0.1 rad - six degrees - which left it doing exactly
    // that, and the water effects were then placed off to the side to match.
    const view = new PlayerToolView(null);
    const can = view.object.getObjectByName('FarmTool_WateringCan')!;
    const splash = view.object.getObjectByName('FarmTool_WaterSplash')!;

    // Measured off the built mesh: the rose sits at (0.595, 0.327, 0) in the
    // can's own space, and the spout emerges from the body around y = 0.24.
    const spoutTipLocal = new THREE.Vector3(0.595, 0.327, 0);
    const spoutBaseLocal = new THREE.Vector3(0, 0.24, 0);

    view.sync('tend', 0.5, 1.2);
    can.updateMatrix();
    const tip = spoutTipLocal.clone().applyMatrix4(can.matrix);
    const base = spoutBaseLocal.clone().applyMatrix4(can.matrix);
    const spout = tip.clone().sub(base).normalize();

    // Forward is the dominant axis, and it is pointing down rather than up.
    expect(spout.z).toBeGreaterThan(0.6);
    expect(Math.abs(spout.x)).toBeLessThan(0.3);
    expect(spout.y).toBeLessThan(-0.2);

    // The rose ends up in front of the farmer and still above the soil. It
    // used to fall to 0.26 m once the spout was aimed, because the pour tilt
    // had been tuned while it was rolling the can about its own axis.
    expect(tip.z).toBeGreaterThan(0.6);
    expect(tip.y).toBeGreaterThan(0.35);

    // And the ground ring sits directly beneath the rose, because it is
    // derived from the spout rather than tuned alongside it.
    expect(splash.position.x).toBeCloseTo(tip.x, 5);
    expect(splash.position.z).toBeCloseTo(tip.z, 5);
    view.dispose();
  });

  it('runs the water stream from the spout down to the ground ring', () => {
    // A fixed stream length pushed the cylinder through the soil at full pour
    // and left it short of the rose at low pour. Spanning the gap means the
    // two ends are correct by construction at every tilt.
    const view = new PlayerToolView(null);
    const can = view.object.getObjectByName('FarmTool_WateringCan')!;
    const stream = view.object.getObjectByName('FarmTool_WaterStream')!;
    const spoutTipLocal = new THREE.Vector3(0.595, 0.327, 0);

    for (const progress of [0.25, 0.4, 0.55, 0.7]) {
      view.sync('tend', progress, 1.2);
      if (!stream.visible) continue;
      can.updateMatrix();
      const tip = spoutTipLocal.clone().applyMatrix4(can.matrix);

      const half = stream.scale.y * 0.5;
      const top = stream.position.y + half;
      const bottom = stream.position.y - half;
      // Ripple is a couple of centimetres, so allow for it at both ends.
      expect(Math.abs(top - tip.y)).toBeLessThan(0.05);
      expect(bottom).toBeGreaterThan(0);
      expect(bottom).toBeLessThan(0.09);
      expect(stream.position.x).toBeCloseTo(tip.x, 5);
      expect(stream.position.z).toBeCloseTo(tip.z, 5);
    }
    view.dispose();
  });

  it('synchronises work particles to tool contact instead of anticipation', () => {
    for (const action of ['plant', 'tend', 'harvest'] as const) {
      expect(hasReachedActionContact(action, ACTION_EFFECT_CONTACT[action] - 0.01)).toBe(false);
      expect(hasReachedActionContact(action, ACTION_EFFECT_CONTACT[action])).toBe(true);
    }
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
