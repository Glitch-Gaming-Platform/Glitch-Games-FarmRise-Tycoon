import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

async function enterFarm(page: Page, timeout = 30_000): Promise<void> {
  await page.getByTestId('menu-play').dispatchEvent('click');
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible({ timeout });
}

test('renders continuously changing farm motion without adding scene draw calls over time', async ({
  page,
}) => {
  await page.goto('/?debug=overlay');
  await enterFarm(page);

  const canvas = page.locator('#app > canvas');
  const overlay = page.getByTestId('debug-overlay');
  await expect(canvas).toBeVisible();
  await expect(overlay).toContainText(/draws\s+[1-9]/);

  const first = await canvas.screenshot();
  const firstDraws = Number(/draws\s+(\d+)/.exec((await overlay.textContent()) ?? '')?.[1] ?? 0);
  await page.waitForTimeout(700);
  const second = await canvas.screenshot();
  const secondDraws = Number(/draws\s+(\d+)/.exec((await overlay.textContent()) ?? '')?.[1] ?? 0);

  expect(Buffer.compare(first, second)).not.toBe(0);
  expect(secondDraws).toBeLessThanOrEqual(firstDraws);
});

test('accepts a sustained sprint input while the procedural locomotion pass is active', async ({
  page,
}) => {
  await page.goto('/');
  await enterFarm(page);

  const canvas = page.locator('#app > canvas');
  const before = await canvas.screenshot();
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(450);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
  const after = await canvas.screenshot();

  expect(Buffer.compare(before, after)).not.toBe(0);
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible();
});

test('sustains an unsprinted walk, the gait path the run blend used to hide', async ({ page }) => {
  test.setTimeout(240_000);
  // Every locomotion spec here held Shift, so the plain walk was the one gait
  // the browser suite never exercised. That mattered: the blend window used to
  // put 6.5 m/s at 78% of the RUN clip, so walking and sprinting drove nearly
  // the same pose and a spec that only sprinted could not tell them apart.
  //
  // The pose numbers themselves are asserted in characterRig.test.ts, where
  // joint angles are readable. What this adds is that the walk path runs in a
  // real browser for a sustained stretch without throwing and while continuing
  // to animate.
  await page.goto('/');
  await enterFarm(page);

  const canvas = page.locator('#app > canvas');
  const frames: Buffer[] = [];
  await page.keyboard.down('w');
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(220);
    frames.push(await canvas.screenshot());
  }
  await page.keyboard.up('w');

  // SwiftShader may return the same compositor frame twice while a PNG encode
  // blocks rendering. The sequence still has to contain real movement; it just
  // cannot promise that every adjacent capture advanced the GPU clock.
  const uniqueFrames = new Set(frames.map((frame) => frame.toString('base64')));
  expect(uniqueFrames.size).toBeGreaterThan(1);
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible();
});

test('gives planting a distinct one-shot pose, particle burst and crop pop', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await enterFarm(page, 60_000);

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await page.waitForTimeout(100);
    if ((await page.getByTestId('hud-prompt').textContent())?.includes('Plant Wheat')) break;
  }
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('hud-prompt')).toContainText('Plant Wheat');

  const canvas = page.locator('#app > canvas');
  const before = await canvas.screenshot();
  await page.keyboard.press('e');
  await page.waitForTimeout(140);
  const during = await canvas.screenshot();

  expect(Buffer.compare(before, during)).not.toBe(0);
  await expect(page.getByTestId('hud-balance')).toContainText('$48.65');
  await page.waitForTimeout(550);
  await expect(page.getByTestId('hud-prompt')).toContainText('Tend');
});

test('keeps the plant animation live through low and Ultra mesh routing', async ({ page }) => {
  test.setTimeout(240_000);
  for (const quality of ['low', 'ultra'] as const) {
    await page.goto(`/?quality=${quality}&debug=actions`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await enterFarm(page, 60_000);

    await expect(page.locator('#app')).toHaveAttribute('data-quality', quality);
    const prompt = page.getByTestId('hud-prompt');
    const canvas = page.locator('#app > canvas');
    await expect(prompt).toContainText('Plant Wheat');
    await expect(canvas).toBeVisible();
    await page.keyboard.press('e');
    await page.waitForTimeout(220);
    await expect(prompt).toContainText('Tend');
    await expect(page.getByTestId('hud-balance')).toContainText('$48.65');
  }
});

test('shows an unobstructed Ultra watering contact sequence that visibly decays', async ({
  page,
}) => {
  await page.goto('/?quality=ultra&debug=actions');
  await enterFarm(page);

  const prompt = page.getByTestId('hud-prompt');
  const canvas = page.locator('#app > canvas');
  await expect(prompt).toContainText('Plant Wheat');
  await page.keyboard.press('e');
  await expect(prompt).toContainText('Tend', { timeout: 5_000 });

  const before = await canvas.screenshot();
  await page.keyboard.press('e');
  // Tend contact is authored at 18% of a 1.65 second action: about 300 ms.
  await page.waitForTimeout(330);
  const contact = await canvas.screenshot();
  await page.waitForTimeout(240);
  const followThrough = await canvas.screenshot();
  await page.waitForTimeout(1_350);
  const decayed = await canvas.screenshot();

  expect(Buffer.compare(before, contact)).not.toBe(0);
  expect(Buffer.compare(contact, followThrough)).not.toBe(0);
  expect(Buffer.compare(followThrough, decayed)).not.toBe(0);
  await expect(page.getByTestId('menu-shortcuts')).toBeVisible();
});
