import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    // `e2e/**` holds Playwright specs (see `playwright.config.js`), not
    // Vitest ones: they use a different `test`/`expect` API and must never
    // be picked up here.
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
});
