import { describe, expect, it } from 'vitest';
import { cents } from '@farmrise/shared';
import { Hud, type HudSnapshot } from '@ui/hud/Hud.js';

const BASE: Omit<HudSnapshot, 'warning'> = {
  balance: cents(5_000),
  storageUsed: 0,
  storageCapacity: 60,
  selectedCrop: 'Wheat',
  readyPlots: 0,
  revealed: new Set(['warning']),
  objectiveProgress: 0,
  objectiveLabel: 'Grow',
  objectiveReady: false,
  carry: null,
  season: null,
};

describe('incident HUD phases', () => {
  it('offers prevention only before impact', () => {
    const hud = new Hud();
    hud.render({
      ...BASE,
      warning: {
        label: 'Drought',
        phase: 'warning',
        ticksRemaining: 600,
        preventCost: cents(1_200),
      },
    });

    expect(hud.root.textContent).toContain('Drought in');
    expect(hud.root.textContent).toContain('F to prevent $12.00');
    hud.dispose();
  });

  it('shows recovery time without a false prevention action after impact', () => {
    const hud = new Hud();
    hud.render({
      ...BASE,
      warning: {
        label: 'Drought',
        phase: 'active',
        ticksRemaining: 600,
        preventCost: null,
      },
    });

    expect(hud.root.textContent).toContain('Drought active');
    expect(hud.root.textContent).toContain('left');
    expect(hud.root.textContent).not.toContain('prevent');
    hud.dispose();
  });
});

describe('context prompt', () => {
  it('shows the seed-cycle key only when a secondary plot action exists', () => {
    const hud = new Hud();
    hud.setPrompt('Plant Wheat', 'Change seed');
    expect(hud.root.textContent).toContain('Plant Wheat  ·  press E');
    expect(hud.root.textContent).toContain('Change seed  ·  press Q');

    hud.setPrompt('Harvest');
    expect(hud.root.textContent).toContain('Harvest  ·  press E');
    expect(hud.root.textContent).not.toContain('press Q');
    hud.dispose();
  });
});
