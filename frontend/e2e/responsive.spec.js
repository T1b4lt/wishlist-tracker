import { test, expect } from '@playwright/test';
import { ApiMock } from './support/apiMock';
import { CONFIG_NOT_CONFIGURED } from './fixtures/config';
import { CATEGORIES_BASIC } from './fixtures/categories';
import { buildManyProducts, buildProductDetail } from './fixtures/products';

// The 390px width is required regardless of which project runs this file
// (both `desktop` and `mobile` end up asserting it, which is redundant but
// harmless): this is specifically the "no horizontal scroll at 390px"
// requirement, not "whatever the mobile project happens to use".
test.use({ viewport: { width: 390, height: 844 } });

/** Every route the app resolves at least one of; each gets its own no-scroll check. */
const ROUTES = [
  '/',
  '/product/1',
  '/categories',
  '/settings',
  '/does-not-exist'
];

async function expectNoHorizontalScroll(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe('No horizontal scroll at 390px', () => {
  for (const route of ROUTES) {
    test(`on ${route}`, async ({ page }) => {
      const api = new ApiMock(page);
      api.setConfig(CONFIG_NOT_CONFIGURED);
      api.setCategories(CATEGORIES_BASIC);
      // 25 rows, including a long name, stress the table/card layout and the
      // summary strip's wrapping at this width.
      api.setProducts(buildManyProducts(25));
      api.setDetail(1, buildProductDetail({ id: 1 }));
      await api.install();

      await page.goto(route);
      // Let layout, fonts and any mount animation settle before measuring.
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    });
  }
});
