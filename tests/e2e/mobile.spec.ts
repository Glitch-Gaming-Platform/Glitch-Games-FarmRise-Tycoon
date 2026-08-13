import { expect, test, type Page } from '@playwright/test';

const MOBILE_PROJECTS = new Set(['mobile-chrome', 'mobile-webkit']);
test.describe.configure({ timeout: 150_000 });

async function enterFarm(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('menu-play')).toBeVisible();
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible({ timeout: 90_000 });
}

async function tapAtFirstValidPlacement(page: Page): Promise<void> {
  const canvas = page.locator('#app > canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The farm canvas has no layout box.');

  for (const yFraction of [0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82]) {
    for (const xFraction of [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88, 0.94]) {
      const x = box.x + box.width * xFraction;
      const y = box.y + box.height * yFraction;
      const canvasOwnsPoint = await page.evaluate(
        ({ x: clientX, y: clientY }) =>
          document.elementFromPoint(clientX, clientY)?.tagName === 'CANVAS',
        { x, y },
      );
      if (!canvasOwnsPoint) continue;

      await canvas.dispatchEvent('pointermove', {
        pointerId: 91,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      });
      await page.waitForTimeout(80);
      const banner = (await page.getByTestId('placing-banner').textContent()) ?? '';
      if (!banner.includes('Cannot') && /tap to build/i.test(banner)) {
        await page.touchscreen.tap(x, y);
        await expect(page.getByTestId('placing-banner')).toBeVisible({ timeout: 3_000 });
        return;
      }
    }
  }

  throw new Error('No valid touch-placement point was found on the visible mobile canvas.');
}

test('keeps the desktop interface free of mobile-only controls', async ({ page }, testInfo) => {
  test.skip(MOBILE_PROJECTS.has(testInfo.project.name));
  await enterFarm(page);
  await expect(page.getByTestId('touch-controls')).toHaveCount(0);
});

test('uses the mobile render budget and exposes touch gameplay controls', async ({
  page,
}, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name));
  await enterFarm(page);

  await expect(page.getByTestId('touch-controls')).toBeVisible();
  await expect(page.getByTestId('touch-joystick')).toBeVisible();
  await expect(page.getByTestId('touch-interact')).toBeVisible();

  const canvas = page.locator('#app > canvas');
  const size = await canvas.evaluate((element) => {
    const node = element as HTMLCanvasElement;
    const rect = node.getBoundingClientRect();
    return { cssWidth: rect.width, cssHeight: rect.height, width: node.width, height: node.height };
  });
  expect(size.width / size.cssWidth).toBeLessThanOrEqual(1.51);
  expect(size.height / size.cssHeight).toBeLessThanOrEqual(1.51);
});

test('held touch controls move the player and Work changes authoritative game state', async ({
  page,
}, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name));
  await enterFarm(page);

  const joystick = page.getByTestId('touch-joystick');
  const joystickBox = await joystick.boundingBox();
  if (!joystickBox) throw new Error('Touch joystick has no layout box.');
  await page.mouse.move(joystickBox.x + joystickBox.width / 2, joystickBox.y + 12);
  await page.mouse.down();
  try {
    await expect(page.getByTestId('hud-prompt')).toContainText('Plant Wheat', { timeout: 14_000 });
  } finally {
    await page.mouse.up();
  }

  const seed = page.getByTestId('touch-cycle');
  const seedBox = await seed.boundingBox();
  if (!seedBox) throw new Error('Touch seed control has no layout box.');
  await page.touchscreen.tap(seedBox.x + seedBox.width / 2, seedBox.y + seedBox.height / 2);
  await expect(page.getByTestId('seed-panel')).toBeVisible();
  await expect(page.getByTestId('touch-controls')).toBeHidden();
  await page.waitForTimeout(300);
  const radish = page.getByTestId('seed-option-radish');
  const radishBox = await radish.boundingBox();
  if (!radishBox) throw new Error('Radish seed choice has no layout box.');
  await page.touchscreen.tap(radishBox.x + radishBox.width / 2, radishBox.y + radishBox.height / 2);
  await expect(page.getByTestId('seed-panel')).toBeHidden();
  await expect(page.getByTestId('hud-prompt')).toContainText('Plant Radish');

  const work = page.getByTestId('touch-interact');
  const workBox = await work.boundingBox();
  if (!workBox) throw new Error('Touch work control has no layout box.');
  const balanceBeforeWork = await page.getByTestId('hud-balance').textContent();
  await page.mouse.move(workBox.x + workBox.width / 2, workBox.y + workBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();

  await expect(page.getByTestId('hud-balance')).not.toHaveText(balanceBeforeWork ?? '');
  await expect(page.getByTestId('hud-prompt')).toContainText('Tend');
});

test('opens every management panel from the mobile shortcut dock', async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name));
  await enterFarm(page);

  for (const panel of [
    { shortcut: 'menu-shortcut-market', panel: 'market-panel', close: 'market-close' },
    { shortcut: 'menu-shortcut-build', panel: 'build-panel', close: 'build-close' },
    { shortcut: 'menu-shortcut-career', panel: 'career-panel', close: 'career-close' },
    { shortcut: 'menu-shortcut-town', panel: 'town-panel', close: 'town-close' },
  ]) {
    await page.getByTestId(panel.shortcut).click();
    await expect(page.getByTestId(panel.panel)).toBeVisible();
    await expect(page.getByTestId('touch-controls')).toBeHidden();
    await page.getByTestId(panel.close).click();
    await expect(page.getByTestId(panel.panel)).toBeHidden();
    await expect(page.getByTestId(panel.shortcut)).toBeVisible();
  }
});

test('keeps essential touch targets on-screen through both orientations', async ({
  page,
}, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name));
  await enterFarm(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 812, height: 311 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    for (const id of [
      'touch-joystick',
      'touch-interact',
      'menu-shortcut-market',
      'menu-shortcut-build',
      'menu-shortcut-career',
      'menu-shortcut-town',
    ]) {
      const control = page.getByTestId(id);
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.x, id).toBeGreaterThanOrEqual(0);
      expect(box!.y, id).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, id).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height, id).toBeLessThanOrEqual(viewport.height + 1);
      const topmostControl = await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-testid]')?.dataset[
            'testid'
          ] ?? null,
        { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
      );
      expect(topmostControl, `${id} is covered by another mobile interface`).toBe(id);
    }
    const dockBox = await page.getByTestId('menu-shortcuts').boundingBox();
    expect(dockBox).not.toBeNull();
    expect(dockBox!.x).toBeLessThan(viewport.width / 2);
    expect(dockBox!.y).toBeLessThan(viewport.height / 2);
    if (viewport.height <= 500) expect(dockBox!.height).toBeLessThanOrEqual(130);
  }
});

test('rotates and places multiple buildings before touch cancellation', async ({
  page,
}, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name));
  await enterFarm(page);
  await page.getByTestId('coach-skip').click();
  const balanceBeforePlacement = await page.getByTestId('hud-balance').textContent();

  await page.getByTestId('menu-shortcut-build').click();
  await page.getByTestId('build-road').click();
  await expect(page.getByTestId('placing-banner')).toContainText(/tap to build|tap another spot/i);
  await expect(page.getByTestId('touch-rotate')).toBeVisible();
  await expect(page.getByTestId('touch-cancel')).toBeVisible();

  await page.getByTestId('touch-rotate').tap();
  await tapAtFirstValidPlacement(page);
  await expect(page.getByTestId('hud-balance')).not.toHaveText(balanceBeforePlacement ?? '');
  const balanceAfterFirst = await page.getByTestId('hud-balance').textContent();
  await tapAtFirstValidPlacement(page);
  await expect(page.getByTestId('hud-balance')).not.toHaveText(balanceAfterFirst ?? '');

  await page.getByTestId('touch-cancel').tap();
  await expect(page.getByTestId('placing-banner')).toBeHidden();
});
