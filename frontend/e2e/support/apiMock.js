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
 * afterward) is recorded in `unmatchedRequests` and fails loudly (a `500`,
 * plus a `console.error` on the test runner's own stdout) rather than
 * silently falling through to the real network or to an unrelated-looking
 * UI error state. `support/fixtures.js`'s `apiMock` fixture (used by every
 * spec instead of constructing this class directly) checks
 * `unmatchedRequests` after each test and fails it if it is non-empty, so a
 * missing fixture cannot slip through unnoticed.
 *
 * Usage (via the fixture): `async ({ page, apiMock }) => { apiMock.setConfig(...);
 * ...; await page.goto(...); }` - the fixture already calls `install()`, so
 * a test only ever needs the setters.
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
    /** The chat id `GET /telegram-chat-id` "finds" once a bot token is
     * configured; `null` reproduces the real endpoint's 404 ("no chat
     * found yet"). @type {string|null} */
    this.telegramChatId = null;
    /**
     * Every request that reached the catch-all or an endpoint's own
     * "unhandled method" fallback, i.e. one no fixture covered: `{method,
     * url}` entries, in the order they were received.
     * @type {Array<{method: string, url: string}>}
     */
    this.unmatchedRequests = [];
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

  /** @param {string|null} chatId See the constructor's `telegramChatId`. */
  setTelegramChatId(chatId) {
    this.telegramChatId = chatId;
  }

  /**
   * Records and fails a route loudly: logs the unmatched request to the
   * test runner's own stdout/stderr (this callback runs in the Node/test
   * process, not the browser) and responds with a `500` carrying the same
   * message, so a missing fixture surfaces immediately instead of the UI
   * just quietly showing an unrelated empty/error state. Also pushed onto
   * `unmatchedRequests`, which `support/fixtures.js` checks after the test.
   * @param {import('@playwright/test').Route} route
   */
  _recordUnmatched(route) {
    const req = route.request();
    const entry = { method: req.method(), url: req.url() };
    this.unmatchedRequests.push(entry);
    console.error(`[e2e] Unmocked API request: ${entry.method} ${entry.url}`);
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: `Unmocked API request: ${entry.method} ${entry.url}`
      })
    });
  }

  /** Installs every route handler. Normally called once by
   * `support/fixtures.js`'s `apiMock` fixture, not by a test directly. */
  async install() {
    const { page } = this;

    // Registered first, so every route added below (and any a test adds
    // afterward) takes priority: Playwright tries the most-recently-added
    // matching handler first.
    await page.route(`${API_URL}/**`, (route) => this._recordUnmatched(route));

    await page.route(`${API_URL}/config/`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ json: this.config });
      }
      if (req.method() === 'PATCH') {
        this.config = { ...this.config, ...req.postDataJSON() };
        return route.fulfill({ json: this.config });
      }
      return this._recordUnmatched(route);
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
      return this._recordUnmatched(route);
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
        return this._recordUnmatched(route);
      }
    );

    await page.route(`${API_URL}/products/dashboard-summary`, (route) =>
      route.fulfill({ json: this.products })
    );

    await page.route(`${API_URL}/products/`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        // The plain `Product` list (`backend/src/models/database_models.py`'s
        // `Product`), distinct from `/products/dashboard-summary`. Unused
        // by the current UI (only the summary and detail endpoints are),
        // mocked anyway so it never falls through to the catch-all.
        return route.fulfill({
          json: this.products.map((product) => ({
            id: product.id,
            name: product.name,
            url: product.url,
            priority: product.priority,
            category_id: product.category_id,
            description: this.details[product.id]?.description ?? '',
            currency: product.currency
          }))
        });
      }
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
      return this._recordUnmatched(route);
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
        return this._recordUnmatched(route);
      }
    );

    await page.route(`${API_URL}/extract-product-info/`, (route) =>
      route.fulfill({ json: this.extraction ?? DEFAULT_EXTRACTION })
    );

    // Telegram endpoints: unused by the current specs (nothing clicks "Get
    // chat ID"/"Test bot" yet), mocked anyway so they never fall through to
    // the catch-all if a future spec does, and so they behave like the real
    // backend (`backend/src/services/telegram_service.py`) given whatever
    // `this.config` currently holds.
    await page.route(`${API_URL}/telegram-chat-id`, (route) => {
      if (route.request().method() !== 'GET')
        return this._recordUnmatched(route);
      if (!this.config?.telegram_bot_token) {
        return route.fulfill({
          status: 400,
          json: { detail: 'Telegram bot token not configured' }
        });
      }
      if (!this.telegramChatId) {
        return route.fulfill({
          status: 404,
          json: {
            detail: 'No chat ID found. Please send a message to the bot first.'
          }
        });
      }
      this.config = {
        ...this.config,
        telegram_bot_chat_id: this.telegramChatId,
        telegram_status: 'connected'
      };
      return route.fulfill({ json: { message: 'Chat ID saved successfully' } });
    });

    await page.route(`${API_URL}/telegram-test-message`, (route) => {
      if (route.request().method() !== 'POST')
        return this._recordUnmatched(route);
      if (!this.config?.telegram_bot_token) {
        return route.fulfill({
          status: 400,
          json: { detail: 'Telegram bot token not configured' }
        });
      }
      if (!this.config?.telegram_bot_chat_id) {
        return route.fulfill({
          status: 400,
          json: { detail: 'Telegram chat ID not configured.' }
        });
      }
      return route.fulfill({
        json: { message: 'Test message sent successfully' }
      });
    });
  }
}
