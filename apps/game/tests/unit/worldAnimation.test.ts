import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ActiveFarmEvent } from '../../src/game/events/EventDirector.js';
import { Fox } from '../../src/game/enemies/Fox.js';
import { build } from '../../src/game/world/FarmCommands.js';
import { FarmWorld } from '../../src/game/world/FarmWorld.js';
import { STARTER_FARM } from '../../src/game/world/levels/starterFarm.js';
import { FarmView } from '../../src/game/world/view/FarmView.js';
import { createFarmMaterials } from '../../src/game/world/view/materials.js';
import { StructureView } from '../../src/game/world/view/StructureView.js';

describe('world animation state', () => {
  it('raises a construction visual through progress and pops it on completion', () => {
    const world = new FarmWorld(STARTER_FARM, 7);
    expect(build(world, 'road', 10, 10).ok).toBe(true);
    const materials = createFarmMaterials();
    const view = new StructureView(world, materials);
    const visual = view.object.children.find((child) => child.userData['building']);
    expect(visual).toBeDefined();

    world.advance(300);
    view.animate(1);
    expect(visual!.scale.y).toBeGreaterThan(0.7);
    expect(visual!.scale.y).toBeLessThan(1);

    world.advance(300);
    view.sync(world);
    view.animate(1.1);
    const completed = view.object.children.find((child) => child.userData['building']);
    expect(completed?.scale.y).toBeGreaterThan(1);

    view.dispose();
    materials.dispose();
  });

  it('turns an active drought into a visible lighting shift', () => {
    const world = new FarmWorld(STARTER_FARM, 9);
    const view = new FarmView(world);
    const sun = view.object.children.find(
      (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight,
    );
    expect(sun).toBeDefined();
    const normalColour = sun!.color.getHex();
    const drought: ActiveFarmEvent = {
      kind: 'drought',
      phase: 'active',
      remainingTicks: 60,
      mitigated: false,
      targets: ['plot-1'],
    };

    for (let i = 0; i < 10; i += 1) {
      view.sync(world, [], drought, {
        deltaSeconds: 0.2,
        elapsedSeconds: i * 0.2,
        alpha: 0,
      });
    }
    expect(sun!.color.getHex()).not.toBe(normalColour);
    expect(sun!.intensity).toBeGreaterThan(2.3);
    view.dispose();
  });

  it('gives a raiding fox a stronger pounce silhouette than its idle pose', () => {
    const world = new FarmWorld(STARTER_FARM, 11);
    const view = new FarmView(world);
    const fox = new Fox(0, 0, { x: 0, z: 0 });
    fox.state = 'raiding';
    view.sync(world, [fox], null, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 0.3,
      alpha: 0,
    });
    const mesh = view.object.children.find(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && child.geometry.type === 'ConeGeometry',
    );
    expect(mesh?.scale.z).toBeGreaterThan(1.05);
    expect(mesh?.rotation.x).toBeLessThan(-0.15);
    view.dispose();
  });
});
