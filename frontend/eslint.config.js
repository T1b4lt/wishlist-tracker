import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module'
      }
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }]
    }
  },
  {
    files: ['src/components/ui/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.vitest
    }
  },
  {
    files: ['playwright.config.js', 'e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      // Playwright fixtures (`support/fixtures.js`) take a `use` callback
      // parameter, a Playwright API convention unrelated to React's `use()`
      // hook; this rule otherwise mistakes it for one because of the name.
      'react-hooks/rules-of-hooks': 'off'
    }
  }
]);
