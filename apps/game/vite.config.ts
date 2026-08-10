import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  // Glitch Distribution serves index.html from a nested build path. Relative
  // URLs keep JS, models, and audio inside that exact build instead of
  // incorrectly requesting bucket-root /assets/* objects.
  base: './',
  resolve: {
    alias: {
      '@engine': resolvePath('./src/engine'),
      '@game': resolvePath('./src/game'),
      '@assets': resolvePath('./src/assets'),
      '@analytics': resolvePath('./src/analytics'),
      '@platform': resolvePath('./src/platform'),
      '@net': resolvePath('./src/net'),
      '@ui': resolvePath('./src/ui'),
    },
  },
  server: {
    port: 5173,
    // The API lives in the Next.js app. Proxying in dev keeps the browser on a
    // single origin, so cookies behave the same locally as in production.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Three.js is large and changes rarely; splitting it keeps game-code
        // deploys from busting the whole cache.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
