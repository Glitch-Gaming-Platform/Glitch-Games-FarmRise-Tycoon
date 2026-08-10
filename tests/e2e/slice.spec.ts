/**
 * The first playable slice, in a real browser.
 *
 * These cover what a headless test structurally cannot: that the coach mark
 * does not block the canvas, that keyboard shortcuts reach the game rather
 * than the browser, and that the HUD really does reveal progressively.
 *
 * Run with `npm run test:e2e` after a one-time `npx playwright install`.
 */
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
  // Every spec starts as a brand-new player.
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('farmrise:onboarded');
    } catch {
      /* private mode */
    }
  });
});

async function startFarmFromMenu(page: Page) {
  // Vite may optimise Three's loader graph on the first farm request and
  // reload once. Retry the semantic click so the test observes the game,
  // not the development server warmup.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByTestId('menu-play').dispatchEvent('click');
    try {
      await expect(page.getByTestId('hud')).toBeVisible({ timeout: 12_000 });
      return;
    } catch {
      await expect(page.getByTestId('main-menu')).toBeVisible();
    }
  }
  await expect(page.getByTestId('hud')).toBeVisible();
}

async function enterFarm(page: Page, path = '/') {
  await page.goto(path);
  await startFarmFromMenu(page);
}

async function skipTutorial(page: Page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByTestId('coach-skip').dispatchEvent('click');
    try {
      await expect(page.getByTestId('coach-mark')).toBeHidden({ timeout: 3_000 });
      await expect(page.getByTestId('hud')).toBeVisible();
      return;
    } catch {
      if (await page.getByTestId('main-menu').isVisible()) await startFarmFromMenu(page);
    }
  }
  await expect(page.getByTestId('coach-mark')).toBeHidden();
}

async function tendFirstCrop(page: Page) {
  // The plant work lock lasts fixed simulation ticks. On a throttled software
  // renderer those ticks can take longer than 500 ms of wall time, so retry
  // the instructed action until the real onboarding state advances.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press('e');
    try {
      await expect(page.getByTestId('coach-mark')).toContainText(/ripens quickly/i, {
        timeout: 700,
      });
      return;
    } catch {
      await page.waitForTimeout(180);
    }
  }
  await expect(page.getByTestId('coach-mark')).toContainText(/ripens quickly/i);
}

async function reachFirstPlot(page: Page) {
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await page.waitForTimeout(100);
    if ((await page.getByTestId('hud-prompt').textContent())?.includes('Plant Wheat')) break;
  }
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('hud-prompt')).toContainText('Plant Wheat');
}

async function placeAtFirstValidCanvasPoint(page: Page) {
  const canvas = page.locator('#app > canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The farm canvas has no layout box.');

  for (const yFraction of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) {
    for (const xFraction of [0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88]) {
      const x = box.x + box.width * xFraction;
      const y = box.y + box.height * yFraction;
      await page.mouse.move(x, y);
      await page.waitForTimeout(120);
      const banner = (await page.getByTestId('placing-banner').textContent()) ?? '';
      if (!banner.includes('Cannot') && /click to (build|place)/i.test(banner)) {
        await page.mouse.click(x, y);
        await expect(page.getByTestId('placing-banner')).toBeHidden({ timeout: 3_000 });
        return;
      }
    }
  }

  throw new Error('No valid road-placement point was found on the visible canvas.');
}

test('a new player is given something to do within seconds', async ({ page }) => {
  await enterFarm(page);
  const coach = page.getByTestId('coach-mark');
  await expect(coach).toBeVisible({ timeout: 10_000 });
  await expect(coach).toContainText(/W, A, S and D.*brown plots/i);
});

test('the first-time loop reaches harvest, sale and reinvestment without a long wait', async ({
  page,
}) => {
  await enterFarm(page);
  await reachFirstPlot(page);

  await page.keyboard.press('e');
  await expect(page.getByTestId('hud-prompt')).toContainText('Tend');
  await expect(page.getByTestId('coach-mark')).toContainText(/press E.*water/i);

  await tendFirstCrop(page);
  await expect(page.getByTestId('hud-prompt')).toContainText('Harvest', { timeout: 12_000 });

  await page.keyboard.press('e');
  await expect(page.getByTestId('hud-storage')).toContainText(/[1-9]\/60/);
  await expect(page.getByTestId('coach-mark')).toContainText(/Press M.*Sell all/i);

  await page.keyboard.press('m');
  await expect(page.getByTestId('market-panel')).toBeVisible();
  await expect(page.getByTestId('market-sell-all-wheat')).toBeVisible();
  await page.getByTestId('market-sell-all-wheat').click();
  await expect
    .poll(async () => {
      const text = await page.getByTestId('hud-balance').innerText();
      return Number(text.match(/\$([\d.]+)/)?.[1] ?? '0');
    })
    .toBeGreaterThan(48.8);
  await expect(page.getByTestId('coach-mark')).toContainText(/Press B.*place/i);

  await page.getByTestId('market-close').click();
  await page.keyboard.press('b');
  await page.getByTestId('build-chicken').click();
  await page.getByTestId('build-close').click();
  await expect(page.getByTestId('hud-objective')).toBeVisible();
  await expect(page.getByTestId('coach-mark')).toBeHidden();
});

test('market and reinvest interfaces block farm controls behind them', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);
  await reachFirstPlot(page);

  await page.keyboard.press('m');
  await expect(page.getByTestId('market-panel')).toBeVisible();
  await page.keyboard.press('e');
  await page.keyboard.down('s');
  await page.waitForTimeout(650);
  await page.keyboard.up('s');
  await page.mouse.click(120, 220);
  await expect(page.getByTestId('hud-balance')).toContainText('$50.00');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('market-panel')).toBeHidden();
  await expect(page.getByTestId('pause-menu')).toBeHidden();
  await expect(page.getByTestId('hud-prompt')).toContainText('Plant Wheat');

  await page.keyboard.press('b');
  await expect(page.getByTestId('build-panel')).toBeVisible();
  await page.mouse.click(120, 220);
  await expect(page.getByTestId('build-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('build-panel')).toBeHidden();
  await expect(page.getByTestId('pause-menu')).toBeHidden();
});

test('the coach mark never blocks the game behind it', async ({ page }) => {
  await enterFarm(page, '/?debug=overlay');
  await expect(page.getByTestId('coach-mark')).toBeVisible();

  // The world keeps running behind a prompt: the tick counter must advance.
  const overlay = page.getByTestId('debug-overlay');
  await expect(overlay).toBeVisible();
  const readTick = async () =>
    Number(/tick\s+(\d+)/.exec((await overlay.textContent()) ?? '')?.[1] ?? 0);
  const first = await readTick();
  await expect.poll(readTick, { timeout: 5_000 }).toBeGreaterThan(first);
});

test('the tutorial can be skipped, and stays skipped', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);
  await expect(page.getByTestId('coach-mark')).toBeHidden();

  // Skipping reveals the whole HUD immediately.
  await expect(page.getByTestId('hud-balance')).toBeVisible();
  await expect(page.getByTestId('hud-objective')).toBeVisible();
});

test('the HUD reveals progressively rather than all at once', async ({ page }) => {
  await enterFarm(page);
  // On the first beat the player has nothing to store and no goal yet.
  await expect(page.getByTestId('hud-objective')).toBeHidden();
  await expect(page.getByTestId('hud-storage')).toHaveCount(0);
});

test('the market panel opens and closes on M', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);

  await page.keyboard.press('KeyM');
  await expect(page.getByTestId('market-panel')).toBeVisible();
  // With nothing harvested the panel says so instead of showing an empty list.
  await expect(page.getByTestId('market-inventory')).toContainText(/nothing harvested/i);

  await page.keyboard.press('KeyM');
  await expect(page.getByTestId('market-panel')).toBeHidden();
});

test('bottom-right menu icons and their letter keys open the same interfaces', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);

  const shortcuts = page.getByTestId('menu-shortcuts');
  await expect(shortcuts).toBeVisible();
  await expect(page.getByTestId('menu-shortcut-market')).toContainText(/Market.*M/);
  await expect(page.getByTestId('menu-shortcut-build')).toContainText(/Build.*B/);

  await page.getByTestId('menu-shortcut-market').click();
  await expect(page.getByTestId('market-panel')).toBeVisible();
  await expect(shortcuts).toBeHidden();
  await page.getByTestId('market-close').click();
  await expect(shortcuts).toBeVisible();

  await page.keyboard.press('KeyB');
  await expect(page.getByTestId('build-panel')).toBeVisible();
  await expect(shortcuts).toBeHidden();
  await page.getByTestId('build-close').click();

  await page.getByTestId('menu-shortcut-build').click();
  await expect(page.getByTestId('build-panel')).toBeVisible();
  await page.getByTestId('build-close').click();
  await expect(page.getByTestId('build-panel')).toBeHidden();
  await expect(shortcuts).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await expect(shortcuts).toBeHidden();
  await page.getByTestId('pause-resume').click();
  await expect(shortcuts).toBeVisible();
});

test('the reinvest panel shows every option, including the goal', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);

  await page.keyboard.press('KeyB');
  await expect(page.getByTestId('build-panel')).toBeVisible();
  for (const kind of ['barn', 'irrigation', 'road', 'fence']) {
    await expect(page.getByTestId(`build-${kind}`)).toBeVisible();
  }
  // The land purchase is always listed, even when unaffordable, so the player
  // learns what they are saving toward.
  await expect(page.getByTestId('build-land')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('build-panel')).toBeHidden();
});

test('choosing a building enters placement mode', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);

  await page.keyboard.press('KeyB');
  await page.getByTestId('build-road').click();

  await expect(page.getByTestId('build-panel')).toBeHidden();
  await expect(page.getByTestId('placing-banner')).toBeVisible();
  await expect(page.getByTestId('placing-banner')).toContainText(/Esc to cancel/i);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('placing-banner')).toBeHidden();
});

test('a building can be placed on open ground with a world click', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);

  await page.keyboard.press('KeyB');
  await page.getByTestId('build-road').click();
  await placeAtFirstValidCanvasPoint(page);

  await expect
    .poll(async () => {
      const text = await page.getByTestId('hud-balance').innerText();
      return Number(text.match(/\$([\d.]+)/)?.[1] ?? '50');
    })
    .toBeLessThan(50);
});

test('opening a panel while placing cancels the placement', async ({ page }) => {
  await enterFarm(page);
  await skipTutorial(page);

  await page.keyboard.press('KeyB');
  await page.getByTestId('build-road').click();
  await expect(page.getByTestId('placing-banner')).toBeVisible();

  await page.keyboard.press('KeyM');
  await expect(page.getByTestId('placing-banner')).toBeHidden();
  await expect(page.getByTestId('market-panel')).toBeVisible();
});

test('prompts never stack', async ({ page }) => {
  await enterFarm(page);
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyB');
  // Exactly one panel and at most one coach mark, always.
  await expect(page.locator('[data-testid="market-panel"]:not([hidden])')).toHaveCount(0);
  await expect(page.getByTestId('coach-mark')).toHaveCount(1);
});
