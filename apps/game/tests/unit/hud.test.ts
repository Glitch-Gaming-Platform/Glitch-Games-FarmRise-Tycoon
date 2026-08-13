import { describe, expect, it } from 'vitest';
import { BUILDING_KINDS, cents } from '@farmrise/shared';
import { Hud, type HudSnapshot } from '@ui/hud/Hud.js';
import { createEnglishLocalization } from '@ui/i18n/gameI18n.js';
import { playerBuildingName, saleToastMessage } from '../../src/bootstrap/bindHud.js';

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
    hud.setPrompt('Plant Wheat', 'Choose seed');
    expect(hud.root.textContent).toContain('Plant Wheat  ·  press E');
    expect(hud.root.textContent).toContain('Choose seed  ·  press Q');

    hud.setPrompt('Harvest');
    expect(hud.root.textContent).toContain('Harvest  ·  press E');
    expect(hud.root.textContent).not.toContain('press Q');

    hud.setPrompt('Tend', null, "You can't carry anymore. Store some items first.");
    expect(hud.root.textContent).toContain('Tend  ·  press E');
    expect(hud.root.textContent).toContain("You can't carry anymore. Store some items first.");
    hud.dispose();
  });
});

describe('sale feedback', () => {
  it('states the exact payout and resulting balance', () => {
    expect(saleToastMessage('wheat', 9, cents(522), cents(2_047), false)).toBe(
      'Paid $5.22 for 9 Wheat. Balance $20.47.',
    );
    expect(saleToastMessage('eggs', 1, cents(85), cents(2_132), true)).toBe(
      'Paid $0.85 for 1 Egg on contract. Balance $21.32.',
    );
  });
});

describe('building feedback', () => {
  it('uses player-readable names for every building kind', () => {
    const i18n = createEnglishLocalization();
    for (const kind of BUILDING_KINDS) {
      const name = playerBuildingName(i18n, kind);
      expect(name, kind).not.toContain('_');
      expect(name, kind).not.toBe(kind);
    }
    expect(playerBuildingName(i18n, 'animal_shelter')).toBe('Animal Shelter');
  });
});
