/**
 * The mocked backend origin. Deliberately *not* `src/lib/api/client.js`'s
 * default (`http://localhost:8000`, the real backend's usual dev address):
 * `playwright.config.js` pins `VITE_API_URL` to this exact value for the
 * e2e Vite dev server (`webServer.env`), so every request the app makes
 * targets this origin regardless of any `VITE_API_URL` already exported in
 * the shell (which would otherwise point the app at a real backend that
 * might happen to be running, e.g. via `just dev-backend`, sidestepping the
 * mocks entirely). Every request to it is intercepted by
 * `support/apiMock.js` before it reaches the network; no real backend is
 * ever started for these tests.
 */
export const API_URL = 'http://mock-api.e2e-test.internal';
