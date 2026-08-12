/**
 * Growth-stage mapping.
 *
 * This is the code that decides which of the four authored crop meshes a
 * plot shows, so it is the direct implementation of the art direction's
 * central promise: if it looks ready, it IS ready. The last test in this
 * file is that promise expressed as an assertion.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CROP_IDS,
  advancePlot,
  asPlotId,
  emptyPlot,
  plantCrop,
  plotStage,
  requireCrop,
} from '@farmrise/shared';
import {
  CROP_WIND,
  cropMeshName,
  cropStress,
  stagePopScale,
  visualStage,
} from '@game/world/view/PlotView.js';
import { PlotView } from '@game/world/view/PlotView.js';
import { createFarmMaterials } from '@game/world/view/materials.js';
import { makeCareer } from '../helpers/career.js';

const plant = (cropId: string) => plantCrop(emptyPlot(asPlotId('p1')), cropId);

describe('visualStage', () => {
  it('starts a fresh planting at stage 1', () => {
    expect(visualStage(plant('wheat'))).toBe(1);
  });

  it('advances every crop through all four authored stages', () => {
    for (const cropId of CROP_IDS) {
      const crop = requireCrop(cropId);
      const seen = new Set<number>();
      let plot = { ...plant(cropId), irrigated: true };
      for (let i = 0; i < crop.growthTicks * 1.2; i += 30) {
        seen.add(visualStage(plot));
        plot = advancePlot(plot, 30);
      }
      seen.add(visualStage(plot));
      expect([...seen].sort(), cropId).toEqual([1, 2, 3, 4]);
    }
  });

  it('never skips a stage', () => {
    const crop = requireCrop('corn');
    let plot = { ...plant('corn'), irrigated: true };
    let previous = visualStage(plot);
    for (let i = 0; i < crop.growthTicks * 1.2; i += 15) {
      plot = advancePlot(plot, 15);
      const current = visualStage(plot);
      expect(current - previous).toBeLessThanOrEqual(1);
      previous = current;
    }
  });

  it('reserves every crop stage 4 strictly for harvestable crops', () => {
    // The whole art direction rests on this: the gold/orange colour flip is
    // a promise, and a stage-4 mesh on an unharvestable plot would break it.
    for (const cropId of CROP_IDS) {
      const crop = requireCrop(cropId);
      let plot = { ...plant(cropId), irrigated: true };
      for (let i = 0; i < crop.growthTicks * 1.3; i += 10) {
        plot = advancePlot(plot, 10);
        if (visualStage(plot) === 4) {
          expect(plotStage(plot), cropId).toBe('ready');
        }
        if (plotStage(plot) === 'ready') {
          expect(visualStage(plot), cropId).toBe(4);
        }
      }
    }
  });
});

describe('cropMeshName', () => {
  it('matches the names the Blender build exports', () => {
    expect(cropMeshName('wheat', 4)).toBe('SM_crop_wheat_s4');
    expect(cropMeshName('pumpkin', 1)).toBe('SM_crop_pumpkin_s1');
  });

  it('covers every crop and stage the build produces', () => {
    for (const cropId of CROP_IDS) {
      for (const stage of [1, 2, 3, 4] as const) {
        expect(cropMeshName(cropId, stage)).toMatch(/^SM_crop_[a-z]+_s[1-4]$/);
      }
    }
  });
});

describe('crop animation presentation', () => {
  it('keeps every crop rooted with a species-scale wind profile', () => {
    expect(Object.keys(CROP_WIND).sort()).toEqual([...CROP_IDS].sort());
    for (const profile of Object.values(CROP_WIND)) {
      expect(profile.baseHeight).toBeGreaterThanOrEqual(0);
      expect(profile.fullHeight).toBeGreaterThan(profile.baseHeight);
      expect(profile.strength).toBeLessThanOrEqual(0.08);
      expect(profile.speed).toBeGreaterThan(0);
    }

    expect(CROP_WIND.radish.speed).toBeGreaterThan(CROP_WIND.beetroot.speed);
    expect(CROP_WIND.radish.torsion).toBeLessThan(CROP_WIND.beetroot.torsion);
    expect(CROP_WIND.cranberry.fullHeight).toBeLessThan(CROP_WIND.grape.fullHeight);
    expect(CROP_WIND.avocado.cantilever).toBe(true);
  });

  it('settles a new growth stage from a rooted pop to full scale', () => {
    const start = stagePopScale(0);
    const middle = stagePopScale(0.24);
    const settled = stagePopScale(1);

    expect(start.vertical).toBeLessThan(start.horizontal);
    expect(middle.vertical).toBeGreaterThan(start.vertical);
    expect(settled).toEqual({ horizontal: 1, vertical: 1 });
  });

  it('turns drought, event damage and disease into visible crop stress', () => {
    const healthy = plant('wheat');
    expect(cropStress(healthy)).toBe(0);
    expect(cropStress({ ...healthy, water: 0.2 })).toBeGreaterThan(0.5);
    expect(cropStress({ ...healthy, eventMultiplier: 0.4 })).toBeCloseTo(0.6);
    expect(cropStress({ ...healthy, diseased: true })).toBe(0.72);
  });

  it('keeps dynamically re-bucketed plot instances out of stale frustum bounds', () => {
    const world = makeCareer().world;
    const materials = createFarmMaterials();
    const view = new PlotView(world, materials);
    const instances: THREE.InstancedMesh[] = [];
    view.object.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) instances.push(node);
    });
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.every((mesh) => mesh.frustumCulled === false)).toBe(true);
    view.dispose();
    materials.dispose();
  });
});
