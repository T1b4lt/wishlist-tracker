import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildManyProducts } from './fixtures/products';

// The rest of the suite pins `reducedMotion: 'reduce'` (see
// `playwright.config.js`) for stability. This file opts back into real
// motion so the route-change `PageTransition` (`AnimatePresence`
// mode="wait" in `AppShell`) actually runs at least once under test.
test.use({ reducedMotion: 'no-preference' });

function mockEmptyApp(apiMock) {
  apiMock.setConfig(CONFIG_NOT_CONFIGURED);
  apiMock.setCategories([]);
  apiMock.setProducts([]);
}

test.describe('Navigation', () => {
  test('marks the active nav link and animates between routes', async ({
    page,
    apiMock
  }) => {
    mockEmptyApp(apiMock);
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();

    if (isDesktop) {
      const nav = page
        .getByRole('navigation')
        .filter({ hasText: 'Categories' });
      await expect(nav.getByRole('link', { name: 'Wishlist' })).toHaveAttribute(
        'aria-current',
        'page'
      );
      await expect(
        nav.getByRole('link', { name: 'Categories' })
      ).not.toHaveAttribute('aria-current', 'page');

      await nav.getByRole('link', { name: 'Categories' }).click();
      await expect(
        page.getByRole('heading', { name: 'Manage categories', level: 1 })
      ).toBeVisible();
      await expect(
        nav.getByRole('link', { name: 'Categories' })
      ).toHaveAttribute('aria-current', 'page');
      await expect(
        nav.getByRole('link', { name: 'Wishlist' })
      ).not.toHaveAttribute('aria-current', 'page');

      await nav.getByRole('link', { name: 'Settings' }).click();
      await expect(
        page.getByRole('heading', { name: 'Settings', level: 1 })
      ).toBeVisible();
    } else {
      // Below `md`, navigation lives inside the header's drawer menu.
      await page.getByRole('button', { name: 'Open menu' }).click();
      const drawer = page.getByRole('dialog');
      await expect(
        drawer.getByRole('link', { name: 'Wishlist' })
      ).toHaveAttribute('aria-current', 'page');

      await drawer.getByRole('link', { name: 'Categories' }).click();
      await expect(
        page.getByRole('heading', { name: 'Manage categories', level: 1 })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(
        page.getByRole('dialog').getByRole('link', { name: 'Categories' })
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  test('the 404 page is reachable and links back to the dashboard', async ({
    page,
    apiMock
  }) => {
    mockEmptyApp(apiMock);

    await page.goto('/this-page-does-not-exist');
    await expect(
      page.getByRole('heading', { name: 'Page not found' })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Back to wishlist' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();
  });

  test('the brand links back to the wishlist', async ({ page, apiMock }) => {
    mockEmptyApp(apiMock);

    await page.goto('/categories');
    await expect(
      page.getByRole('heading', { name: 'Manage categories', level: 1 })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Wishlist Tracker' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();
  });

  test('a route change lands at the top of the new page, not at the old scroll position', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts(buildManyProducts(25));

    // Settings is long enough to scroll well down; the dashboard, with 25
    // products, is longer still, so the old scroll position would still be
    // reachable there if nothing reset it.
    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 })
    ).toBeVisible();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    // The brand link lives in the sticky header, so it is reachable from
    // any scroll position.
    await page.getByRole('link', { name: 'Wishlist Tracker' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('the mobile drawer closes after leaving a dirty page through the guard', async ({
    page,
    apiMock
  }) => {
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
    test.skip(isDesktop, 'The drawer only exists below `md`.');
    mockEmptyApp(apiMock);

    await page.goto('/settings');
    await page.getByRole('combobox', { name: 'Analysis hour' }).click();
    await page.getByRole('option', { name: '14:00' }).click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('link', { name: 'Wishlist' }).click();

    await page.getByRole('button', { name: 'Leave without saving' }).click();

    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();
    await expect(drawer).toBeHidden();
  });
});
