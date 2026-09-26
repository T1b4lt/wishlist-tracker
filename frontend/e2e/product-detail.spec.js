import { test, expect } from '@playwright/test';
import { ApiMock } from './support/apiMock';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import {
  buildDashboardProduct,
  buildHistoryPoint,
  buildProductDetail,
  buildSinglePointDetail
} from './fixtures/products';
import { DAY_SECONDS, formatShortDateUTC, nowSeconds } from './fixtures/time';

/**
 * Six points spread from 140 days ago to 1 day ago, with strictly
 * decreasing-then-flat prices chosen so each range option's average is
 * distinct and easy to assert on (see the range selector test below):
 * - within the last 30 days: 100, 50 -> average 75
 * - within the last 60 days (the fixture's `hist_window_size`, so this is
 *   also the page's default range): 150, 100, 50 -> average 100
 * - all 6 points ("All"): 300, 250, 200, 150, 100, 50 -> average 175
 */
function buildRangeHistory() {
  const now = nowSeconds();
  return [140, 100, 70, 40, 10, 1].map((daysAgo, index) =>
    buildHistoryPoint({
      price: 300 - index * 50,
      timestamp: now - daysAgo * DAY_SECONDS
    })
  );
}

test.describe('Product detail', () => {
  test('the range selector recomputes the range-dependent stats', async ({
    page
  }) => {
    const api = new ApiMock(page);
    api.setConfig(CONFIG_NOT_CONFIGURED); // hist_window_size: 60
    api.setCategories(CATEGORIES_BASIC);
    const product = buildDashboardProduct({ id: 1 });
    api.setProducts([product]);
    api.setDetail(
      1,
      buildProductDetail({ id: 1, price_history: buildRangeHistory() })
    );
    await api.install();

    await page.goto('/product/1');
    await expect(
      page.getByRole('heading', { name: 'Price history' })
    ).toBeVisible();

    // Default range: the option closest to `hist_window_size` (60).
    await expect(page.getByRole('radio', { name: '60 days' })).toBeChecked();
    await expect(
      page.getByText('Average in range').locator('..')
    ).toContainText('$100.00');

    // The radio input itself is visually hidden (a sibling label carries
    // the visible text and the sliding indicator overlay can momentarily
    // sit on top of it), so it is force-clicked directly rather than going
    // through the normal actionability/interception checks.
    await page.getByRole('radio', { name: '30 days' }).click({ force: true });
    await expect(page.getByRole('radio', { name: '30 days' })).toBeChecked();
    await expect(
      page.getByText('Average in range').locator('..')
    ).toContainText('$75.00');

    await page.getByRole('radio', { name: 'All' }).click({ force: true });
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    await expect(
      page.getByText('Average in range').locator('..')
    ).toContainText('$175.00');

    // The lowest price in the full history never changes across ranges that
    // all include it.
    await expect(page.getByText('Lowest in range').locator('..')).toContainText(
      '$50.00'
    );
  });

  test('shows the "just started tracking" state for a single history point', async ({
    page
  }) => {
    const api = new ApiMock(page);
    api.setConfig(CONFIG_NOT_CONFIGURED);
    api.setCategories(CATEGORIES_BASIC);
    const detail = buildSinglePointDetail({ id: 2, name: 'Just Added Gadget' });
    api.setProducts([
      buildDashboardProduct({ id: 2, name: 'Just Added Gadget' })
    ]);
    api.setDetail(2, detail);
    await api.install();

    await page.goto('/product/2');
    await expect(
      page.getByRole('heading', { name: 'Just Added Gadget', level: 1 })
    ).toBeVisible();

    const startDate = formatShortDateUTC(detail.price_history[0].timestamp);
    await expect(
      page.getByText(
        `Tracking started ${startDate}. The chart fills in as prices are checked.`
      )
    ).toBeVisible();

    // No line chart is rendered yet, but the range selector itself is still
    // usable.
    await expect(page.getByRole('radio', { name: '30 days' })).toBeVisible();
  });
});
