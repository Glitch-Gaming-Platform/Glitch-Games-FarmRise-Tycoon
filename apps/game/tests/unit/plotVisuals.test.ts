/**
 * Growth-stage mapping.
 *
 * This is the code that decides which of the four authored crop meshes a
 * plot shows, so it is the direct implementation of the art direction's
 * central promise: if it looks ready, it IS ready. The last test in this
 * file is that promise expressed as an assertion.
 */
import { describe, expect, it } from 'vitest';
import {
  advancePlot,
  asPlotId,
  emptyPlot,
  plantCrop,
  plotStage,
  requireCrop,
} from '@farmrise/shared';
import { cropMeshName, cropStress, stagePopScale, visualStage } from '@game/world/view/PlotView.js';

const plant = (cropId: string) => plantCrop(emptyPlot(asPlotId('p1')), cropId);

describe('visualStage', () => {
  it('starts a fresh planting at stage 1', () => {
    expect(visualStage(plant('wheat'))).toBe(1);
  });

  it('advances through all four stages as the crop grows', () => {
    const crop = requireCrop('wheat');
    const seen = new Set<number>();
    let plot = { ...plant('wheat'), irrigated: true };
    for (let i = 0; i < crop.growthTicks * 1.2; i += 30) {
      seen.add(visualStage(plot));
      plot = advancePlot(plot, 30);
    }
    seen.add(visualStage(plot));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
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

  it('reserves stage 4 strictly for harvestable crops', () => {
    // The whole art direction rests on this: the gold/orange colour flip is
    // a promise, and a stage-4 mesh on an unharvestable plot would break it.
    const crop = requireCrop('pumpkin');
    let plot = { ...plant('pumpkin'), irrigated: true };
    for (let i = 0; i < crop.growthTicks * 1.3; i += 10) {
      plot = advancePlot(plot, 10);
      if (visualStage(plot) === 4) {
        expect(plotStage(plot)).toBe('ready');
      }
      if (plotStage(plot) === 'ready') {
        expect(visualStage(plot)).toBe(4);
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
    for (const cropId of ['wheat', 'corn', 'pumpkin']) {
      for (const stage of [1, 2, 3, 4] as const) {
        expect(cropMeshName(cropId, stage)).toMatch(/^SM_crop_[a-z]+_s[1-4]$/);
      }
    }
  });
});

describe('crop animation presentation', () => {
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
});
