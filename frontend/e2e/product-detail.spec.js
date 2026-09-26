import { test, expect } from './support/fixtures';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import {
  buildDashboardProduct,
  buildHistoryPoint,
  buildLongHistoryDetail,
  buildProductDetail,
  buildSinglePointDetail
} from './fixtures/products';
import { DAY_SECONDS, formatShortDateUTC, nowSeconds } from './fixtures/time';

/** Formats a price the same way `src/lib/format.js`'s `formatPrice` does for
 * USD/`'en-US'`, so a value computed directly from a fixture's raw numbers
 * can be compared against the page's own rendered (rounded) text. */
const formatUSD = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    value
  );

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
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED); // hist_window_size: 60
    apiMock.setCategories(CATEGORIES_BASIC);
    const product = buildDashboardProduct({ id: 1 });
    apiMock.setProducts([product]);
    apiMock.setDetail(
      1,
      buildProductDetail({ id: 1, price_history: buildRangeHistory() })
    );

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

  test('exercises the 180-day and All ranges on a long (180-point) history', async ({
    page,
    apiMock
  }) => {
    // The brief's "25 products with 180-point histories" fixture, exercised
    // here specifically on its two longest ranges (see `buildLongHistoryDetail`).
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    const detail = buildLongHistoryDetail(3, 180);
    apiMock.setProducts([
      buildDashboardProduct({
        id: 3,
        name: detail.name,
        current_price: detail.current_price
      })
    ]);
    apiMock.setDetail(3, detail);

    const prices = detail.price_history.map((point) => point.price);
    const expectedAverage =
      prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const expectedLowest = Math.min(...prices);

    await page.goto('/product/3');
    await expect(
      page.getByRole('heading', { name: 'Price history' })
    ).toBeVisible();

    const averageStat = page.getByText('Average in range').locator('..');
    const lowestStat = page.getByText('Lowest in range').locator('..');

    // The fixture spans exactly 180 daily points (179 days old to today),
    // so both the "180 days" and "All" ranges include every one of them:
    // they must agree with each other, and with a plain average/min
    // computed directly over the whole fixture in this test.
    await page.getByRole('radio', { name: '180 days' }).click({ force: true });
    await expect(page.getByRole('radio', { name: '180 days' })).toBeChecked();
    await expect(averageStat).toContainText(formatUSD(expectedAverage));
    await expect(lowestStat).toContainText(formatUSD(expectedLowest));

    await page.getByRole('radio', { name: 'All' }).click({ force: true });
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    await expect(averageStat).toContainText(formatUSD(expectedAverage));
    await expect(lowestStat).toContainText(formatUSD(expectedLowest));
  });

  test('shows the "just started tracking" state for a single history point', async ({
    page,
    apiMock
  }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories(CATEGORIES_BASIC);
    const detail = buildSinglePointDetail({ id: 2, name: 'Just Added Gadget' });
    apiMock.setProducts([
      buildDashboardProduct({ id: 2, name: 'Just Added Gadget' })
    ]);
    apiMock.setDetail(2, detail);

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
