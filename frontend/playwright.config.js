import { defineConfig } from '@playwright/test';

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
  // (`page.route` against `http://localhost:8000`, the app's default
  // `VITE_API_URL`): no real backend is ever started for these tests.
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
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
