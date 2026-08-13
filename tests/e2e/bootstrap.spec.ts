/**
 * Live-browser tests.
 *
 * These are the only tests that can prove the bootstrap actually renders: the
 * unit tests deliberately do not stub WebGL, precisely so that "it renders" is
 * never something a fake can assert.
 *
 * Run with `npm run test:e2e` after a one-time `npx playwright install`.
 */
import { expect, test, type Page } from '@playwright/test';
import { ESTATE_PARCELS, asPlotId, newCareer, type CareerSaveState } from '@farmrise/shared';

const LOCAL_CAREER_KEY = 'farmrise:save:v1';

test.beforeEach(async ({ page }) => {
  // Fail loudly on a page error rather than passing with a broken canvas.
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

async function openMainMenuInterface(page: Page, triggerTestId: string, targetTestId: string) {
  await page.getByTestId(triggerTestId).dispatchEvent('click');
  await expect(page.getByTestId(targetTestId)).toBeVisible();
}

async function enterFarm(page: Page, path = '/') {
  await page.goto(path);
  await page.getByTestId('menu-play').dispatchEvent('click');
  // The HUD intentionally hides before onboarding reveals its first feature;
  // the gameplay shortcut dock is the stable signal that the farm is ready.
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible({ timeout: 30_000 });
}

function openingMilestoneCareer(options: {
  readonly earned: boolean;
  readonly parcelsOwned: boolean;
}): CareerSaveState {
  const state = newCareer({ careerId: 'opening-milestone-e2e', seed: 0x51a9e });
  const site = state.sites[0]!;
  const ownedParcels = options.parcelsOwned
    ? ESTATE_PARCELS.slice(0, 3)
    : ESTATE_PARCELS.slice(0, 1);
  return {
    ...state,
    onboardingCompleted: true,
    statistics: {
      ...state.statistics,
      lifetimeEarned: options.earned ? 15_000 : 0,
    },
    sites: [
      {
        ...site,
        ownedParcelIds: ownedParcels.map((parcel) => parcel.id),
        plots: ownedParcels.flatMap((parcel) =>
          parcel.beds.map((bed) => ({
            id: asPlotId(bed.id),
            cropId: null,
            grownTicks: 0,
            tendCount: 0,
            water: 1,
            irrigated: false,
            diseased: false,
            eventMultiplier: 1,
            soil: 1,
            quality: 1,
            previousCropId: null,
          })),
        ),
      },
    ],
  };
}

async function enterSavedCareer(page: Page, state: CareerSaveState) {
  const envelope = JSON.stringify({
    schemaVersion: 1,
    savedAt: Date.now(),
    revision: 0,
    state,
  });
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: LOCAL_CAREER_KEY,
    value: envelope,
  });
  await enterFarm(page);
  await page.getByTestId('menu-shortcut-career').dispatchEvent('click');
  await expect(page.getByTestId('career-panel')).toBeVisible();
}

test('boots to the main menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('menu-play')).toBeVisible();

  const hero = page.getByRole('img', { name: 'Farmer beside a barn and ripe crops' });
  await expect(hero).toBeVisible();
  expect(await hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test('changes and persists the language from the menu and settings', async ({ page }) => {
  await page.goto('/');

  const menuLanguage = page.getByTestId('menu-language-select');
  const menuFlag = menuLanguage.locator('..').locator('.fr-language-flag');
  await expect(menuFlag).toHaveText('🇺🇸');
  await menuLanguage.selectOption('es');
  await expect(page.getByTestId('menu-play')).toContainText('Trabajar la granja');
  await expect(menuFlag).toHaveText('🇪🇸');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');

  await openMainMenuInterface(page, 'menu-settings', 'settings-panel');
  const settingsLanguage = page.getByTestId('settings-language-select');
  await expect(settingsLanguage).toHaveValue('es');
  await settingsLanguage.selectOption('ar');
  await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible();
  await expect(settingsLanguage.locator('..').locator('.fr-language-flag')).toHaveText('🇸🇦');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.reload();
  await expect(page.getByTestId('menu-language-select')).toHaveValue('ar');
  await expect(page.getByTestId('menu-play')).toContainText('ابدأ العمل في المزرعة');

  await page.getByTestId('menu-language-select').selectOption('ja');
  await expect(page.getByTestId('menu-play')).toContainText('農場で働く');
  await expect(page.getByTestId('menu-language-select').locator('..')).toContainText('🇯🇵');
  await page.getByTestId('menu-language-select').selectOption('de');
  await expect(page.getByTestId('menu-play')).toContainText('Auf dem Hof arbeiten');
  await expect(page.getByTestId('menu-language-select').locator('..')).toContainText('🇩🇪');
  await page.reload();
  await expect(page.getByTestId('menu-language-select')).toHaveValue('de');
});

test('main-menu settings and account interfaces open, render and close', async ({ page }) => {
  await page.goto('/');

  await openMainMenuInterface(page, 'menu-settings', 'settings-panel');
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Master volume' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Current song' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Play Sunrise Rows' })).toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();

  await openMainMenuInterface(page, 'menu-account', 'account-panel');
  await expect(page.getByTestId('account-panel')).toBeVisible();
  await expect(page.getByTestId('account-form')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await page.getByTestId('account-close').click();
  await expect(page.getByTestId('account-panel')).toBeHidden();
  await expect(page.getByTestId('main-menu')).toBeVisible();
});

test('creates a WebGL canvas sized to the viewport', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#app > canvas');
  await expect(canvas).toBeVisible();

  const size = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.height).toBeGreaterThan(0);
});

test('starts a session and shows the gameplay interface', async ({ page }) => {
  await enterFarm(page);

  await expect(page.getByTestId('menu-shortcuts')).toBeVisible();
  await expect(page.getByTestId('coach-mark')).toContainText(/brown plots/i);
});

test('the Farm Office marks the earnings task complete independently', async ({ page }) => {
  await enterSavedCareer(page, openingMilestoneCareer({ earned: true, parcelsOwned: false }));
  const office = page.getByTestId('career-panel');
  await expect(page.getByTestId('career-next-stage')).toHaveText('Next stage: Homestead');
  await expect(office).toContainText('Complete every requirement to advance to Homestead:');
  await expect(page.getByTestId('career-requirements')).toContainText('✓ Earned: $150.00/$150.00');
  await expect(page.getByTestId('career-requirements')).toContainText('○ Parcels owned: 1/3');
  await expect(page.getByTestId('career-claim-milestone-smallholder')).toHaveText(
    'Requirements not met',
  );
  await expect(page.getByTestId('career-claim-milestone-smallholder')).toBeDisabled();
});

test('the Farm Office marks the parcel task complete independently', async ({ page }) => {
  await enterSavedCareer(page, openingMilestoneCareer({ earned: false, parcelsOwned: true }));
  await expect(page.getByTestId('career-requirements')).toContainText('○ Earned: $0.00/$150.00');
  await expect(page.getByTestId('career-requirements')).toContainText('✓ Parcels owned: 3/3');
  await expect(page.getByTestId('career-claim-milestone-smallholder')).toBeDisabled();
});

test('the full milestone checklist advances Smallholding to Homestead', async ({ page }) => {
  await enterSavedCareer(page, openingMilestoneCareer({ earned: true, parcelsOwned: true }));
  const office = page.getByTestId('career-panel');
  await expect(page.getByTestId('career-requirements')).toContainText('✓ Earned: $150.00/$150.00');
  await expect(page.getByTestId('career-requirements')).toContainText('✓ Parcels owned: 3/3');
  const advance = page.getByTestId('career-claim-milestone-smallholder');
  await expect(advance).toBeEnabled();
  await expect(advance).toHaveText('Advance to Homestead');
  await advance.click();

  await expect(office).toContainText(/Homestead\s+·\s+Healthy/i);
  await expect(page.getByTestId('career-next-stage')).toHaveText('Next stage: Licensed Producer');
  await expect(page.getByTestId('career-claim-milestone-working-farm')).toBeDisabled();
});

test('runs the game loop, so the tick counter advances', async ({ page }) => {
  await enterFarm(page, '/?debug=overlay');

  const overlay = page.getByTestId('debug-overlay');
  await expect(overlay).toBeVisible();

  const readTick = async (): Promise<number> => {
    const text = (await overlay.textContent()) ?? '';
    return Number(/tick\s+(\d+)/.exec(text)?.[1] ?? 0);
  };

  const first = await readTick();
  await page.waitForTimeout(1200);
  expect(await readTick()).toBeGreaterThan(first);
});

test('routes low to the frozen model pack and requests no Ultra surfaces', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await enterFarm(page, '/?quality=low&debug=overlay');
  await expect(page.getByTestId('debug-overlay')).toContainText('tier low');

  const modelRequests = requested.filter((url) => url.includes('/assets/models/'));
  expect(modelRequests.length).toBeGreaterThan(0);
  expect(
    modelRequests.every(
      (url) =>
        url.includes('/assets/models/low/') ||
        /\/assets\/models\/animals-(?:dog|sheep)\.glb$/.test(url),
    ),
  ).toBe(true);
  expect(modelRequests.some((url) => url.endsWith('/assets/models/animals-sheep.glb'))).toBe(true);
  expect(modelRequests.some((url) => url.endsWith('/assets/models/animals-dog.glb'))).toBe(true);
  expect(requested.some((url) => url.includes('/assets/textures/'))).toBe(false);
});

test('Ultra requests the authored animal supplements instead of rendering fallback blobs', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await enterFarm(page, '/?quality=ultra&debug=progression,overlay');
  await expect(page.getByTestId('debug-overlay')).toContainText('tier ultra');
  expect(requested.some((url) => url.endsWith('/assets/models/animals-sheep.glb'))).toBe(true);
  expect(requested.some((url) => url.endsWith('/assets/models/animals-dog.glb'))).toBe(true);
});

test('handles a viewport resize without errors', async ({ page }) => {
  await enterFarm(page);

  const canvas = page.locator('#app > canvas');
  const before = await canvas.evaluate((element) => (element as HTMLCanvasElement).width);

  await page.setViewportSize({ width: 900, height: 500 });
  await page.waitForTimeout(400);

  const after = await canvas.evaluate((element) => (element as HTMLCanvasElement).width);
  expect(after).not.toBe(before);
  await expect(canvas).toBeVisible();
});

test('pauses and resumes', async ({ page }) => {
  await enterFarm(page);
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();

  await page.getByTestId('pause-resume').dispatchEvent('click');
  await expect(page.getByTestId('pause-menu')).toBeHidden();
});
