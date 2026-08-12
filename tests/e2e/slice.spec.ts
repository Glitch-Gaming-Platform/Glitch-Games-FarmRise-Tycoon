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
  await page.getByTestId('menu-play').dispatchEvent('click');
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible({ timeout: 75_000 });
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

async function harvestFirstCrop(page: Page) {
  // The prompt can change to Harvest one fixed tick before the previous work
  // lock releases. Retry the real key until the carried-goods state confirms
  // the harvest instead of assuming a single synthetic edge landed.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press('e');
    try {
      await expect(page.getByTestId('hud-carry')).toContainText(/[1-9]/, { timeout: 700 });
      return;
    } catch {
      await page.waitForTimeout(180);
    }
  }
  await expect(page.getByTestId('hud-carry')).toContainText(/[1-9]/);
}

async function preventFirstIncident(page: Page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press('f');
    try {
      await expect(page.getByTestId('coach-mark')).toContainText(/Starter Extension/i, {
        timeout: 700,
      });
      return;
    } catch {
      await page.waitForTimeout(180);
    }
  }
  await expect(page.getByTestId('coach-mark')).toContainText(/Starter Extension/i);
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

async function carryFirstHarvestHome(page: Page) {
  await expect(page.getByTestId('hud-carry')).toContainText(/[1-9]/);
  await expect(page.getByTestId('coach-mark')).toContainText(/shelter.*(press E|tap Work)/i);

  await page.keyboard.down('Shift');
  await page.keyboard.down('d');
  try {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await page.waitForTimeout(100);
      if ((await page.getByTestId('hud-prompt').textContent())?.includes('Put down')) break;
    }
  } finally {
    await page.keyboard.up('d');
    await page.keyboard.up('Shift');
  }
  await expect(page.getByTestId('hud-prompt')).toContainText('Put down');

  await page.keyboard.press('e');
  await expect(page.getByTestId('hud-storage')).toContainText(/[1-9]\/60/);
  await expect(page.getByTestId('hud-carry')).toHaveCount(0);
}

async function reachEggStack(page: Page) {
  const prompt = page.getByTestId('hud-prompt');
  if (/Pick up .*Eggs/i.test((await prompt.textContent()) ?? '')) return;

  // The first plot is north-west of the shelter. The basket is on its east
  // side, and the shelter's solid footprint blocks a straight diagonal. Walk
  // a three-leg route below the building. These durations follow the shipped
  // 3.773 m/s sprint rather than the old arcade-speed player movement.
  await page.waitForTimeout(1_000);
  await page.keyboard.down('Shift');
  await page.keyboard.down('s');
  await page.waitForTimeout(3_500);
  await page.keyboard.up('s');
  await page.keyboard.down('d');
  await page.waitForTimeout(4_500);
  await page.keyboard.up('d');
  await page.keyboard.down('w');
  try {
    for (let step = 0; step < 60; step += 1) {
      await page.waitForTimeout(100);
      if (/Pick up .*Eggs/i.test((await prompt.textContent()) ?? '')) return;
    }
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
  }

  await expect(prompt).toContainText(/Pick up .*Eggs/i);
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
        await expect(page.getByTestId('placing-banner')).toBeVisible({ timeout: 3_000 });
        return;
      }
    }
  }

  throw new Error('No valid road-placement point was found on the visible canvas.');
}

test('crop condition bars stay out of the top HUD', async ({ page }) => {
  await enterFarm(page);
  await reachFirstPlot(page);

  // Water, growth and spoilage are Three.js labels anchored over the affected
  // world object. The top HUD must not recreate the old full-width meters.
  await expect(page.getByTestId('hud-meter-water')).toHaveCount(0);
  await expect(page.getByTestId('hud-meter-growth')).toHaveCount(0);
  await expect(page.getByTestId('hud-meter-freshness')).toHaveCount(0);

  await page.keyboard.press('e');
  await expect(page.getByTestId('hud-prompt')).toContainText('Tend');
  await expect(page.getByTestId('hud-meter-water')).toHaveCount(0);
  await expect(page.getByTestId('hud-meter-growth')).toHaveCount(0);
});

test('a new player is given something to do within seconds', async ({ page }) => {
  await enterFarm(page);
  const coach = page.getByTestId('coach-mark');
  await expect(coach).toBeVisible({ timeout: 10_000 });
  await expect(coach).toContainText(/W A S D/i);
  await expect(coach).toContainText(/Hold SHIFT to run/i);
  await expect(coach).toContainText(/brown plot/i);
});

test('the first-time loop reaches harvest, sale and reinvestment without a long wait', async ({
  page,
}) => {
  // Software-rendered Firefox can spend most of the default allowance drawing
  // the farm when this test follows the rest of the release matrix. The crop
  // still uses the accelerated onboarding clock; this only protects the
  // browser-driving wall-clock budget from renderer contention.
  test.setTimeout(300_000);
  await enterFarm(page, '/?quality=low');
  await reachFirstPlot(page);

  await page.keyboard.press('e');
  await expect(page.getByTestId('hud-prompt')).toContainText('Tend');
  await expect(page.getByTestId('coach-mark')).toContainText(/(press E|tap Work).*water/i);

  await tendFirstCrop(page);
  await expect(page.getByTestId('hud-prompt')).toContainText('Harvest', { timeout: 30_000 });

  await harvestFirstCrop(page);
  await carryFirstHarvestHome(page);
  await expect(page.getByTestId('coach-mark')).toContainText(/(Press M|Tap Market).*Sell all/i);

  await page.keyboard.press('m');
  await expect(page.getByTestId('market-panel')).toBeVisible();
  await expect(page.getByTestId('market-sell-all-eggs')).toHaveCount(0);
  await expect(page.getByTestId('market-sell-all-wheat')).toBeVisible();
  await page.getByTestId('market-sell-all-wheat').click();
  await expect
    .poll(async () => {
      const text = await page.getByTestId('hud-balance').innerText();
      return Number(text.match(/\$([\d.]+)/)?.[1] ?? '0');
    })
    .toBeGreaterThan(48.8);
  // A returning or exploratory player may have sold the starter feed before
  // the egg lesson. The first clutch is already fed, so onboarding must still
  // produce a visible, collectable basket; later clutches require stored corn.
  await expect(page.getByTestId('market-sell-all-corn')).toBeVisible();
  await page.getByTestId('market-sell-all-corn').click();
  await expect(page.getByTestId('market-sell-all-corn')).toHaveCount(0);
  await expect(page.getByTestId('coach-mark')).toContainText(/(Press B|Tap Build).*place/i);

  await page.getByTestId('market-close').click();
  // This scenario proves the progression loop. Shortcut behavior is covered
  // by the dedicated panel-input test below, so use the always-visible menu
  // control here to avoid losing a synthetic key event under a busy renderer.
  await page.getByRole('button', { name: 'Open build' }).click();
  await expect(page.getByTestId('build-panel')).toBeVisible();
  await expect(page.getByTestId('build-land-row-parcel-starter-extension')).toContainText(
    /Collect the eggs/i,
  );
  await expect(page.getByTestId('build-land-parcel-starter-extension')).toBeDisabled();
  await page.getByTestId('build-animal-chicken').click();
  await expect(page.getByTestId('build-panel')).toContainText(/stored Corn.*Eggs.*Market/i);
  await page.getByTestId('build-close').click();
  await expect(page.getByTestId('hud-objective')).toBeVisible();

  await expect(page.getByTestId('coach-mark')).toContainText(/Collect the eggs/i);
  await reachEggStack(page);
  await page.keyboard.press('e');
  await expect(page.getByTestId('hud-prompt')).toContainText(
    "You can't carry anymore. Store some items first.",
  );
  await page.keyboard.press('m');
  await expect(page.getByTestId('market-sell-all-eggs')).toBeVisible();
  await page.getByTestId('market-close').click();
  await expect(page.getByTestId('coach-mark')).toContainText(/Something is coming/i);
  await expect(page.getByTestId('hud-warning')).toBeVisible();
  await preventFirstIncident(page);
  await expect(page.getByText('That is already dealt with.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open build' }).click();
  const extension = page.getByTestId('build-land-row-parcel-starter-extension');
  const north = page.getByTestId('build-land-row-parcel-north-field');
  await expect(extension).toContainText(/\$20\.00.*3 crop beds/i);
  await expect(page.getByTestId('build-land-parcel-starter-extension')).toBeEnabled();
  await expect(north).toContainText(/Buy Starter Extension first/i);
  await page.getByTestId('build-land-parcel-starter-extension').click();
  await expect(page.getByTestId('build-panel')).toBeHidden();
  await expect(page.getByTestId('coach-mark')).toContainText(/Millbrook Seed Box/i);
  await page.getByRole('button', { name: 'Open town' }).click();
  await expect(page.getByTestId('town-panel')).toBeVisible();
  const starterProject = page.getByTestId('town-project-project-seed-box');
  await expect(starterProject).toBeEnabled();
  await expect(page.getByTestId('town-projects')).toContainText(/\$0\.00.*no materials needed/i);
  await starterProject.click();
  await expect(page.getByTestId('town-projects')).toContainText(/Millbrook Seed Box.*remaining/i);
  await expect(page.getByTestId('coach-mark')).toBeHidden({ timeout: 5_000 });
});

test('the top objective, status bar and messages never overlap', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1184, height: 780 });
  await enterFarm(page, '/?quality=low');
  await skipTutorial(page);

  const objective = page.getByTestId('hud-objective');
  const stats = page.getByTestId('hud-bar');
  await expect(objective).toBeVisible();
  await expect(stats).toBeVisible();
  const [objectiveBox, statsBox] = await Promise.all([
    objective.boundingBox(),
    stats.boundingBox(),
  ]);
  expect(objectiveBox).not.toBeNull();
  expect(statsBox).not.toBeNull();
  const horizontallySeparate =
    objectiveBox!.x + objectiveBox!.width <= statsBox!.x ||
    statsBox!.x + statsBox!.width <= objectiveBox!.x;
  const verticallySeparate =
    objectiveBox!.y + objectiveBox!.height <= statsBox!.y ||
    statsBox!.y + statsBox!.height <= objectiveBox!.y;
  expect(horizontallySeparate || verticallySeparate).toBe(true);
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
  await page.getByTestId('pause-resume').dispatchEvent('click');
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
  const extension = page.getByTestId('build-land-row-parcel-starter-extension');
  const north = page.getByTestId('build-land-row-parcel-north-field');
  await expect(extension).toBeVisible();
  await expect(extension).toContainText(/\$20\.00.*3 crop beds/i);
  await expect(north).toBeVisible();
  await expect(north).toContainText(/Buy Starter Extension first/i);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('build-panel')).toBeHidden();
});

test('choosing a building enters placement mode', async ({ page }) => {
  await enterFarm(page, '/?quality=low');
  await skipTutorial(page);

  await page.keyboard.press('KeyB');
  await page.getByTestId('build-road').click();

  await expect(page.getByTestId('build-panel')).toBeHidden();
  await expect(page.getByTestId('placing-banner')).toBeVisible();
  await expect(page.getByTestId('placing-banner')).toContainText(/R to rotate/i);
  await expect(page.getByTestId('placing-banner')).toContainText(/WASD to move/i);
  await expect(page.getByTestId('placing-banner')).toContainText(/Esc to stop/i);

  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('placing-banner')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('placing-banner')).toBeHidden();
});

test('one selection can place multiple buildings with world clicks', async ({ page }) => {
  test.setTimeout(180_000);
  await enterFarm(page, '/?quality=low');
  await skipTutorial(page);

  await page.keyboard.press('KeyB');
  await page.getByTestId('build-road').click();
  await placeAtFirstValidCanvasPoint(page);
  await expect(page.getByTestId('placing-banner')).toBeVisible();

  await expect
    .poll(async () => {
      const text = await page.getByTestId('hud-balance').innerText();
      return Number(text.match(/\$([\d.]+)/)?.[1] ?? '50');
    })
    .toBeLessThan(50);

  await placeAtFirstValidCanvasPoint(page);
  await expect
    .poll(async () => {
      const text = await page.getByTestId('hud-balance').innerText();
      return Number(text.match(/\$([\d.]+)/)?.[1] ?? '50');
    })
    .toBeLessThan(46);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('placing-banner')).toBeHidden();
});

test('WASD movement remains active while a placement cursor is open', async ({ page }) => {
  await enterFarm(page, '/?quality=low');

  await page.keyboard.press('KeyB');
  await page.getByTestId('build-road').click();
  await expect(page.getByTestId('placing-banner')).toBeVisible();

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  try {
    await expect(page.getByTestId('coach-mark')).toContainText(/Put something in the ground/i, {
      timeout: 14_000,
    });
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
  }

  await expect(page.getByTestId('placing-banner')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('opening a panel while placing cancels the placement', async ({ page }) => {
  await enterFarm(page, '/?quality=low');
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
