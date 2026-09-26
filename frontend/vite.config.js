import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Pin the timezone for Vitest so every unit test is timezone-independent
// (date formatting and day bucketing otherwise depend on the machine's TZ).
// Set on the main process before the test pool spawns, so worker forks
// inherit it; also forwarded explicitly through `test.env` below. Harmless
// for `vite dev`/`vite build`, which do not format dates at config time.
if (process.env.VITEST) {
  process.env.TZ = 'UTC';
}

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
    env: { TZ: 'UTC' },
    // `e2e/**` holds Playwright specs (see `playwright.config.js`), not
    // Vitest ones: they use a different `test`/`expect` API and must never
    // be picked up here.
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
});
