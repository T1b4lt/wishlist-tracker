/**
 * Pure computations for the dashboard's summary strip. Kept separate from
 * `DashboardSummary.jsx` so the numbers can be unit tested without
 * rendering anything.
 *
 * @typedef {object} DashboardSummaryProduct
 * @property {number|null|undefined} current_price
 * @property {string|null|undefined} currency
 * @property {number|null|undefined} price_change_60d
 * @property {number[]|null|undefined} recent_prices
 */

/**
 * @param {unknown} value
 * @returns {value is number} Whether `value` is a finite, usable number.
 */
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * @param {DashboardSummaryProduct} product
 * @returns {boolean} Whether `product.current_price` is currently at (or
 *   below) the minimum of its own `recent_prices`.
 */
export const isAtLowestPrice = (product) => {
  if (!isFiniteNumber(product.current_price)) return false;
  if (
    !Array.isArray(product.recent_prices) ||
    product.recent_prices.length === 0
  ) {
    return false;
  }
  const numericRecentPrices = product.recent_prices.filter(isFiniteNumber);
  if (numericRecentPrices.length === 0) return false;

  return product.current_price === Math.min(...numericRecentPrices);
};

/**
 * Computes the dashboard summary strip's stats from the dashboard-summary
 * product list. Each stat is `null` (for the counts) or an empty array (for
 * `totalsByCurrency`) when it cannot be computed from the given products, so
 * the caller can hide it instead of showing a misleading zero.
 *
 * @param {DashboardSummaryProduct[]} products
 * @returns {{
 *   itemCount: number,
 *   totalsByCurrency: Array<{ currency: string, total: number }>,
 *   priceDropCount: number|null,
 *   atLowestCount: number|null
 * }}
 */
export function computeDashboardSummary(products) {
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
    isFiniteNumber(product.price_change_60d)
  );
  const priceDropCount =
    productsWithPriceChange.length === 0
      ? null
      : productsWithPriceChange.filter(
          (product) => product.price_change_60d < 0
        ).length;

  const productsWithRecentPrices = products.filter(
    (product) =>
      Array.isArray(product.recent_prices) &&
      product.recent_prices.some(isFiniteNumber) &&
      isFiniteNumber(product.current_price)
  );
  const atLowestCount =
    productsWithRecentPrices.length === 0
      ? null
      : productsWithRecentPrices.filter(isAtLowestPrice).length;

  return {
    itemCount,
    totalsByCurrency: Array.from(totalsByCurrency, ([currency, total]) => ({
      currency,
      total
    })).sort((a, b) => a.currency.localeCompare(b.currency)),
    priceDropCount,
    atLowestCount
  };
}
