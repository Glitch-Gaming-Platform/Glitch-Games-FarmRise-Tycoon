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

test('boots to the main menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('menu-play')).toBeVisible();

  const hero = page.getByRole('img', { name: 'Farmer beside a barn and ripe crops' });
  await expect(hero).toBeVisible();
  expect(await hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
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
  expect(modelRequests.every((url) => url.includes('/assets/models/low/'))).toBe(true);
  expect(requested.some((url) => url.includes('/assets/textures/'))).toBe(false);
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
