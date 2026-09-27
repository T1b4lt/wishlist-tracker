/**
 * Chart helpers for the product detail page: filtering a history by the
 * backend's range `window_start`, chart points and the Y domain. Every
 * statistic comes precomputed from the backend
 * (`ProductDetailResponse.ranges`). Kept separate from the React components
 * so they can be unit tested without rendering anything.
 *
 * @typedef {object} PriceHistoryRecord
 * @property {number} timestamp - Seconds since epoch.
 * @property {number} price
 * @property {boolean} is_in_stock
 */

/** The backend's key for the whole-history range. */
export const RANGE_ALL = 'all';

/**
 * @param {unknown} value
 * @returns {value is number} Whether `value` is a finite, usable number.
 */
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Sort a price history ascending by timestamp and keep the records at or
 * after `windowStart` (the selected range's `window_start`, computed by the
 * backend). `null` keeps every record.
 *
 * @param {PriceHistoryRecord[]|null|undefined} priceHistory
 * @param {number|null} windowStart - Seconds since epoch.
 * @returns {PriceHistoryRecord[]} A new, sorted (and possibly filtered) array.
 */
export function filterPriceHistoryByWindow(priceHistory, windowStart) {
  const sorted = Array.isArray(priceHistory)
    ? [...priceHistory].sort((a, b) => a.timestamp - b.timestamp)
    : [];
  if (windowStart === null || windowStart === undefined) return sorted;
  return sorted.filter((record) => record.timestamp >= windowStart);
}

/**
 * Build the chart's per-point data from a (already filtered, ascending)
 * price history: each point keeps its raw `timestamp` (for a numeric X axis
 * and timestamp-keyed reference lines) and adds the percentage change versus
 * the previous point.
 *
 * @param {PriceHistoryRecord[]} filteredHistory - Ascending by timestamp.
 * @returns {Array<{timestamp: number, price: number, isInStock: boolean, changePercent: number|null}>}
 */
export function buildChartPoints(filteredHistory) {
  if (!Array.isArray(filteredHistory)) return [];

  return filteredHistory.map((record, index) => {
    const previous = filteredHistory[index - 1];
    const changePercent =
      previous && isFiniteNumber(previous.price) && previous.price !== 0
        ? ((record.price - previous.price) / previous.price) * 100
        : null;

    return {
      timestamp: record.timestamp,
      price: record.price,
      isInStock: record.is_in_stock,
      changePercent
    };
  });
}

/**
 * Compute a Y-axis domain padded around the filtered history's min and max
 * price, so the line never touches the chart's top/bottom edge, never starts
 * at a forced zero baseline and never extends below zero.
 *
 * @param {PriceHistoryRecord[]} filteredHistory
 * @param {number} [paddingRatio] - Fraction of the price range added above
 *   and below. Defaults to `0.1` (10%).
 * @returns {[number, number]|['auto', 'auto']} `['auto', 'auto']` when there
 *   is nothing to compute a domain from.
 */
export function computeYDomain(filteredHistory, paddingRatio = 0.1) {
  if (!Array.isArray(filteredHistory) || filteredHistory.length === 0) {
    return ['auto', 'auto'];
  }

  const prices = filteredHistory.map((record) => record.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min === max) {
    // A perfectly flat line still needs headroom on both sides; fall back to
    // a fixed padding when the flat price is itself `0`.
    const padding = min === 0 ? 1 : Math.abs(min) * paddingRatio;
    return [Math.max(0, min - padding), max + padding];
  }

  const padding = (max - min) * paddingRatio;
  return [Math.max(0, min - padding), max + padding];
}

/**
 * Whether a product has enough tracked history to plot a chart (the brief's
 * "fewer than 2 points" threshold).
 *
 * @param {PriceHistoryRecord[]|null|undefined} priceHistory
 * @returns {boolean}
 */
export function hasEnoughHistory(priceHistory) {
  return Array.isArray(priceHistory) && priceHistory.length >= 2;
}

/**
 * The timestamp tracking started at: the earliest record in the full price
 * history, used by the "Tracking started {{date}}." empty-chart message.
 *
 * @param {PriceHistoryRecord[]|null|undefined} priceHistory
 * @returns {number|null}
 */
export function getTrackingStartTimestamp(priceHistory) {
  if (!Array.isArray(priceHistory) || priceHistory.length === 0) return null;
  return priceHistory.reduce(
    (earliest, record) => Math.min(earliest, record.timestamp),
    priceHistory[0].timestamp
  );
}
