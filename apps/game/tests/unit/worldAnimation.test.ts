import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { IncidentInstance } from '@farmrise/shared';
import { Fox } from '../../src/game/enemies/Fox.js';
import { build } from '../../src/game/world/FarmCommands.js';
import { FarmView } from '../../src/game/world/view/FarmView.js';
import { createFarmMaterials } from '../../src/game/world/view/materials.js';
import {
  buildingOperationalMotion,
  StructureView,
} from '../../src/game/world/view/StructureView.js';
import { constructionProgressState } from '../../src/game/world/view/ConstructionProgressView.js';
import { groundGoodsActionLabel } from '../../src/game/world/view/GroundGoodsView.js';
import { proximityMeterAnchor } from '../../src/game/world/view/ProximityStatusView.js';
import { fundedCareer, makeCareer } from '../helpers/career.js';

describe('world animation state', () => {
  it('labels visible animal products with the same keyboard and touch action', () => {
    expect(groundGoodsActionLabel('eggs', 1)).toBe('Pick up 1 Egg · E / Work');
    expect(groundGoodsActionLabel('eggs', 3)).toBe('Pick up 3 Eggs · E / Work');
    expect(groundGoodsActionLabel('milk', 12)).toBe('Pick up 12 Milk · E / Work');
    expect(groundGoodsActionLabel('pea', 5)).toBe('Pick up 5 Peas · E / Work');
  });

  it('anchors water and spoilage gauges above their world objects', () => {
    const world = makeCareer({}, 'meter-anchors').world;
    const placement = world.fields.placements[0]!;
    const plotAt = world.grid.tileToWorld(placement.tileX, placement.tileZ);
    const plotAnchor = proximityMeterAnchor(world, {
      kind: 'water',
      target: { kind: 'plot', id: placement.id },
      label: 'Water',
      value: 0.5,
      detail: 'Dry in 1m',
      urgent: false,
    });
    expect(plotAnchor).toEqual({ x: plotAt.x, y: 1.75, z: plotAt.z });

    world.dropAt(placement.tileX, placement.tileZ, 'wheat', 4, 1);
    const stack = world.stores.stores.find((store) => store.id.startsWith('stack-'))!;
    const stackAt = world.grid.tileToWorld(stack.tileX, stack.tileZ);
    const stackAnchor = proximityMeterAnchor(world, {
      kind: 'freshness',
      target: { kind: 'store', id: stack.id },
      label: '4 Wheat freshness',
      value: 0.8,
      detail: '1 spoils in 1m — left in field',
      urgent: false,
    });
    expect(stackAnchor).toEqual({ x: stackAt.x, y: 1.15, z: stackAt.z });
  });

  it('reports construction percentage and remaining time for the overhead bar', () => {
    const start = constructionProgressState('barn', 5_400);
    const middle = constructionProgressState('barn', 2_700);
    expect(start.progress).toBe(0);
    expect(middle.progress).toBeCloseTo(0.5);
    expect(middle.label).toContain('Barn');
    expect(middle.label).toContain('45s');
  });

  it('raises a construction visual through progress and pops it on completion', () => {
    const career = fundedCareer();
    const world = career.world;
    expect(build(career, 'road', 10, 12).ok).toBe(true);
    const materials = createFarmMaterials();
    const view = new StructureView(world, materials);
    const visual = view.object.children.find((child) => child.userData['building']);
    expect(visual).toBeDefined();

    career.advance(300);
    view.animate(1);
    expect(visual!.scale.y).toBeGreaterThan(0.7);
    expect(visual!.scale.y).toBeLessThan(1);

    career.advance(300);
    view.sync(world);
    view.animate(1.1);
    const completed = view.object.children.find((child) => child.userData['building']);
    expect(completed?.scale.y).toBeGreaterThan(1);

    view.dispose();
    materials.dispose();
  });

  it('runs processor parts only while useful and stops them when broken', () => {
    const idleMill = buildingOperationalMotion('mill', 2, false, false);
    const busyMill = buildingOperationalMotion('mill', 2, true, false);
    const brokenMill = buildingOperationalMotion('mill', 2, true, true);
    const coldStore = buildingOperationalMotion('cold_store', 2, false, false);

    expect(idleMill.active).toBe(false);
    expect(idleMill.rotorAngle).toBe(0);
    expect(busyMill.active).toBe(true);
    expect(busyMill.rotorAngle).toBeGreaterThan(3);
    expect(brokenMill.active).toBe(false);
    expect(brokenMill.shake).not.toBe(0);
    expect(coldStore.active).toBe(true);
  });

  it('turns an active drought into a visible lighting shift', () => {
    const world = makeCareer({}, 'weather-view').world;
    const view = new FarmView(world);
    const sun = view.object.children.find(
      (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight,
    );
    expect(sun).toBeDefined();
    const normalColour = sun!.color.getHex();
    const drought: IncidentInstance = {
      id: 'view-drought',
      definitionId: 'incident-drought',
      siteId: world.id,
      severity: 'minor',
      warnedTick: 0,
      impactTick: 1,
      endsTick: 60,
      targetIds: ['plot-1'],
      responseKind: null,
      responseProgress: 0,
      resolved: false,
      appliedMultiplier: 0.35,
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
    const world = makeCareer({}, 'fox-view').world;
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
