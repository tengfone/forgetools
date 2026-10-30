// ESLint v9 flat config. Formatting is Prettier's job (eslint-config-prettier turns off style rules).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'out/',
      'dist/',
      'build/',
      'logs/',
      'test-results/',
      'docs-shots/',
      'src-tauri/',
      '.opencode/',
      '.pi/',
      '.impeccable/',
      '.demo-frames/',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  // TypeScript (type-aware)
  {
    files: ['**/*.ts', '**/*.mts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.web.json', './tsconfig.node.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  // Renderer: browser globals, console only through logger.ts
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: { 'no-console': 'error' },
  },
  {
    files: ['src/renderer/src/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/renderer/src/tools/ui/regexWorker.ts'],
    languageOptions: { globals: { ...globals.worker } },
  },
  // Unit tests
  {
    files: ['tests/unit/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    // fixtures are known-shape; `!` on indexed access is the clearest assertion there
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  // Node scripts / configs
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['**/*.mjs', '*.js', 'vite.config.ts', 'vitest.config.mts'],
    languageOptions: { globals: { ...globals.node } },
  },
  // WebdriverIO + mocha e2e specs (browser.execute callbacks run in the page)
  {
    files: ['tests/e2e/**/*.mjs', 'scripts/**/*.mjs', 'wdio.conf.mjs', 'scripts/demo.wdio.conf.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
        ...globals.browser,
        browser: 'readonly',
        $: 'readonly',
        $$: 'readonly',
        expect: 'readonly',
      },
    },
  },
  prettier,
);
