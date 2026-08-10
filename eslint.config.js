// Flat ESLint config. The most important thing in this file is the
// `import/no-restricted-paths` block: it turns the architectural dependency
// rules documented in docs/ARCHITECTURE.md into a build failure rather than a
// convention people forget. If you need to change a boundary, change the ADR
// first, then this file.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

/** Layer boundaries for the browser client. Lower layers never see higher ones. */
const clientLayerZones = [
  // engine/* is the reusable, game-agnostic runtime. It must not know that
  // FarmRise Tycoon exists.
  {
    target: './apps/game/src/engine',
    from: [
      './apps/game/src/game',
      './apps/game/src/ui',
      './apps/game/src/net',
      './apps/game/src/assets',
    ],
    message:
      'engine/ is game-agnostic. Move the shared behaviour into engine/ or invert the dependency with a port/interface.',
  },
  // Simulation code must not reach into the DOM UI layer. UI observes the game
  // through the event bus and read-only selectors.
  {
    target: './apps/game/src/game',
    from: ['./apps/game/src/ui'],
    message: 'game/ must not import ui/. Emit an event and let the UI subscribe.',
  },
  // Assets are a leaf: they describe and load bytes, nothing else.
  {
    target: './apps/game/src/assets',
    from: ['./apps/game/src/game', './apps/game/src/ui', './apps/game/src/net'],
    message: 'assets/ is a leaf layer and may only depend on engine/ and @farmrise/shared.',
  },
  // Analytics is a SINK. It defines an event schema and a buffered client and
  // subscribes to buses from the bootstrap layer. It must never be imported by
  // gameplay, or instrumentation starts dictating design.
  {
    target: './apps/game/src/analytics',
    from: [
      './apps/game/src/game',
      './apps/game/src/ui',
      './apps/game/src/net',
      './apps/game/src/assets',
    ],
    message:
      'analytics/ is a sink. Subscribe to an existing event bus from bootstrap/ instead of importing gameplay.',
  },
  {
    target: './apps/game/src/game',
    from: ['./apps/game/src/analytics'],
    message:
      'game/ must not know it is being measured. Emit an event and let bootstrap/bindAnalytics translate it.',
  },
  // The platform layer wraps third-party services (Glitch) and storage
  // tiering. It must not contain gameplay rules, and gameplay must not know
  // which platform it is running on.
  {
    target: './apps/game/src/platform',
    from: ['./apps/game/src/game', './apps/game/src/ui', './apps/game/src/assets'],
    message:
      'platform/ wraps external services. Take what it needs as arguments; do not import gameplay.',
  },
  {
    target: './apps/game/src/game',
    from: ['./apps/game/src/platform'],
    message: 'game/ must not know whether Glitch exists. Wire the platform in from bootstrap/.',
  },
  // Networking is transport only. It must not contain gameplay rules.
  {
    target: './apps/game/src/net',
    from: ['./apps/game/src/game', './apps/game/src/ui'],
    message: 'net/ is transport only. Gameplay decisions belong in game/.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    settings: {
      // The TypeScript resolver is required for the boundary rules to see
      // through the `@engine/*`-style path aliases. Without it,
      // `import/no-restricted-paths` silently ignores every aliased import,
      // which would make the architecture rules decorative.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./packages/*/tsconfig.json', './apps/*/tsconfig.json'],
        },
        node: { extensions: ['.js', '.ts', '.tsx'] },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            ...clientLayerZones,
            // The shared contract package is the only thing both sides may
            // depend on, and it may depend on neither of them.
            {
              target: './packages/shared',
              from: ['./apps'],
              message: '@farmrise/shared is the contract package and must not depend on any app.',
            },
            // Private server logic never ships to the browser.
            {
              target: './apps/game',
              from: ['./apps/server'],
              message:
                'The client must not import server code. Put the shape in packages/shared and keep the logic on the server.',
            },
            {
              target: './apps/server',
              from: ['./apps/game'],
              message: 'The server must not import client code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/game/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Tests may reach across boundaries in order to assemble fixtures.
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**', '**/e2e/**'],
    rules: { 'import/no-restricted-paths': 'off', 'no-console': 'off' },
  },
  {
    files: ['**/*.config.{ts,js,mjs}', 'apps/server/scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
