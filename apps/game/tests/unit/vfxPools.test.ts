import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { IncidentInstance } from '@farmrise/shared';
import { RenderPipeline } from '../../src/engine/render/RenderPipeline.js';
import { FarmImpactEffects } from '../../src/game/world/view/FarmImpactEffects.js';
import { PooledWorldEffects } from '../../src/game/world/view/PooledWorldEffects.js';
import {
  REPAIR_EFFECT_CONTACT,
  StructureEffectsView,
} from '../../src/game/world/view/StructureEffectsView.js';
import { StructureOperationEffects } from '../../src/game/world/view/StructureOperationEffects.js';
import { makeCareer } from '../helpers/career.js';

describe('pooled environmental effects', () => {
  it('wraps fixed particle/ring pools and visibly decays without replacing GPU resources', () => {
    const effects = new PooledWorldEffects(4, 2);
    const particleGeometry = effects.particles.geometry;
    const particleMaterial = effects.particles.material;
    const ringGeometry = effects.rings.geometry;

    effects.emitBurst({
      x: 0,
      y: 0.1,
      z: 0,
      count: 9,
      radius: 0.3,
      speed: 0.5,
      lift: 0.5,
      duration: 0.24,
      size: 0.8,
      gravity: 1,
      drag: 1,
      colours: [0xc9b896, 0xe0bc6a],
    });
    for (let index = 0; index < 5; index += 1) {
      effects.emitRing({
        x: index,
        y: 0.05,
        z: 0,
        duration: 0.2,
        startRadius: 0.1,
        endRadius: 1,
        colour: 0x83c4d1,
      });
    }
    effects.update(1 / 60);

    expect(effects.particleCapacity).toBe(4);
    expect(effects.ringCapacity).toBe(2);
    expect(effects.activeParticleCount).toBe(4);
    expect(effects.activeRingCount).toBe(2);
    expect(effects.particles.geometry).toBe(particleGeometry);
    expect(effects.particles.material).toBe(particleMaterial);
    expect(effects.rings.geometry).toBe(ringGeometry);

    for (let frame = 0; frame < 40; frame += 1) effects.update(1 / 60);
    expect(effects.activeParticleCount).toBe(0);
    expect(effects.activeRingCount).toBe(0);
    expect(effects.particles.visible).toBe(false);
    expect(effects.rings.visible).toBe(false);
    effects.dispose();
  });

  it('uses one fixed structure pool for completion, breakdown and repair beats', () => {
    const world = makeCareer({}, 'structure-effects').world;
    const effects = new StructureEffectsView(world, null);
    world.structures.add({
      id: 'effects-mill',
      kind: 'mill',
      tileX: 10,
      tileZ: 20,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: false,
    });
    const building = world.structures.get('effects-mill')!;
    const operationPuffs = effects.object.getObjectByName(
      'StructureOperationPuffs',
    ) as THREE.InstancedMesh;

    world.structures.events.emit('building:completed', {
      id: 'review-completion',
      kind: 'barn',
      tileX: 10,
      tileZ: 10,
    });
    effects.update(1, 1 / 60);
    expect(effects.activeParticleCount).toBeGreaterThan(0);
    expect(effects.particleCapacity).toBe(96);

    world.structures.setBroken(building.id, true);
    effects.update(1.1, 1 / 60);
    expect(operationPuffs.count).toBeGreaterThan(0);
    world.structures.setBroken(building.id, false);
    expect(effects.repairPending).toBe(true);
    effects.update(1.2, 1 / 60, 'repair', REPAIR_EFFECT_CONTACT - 0.01);
    expect(effects.repairPending).toBe(true);
    effects.update(1.3, 1 / 60, 'repair', REPAIR_EFFECT_CONTACT);
    expect(effects.repairPending).toBe(false);
    expect(effects.activeParticleCount).toBeLessThanOrEqual(effects.particleCapacity);
    effects.dispose();
  });

  it('owns one reusable operation pool and a capped set of non-shadowing local lights', () => {
    const world = makeCareer({}, 'structure-operation-effects').world;
    world.structures.add({
      id: 'operation-cold-store',
      kind: 'cold_store',
      tileX: 8,
      tileZ: 12,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: false,
    });
    world.structures.add({
      id: 'operation-broken-mill',
      kind: 'mill',
      tileX: 14,
      tileZ: 18,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: true,
    });
    const pipeline = new RenderPipeline({ tier: 'ultra' });
    const effects = new StructureOperationEffects(world, pipeline);
    const puffs = effects.object.getObjectByName('StructureOperationPuffs') as THREE.InstancedMesh;
    const geometry = puffs.geometry;
    const material = puffs.material;
    const instanceMatrix = puffs.instanceMatrix;

    effects.update(1);
    expect(puffs.count).toBeGreaterThan(0);
    expect(puffs.instanceMatrix.count).toBe(30);
    const lights = effects.object.children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight,
    );
    expect(lights).toHaveLength(3);
    expect(lights.every((light) => !light.castShadow)).toBe(true);
    expect(lights.some((light) => light.intensity > 0)).toBe(true);

    effects.update(2);
    expect(puffs.geometry).toBe(geometry);
    expect(puffs.material).toBe(material);
    expect(puffs.instanceMatrix).toBe(instanceMatrix);

    effects.dispose();
    pipeline.dispose();
  });

  it('transitions incident beats locally and caps Ultra response lights', () => {
    const world = makeCareer({}, 'incident-effects').world;
    const placement = world.fields.placements[0]!;
    const pipeline = new RenderPipeline({ tier: 'ultra' });
    const effects = new FarmImpactEffects(pipeline);
    const warning: IncidentInstance = {
      id: 'effects-drought',
      definitionId: 'incident-drought',
      siteId: world.id,
      severity: 'minor',
      warnedTick: 0,
      impactTick: 60,
      endsTick: 120,
      targetIds: [placement.id],
      responseKind: null,
      responseProgress: 0,
      resolved: false,
      appliedMultiplier: null,
    };

    effects.syncIncident(world, warning, null, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 1,
      alpha: 0,
    });
    expect(effects.activeParticleCount).toBeGreaterThan(0);
    const lights = effects.object.children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight,
    );
    expect(lights).toHaveLength(3);
    expect(lights[0]?.intensity).toBeGreaterThan(0);

    for (let frame = 0; frame < 90; frame += 1) {
      effects.syncIncident(world, warning, null, {
        deltaSeconds: 1 / 60,
        elapsedSeconds: 1 + frame / 60,
        alpha: 0,
      });
    }
    expect(effects.activeParticleCount).toBe(0);

    effects.syncIncident(world, { ...warning, appliedMultiplier: 0.35 }, null, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 3,
      alpha: 0,
    });
    expect(effects.activeParticleCount).toBeGreaterThan(0);
    effects.dispose();
    pipeline.dispose();
  });
});
