import { DAY_SECONDS, nowSeconds } from './time';

/**
 * `GET /products/dashboard-summary` and `GET /products/{id}` fixtures
 * (`backend/src/schemas/product.py`'s `ProductDashboardSummary` and
 * `ProductDetailResponse`).
 */

/**
 * A single dashboard-summary row.
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildDashboardProduct(overrides = {}) {
  return {
    id: 1,
    name: 'Wireless Headphones',
    url: 'https://example.com/headphones',
    category_id: 1,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    priority: 'High',
    current_price: 199.99,
    price_change_60d: -5.2,
    is_in_stock: true,
    currency: 'USD',
    recent_prices: [219.99, 209.99, 199.99],
    last_checked_at: nowSeconds() - 3600,
    ...overrides
  };
}

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
 * A full product detail record.
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildProductDetail(overrides = {}) {
  return {
    id: 1,
    name: 'Wireless Headphones',
    url: 'https://example.com/headphones',
    priority: 'High',
    category_id: 1,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    description: 'Over-ear headphones with active noise cancellation.',
    current_price: 199.99,
    min_price: 189.99,
    is_in_stock: true,
    currency: 'USD',
    last_checked_at: nowSeconds() - 3600,
    price_history: [
      buildHistoryPoint({
        price: 219.99,
        timestamp: nowSeconds() - 5 * DAY_SECONDS
      }),
      buildHistoryPoint({ price: 199.99, timestamp: nowSeconds() - 3600 })
    ],
    ...overrides
  };
}

/** A product detail record with exactly one history point ("just started
 * tracking"): the chart must show the "tracking started" message instead
 * of plotting a line. */
export function buildSinglePointDetail(overrides = {}) {
  const ts = nowSeconds() - 3600;
  return buildProductDetail({
    id: 2,
    name: 'Just Added Gadget',
    current_price: 49.99,
    min_price: 49.99,
    last_checked_at: ts,
    price_history: [buildHistoryPoint({ price: 49.99, timestamp: ts })],
    ...overrides
  });
}

/**
 * `count` dashboard-summary rows, alternating category/priority/stock so
 * the list is not visually uniform.
 * @param {number} [count]
 * @returns {object[]}
 */
export function buildManyProducts(count = 25) {
  const priorities = ['High', 'Medium', 'Low'];
  return Array.from({ length: count }, (_, i) =>
    buildDashboardProduct({
      id: i + 1,
      name: `Product ${String(i + 1).padStart(2, '0')}`,
      url: `https://example.com/product-${i + 1}`,
      category_id: (i % 2) + 1,
      category_name: i % 2 === 0 ? 'Electronics' : 'Books',
      category_color: i % 2 === 0 ? '#3B82F6' : '#22C55E',
      priority: priorities[i % priorities.length],
      current_price: 50 + i,
      price_change_60d: i % 3 === 0 ? 4.2 : -3.1,
      is_in_stock: i % 5 !== 0,
      // Only every 4th product is "at its lowest price" (current price ==
      // min(recent_prices)); the rest have a lower point somewhere in their
      // recent history, so `atLowestCount` differs from `itemCount` and
      // from `priceDropCount` (see `lib/dashboardSummary.js`), keeping the
      // summary strip's numbers distinct for assertions.
      recent_prices:
        i % 4 === 0 ? [50 + i, 55 + i, 60 + i] : [45 + i, 50 + i, 55 + i],
      last_checked_at: nowSeconds() - i * 60
    })
  );
}

/**
 * A product detail record with `points` daily history records, for exercising
 * a long-running product's chart (e.g. the "180 days"/"All" ranges).
 * @param {number} id
 * @param {number} [points]
 * @returns {object}
 */
export function buildLongHistoryDetail(id, points = 180) {
  const now = nowSeconds();
  const history = Array.from({ length: points }, (_, i) =>
    buildHistoryPoint({
      price: Math.round((100 + Math.sin(i / 12) * 20 + i * 0.05) * 100) / 100,
      is_in_stock: i % 37 !== 0,
      timestamp: now - (points - 1 - i) * DAY_SECONDS
    })
  );
  return buildProductDetail({
    id,
    name: `Product ${String(id).padStart(2, '0')}`,
    price_history: history,
    current_price: history[history.length - 1].price,
    last_checked_at: history[history.length - 1].timestamp
  });
}
