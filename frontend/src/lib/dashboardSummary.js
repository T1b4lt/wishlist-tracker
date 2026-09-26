import { isStale, nowInSeconds } from './staleness';

/**
 * Pure computations for the dashboard's summary strip. Kept separate from
 * `DashboardSummary.jsx` so the numbers can be unit tested without
 * rendering anything.
 *
 * @typedef {object} DashboardSummaryProduct
 * @property {number|null|undefined} current_price
 * @property {string|null|undefined} currency
 * @property {number|null|undefined} price_change_pct
 * @property {boolean|undefined} is_at_lowest
 * @property {number|null|undefined} last_checked_at
 */

/**
 * @param {unknown} value
 * @returns {value is number} Whether `value` is a finite, usable number.
 */
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Computes the dashboard summary strip's stats from the dashboard-summary
 * product list. Each stat is `null` (for the counts) or an empty array (for
 * `totalsByCurrency`) when it cannot be computed from the given products, so
 * the caller can hide it instead of showing a misleading zero.
 *
 * `staleCount` is always a number; the caller hides it when it is zero so a
 * healthy dashboard stays uncluttered.
 *
 * @param {DashboardSummaryProduct[]} products
 * @param {number} [now] - Reference Unix time in seconds; defaults to now.
 * @returns {{
 *   itemCount: number,
 *   totalsByCurrency: Array<{ currency: string, total: number }>,
 *   priceDropCount: number|null,
 *   atLowestCount: number|null,
 *   staleCount: number
 * }}
 */
export function computeDashboardSummary(products, now = nowInSeconds()) {
  const itemCount = products.length;

  const totalsByCurrency = new Map();
  for (const product of products) {
    if (!isFiniteNumber(product.current_price) || !product.currency) continue;
    const currency = product.currency;
    totalsByCurrency.set(
      currency,
      (totalsByCurrency.get(currency) ?? 0) + product.current_price
    );
  }

  const productsWithPriceChange = products.filter((product) =>
    isFiniteNumber(product.price_change_pct)
  );
  const priceDropCount =
    productsWithPriceChange.length === 0
      ? null
      : productsWithPriceChange.filter(
          (product) => product.price_change_pct < 0
        ).length;

  // "At lowest" is decided by the backend (`is_at_lowest`, see
  // `backend/src/services/price_stats.py`); hidden when no product has any
  // history yet (no current price).
  const productsWithHistory = products.filter((product) =>
    isFiniteNumber(product.current_price)
  );
  const atLowestCount =
    productsWithHistory.length === 0
      ? null
      : productsWithHistory.filter((product) => product.is_at_lowest === true)
          .length;

  return {
    itemCount,
    totalsByCurrency: Array.from(totalsByCurrency, ([currency, total]) => ({
      currency,
      total
    })).sort((a, b) => a.currency.localeCompare(b.currency)),
    priceDropCount,
    atLowestCount,
    staleCount: products.filter((product) => isStale(product, now)).length
  };
}
