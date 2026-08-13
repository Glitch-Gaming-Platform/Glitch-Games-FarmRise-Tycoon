import { expect, test, type Page } from '@playwright/test';
import {
  BUILDINGS,
  INCIDENTS,
  RECIPES,
  newCareer,
  type BuildingKind,
  type CareerSaveState,
  type FarmSiteSaveState,
} from '@farmrise/shared';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

function preparedCareer(prepare: (site: FarmSiteSaveState, state: CareerSaveState) => void) {
  const state = newCareer({ careerId: 'building-actions-e2e', seed: 0xb011d });
  const site = state.sites[0];
  if (!site) throw new Error('Building action fixture needs the starter site.');
  state.onboardingCompleted = true;
  state.balance = 100_000;
  state.incidentCooldowns = Object.fromEntries(
    INCIDENTS.map((incident) => [incident.id, 1_000_000_000]),
  );
  prepare(site, state);
  return state;
}

function addBuilding(site: FarmSiteSaveState, kind: BuildingKind, id = `action-${kind}`) {
  site.buildings.push({
    id,
    kind,
    tileX: 16,
    tileZ: 17,
    rotation: 0,
    remainingBuildTicks: 0,
    broken: false,
  });
  return id;
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

for (const kind of ['barn', 'loading_pad', 'cold_store'] as const) {
  test(`${kind} prompt opens its inventory and can withdraw goods`, async ({ page }) => {
    const state = preparedCareer((site) => {
      const buildingId = addBuilding(site, kind);
      site.stores.push({
        id: `store-${buildingId}`,
        buildingId,
        tileX: 16,
        tileZ: 17,
        capacity: kind === 'barn' ? 120 : kind === 'cold_store' ? 70 : 40,
        preserving: kind === 'cold_store',
        items: { wheat: 5 },
        quality: { wheat: 1 },
        spoilageRemainder: {},
      });
    });

    await enterSavedFarm(page, state);
    await expect(page.getByTestId('hud-prompt')).toContainText(
      `Inspect ${BUILDINGS[kind].displayName}`,
    );
    await page.keyboard.press('e');

    await expect(page.getByTestId('storage-panel')).toBeVisible();
    await expect(page.getByTestId('storage-take-wheat')).toContainText('Take 5');
    await page.getByTestId('storage-take-wheat').click();

    await expect(page.getByTestId('hud-carry')).toContainText('5/8');
    await expect(page.getByTestId('storage-take-wheat')).toHaveCount(0);
    await expect(page.getByTestId('storage-options')).toContainText('This building is empty');
  });
}

for (const recipe of RECIPES) {
  test(`${recipe.processor} prompt loads its matching recipe`, async ({ page }) => {
    const state = preparedCareer((site, career) => {
      career.unlocks = [...new Set([...career.unlocks, 'processing'])];
      const buildingId = addBuilding(site, recipe.processor);
      site.processors.push({
        id: `processor-${buildingId}`,
        buildingId,
        queue: [],
        held: {},
      });
      site.carried = {
        ...site.carried,
        items: { [recipe.inputItemId]: recipe.inputQuantity },
        quality: { [recipe.inputItemId]: 1 },
      };
    });

    await enterSavedFarm(page, state);
    await expect(page.getByTestId('hud-prompt')).toContainText(
      `Load ${BUILDINGS[recipe.processor].displayName}`,
    );
    await page.keyboard.press('e');

    await expect(page.getByTestId('career-panel')).toBeVisible();
    const action = page.getByTestId(
      `career-action-processor-action-${recipe.processor}-${recipe.id}`,
    );
    await expect(action).toBeEnabled();
    await action.click();

    await expect(page.getByTestId('hud-carry')).toHaveCount(0);
    await expect(page.getByTestId('career-options')).toContainText('1/');
    const wait = page.getByTestId(`career-wait-processor-action-${recipe.processor}-${recipe.id}`);
    await expect(wait).toContainText(/Processing · .* remaining/i);
    await expect(wait.getByRole('progressbar')).toHaveAttribute('aria-valuenow', /\d+/);
  });
}

test('animal shelter prompt opens livestock management and buys into that shelter', async ({
  page,
}) => {
  const state = preparedCareer((site, career) => {
    career.unlocks = [...new Set([...career.unlocks, 'animal_shelters'])];
    addBuilding(site, 'animal_shelter');
  });

  await enterSavedFarm(page, state);
  await expect(page.getByTestId('hud-prompt')).toContainText('Manage Animal Shelter');
  await page.keyboard.press('e');

  await expect(page.getByTestId('build-panel')).toBeVisible();
  await expect(page.getByTestId('build-barn')).toHaveCount(0);
  await page.getByTestId('build-animal-chicken').click();

  await expect(page.getByTestId('build-animal-row-chicken')).toContainText('3 shelter space free');
});

test('Stage 3 buys a farm dog into the shelter being managed', async ({ page }) => {
  const state = preparedCareer((site, career) => {
    career.stage = 3;
    career.unlocks = [...new Set([...career.unlocks, 'animal_shelters', 'farm_dog'])];
    addBuilding(site, 'animal_shelter');
  });

  await enterSavedFarm(page, state);
  await expect(page.getByTestId('hud-prompt')).toContainText('Manage Animal Shelter');
  await page.keyboard.press('e');

  const dog = page.getByTestId('build-animal-row-dog');
  await expect(dog).toContainText(/Farm dog.*\$100\.00.*1 shelter space.*10 foxes per raid/i);
  await expect(dog.locator('img')).toHaveAttribute('src', /dog\.webp$/);
  await dog.getByRole('button', { name: 'Buy' }).click();

  await expect(page.getByTestId('build-animal-row-dog')).toContainText('3 shelter space free');
});

test('worker hut prompt opens workforce management and hires into that hut', async ({ page }) => {
  const state = preparedCareer((site, career) => {
    career.unlocks = [...new Set([...career.unlocks, 'workers'])];
    addBuilding(site, 'worker_hut');
  });

  await enterSavedFarm(page, state);
  await expect(page.getByTestId('hud-prompt')).toContainText('Manage Worker hut');
  await page.keyboard.press('e');

  await expect(page.getByTestId('career-panel')).toBeVisible();
  await expect(page.getByTestId('career-action-field_hand')).toBeEnabled();
  await page.getByTestId('career-action-field_hand').click();

  await expect(page.getByTestId('career-options')).toContainText('Aoife');
  await expect(page.getByTestId('career-action-field_hand')).toBeDisabled();
});

for (const recipe of RECIPES) {
  test(`${recipe.processor} completes output that can be collected and sold`, async ({ page }) => {
    const state = preparedCareer((site, career) => {
      career.unlocks = [...new Set([...career.unlocks, 'processing'])];
      const buildingId = addBuilding(site, recipe.processor, `output-${recipe.processor}`);
      site.processors.push({
        id: `processor-${buildingId}`,
        buildingId,
        queue: [{ recipeId: recipe.id, batches: 1, remainingTicks: 1 }],
        held: {},
      });
    });

    await enterSavedFarm(page, state);
    await expect(page.getByTestId('hud-prompt')).toContainText(
      new RegExp(`Pick up ${recipe.outputQuantity} `, 'i'),
    );
    await page.keyboard.press('e');
    await page.keyboard.press('m');

    const sell = page.getByTestId(`market-sell-all-${recipe.outputItemId}`);
    await expect(sell).toBeEnabled();
    await sell.click();

    await expect(page.getByRole('log')).toContainText(
      new RegExp(`Paid .* for ${recipe.outputQuantity} `, 'i'),
    );
  });
}
