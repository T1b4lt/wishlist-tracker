import { defineConfig } from '@playwright/test';
import { API_URL } from './e2e/support/constants.js';

/** Port the Vite dev server binds to for the e2e run. Distinct from the
 * regular dev port (5173) so `just test-e2e` never collides with `just dev`
 * running in another terminal. */
const PORT = 4310;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',

  // Every API call is mocked per-test via `e2e/support/apiMock.js`
  // (`page.route` against `API_URL`). `VITE_API_URL` is pinned to that same
  // mocked origin here, in the dev server's own environment, so the app
  // always targets it regardless of any `VITE_API_URL` already exported in
  // the outer shell (which would otherwise point requests at a real backend
  // - e.g. one already running via `just dev-backend` - bypassing the
  // mocks). No real backend is ever started for these tests.
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      VITE_API_URL: API_URL
    }
  },

  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    // Pinned so date/time assertions are stable regardless of the machine
    // running the suite (the developer runs in Europe/Madrid).
    timezoneId: 'UTC',
    locale: 'en-US',
    // Stable by default; `e2e/navigation.spec.js` opts back into motion
    // (`test.use({ reducedMotion: 'no-preference' })`) to smoke-test the
    // page transition with animation actually running.
    reducedMotion: 'reduce'
  },

  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    }
  ]
});
