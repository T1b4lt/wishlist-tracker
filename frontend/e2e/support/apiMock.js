import { API_URL } from './constants';

const API_ORIGIN = new URL(API_URL).origin;

/** Default AI-extraction response (`POST /extract-product-info/`) used when a
 * test does not set its own via `ApiMock#setExtraction`. */
const DEFAULT_EXTRACTION = {
  name: 'Extracted Product',
  category: 'Electronics',
  description: 'A product description extracted from the page.',
  currency: 'usd'
};

/**
 * Fails a route loudly: logs the unmatched request to the test runner's own
 * stdout/stderr (this callback runs in the Node/test process, not the
 * browser) and responds with a `500` carrying the same message, so a
 * missing fixture surfaces immediately instead of the UI just quietly
 * showing an unrelated empty/error state.
 * @param {import('@playwright/test').Route} route
 */
function unmockedResponse(route) {
  const req = route.request();
  const message = `Unmocked API request: ${req.method()} ${req.url()}`;
  console.error(`[e2e] ${message}`);
  return route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ detail: message })
  });
}

/** Smallest id greater than every id already in `items` (starts at 1). */
function nextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

/** Whether `url` targets the mocked API origin at `pathname` (a `RegExp`). */
function matchesApiPath(url, pathname) {
  return url.origin === API_ORIGIN && pathname.test(url.pathname);
}

/**
 * Mocks every API request the frontend makes (`src/lib/api/*.js`) against an
 * in-memory, mutable fixture set, so specs can exercise full create/edit/
 * delete flows without a real backend. Every route not explicitly handled
 * here (or overridden by a test with its own `page.route` call registered
 * afterward) fails loudly via `unmockedResponse` rather than silently
 * falling through to the real network.
 *
 * Usage: `const api = new ApiMock(page); api.setConfig(...); ...; await
 * api.install();` (set the initial fixtures before installing, or call the
 * setters afterward to mutate live state).
 */
export class ApiMock {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.config = null;
    this.categories = [];
    this.products = [];
    this.details = {};
    this.extraction = null;
  }

  /** @param {object} config A full `ConfigResponse`-shaped object. */
  setConfig(config) {
    this.config = config;
  }

  /** @param {object[]} categories `CategoryResponse[]`. */
  setCategories(categories) {
    this.categories = categories;
  }

  /** @param {object[]} products `ProductDashboardSummary[]`. */
  setProducts(products) {
    this.products = products;
  }

  /**
   * @param {number|string} id
   * @param {object} detail `ProductDetailResponse`.
   */
  setDetail(id, detail) {
    this.details[id] = detail;
  }

  /** @param {object} extraction `ProductInfoResponse`. */
  setExtraction(extraction) {
    this.extraction = extraction;
  }

  /** Installs every route handler. Call once per test, after the fixtures
   * that matter for it are set. */
  async install() {
    const { page } = this;

    // Registered first, so every route added below (and any a test adds
    // afterward) takes priority: Playwright tries the most-recently-added
    // matching handler first.
    await page.route(`${API_URL}/**`, (route) => unmockedResponse(route));

    await page.route(`${API_URL}/config/`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ json: this.config });
      }
      if (req.method() === 'PATCH') {
        this.config = { ...this.config, ...req.postDataJSON() };
        return route.fulfill({ json: this.config });
      }
      return unmockedResponse(route);
    });

    await page.route(`${API_URL}/categories/`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ json: this.categories });
      }
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        const created = {
          id: nextId(this.categories),
          name: body.name,
          color: body.color
        };
        this.categories = [
          ...this.categories,
          { ...created, product_count: 0 }
        ];
        return route.fulfill({ json: created });
      }
      return unmockedResponse(route);
    });

    await page.route(
      (url) => matchesApiPath(url, /^\/categories\/\d+$/),
      async (route) => {
        const req = route.request();
        const id = Number(new URL(req.url()).pathname.split('/').pop());
        if (req.method() === 'PATCH') {
          const body = req.postDataJSON();
          this.categories = this.categories.map((category) =>
            category.id === id ? { ...category, ...body } : category
          );
          const updated = this.categories.find(
            (category) => category.id === id
          );
          return route.fulfill({
            json: { id: updated.id, name: updated.name, color: updated.color }
          });
        }
        if (req.method() === 'DELETE') {
          const target = this.categories.find((category) => category.id === id);
          if (target && target.product_count > 0) {
            return route.fulfill({
              status: 400,
              json: { detail: 'Category has associated products.' }
            });
          }
          this.categories = this.categories.filter(
            (category) => category.id !== id
          );
          return route.fulfill({ json: { ok: true } });
        }
        return unmockedResponse(route);
      }
    );

    await page.route(`${API_URL}/products/dashboard-summary`, (route) =>
      route.fulfill({ json: this.products })
    );

    await page.route(`${API_URL}/products/`, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        const id = Math.max(
          nextId(this.products),
          nextId(Object.values(this.details))
        );
        const category = this.categories.find((c) => c.id === body.category_id);

        this.products = [
          ...this.products,
          {
            id,
            name: body.name,
            url: body.url,
            category_id: body.category_id,
            category_name: category?.name ?? '',
            category_color: category?.color ?? '#94A3B8',
            priority: body.priority,
            current_price: null,
            price_change_60d: null,
            is_in_stock: null,
            currency: body.currency,
            recent_prices: [],
            last_checked_at: null
          }
        ];
        this.details[id] = {
          id,
          name: body.name,
          url: body.url,
          priority: body.priority,
          category_id: body.category_id,
          category_name: category?.name ?? '',
          category_color: category?.color ?? '#94A3B8',
          description: body.description,
          current_price: null,
          min_price: null,
          is_in_stock: null,
          price_history: [],
          currency: body.currency,
          last_checked_at: null
        };
        return route.fulfill({ json: { id, ...body } });
      }
      return unmockedResponse(route);
    });

    await page.route(
      (url) => matchesApiPath(url, /^\/products\/\d+$/),
      async (route) => {
        const req = route.request();
        const id = Number(new URL(req.url()).pathname.split('/').pop());
        if (req.method() === 'GET') {
          const detail = this.details[id];
          if (!detail) {
            return route.fulfill({
              status: 404,
              json: { detail: 'Product not found' }
            });
          }
          return route.fulfill({ json: detail });
        }
        if (req.method() === 'PATCH') {
          const body = req.postDataJSON();
          this.details[id] = { ...this.details[id], ...body };
          this.products = this.products.map((product) =>
            product.id === id ? { ...product, ...body } : product
          );
          return route.fulfill({ json: this.details[id] });
        }
        if (req.method() === 'DELETE') {
          this.products = this.products.filter((product) => product.id !== id);
          delete this.details[id];
          return route.fulfill({ json: { ok: true } });
        }
        return unmockedResponse(route);
      }
    );

    await page.route(`${API_URL}/extract-product-info/`, (route) =>
      route.fulfill({ json: this.extraction ?? DEFAULT_EXTRACTION })
    );
  }
}
