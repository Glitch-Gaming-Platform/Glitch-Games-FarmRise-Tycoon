import { describe, expect, it } from 'vitest';
import {
  GAME_DAY_TICKS,
  MIN_SOIL,
  SOIL_BAND_LABELS,
  rotationFactor,
  soilAfterFallow,
  soilAfterHarvest,
  soilBand,
  soilYieldFactor,
} from '../src/index.js';

describe('soilYieldFactor', () => {
  it('rewards rich ground and never reduces a bed to nothing', () => {
    expect(soilYieldFactor(1)).toBeGreaterThan(1);
    expect(soilYieldFactor(MIN_SOIL)).toBeGreaterThan(0.4);
    expect(soilYieldFactor(0)).toBe(soilYieldFactor(MIN_SOIL));
  });

  it('falls monotonically as the ground is worked out', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let soil = 1; soil >= 0; soil -= 0.1) {
      const factor = soilYieldFactor(soil);
      expect(factor).toBeLessThanOrEqual(previous + 1e-9);
      previous = factor;
    }
  });
});

describe('rotationFactor', () => {
  it('rewards following a crop with a different one', () => {
    expect(rotationFactor('wheat', 'corn')).toBeGreaterThan(1);
  });

  it('penalises planting the same thing twice', () => {
    expect(rotationFactor('wheat', 'wheat')).toBeLessThan(1);
  });

  it('is neutral on ground with no history', () => {
    expect(rotationFactor(null, 'wheat')).toBe(1);
  });
});

describe('soilAfterHarvest', () => {
  it('takes more out of the ground for a hungry crop than a light one', () => {
    expect(soilAfterHarvest(1, 'pumpkin')).toBeLessThan(soilAfterHarvest(1, 'wheat'));
  });

  it('puts nutrient back when the crop is a restorative one', () => {
    expect(soilAfterHarvest(0.5, 'clover')).toBeGreaterThan(0.5);
  });

  it('depletes faster under a specialization that strains the land', () => {
    expect(soilAfterHarvest(1, 'wheat', 1.35)).toBeLessThan(soilAfterHarvest(1, 'wheat', 1));
  });

  it('never leaves soil outside 0..1', () => {
    expect(soilAfterHarvest(0, 'pumpkin')).toBeGreaterThanOrEqual(0);
    expect(soilAfterHarvest(1, 'clover')).toBeLessThanOrEqual(1);
  });
});

describe('soilAfterFallow', () => {
  it('recovers a resting bed over time', () => {
    expect(soilAfterFallow(0.5, GAME_DAY_TICKS)).toBeGreaterThan(0.5);
  });

  it('stops at full fertility', () => {
    expect(soilAfterFallow(1, GAME_DAY_TICKS * 50)).toBe(1);
    expect(soilAfterFallow(0.99, GAME_DAY_TICKS * 50)).toBe(1);
  });

  it('is slower than working the bed depletes it, so rotation is a real cost', () => {
    const restedForADay = soilAfterFallow(0.5, GAME_DAY_TICKS) - 0.5;
    const takenByOneCrop = 0.5 - soilAfterHarvest(0.5, 'pumpkin');
    expect(restedForADay).toBeLessThan(takenByOneCrop);
  });
});

describe('soilBand', () => {
  it('gives the player words rather than a decimal', () => {
    expect(soilBand(1)).toBe('rich');
    expect(soilBand(0.7)).toBe('good');
    expect(soilBand(0.5)).toBe('tired');
    expect(soilBand(0.1)).toBe('exhausted');
    expect(SOIL_BAND_LABELS[soilBand(0.1)]).toBe('Exhausted');
  });
});
