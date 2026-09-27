import {
  currentRecord,
  detailFields,
  offerStaleFields,
  productStaleFields,
  windowRecords,
  windowStats
} from './backendFields';
import { DAY_SECONDS, nowSeconds } from './time';

/** The `hist_window_size` of the config fixtures (`./config.js`), which the
 * dashboard-summary rows below are computed over, like the backend does. */
const SUMMARY_WINDOW_DAYS = 60;

/**
 * `GET /products/dashboard-summary` and `GET /products/{id}` fixtures
 * (`backend/src/schemas/product.py`'s `ProductDashboardSummary` and
 * `ProductDetailResponse`).
 */

/**
 * A single price-history record.
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildHistoryPoint(overrides = {}) {
  return {
    price: 199.99,
    is_in_stock: true,
    timestamp: nowSeconds(),
    ...overrides
  };
}

/**
 * A dashboard offer summary (`OfferSummary`).
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildOfferSummary(overrides = {}) {
  const offer = {
    id: 1,
    url: 'https://example.com/headphones',
    store_id: 1,
    store_name: 'Amazon',
    store_domain: 'amazon.com',
    store_has_favicon: true,
    current_price: 199.99,
    is_in_stock: true,
    last_checked_at: nowSeconds() - 3600,
    ...overrides
  };
  return { ...offerStaleFields(offer.last_checked_at), ...offer };
}

/**
 * A product-detail offer (`OfferDetail`), with its price history.
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildOfferDetail(overrides = {}) {
  const {
    price_history = [
      buildHistoryPoint({
        price: 219.99,
        timestamp: nowSeconds() - 5 * DAY_SECONDS
      }),
      buildHistoryPoint({ price: 199.99, timestamp: nowSeconds() - 3600 })
    ],
    ...rest
  } = overrides;
  return { ...buildOfferSummary(rest), price_history };
}

/**
 * A single dashboard-summary row (one store by default).
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildDashboardProduct(overrides = {}) {
  const product = {
    id: 1,
    name: 'Wireless Headphones',
    category_id: 1,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    priority: 'High',
    currency: 'USD',
    current_price: 199.99,
    price_change_pct: -5.2,
    is_in_stock: true,
    is_at_lowest: true,
    recent_prices: [219.99, 209.99, 199.99],
    best_offer_id: 1,
    offers: [buildOfferSummary()],
    ...overrides
  };
  return { ...productStaleFields(product.offers), ...product };
}

/**
 * A full product detail record (one store by default).
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildProductDetail(overrides = {}) {
  const detail = {
    id: 1,
    name: 'Wireless Headphones',
    priority: 'High',
    category_id: 1,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    description: 'Over-ear headphones with active noise cancellation.',
    currency: 'USD',
    offers: [buildOfferDetail()],
    ...overrides
  };
  return {
    ...productStaleFields(detail.offers),
    ...detailFields(detail.offers),
    ...detail
  };
}

/** The same headphones in two stores: Amazon (best, 199.99) and Thomann (209.99). */
export function buildMultiStoreProduct(overrides = {}) {
  return buildDashboardProduct({
    id: 3,
    best_offer_id: 1,
    offers: [
      buildOfferSummary(),
      buildOfferSummary({
        id: 2,
        url: 'https://thomann.de/headphones',
        store_id: 2,
        store_name: 'Thomann',
        store_domain: 'thomann.de',
        current_price: 209.99
      })
    ],
    ...overrides
  });
}

/** Detail of `buildMultiStoreProduct`. */
export function buildMultiStoreDetail(overrides = {}) {
  return buildProductDetail({
    id: 3,
    offers: [
      buildOfferDetail(),
      buildOfferDetail({
        id: 2,
        url: 'https://thomann.de/headphones',
        store_id: 2,
        store_name: 'Thomann',
        store_domain: 'thomann.de',
        current_price: 209.99,
        price_history: [
          buildHistoryPoint({
            price: 214.99,
            timestamp: nowSeconds() - 5 * DAY_SECONDS
          }),
          buildHistoryPoint({ price: 209.99, timestamp: nowSeconds() - 3600 })
        ]
      })
    ],
    ...overrides
  });
}

/** A product detail record with exactly one history point ("just started
 * tracking"): the chart must show the "tracking started" message instead
 * of plotting a line. */
export function buildSinglePointDetail(overrides = {}) {
  const ts = nowSeconds() - 3600;
  return buildProductDetail({
    id: 2,
    name: 'Just Added Gadget',
    offers: [
      buildOfferDetail({
        id: 2,
        current_price: 49.99,
        last_checked_at: ts,
        price_history: [buildHistoryPoint({ price: 49.99, timestamp: ts })]
      })
    ],
    ...overrides
  });
}

/**
 * A `points`-record daily price history, deterministic but varied by
 * `seed` (an even seed trends downward over the period, an odd one trends
 * upward, each with a small oscillation so it is not a straight line).
 * Shared by `buildManyProducts` (which derives its summary rows' numbers
 * from the tail of one of these series, rather than making them up
 * separately) and `buildLongHistoryDetail` (which exposes the same series
 * in full), so a dashboard row and its own detail page are always
 * consistent with each other for a given `seed`/id.
 * @param {number} seed
 * @param {number} [points]
 * @returns {object[]} Ascending by timestamp, ending "now".
 */
function buildHistorySeries(seed, points = 180) {
  const now = nowSeconds();
  const base = 80 + (seed % 10) * 12;
  // Even seed: price falls as it approaches "now" (a price drop, and today
  // sits at/near the period's low). Odd seed: price rises (today sits
  // at/near the period's high).
  const trendPerDay = seed % 2 === 0 ? 0.15 : -0.15;
  return Array.from({ length: points }, (_, i) => {
    const daysAgo = points - 1 - i;
    const wobble = Math.sin((i + seed) / 9) * 4;
    const price = Math.max(
      1,
      Math.round((base + trendPerDay * daysAgo + wobble) * 100) / 100
    );
    return buildHistoryPoint({
      price,
      is_in_stock: (i + seed) % 23 !== 0,
      timestamp: now - daysAgo * DAY_SECONDS
    });
  });
}

/**
 * `count` dashboard-summary rows, each backed by its own realistic
 * `historyPoints`-long price history (`buildHistorySeries`): `current_price`,
 * `price_change_pct`, `is_in_stock`, `is_at_lowest` and `recent_prices` are
 * all derived from that same series with `./backendFields.js` (a test-only
 * stand-in of the backend formulas) over a `SUMMARY_WINDOW_DAYS` window,
 * so they are internally consistent the way a real backend response would
 * be. Alternates category/priority so the list is
 * not visually uniform, and alternates the underlying trend direction (see
 * `buildHistorySeries`) so `priceDropCount`/`atLowestCount`
 * (`lib/dashboardSummary.js`) land well short of `count` (roughly half),
 * never colliding with it in an assertion.
 * @param {number} [count]
 * @param {object} [options]
 * @param {number} [options.historyPoints] - Passed to `buildHistorySeries`.
 * @returns {object[]}
 */
export function buildManyProducts(count = 25, { historyPoints = 180 } = {}) {
  const priorities = ['High', 'Medium', 'Low'];
  return Array.from({ length: count }, (_, i) => {
    const history = buildHistorySeries(i, historyPoints);
    const current = currentRecord(history);
    const window = windowRecords(history, SUMMARY_WINDOW_DAYS);
    const stats = windowStats(window, current);
    return buildDashboardProduct({
      id: i + 1,
      name: `Product ${String(i + 1).padStart(2, '0')}`,
      category_id: (i % 2) + 1,
      category_name: i % 2 === 0 ? 'Electronics' : 'Books',
      category_color: i % 2 === 0 ? '#3B82F6' : '#22C55E',
      priority: priorities[i % priorities.length],
      current_price: current.price,
      price_change_pct: stats.priceChangePct,
      is_in_stock: current.is_in_stock,
      is_at_lowest: stats.isAtLowest,
      recent_prices: window.map((point) => point.price),
      best_offer_id: i + 1,
      offers: [
        buildOfferSummary({
          id: i + 1,
          url: `https://example.com/product-${i + 1}`,
          current_price: current.price,
          is_in_stock: current.is_in_stock,
          last_checked_at: current.timestamp,
          ...(i % 2 === 0
            ? {}
            : {
                store_id: 2,
                store_name: 'Decathlon',
                store_domain: 'decathlon.com',
                store_has_favicon: false
              })
        })
      ]
    });
  });
}

/**
 * A full product detail record with `points` daily history records, for
 * exercising a long-running product's chart (e.g. the "180 days"/"All"
 * ranges). Built from the same `buildHistorySeries(id - 1, points)` series
 * `buildManyProducts`'s `id`th row derives its own summary numbers from, so
 * pairing one of `buildManyProducts`' rows with this detail (same `id`) is
 * always internally consistent.
 * @param {number} id
 * @param {number} [points]
 * @returns {object}
 */
export function buildLongHistoryDetail(id, points = 180) {
  const history = buildHistorySeries(id - 1, points);
  const current = history[history.length - 1];
  return buildProductDetail({
    id,
    name: `Product ${String(id).padStart(2, '0')}`,
    offers: [
      buildOfferDetail({
        id,
        price_history: history,
        current_price: current.price,
        is_in_stock: current.is_in_stock,
        last_checked_at: current.timestamp
      })
    ]
  });
}
