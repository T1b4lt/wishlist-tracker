/**
 * The mocked backend origin. Matches `API_URL`'s own default
 * (`src/lib/api/client.js`: `import.meta.env.VITE_API_URL || 'http://localhost:8000'`),
 * so the app talks to this origin in the e2e Vite dev server without any
 * extra env wiring, and every request is intercepted by
 * `support/apiMock.js` before it reaches the network. No real backend is
 * ever started for these tests.
 */
export const API_URL = 'http://localhost:8000';
