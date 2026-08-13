import { expect, test, type Page } from '@playwright/test';
import {
  INCIDENTS,
  newCareer,
  requireCrop,
  type CareerSaveState,
  type FarmSiteSaveState,
  type IncidentInstance,
} from '@farmrise/shared';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

function preparedCareer(prepare: (site: FarmSiteSaveState, state: CareerSaveState) => void) {
  const state = newCareer({ careerId: 'inventory-e2e', seed: 0x1a2b3c });
  const site = state.sites[0];
  if (!site) throw new Error('Inventory E2E fixture needs the starter site.');
  state.onboardingCompleted = true;
  state.incidentCooldowns = Object.fromEntries(
    INCIDENTS.map((incident) => [incident.id, 1_000_000_000]),
  );
  prepare(site, state);
  return state;
}

async function enterSavedFarm(page: Page, state: CareerSaveState): Promise<void> {
  await page.addInitScript((savedState) => {
    window.localStorage.setItem(
      'farmrise:save:v1',
      JSON.stringify({
        schemaVersion: 1,
        savedAt: Date.now(),
        revision: 0,
        state: savedState,
      }),
    );
  }, state);
  await page.goto('/?quality=low');
  await page.getByTestId('menu-play').dispatchEvent('click');
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible({ timeout: 60_000 });
}

async function walkNorthUntilPrompt(page: Page, expected: RegExp): Promise<void> {
  const prompt = page.getByTestId('hud-prompt');
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await page.waitForTimeout(100);
      if (expected.test((await prompt.textContent()) ?? '')) return;
    }
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
  }
  await expect(prompt).toContainText(expected);
}

test('a drought cannot mask Harvest and a damaged mature crop still yields produce', async ({
  page,
}) => {
  const state = preparedCareer((site, career) => {
    const plot = site.plots.find((candidate) => candidate.id === 'plot-5');
    if (!plot) throw new Error('Missing plot-5.');
    Object.assign(plot, {
      cropId: 'avocado',
      grownTicks: requireCrop('avocado').growthTicks * 10,
      tendCount: requireCrop('avocado').tendActions,
      water: 0,
      eventMultiplier: 0.1225,
      soil: 0.8876,
      previousCropId: 'wheat',
    });
    const incident: IncidentInstance = {
      id: 'inventory-ready-drought',
      definitionId: 'incident-drought',
      siteId: site.id,
      severity: 'minor',
      warnedTick: career.tick,
      impactTick: career.tick + 3_600,
      endsTick: career.tick + 7_200,
      targetIds: [plot.id],
      responseKind: null,
      responseProgress: 0,
      resolved: false,
      appliedMultiplier: null,
    };
    career.incidents = [incident];
  });

  await enterSavedFarm(page, state);
  await walkNorthUntilPrompt(page, /Harvest/);
  await expect(page.getByTestId('hud-prompt')).not.toContainText(/Tend/);

  await page.keyboard.press('e');

  await expect(page.getByTestId('hud-carry')).toContainText('1/8');
  await expect(page.getByTestId('hud-ready')).toContainText('0');
});

test('an old cranberry harvest is collected before the new crop underneath and is paid for', async ({
  page,
}) => {
  const state = preparedCareer((site) => {
    const plot = site.plots.find((candidate) => candidate.id === 'plot-5');
    if (!plot) throw new Error('Missing plot-5.');
    Object.assign(plot, {
      cropId: 'corn',
      grownTicks: 1,
      tendCount: 0,
      water: 1,
      eventMultiplier: 1,
    });
    site.carried = {
      ...site.carried,
      items: { wheat: 2 },
      quality: { wheat: 1 },
    };
    site.stores.push({
      id: 'stack-15-15',
      buildingId: null,
      tileX: 15,
      tileZ: 15,
      capacity: 999,
      preserving: false,
      items: { cranberry: 4 },
      quality: { cranberry: 1 },
      spoilageRemainder: {},
    });
  });

  await enterSavedFarm(page, state);
  await walkNorthUntilPrompt(page, /Pick up 4 Cranberries/);

  await page.keyboard.press('e');

  await expect(page.getByTestId('hud-carry')).toContainText('6/8');
  await walkNorthUntilPrompt(page, /Tend/);
  await page.keyboard.press('m');
  await expect(page.getByTestId('market-sell-all-cranberry')).toBeVisible();
  await page.getByTestId('market-sell-all-cranberry').click();
  await expect(page.getByRole('log')).toContainText(
    'Paid $12.60 for 4 Cranberries. Balance $62.60.',
  );
  await expect(page.getByTestId('market-sell-all-cranberry')).toHaveCount(0);
});

test('a nearby barn status card renders without browser errors at the normal camera', async ({
  page,
}) => {
  const state = preparedCareer((site) => {
    site.buildings.push({
      id: 'inventory-e2e-barn',
      kind: 'barn',
      tileX: 16,
      tileZ: 17,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: false,
    });
    site.stores.push({
      id: 'store-inventory-e2e-barn',
      buildingId: 'inventory-e2e-barn',
      tileX: 16,
      tileZ: 17,
      capacity: 120,
      preserving: false,
      items: { cranberry: 8, eggs: 3, wheat: 12 },
      quality: { cranberry: 1, eggs: 1, wheat: 1 },
      spoilageRemainder: {},
    });
  });

  await enterSavedFarm(page, state);
  await expect(page.locator('#app > canvas')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible();
});

test('an accepted preserves contract reveals its kitchen, produces jars, and can be fulfilled', async ({
  page,
}) => {
  const state = preparedCareer((site, career) => {
    career.stage = 1;
    career.balance = 10_000;
    career.unlocks = ['contracts', 'buyer_co_op'];
    career.contracts = [
      {
        id: 'offer-preserves-e2e',
        buyerId: 'growers_co_op',
        itemId: 'preserves',
        quantity: 3,
        delivered: 0,
        unitPrice: 342,
        minimumQuality: 0,
        acceptedTick: career.tick,
        deadlineTick: career.tick + 1,
        recurringEveryTicks: 0,
        status: 'open',
      },
    ];
    site.buildings.push({
      id: 'building-preserve-contract',
      kind: 'preserve_kitchen',
      tileX: 16,
      tileZ: 17,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: false,
    });
    site.processors.push({
      id: 'processor-building-preserve-contract',
      buildingId: 'building-preserve-contract',
      queue: [{ recipeId: 'recipe-preserves', batches: 1, remainingTicks: 1 }],
      held: {},
    });
  });

  await enterSavedFarm(page, state);
  await page.getByRole('button', { name: 'Open build' }).click();

  await expect(page.getByTestId('build-preserve_kitchen')).toBeVisible();
  await expect(page.getByTestId('build-preserve_kitchen')).toBeEnabled();
  await expect(page.getByTestId('build-mill')).toHaveCount(0);
  await expect(page.getByTestId('build-creamery')).toHaveCount(0);
  await page.getByTestId('build-close').click();

  await expect(page.getByTestId('hud-prompt')).toContainText('Pick up 3 Preserves');
  await page.keyboard.press('e');
  await page.keyboard.press('m');

  const delivery = page.getByTestId('market-fulfil-preserves');
  await expect(delivery).toBeEnabled();
  await expect(delivery).toContainText('Deliver 3');
  await delivery.click();

  await expect(page.getByRole('log')).toContainText(/Paid .* for 3 Preserves/i);
  await expect(page.getByTestId('market-fulfil-preserves')).toHaveCount(0);
});
