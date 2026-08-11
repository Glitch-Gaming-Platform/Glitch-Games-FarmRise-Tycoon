import { expect, test, type Page } from '@playwright/test';
import { createIncidentReviewCareer } from '../../apps/game/src/game/debug/incidentReview.js';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

async function enterSavedIncident(page: Page, definitionId: string): Promise<void> {
  const state = createIncidentReviewCareer(definitionId).state;
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
  await page.goto('/');
  await page.getByTestId('menu-play').dispatchEvent('click');
  await expect(page.getByTestId('hud-warning')).toBeVisible({ timeout: 30_000 });
}

test('restores a persisted warning and Protect chooses the paid response', async ({ page }) => {
  await enterSavedIncident(page, 'incident-cold-snap');

  await expect(page.getByTestId('hud-warning')).toContainText('Cold snap in');
  await expect(page.getByTestId('hud-warning')).toContainText('F to prevent $22.00');

  const before = await page.getByTestId('hud-balance').textContent();
  await page.keyboard.press('f');

  await expect(page.getByRole('log')).toContainText('You are dealing with it.');
  await expect(page.getByTestId('hud-warning')).not.toContainText('F to prevent');
  const after = await page.getByTestId('hud-balance').textContent();
  const dollars = (text: string | null): number =>
    Number(text?.replace(/[^0-9.]/g, '') ?? Number.NaN);
  expect(dollars(before) - dollars(after)).toBeGreaterThan(21.5);
});

test('Protect refuses to perform a physical cart repair remotely', async ({ page }) => {
  await enterSavedIncident(page, 'incident-cart-axle');

  await expect(page.getByTestId('hud-warning')).toContainText('Broken cart axle');
  await expect(page.getByTestId('hud-warning')).not.toContainText('F to prevent');
  await expect(page.getByTestId('hud-prompt')).toContainText('Repair the axle');

  await page.keyboard.press('f');

  await expect(page.getByRole('log')).toContainText(
    'Go to the marked problem and use Work to answer it.',
  );
  await expect(page.getByTestId('hud-carry')).toContainText('10/30');
});
