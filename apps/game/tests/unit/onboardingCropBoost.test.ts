import { describe, expect, it } from 'vitest';
import { plotStage } from '@farmrise/shared';
import { OnboardingCropBoost } from '@game/onboarding/OnboardingCropBoost.js';
import { plant, tend } from '@game/world/FarmCommands.js';
import { makeCareer } from '../helpers/career.js';

describe('OnboardingCropBoost', () => {
  it('ripens the first crop watered on the tend beat in a few seconds', () => {
    const career = makeCareer();
    const world = career.world;
    const plotId = world.fields.placements[0]!.id;
    const boost = new OnboardingCropBoost(career);

    plant(career, plotId, 'wheat');
    tend(career, plotId);
    for (let tick = 0; tick < 210 && plotStage(world.getPlot(plotId)!) !== 'ready'; tick += 1) {
      boost.update(true);
      career.advance(1);
    }

    expect(plotStage(world.getPlot(plotId)!)).toBe('ready');
  });

  it('leaves normal crop timing unchanged outside the tend beat', () => {
    const career = makeCareer();
    const world = career.world;
    const plotId = world.fields.placements[0]!.id;
    const boost = new OnboardingCropBoost(career);

    plant(career, plotId, 'wheat');
    tend(career, plotId);
    for (let tick = 0; tick < 420; tick += 1) {
      boost.update(false);
      career.advance(1);
    }

    expect(plotStage(world.getPlot(plotId)!)).toBe('growing');
  });
});
