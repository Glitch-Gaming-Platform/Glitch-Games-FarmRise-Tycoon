/**
 * Live-browser tests. These build and preview the production client, then
 * drive real Chromium/Firefox/WebKit instances, so they prove both that the
 * release bundle boots and that WebGL gameplay actually renders.
 *
 * Requires a one-time `npx playwright install` to download browser binaries.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5174);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // The headless browsers use software WebGL in automation. Concurrent farms
  // produce GPU stalls and simulation-time flakes, so release verification is
  // intentionally serialized instead of relying on retries.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile-chrome',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-webkit',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: `npm run build --workspace @farmrise/shared && npm run build --workspace @farmrise/game && npm run preview --workspace @farmrise/game -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
