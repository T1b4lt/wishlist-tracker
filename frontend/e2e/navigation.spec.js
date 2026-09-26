import { test, expect } from '@playwright/test';
import { ApiMock } from './support/apiMock';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';

// The rest of the suite pins `reducedMotion: 'reduce'` (see
// `playwright.config.js`) for stability. This file opts back into real
// motion so the route-change `PageTransition` (`AnimatePresence`
// mode="wait" in `AppShell`) actually runs at least once under test.
test.use({ reducedMotion: 'no-preference' });

async function mockEmptyApp(page) {
  const api = new ApiMock(page);
  api.setConfig(CONFIG_NOT_CONFIGURED);
  api.setCategories([]);
  api.setProducts([]);
  await api.install();
}

test.describe('Navigation', () => {
  test('marks the active nav link and animates between routes', async ({
    page
  }) => {
    await mockEmptyApp(page);
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();

    if (isDesktop) {
      const nav = page
        .getByRole('navigation')
        .filter({ hasText: 'Categories' });
      await expect(
        nav.getByRole('link', { name: 'Dashboard' })
      ).toHaveAttribute('aria-current', 'page');
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
        nav.getByRole('link', { name: 'Dashboard' })
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
        drawer.getByRole('link', { name: 'Dashboard' })
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
    page
  }) => {
    await mockEmptyApp(page);

    await page.goto('/this-page-does-not-exist');
    await expect(
      page.getByRole('heading', { name: 'Page not found' })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Back to wishlist' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();
  });
});
