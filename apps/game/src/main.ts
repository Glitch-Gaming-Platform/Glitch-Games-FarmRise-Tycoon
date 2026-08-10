/**
 * Browser entry point. Its only job is to find the mount element and hand off
 * to the composition root - keeping it this thin means the whole game can be
 * started from a test or a Storybook-style harness by calling startGame().
 */
import { startGame } from './bootstrap/startGame.js';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app element. Check index.html.');
}

startGame({
  container,
  isDev: import.meta.env.DEV,
  apiBaseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
}).catch((error: unknown) => {
  console.error('[FarmRise] failed to start', error);
});
