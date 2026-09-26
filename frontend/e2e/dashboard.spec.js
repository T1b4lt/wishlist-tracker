import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildManyProducts } from './fixtures/products';

test.describe('Dashboard', () => {
  test('shows the empty state with no products', async ({ page, apiMock }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([]);
    apiMock.setProducts([]);

    await page.goto('/');

    await expect(page).toHaveTitle('Your wishlist | Wishlist Tracker');
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByText('No products in your wishlist yet')
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add product' }).first()
    ).toBeVisible();
  });

  test('renders the summary strip and the product list', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts(buildManyProducts(25));

    await page.goto('/');

    await expect(page).toHaveTitle('Your wishlist | Wishlist Tracker');
    await expect(
      page.getByRole('heading', { name: 'Your wishlist', level: 1 })
    ).toBeVisible();

    // Summary strip.
    await expect(page.getByText('Items')).toBeVisible();
    await expect(page.getByText('25', { exact: true })).toBeVisible();

    const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
    if (isDesktop) {
      const table = page.getByRole('table');
      await expect(table).toBeVisible();
      // One header row + 25 product rows.
      await expect(table.getByRole('row')).toHaveCount(26);
      await expect(
        page.getByRole('link', { name: 'Product 01' })
      ).toBeVisible();
      // The mobile card list stays in the DOM (hidden via CSS from `md` up),
      // so it must not be visible at this viewport.
      await expect(
        page.getByRole('link', { name: 'Open Product 01' })
      ).toBeHidden();
    } else {
      const list = page.getByRole('list').filter({ hasText: 'Product 01' });
      await expect(list).toBeVisible();
      await expect(page.getByRole('listitem')).toHaveCount(25);
      await expect(
        page.getByRole('link', { name: 'Open Product 01' })
      ).toBeVisible();
      await expect(page.getByRole('table')).toBeHidden();
    }
  });
});
