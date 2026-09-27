import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import {
  buildDashboardProduct,
  buildMultiStoreProduct,
  buildOfferSummary,
  buildManyProducts
} from './fixtures/products';
import { buildDailyCheck } from './fixtures/dailyCheck';
import { DAY_SECONDS, nowSeconds } from './fixtures/time';

test.describe('Dashboard', () => {
  test('shows the Gemini limit notice with the pending products', async ({
    page,
    apiMock
  }) => {
    const now = Math.floor(Date.now() / 1000);
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts(buildManyProducts(3));
    apiMock.setDailyCheck(
      buildDailyCheck({
        started_at: now - 600,
        total_products: 40,
        limit_reached_at: now - 420,
        pending_at_limit: 15,
        pending_now: 12
      })
    );

    await page.goto('/');

    await expect(
      page.getByText(/Gemini limit reached at .+ with 15 prices left/)
    ).toBeVisible();
    await expect(
      page.getByText('12 still pending, retrying every 10 minutes.')
    ).toBeVisible();
  });

  test('flags products whose price has not been updated for days', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts([
      buildDashboardProduct({ id: 1, name: 'Wireless Headphones' }),
      buildDashboardProduct({
        id: 2,
        name: 'Discontinued Drone',
        offers: [
          buildOfferSummary({
            id: 2,
            last_checked_at: nowSeconds() - 5 * DAY_SECONDS - 60
          })
        ]
      })
    ]);

    await page.goto('/');

    // The table (md+) and the card list (<md) are both in the DOM; only the
    // one for the current viewport is visible.
    const staleBadges = page
      .getByText('No updates for 5 days')
      .filter({ visible: true });
    await expect(staleBadges).toHaveCount(1);
    await expect(page.getByText('Outdated', { exact: true })).toBeVisible();
    await expect(page.getByTestId('summary-stale-count')).toHaveText('1');

    // The badge's tooltip must not get in the way of the row actions menu.
    await page
      .getByRole('button', { name: 'Actions for Discontinued Drone' })
      .filter({ visible: true })
      .click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete product' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // The "outdated" filter, read from the URL, keeps only the stale one.
    await page.goto('/?stale=1');
    await expect(
      page.getByText('Discontinued Drone').filter({ visible: true })
    ).toHaveCount(1);
    await expect(
      page.getByText('Wireless Headphones').filter({ visible: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Remove filter: Outdated' })
    ).toBeVisible();
  });

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
        current_price: 999,
        best_offer_id: 1,
        offers: [
          buildOfferSummary({
            id: 1,
            store_id: 1,
            store_name: 'Amazon',
            current_price: 999
          })
        ]
      }),
      buildDashboardProduct({
        id: 2,
        name: 'DJI Mini 5 Pro',
        current_price: 949,
        is_in_stock: false,
        best_offer_id: 2,
        offers: [
          buildOfferSummary({
            id: 2,
            store_id: 2,
            store_name: 'PcComponentes',
            store_domain: 'pccomponentes.com',
            current_price: 949,
            is_in_stock: false
          })
        ]
      }),
      buildDashboardProduct({
        id: 3,
        name: 'Wireless Headphones',
        best_offer_id: 3,
        offers: [
          buildOfferSummary({ id: 3, store_id: 1, store_name: 'Amazon' })
        ]
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

  test('counts a product tracked in two stores once', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    apiMock.setProducts([buildMultiStoreProduct()]);

    await page.goto('/');

    await expect(page.getByTestId('summary-items')).toHaveText('1');
    await expect(
      page.getByRole('button', { name: '+1 store' }).filter({ visible: true })
    ).toHaveCount(1);
  });
});
