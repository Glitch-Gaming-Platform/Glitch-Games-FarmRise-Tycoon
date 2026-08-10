/**
 * Root Vitest configuration.
 *
 * Three projects, deliberately separated because they need different
 * environments and have different speed budgets:
 *  - shared: pure functions, node environment, must stay millisecond-fast.
 *  - game:   browser-ish code, jsdom environment, WebGL is stubbed.
 *  - server: route handlers and services, node environment, in-memory or
 *            temp-file SQLite depending on the test.
 *
 * Live-browser coverage is Playwright's job (see playwright.config.ts), not
 * Vitest's.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/** Mirrors the path aliases in each app's tsconfig, so imports resolve identically. */
const gameAliases = {
  '@engine': resolvePath('./apps/game/src/engine'),
  '@game': resolvePath('./apps/game/src/game'),
  '@assets': resolvePath('./apps/game/src/assets'),
  '@analytics': resolvePath('./apps/game/src/analytics'),
  '@platform': resolvePath('./apps/game/src/platform'),
  '@net': resolvePath('./apps/game/src/net'),
  '@ui': resolvePath('./apps/game/src/ui'),
};
const serverAliases = {
  '@/': `${resolvePath('./apps/server/src')}/`,
  '@app/': `${resolvePath('./apps/server/app')}/`,
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: gameAliases },
        test: {
          name: 'game',
          root: './apps/game',
          environment: 'jsdom',
          setupFiles: ['./tests/setup/vitest.setup.ts'],
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: serverAliases },
        test: {
          name: 'server',
          root: './apps/server',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          testTimeout: 20000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/dist/**', '**/tests/**', '**/*.config.*', '**/.next/**'],
    },
  },
});
