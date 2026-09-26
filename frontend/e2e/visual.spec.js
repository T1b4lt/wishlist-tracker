import { test, expect } from './support/fixtures';
import { CONFIG_CONNECTED, CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildLongHistoryDetail, buildManyProducts } from './fixtures/products';
import { pinFixtureNow } from './fixtures/time';

/**
 * Visual snapshots of every page, in light and dark mode, on both projects
 * (`desktop` and `mobile`, see `playwright.config.js`), to catch unintended
 * visual regressions.
 *
 * Determinism:
 * - the API is mocked with fixed fixtures (`apiMock`);
 * - timezone, locale and reduced motion are pinned in `playwright.config.js`
 *   (charts and page transitions render their final state immediately);
 * - "now" is frozen on both sides: the fixtures are built from a pinned
 *   instant (`pinFixtureNow`) and the browser's `Date` is fixed to the same
 *   instant (`page.clock.setFixedTime`), so every date, axis tick and
 *   relative time ("2 hours ago") is identical on every run;
 * - web fonts are awaited before each capture.
 *
 * Baselines live in `visual.spec.js-snapshots/` and are platform-specific
 * (fonts and anti-aliasing differ per OS). Regenerate them after an
 * intended visual change with `npx playwright test --update-snapshots`
 * (see "Visual snapshots" in `frontend/README.md`).
 */

/** 2026-01-15T12:00:00Z: an arbitrary but fixed "now". */
const FIXED_NOW_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Waits for web fonts, so a capture never races a font swap. */
async function waitForFonts(page) {
  await page.evaluate(() => document.fonts.ready);
}

/**
 * The pages to capture: where to go, which API fixtures they need, and
 * what must be visible before the capture (so it never shows a loading
 * skeleton).
 */
const PAGES = [
  {
    name: 'dashboard',
    path: '/',
    mock: (apiMock) => {
      apiMock.setConfig(CONFIG_NOT_CONFIGURED);
      apiMock.setCategories(CATEGORIES_BASIC);
      apiMock.setProducts(buildManyProducts(8));
    },
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: 'Your wishlist', level: 1 })
      ).toBeVisible();
      await expect(page.getByText('Product 08').first()).toBeAttached();
    }
  },
  {
    name: 'product-detail',
    path: '/product/3',
    mock: (apiMock) => {
      apiMock.setConfig(CONFIG_NOT_CONFIGURED);
      apiMock.setCategories(CATEGORIES_BASIC);
      apiMock.setProducts(buildManyProducts(8));
      apiMock.setDetail(3, buildLongHistoryDetail(3));
    },
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: 'Product 03', level: 1 })
      ).toBeVisible();
      await expect(page.locator('.recharts-line-curve')).toBeVisible();
    }
  },
  {
    name: 'categories',
    path: '/categories',
    mock: (apiMock) => {
      apiMock.setConfig(CONFIG_NOT_CONFIGURED);
      apiMock.setCategories(CATEGORIES_BASIC);
    },
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: 'Manage categories', level: 1 })
      ).toBeVisible();
      await expect(
        page.getByText(CATEGORIES_BASIC[0].name, { exact: true })
      ).toBeVisible();
    }
  },
  {
    name: 'settings',
    path: '/settings',
    mock: (apiMock) => {
      apiMock.setConfig(CONFIG_CONNECTED);
    },
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: 'Settings', level: 1 })
      ).toBeVisible();
      await expect(
        page.getByRole('combobox', { name: 'Analysis hour' })
      ).toHaveText('12:00');
    }
  },
  {
    name: 'not-found',
    path: '/this-page-does-not-exist',
    mock: (apiMock) => {
      apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    },
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: 'Page not found' })
      ).toBeVisible();
    }
  }
];

test.beforeEach(async ({ page }) => {
  pinFixtureNow(FIXED_NOW_MS);
  await page.clock.setFixedTime(FIXED_NOW_MS);
});

test.afterEach(() => {
  pinFixtureNow(null);
});

for (const colorScheme of ['light', 'dark']) {
  test.describe(`Visual snapshots (${colorScheme})`, () => {
    // `next-themes` follows the system preference by default, so emulating
    // it is enough to render the whole app in this mode.
    test.use({ colorScheme });

    for (const { name, path, mock, ready } of PAGES) {
      test(`${name} page`, async ({ page, apiMock }) => {
        mock(apiMock);

        await page.goto(path);
        await ready(page);
        await waitForFonts(page);

        await expect(page).toHaveScreenshot(`${name}-${colorScheme}.png`, {
          fullPage: true
        });
      });
    }
  });
}
