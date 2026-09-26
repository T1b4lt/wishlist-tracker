import { test as base, expect } from '@playwright/test';
import { ApiMock } from './apiMock';

/**
 * Extends Playwright's `test` with an `apiMock` fixture: an already-`install()`ed
 * `ApiMock` for the test's `page`, so a spec only ever needs the setters
 * (`apiMock.setConfig(...)`, etc.) before `page.goto(...)`.
 *
 * After the test body runs, fails it if any API request went unmatched
 * (`apiMock.unmatchedRequests`, populated by `ApiMock`'s catch-all/fallback
 * routes): a missing fixture must never pass silently just because the
 * page happened to render something that satisfied the test's own
 * assertions anyway.
 */
export const test = base.extend({
  apiMock: async ({ page }, use) => {
    const apiMock = new ApiMock(page);
    await apiMock.install();

    await use(apiMock);

    if (apiMock.unmatchedRequests.length > 0) {
      const list = apiMock.unmatchedRequests
        .map(({ method, url }) => `  ${method} ${url}`)
        .join('\n');
      throw new Error(
        `${apiMock.unmatchedRequests.length} API request(s) were not covered by any fixture ` +
          `(see the "[e2e] Unmocked API request" lines above for when each happened):\n${list}`
      );
    }
  }
});

export { expect };
