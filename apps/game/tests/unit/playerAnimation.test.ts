import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { PhysicsPort } from '@engine/physics/PhysicsPort.js';
import type { FarmWorld } from '../../src/game/world/FarmWorld.js';
import type { GameAction } from '../../src/game/GameActions.js';
import { Player } from '../../src/game/player/Player.js';
import {
  ACTION_EFFECT_CAPACITY,
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

function advance(controller: PlayerController, ticks = 30): void {
  for (let tick = 0; tick < ticks; tick += 1) controller.fixedUpdate(context);
}

describe('player animation state', () => {
  it('marks walking and sprinting with distinct locomotion intensities', () => {
    const walking = makeController({ moveForward: true });
    walking.controller.fixedUpdate(context);
    expect(walking.player.activity).toBe('walking');
    expect(walking.player.locomotionIntensity).toBeCloseTo(0.2 / walking.player.walkSpeed);
    advance(walking.controller, 29);
    expect(walking.player.locomotionIntensity).toBe(1);

    const sprinting = makeController({ moveForward: true, sprint: true });
    sprinting.controller.fixedUpdate(context);
    expect(sprinting.player.activity).toBe('walking');
    expect(sprinting.player.locomotionIntensity).toBeCloseTo(0.2 / sprinting.player.walkSpeed);
    advance(sprinting.controller, 29);
    expect(sprinting.player.locomotionIntensity).toBe(sprinting.player.sprintMultiplier);

    const analog = makeController({ moveForward: 0.4 });
    advance(analog.controller);
    expect(analog.player.locomotionIntensity).toBeCloseTo(0.4);
    expect(Math.abs(analog.player.position.z)).toBeLessThan(Math.abs(walking.player.position.z));
  });

  it('returns to a still pose when movement stops or work begins', () => {
    const moving = makeController({ moveRight: true });
    advance(moving.controller);
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
    const waterSplash = view.object.getObjectByName('FarmTool_WaterSplash');
    const waterCrown = view.object.getObjectByName('FarmTool_WaterCrown');
    const waterContact = view.object.getObjectByName('FarmTool_WaterContact');
    const sickle = view.object.getObjectByName('FarmTool_Sickle');
    const harvestArc = view.object.getObjectByName('FarmTool_HarvestArc');
    const trowel = view.object.getObjectByName('FarmTool_Trowel');

    view.sync('plant', 0.5, 1);
    expect(trowel?.visible).toBe(true);
    expect(wateringCan?.visible).toBe(false);
    const trowelGrip = view.gripPosition(new THREE.Vector3());
    expect(trowelGrip).not.toBeNull();
    expect(trowelGrip?.y).toBeGreaterThan(0.45);
    expect(trowelGrip?.y).toBeLessThan(0.58);
    expect(trowelGrip?.z).toBeGreaterThan(0.38);
    const trowelBladeTip = new THREE.Vector3(0, -0.1, 0);
    trowel?.updateMatrix();
    if (trowel) trowelBladeTip.applyMatrix4(trowel.matrix);
    expect(trowelBladeTip.y).toBeGreaterThan(0.11);
    expect(trowelBladeTip.y).toBeLessThan(0.17);
    expect(trowelBladeTip.z).toBeGreaterThan(0.78);

    view.sync('tend', 0.5, 1.2);
    expect(wateringCan?.visible).toBe(true);
    expect(waterStream?.visible).toBe(true);
    expect(waterStream).toBeInstanceOf(THREE.Mesh);
    expect(waterStream).not.toBeInstanceOf(THREE.InstancedMesh);
    expect(waterStream?.userData['fragmentCount']).toBe(3);
    expect(waterStream?.userData['motion']).toBe('ballistic-ribbon-fragments');
    expect((waterStream as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(
      ((waterStream as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity,
    ).toBeGreaterThanOrEqual(0.84);
    expect(
      ((waterStream as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity,
    ).toBeLessThanOrEqual(0.88);
    expect(((waterStream as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()).toBe(
      0xa9ecff,
    );
    const splashParameters = (
      waterSplash as THREE.InstancedMesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
    ).geometry.parameters;
    expect(splashParameters.radius).toBeCloseTo(0.14, 5);
    expect(splashParameters.segments).toBeGreaterThanOrEqual(8);
    expect((waterSplash as THREE.InstancedMesh).count).toBe(4);
    expect(waterCrown).toBeInstanceOf(THREE.InstancedMesh);
    expect((waterCrown as THREE.InstancedMesh).geometry).toBeInstanceOf(THREE.OctahedronGeometry);
    expect(waterCrown?.visible).toBe(true);
    expect(waterCrown?.userData['poolCapacity']).toBe(7);
    const crownColours = (waterCrown as THREE.InstancedMesh).instanceColor;
    expect(crownColours).not.toBeNull();
    for (let index = 0; index < (crownColours?.count ?? 0); index += 1) {
      expect(
        (crownColours?.getX(index) ?? 0) +
          (crownColours?.getY(index) ?? 0) +
          (crownColours?.getZ(index) ?? 0),
      ).toBeGreaterThan(0.8);
    }
    expect(waterContact?.visible).toBe(true);
    expect((waterContact as THREE.Mesh).geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(
      ((waterContact as THREE.Mesh).material as THREE.MeshBasicMaterial).alphaMap,
    ).toBeInstanceOf(THREE.DataTexture);
    expect(waterContact?.userData['motion']).toBe('soft-soil-build-and-decay');
    expect(waterContact?.userData['edge']).toBe('procedural-feathered');
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

  it('keeps low watering on the original three-draw effect path', () => {
    const view = new PlayerToolView(null, false);
    const waterEffects = view.object.children.filter((child) =>
      child.name.startsWith('FarmTool_Water'),
    );
    const stream = view.object.getObjectByName('FarmTool_WaterStream') as THREE.Mesh;
    const drops = view.object.getObjectByName('FarmTool_WaterDrops') as THREE.InstancedMesh;
    const splash = view.object.getObjectByName('FarmTool_WaterSplash') as THREE.Mesh;
    const can = view.object.getObjectByName('FarmTool_WateringCan')!;
    const grip = new THREE.Vector3();
    const support = new THREE.Vector3();

    expect(waterEffects).toHaveLength(4);
    expect(waterEffects.map((effect) => effect.name)).toEqual([
      'FarmTool_WateringCan',
      'FarmTool_WaterStream',
      'FarmTool_WaterDrops',
      'FarmTool_WaterSplash',
    ]);
    expect(view.object.getObjectByName('FarmTool_WaterCrown')).toBeUndefined();
    expect(view.object.getObjectByName('FarmTool_WaterContact')).toBeUndefined();
    expect(stream.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(stream.userData['fragmentCount']).toBeUndefined();
    expect((stream.geometry as THREE.CylinderGeometry).parameters.radiusTop).toBeCloseTo(0.024, 5);
    expect((stream.geometry as THREE.CylinderGeometry).parameters.radiusBottom).toBeCloseTo(
      0.04,
      5,
    );
    expect(drops.count).toBe(5);
    expect(splash).not.toBeInstanceOf(THREE.InstancedMesh);
    expect(splash.geometry).toBeInstanceOf(THREE.TorusGeometry);
    expect((splash.geometry as THREE.TorusGeometry).parameters.radius).toBeCloseTo(0.14, 5);
    expect((splash.geometry as THREE.TorusGeometry).parameters.tube).toBeCloseTo(0.018, 5);
    expect(drops.material).toBe(stream.material);
    expect(new Set([stream.material, drops.material, splash.material]).size).toBe(2);
    expect((stream.material as THREE.MeshBasicMaterial).depthTest).toBe(false);
    expect((splash.material as THREE.MeshBasicMaterial).depthTest).toBe(false);
    expect((stream.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xa9ecff);
    expect((splash.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x8fe4f4);

    view.sync('tend', 0.5, 1.2);
    expect(stream.visible).toBe(true);
    expect(drops.visible).toBe(true);
    expect(splash.visible).toBe(true);
    expect(splash.position.y).toBeCloseTo(0.145, 5);
    expect(can.position.x).toBeCloseTo(-0.22, 5);
    expect(can.position.y).toBeCloseTo(0.54, 5);
    expect(can.position.z).toBeCloseTo(0.71, 5);
    expect(can.rotation.y - -Math.PI / 2).toBeCloseTo(0.42, 5);
    expect(can.rotation.z).toBeCloseTo(-0.4, 5);
    expect(can.scale.x).toBeCloseTo(0.88, 5);
    expect(view.gripPosition(grip)).not.toBeNull();
    expect(view.supportPosition(support)).not.toBeNull();
    expect(grip.distanceTo(support)).toBeGreaterThan(0.21);
    expect(support.x - grip.x).toBeGreaterThan(0.09);
    expect(support.y).toBeLessThan(grip.y - 0.18);
    const lowTip = new THREE.Vector3(0.595, 0.327, 0);
    can.updateMatrix();
    lowTip.applyMatrix4(can.matrix);
    expect(splash.position.z).toBeCloseTo(lowTip.z - 0.32, 5);
    expect(splash.position.x).toBeCloseTo(0, 5);
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
    expect(Math.abs(spout.x)).toBeLessThan(0.45);
    expect(spout.z).toBeGreaterThan(Math.abs(spout.x) * 2);
    expect(spout.y).toBeLessThan(-0.2);

    // The rose ends up in front of the farmer and still above the soil. It
    // used to fall to 0.26 m once the spout was aimed, because the pour tilt
    // had been tuned while it was rolling the can about its own axis.
    expect(tip.z).toBeGreaterThan(0.6);
    expect(tip.y).toBeGreaterThan(0.35);

    // The contact sits forward of the rose because the stream keeps the
    // spout's forward velocity while gravity bends it down. A contact directly
    // underneath was the hard elbow that made the old pour look like plumbing.
    expect(Math.abs(splash.position.x - tip.x)).toBeLessThan(0.2);
    expect(splash.position.z).toBeGreaterThan(tip.z + 0.12);
    expect(splash.position.y).toBeCloseTo(0.158, 5);
    view.dispose();
  });

  it('centres the Ultra can between a separated grip and visible support contact', () => {
    const view = new PlayerToolView(null);
    const can = view.object.getObjectByName('FarmTool_WateringCan')!;
    const grip = new THREE.Vector3();
    const support = new THREE.Vector3();

    view.sync('tend', 0.5, 1.2);
    expect(view.gripPosition(grip)).not.toBeNull();
    expect(view.supportPosition(support)).not.toBeNull();

    expect(can.position.x).toBeCloseTo(-0.22, 5);
    expect(can.position.y).toBeCloseTo(0.53, 5);
    expect(can.position.z).toBeCloseTo(0.72, 5);
    expect(can.scale.x).toBeCloseTo(0.94, 5);
    expect(can.rotation.y - -Math.PI / 2).toBeCloseTo(0.44, 5);
    expect(can.rotation.z).toBeCloseTo(-0.4, 5);
    expect(grip.distanceTo(support)).toBeGreaterThan(0.25);
    expect(support.x - grip.x).toBeGreaterThan(0.13);
    expect(grip.y - support.y).toBeGreaterThan(0.2);
    expect(support.z - can.position.z).toBeGreaterThan(0.13);
    view.dispose();
  });

  it('keeps broken tapered stream ribbons coherent along a forward ballistic arc', () => {
    const view = new PlayerToolView(null);
    const can = view.object.getObjectByName('FarmTool_WateringCan')!;
    const stream = view.object.getObjectByName('FarmTool_WaterStream') as THREE.Mesh;
    const splash = view.object.getObjectByName('FarmTool_WaterSplash')!;
    const spoutTipLocal = new THREE.Vector3(0.595, 0.327, 0);
    const position = new THREE.Vector3();

    for (const progress of [0.25, 0.4, 0.55, 0.7]) {
      view.sync('tend', progress, 1.2);
      if (!stream.visible) continue;
      can.updateMatrix();
      const tip = spoutTipLocal.clone().applyMatrix4(can.matrix);
      const positions = stream.geometry.getAttribute('position') as THREE.BufferAttribute;
      let nearestTip = Number.POSITIVE_INFINITY;
      let nearestSplash = Number.POSITIVE_INFINITY;
      for (let index = 0; index < positions.count; index += 1) {
        position.fromBufferAttribute(positions, index);
        nearestTip = Math.min(nearestTip, position.distanceTo(tip));
        nearestSplash = Math.min(nearestSplash, position.distanceTo(splash.position));
      }

      expect(nearestTip).toBeLessThan(0.16);
      expect(nearestSplash).toBeLessThan(0.32);
      const firstWidth = position
        .fromBufferAttribute(positions, 0)
        .distanceTo(new THREE.Vector3().fromBufferAttribute(positions, 1));
      const finalFragmentLastQuad = 132;
      const finalWidth = position
        .fromBufferAttribute(positions, finalFragmentLastQuad + 2)
        .distanceTo(new THREE.Vector3().fromBufferAttribute(positions, finalFragmentLastQuad + 5));
      expect(firstWidth).toBeGreaterThan(finalWidth);
      expect(firstWidth).toBeGreaterThan(0.022);
      expect(firstWidth).toBeLessThan(0.04);
      expect(finalWidth).toBeLessThan(0.022);

      const fragmentOneEnd = position
        .fromBufferAttribute(positions, 38)
        .add(new THREE.Vector3().fromBufferAttribute(positions, 41))
        .multiplyScalar(0.5);
      const fragmentTwoStart = new THREE.Vector3()
        .fromBufferAttribute(positions, 48)
        .add(new THREE.Vector3().fromBufferAttribute(positions, 49))
        .multiplyScalar(0.5);
      const fragmentTwoEnd = new THREE.Vector3()
        .fromBufferAttribute(positions, 86)
        .add(new THREE.Vector3().fromBufferAttribute(positions, 89))
        .multiplyScalar(0.5);
      const fragmentThreeStart = new THREE.Vector3()
        .fromBufferAttribute(positions, 96)
        .add(new THREE.Vector3().fromBufferAttribute(positions, 97))
        .multiplyScalar(0.5);
      const firstGap = fragmentOneEnd.distanceTo(fragmentTwoStart);
      const secondGap = fragmentTwoEnd.distanceTo(fragmentThreeStart);
      expect(firstGap).toBeGreaterThan(0.02);
      expect(firstGap).toBeLessThan(0.12);
      expect(secondGap).toBeGreaterThan(0.02);
      expect(secondGap).toBeLessThan(0.12);
      expect(splash.position.z).toBeGreaterThan(tip.z + 0.12);
    }
    view.dispose();
  });

  it('moves stream pieces, partial splash arcs and crown droplets between review beats', () => {
    const view = new PlayerToolView(null);
    const stream = view.object.getObjectByName('FarmTool_WaterStream') as THREE.Mesh;
    const splash = view.object.getObjectByName('FarmTool_WaterSplash') as THREE.InstancedMesh;
    const crown = view.object.getObjectByName('FarmTool_WaterCrown') as THREE.InstancedMesh;
    const drops = view.object.getObjectByName('FarmTool_WaterDrops') as THREE.InstancedMesh;
    const contact = view.object.getObjectByName('FarmTool_WaterContact') as THREE.Mesh;
    const streamGeometry = stream.geometry;
    const streamMaterial = stream.material;
    const dropGeometry = drops.geometry;
    const dropMaterial = drops.material;
    const splashGeometry = splash.geometry;
    const splashMaterial = splash.material;
    const crownGeometry = crown.geometry;
    const crownMaterial = crown.material;
    const contactGeometry = contact.geometry;
    const contactMaterial = contact.material;
    const contactAlpha = (contact.material as THREE.MeshBasicMaterial).alphaMap;
    const matrix = new THREE.Matrix4();
    const sample = (mesh: THREE.InstancedMesh, index: number): number[] => {
      mesh.getMatrixAt(index, matrix);
      return matrix.toArray();
    };
    const sampleContact = (): number[] => {
      contact.updateMatrix();
      return contact.matrix.toArray();
    };

    view.sync('tend', 0.5, 0.52);
    const at520 = {
      stream: Array.from((stream.geometry.getAttribute('position') as THREE.BufferAttribute).array),
      splash: sample(splash, 0),
      crown: sample(crown, 0),
      contact: sampleContact(),
    };
    view.sync('tend', 0.5, 0.72);
    const at720 = {
      stream: Array.from((stream.geometry.getAttribute('position') as THREE.BufferAttribute).array),
      splash: sample(splash, 0),
      crown: sample(crown, 0),
      contact: sampleContact(),
    };
    view.sync('tend', 0.5, 0.92);
    const at920 = {
      stream: Array.from((stream.geometry.getAttribute('position') as THREE.BufferAttribute).array),
      splash: sample(splash, 0),
      crown: sample(crown, 0),
      contact: sampleContact(),
    };

    expect(at720.stream).not.toEqual(at520.stream);
    expect(at920.stream).not.toEqual(at720.stream);
    expect(at720.splash).not.toEqual(at520.splash);
    expect(at920.splash).not.toEqual(at720.splash);
    expect(at720.crown).not.toEqual(at520.crown);
    expect(at920.crown).not.toEqual(at720.crown);
    expect(at720.contact).not.toEqual(at520.contact);
    expect(at920.contact).not.toEqual(at720.contact);
    expect(stream.geometry).toBe(streamGeometry);
    expect(stream.material).toBe(streamMaterial);
    expect(drops.geometry).toBe(dropGeometry);
    expect(drops.material).toBe(dropMaterial);
    expect(splash.geometry).toBe(splashGeometry);
    expect(splash.material).toBe(splashMaterial);
    expect(crown.geometry).toBe(crownGeometry);
    expect(crown.material).toBe(crownMaterial);
    expect(contact.geometry).toBe(contactGeometry);
    expect(contact.material).toBe(contactMaterial);
    expect((contact.material as THREE.MeshBasicMaterial).alphaMap).toBe(contactAlpha);
    view.dispose();
  });

  it('builds an irregular wet-soil patch, then fades it without shrinking to a hard card', () => {
    const view = new PlayerToolView(null);
    const contact = view.object.getObjectByName('FarmTool_WaterContact') as THREE.Mesh;
    const material = contact.material as THREE.MeshBasicMaterial;
    const texture = material.alphaMap as THREE.DataTexture;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const sample = (progress: number): { opacity: number; scale: THREE.Vector3 } => {
      view.sync('tend', progress, 1.2);
      contact.updateMatrix();
      matrix.copy(contact.matrix).decompose(position, rotation, scale);
      return { opacity: material.opacity, scale: scale.clone() };
    };

    const alpha = texture.image.data as Uint8Array;
    const size = texture.image.width as number;
    expect(alpha[0]).toBe(0);
    expect(alpha[Math.floor(size / 2) * size + Math.floor(size / 2)]).toBeGreaterThan(180);
    expect(material.alphaTest).toBe(0);

    const early = sample(0.2);
    const full = sample(0.55);
    const fading = sample(0.82);
    expect(full.scale.x).toBeGreaterThan(early.scale.x + 0.45);
    expect(full.scale.y).toBeGreaterThan(early.scale.y + 0.3);
    expect(fading.scale.x).toBeGreaterThanOrEqual(full.scale.x - 0.03);
    expect(fading.opacity).toBeLessThan(full.opacity * 0.65);
    view.dispose();
  });

  it('synchronises work particles to tool contact instead of anticipation', () => {
    for (const action of ['plant', 'tend', 'harvest'] as const) {
      expect(hasReachedActionContact(action, ACTION_EFFECT_CONTACT[action] - 0.01)).toBe(false);
      expect(hasReachedActionContact(action, ACTION_EFFECT_CONTACT[action])).toBe(true);
    }

    const tools = new PlayerToolView(null);
    const waterStream = tools.object.getObjectByName('FarmTool_WaterStream');
    const waterSplash = tools.object.getObjectByName('FarmTool_WaterSplash');
    const waterCrown = tools.object.getObjectByName('FarmTool_WaterCrown');
    const waterContact = tools.object.getObjectByName('FarmTool_WaterContact');
    const harvestArc = tools.object.getObjectByName('FarmTool_HarvestArc');
    tools.sync('tend', ACTION_EFFECT_CONTACT.tend - 0.01, 1);
    expect(waterStream?.visible).toBe(false);
    expect(waterSplash?.visible).toBe(false);
    expect(waterCrown?.visible).toBe(false);
    expect(waterContact?.visible).toBe(false);
    tools.sync('tend', ACTION_EFFECT_CONTACT.tend, 1.1);
    expect(waterStream?.visible).toBe(true);
    expect(waterSplash?.visible).toBe(true);
    expect(waterCrown?.visible).toBe(true);
    expect(waterContact?.visible).toBe(true);
    tools.sync('harvest', ACTION_EFFECT_CONTACT.harvest - 0.01, 1.2);
    expect(harvestArc?.visible).toBe(false);
    tools.sync('harvest', ACTION_EFFECT_CONTACT.harvest, 1.3);
    expect(harvestArc?.visible).toBe(true);
    tools.dispose();
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

  it('keeps the shared watering burst on the legacy falling-droplet motion', () => {
    const effects = new PlayerActionEffects();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    effects.trigger('tend', 0);
    effects.update(renderContext, 0, 0);
    expect(effects.activeCount).toBe(13);

    const heights: number[] = [];
    for (let index = 0; index < effects.object.count; index += 1) {
      effects.object.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      if (scale.x > 0.01) heights.push(position.y);
    }
    expect(heights).toHaveLength(13);
    expect(Math.min(...heights)).toBeGreaterThan(0.7);

    for (let frame = 0; frame < 18; frame += 1) {
      effects.update(renderContext, 0, 0);
    }
    const laterHeights: number[] = [];
    for (let index = 0; index < effects.object.count; index += 1) {
      effects.object.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      if (scale.x > 0.01) laterHeights.push(position.y);
    }
    expect(Math.max(...laterHeights)).toBeLessThan(Math.max(...heights));
    effects.dispose();
  });

  it('reuses a fixed action-effect pool and lets every contact burst decay', () => {
    const effects = new PlayerActionEffects();
    const geometry = effects.object.geometry;
    const material = effects.object.material;

    for (let index = 0; index < 8; index += 1) {
      effects.trigger(index % 2 === 0 ? 'harvest' : 'tend', index * 0.2);
    }
    effects.update(renderContext, 0, 0);
    expect(effects.object.userData['poolCapacity']).toBe(ACTION_EFFECT_CAPACITY);
    expect(effects.object.count).toBe(ACTION_EFFECT_CAPACITY);
    expect(effects.activeCount).toBeLessThanOrEqual(ACTION_EFFECT_CAPACITY);
    expect(effects.object.geometry).toBe(geometry);
    expect(effects.object.material).toBe(material);

    for (let frame = 0; frame < 100; frame += 1) {
      effects.update({ ...renderContext, deltaSeconds: 1 / 60 }, 0, 0);
    }
    expect(effects.activeCount).toBe(0);
    expect(effects.object.visible).toBe(false);
    effects.dispose();
  });
});
