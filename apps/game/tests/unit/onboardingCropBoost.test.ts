import { describe, expect, it } from 'vitest';
import { plotStage } from '@farmrise/shared';
import { OnboardingCropBoost } from '@game/onboarding/OnboardingCropBoost.js';
import { FarmWorld } from '@game/world/FarmWorld.js';
import { plant, tend } from '@game/world/FarmCommands.js';
import { STARTER_FARM } from '@game/world/levels/starterFarm.js';

describe('OnboardingCropBoost', () => {
  it('ripens the first crop watered on the tend beat in a few seconds', () => {
    const world = new FarmWorld(STARTER_FARM, 42);
    const plotId = STARTER_FARM.plots[0]!.id;
    const boost = new OnboardingCropBoost(world);

    plant(world, plotId, 'wheat');
    tend(world, plotId);
    for (let tick = 0; tick < 210 && plotStage(world.getPlot(plotId)!) !== 'ready'; tick += 1) {
      boost.update(true);
      world.advance(1);
    }

    expect(plotStage(world.getPlot(plotId)!)).toBe('ready');
  });

  it('leaves normal crop timing unchanged outside the tend beat', () => {
    const world = new FarmWorld(STARTER_FARM, 42);
    const plotId = STARTER_FARM.plots[0]!.id;
    const boost = new OnboardingCropBoost(world);

    plant(world, plotId, 'wheat');
    tend(world, plotId);
    for (let tick = 0; tick < 420; tick += 1) {
      boost.update(false);
      world.advance(1);
    }

    expect(plotStage(world.getPlot(plotId)!)).toBe('growing');
  });
});
