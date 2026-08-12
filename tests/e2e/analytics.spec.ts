import { expect, test } from '@playwright/test';

test('enables analytics by default and exposes an opt-out in settings', async ({ page }) => {
  await page.route('https://api.glitch.fun/js/game-analytics.js', (route) => route.abort());
  await page.goto('/?analytics-test=1');

  const consent = page.getByTestId('analytics-consent');
  await expect(consent).toBeHidden();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.locator('#farmrise-glitch-web-analytics')).toHaveCount(1);
  await page.getByTestId('menu-settings').click();
  await expect(page.getByRole('button', { name: 'Privacy choices' })).toBeVisible();
  await page.getByRole('button', { name: 'Privacy choices' }).click();
  await expect(consent).toBeVisible();
});
