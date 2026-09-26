import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildDashboardProduct, buildManyProducts } from './fixtures/products';

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

  test('searches and filters the product list, keeping it in the URL', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts([
      buildDashboardProduct({
        id: 1,
        name: 'DJI Mini 5 Pro',
        store_id: 1,
        store_name: 'Amazon',
        current_price: 999
      }),
      buildDashboardProduct({
        id: 2,
        name: 'DJI Mini 5 Pro',
        store_id: 2,
        store_name: 'PcComponentes',
        store_domain: 'pccomponentes.com',
        current_price: 949,
        is_in_stock: false
      }),
      buildDashboardProduct({
        id: 3,
        name: 'Wireless Headphones',
        store_id: 1,
        store_name: 'Amazon'
      })
    ]);

    await page.goto('/');

    const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
    const visibleItems = () =>
      isDesktop
        ? page
            .getByRole('table')
            .getByRole('row')
            .filter({ hasNot: page.getByRole('columnheader') })
        : page.getByRole('listitem');

    await expect(visibleItems()).toHaveCount(3);

    await page.getByRole('searchbox', { name: 'Search products' }).fill('dji');
    await expect(visibleItems()).toHaveCount(2);
    await expect(page.getByText('Showing 2 of 3 products')).toBeVisible();
    await expect(page).toHaveURL(/\?q=dji$/);

    // Narrow down to in-stock variants from the filter panel.
    await page.getByRole('button', { name: /Filters/ }).click();
    const panel = page.getByRole('dialog', { name: 'Filter products' });
    await panel.getByText('In stock', { exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(visibleItems()).toHaveCount(1);

    // The filters survive a reload.
    await page.reload();
    await expect(
      page.getByRole('searchbox', { name: 'Search products' })
    ).toHaveValue('dji');
    await expect(visibleItems()).toHaveCount(1);

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(visibleItems()).toHaveCount(2);
  });
});
