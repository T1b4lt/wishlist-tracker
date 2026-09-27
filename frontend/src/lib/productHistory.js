/**
 * Pure computations for the product detail page's price history chart and
 * stats row. `computeRangeStats` mirrors the backend's `price_stats.py`; both
 * are pinned by `contracts/price-stats-cases.json`. Kept separate from the React components so the
 * range filtering, stats and domain math can be unit tested without
 * rendering anything.
 *
 * @typedef {object} PriceHistoryRecord
 * @property {number} timestamp - Seconds since epoch.
 * @property {number} price
 * @property {boolean} is_in_stock
 */

import { HIST_WINDOW_OPTIONS, resolveHistWindow } from './histWindow';

/** Seconds in a day, used to turn a range's day count into a cutoff timestamp. */
const SECONDS_PER_DAY = 60 * 60 * 24;

/** Sentinel range value meaning "show every record" (no cutoff). */
export const RANGE_ALL = 'all';

/**
 * The day-count range options offered by the chart's range selector: the
 * historical window options (`./histWindow.js`) as strings (the values
 * `SegmentedControl` needs), from shortest to longest.
 * @type {string[]}
 */
export const RANGE_OPTIONS = HIST_WINDOW_OPTIONS.map(String);

/**
 * @param {unknown} value
 * @returns {value is number} Whether `value` is a finite, usable number.
 */
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The chart's default range: the app's configured `hist_window_size` when
 * it is one of the options, otherwise the default window.
 *
 * @param {number|null|undefined} histWindowSize
 * @returns {string} One of `RANGE_OPTIONS`.
 */
export function resolveDefaultRange(histWindowSize) {
  return String(resolveHistWindow(histWindowSize));
}

/**
 * Sort a product's full price history by timestamp (ascending) and, unless
 * `range` is `RANGE_ALL`, keep only the records within the last `range` days
 * of `nowSeconds`. Filtering happens entirely on the client: the backend
 * always returns the full history.
 *
 * @param {PriceHistoryRecord[]|null|undefined} priceHistory
 * @param {string} range - A value from `RANGE_OPTIONS`, or `RANGE_ALL`.
 * @param {number} [nowSeconds] - Seconds since epoch to filter against.
 *   Defaults to the current time; pass an explicit value in tests.
 * @returns {PriceHistoryRecord[]} A new, sorted (and possibly filtered) array.
 */
export function filterPriceHistoryByRange(
  priceHistory,
  range,
  nowSeconds = Date.now() / 1000
) {
  const sorted = Array.isArray(priceHistory)
    ? [...priceHistory].sort((a, b) => a.timestamp - b.timestamp)
    : [];

  if (range === RANGE_ALL) return sorted;

  const days = Number(range);
  if (!isFiniteNumber(days)) return sorted;

  const cutoff = nowSeconds - days * SECONDS_PER_DAY;
  return sorted.filter((record) => record.timestamp >= cutoff);
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
 * The newest record of a product's full price history (the "current" one,
 * which may fall outside the selected range). Ties on the timestamp resolve
 * to the last one in input order, like the backend.
 *
 * @param {PriceHistoryRecord[]|null|undefined} priceHistory
 * @returns {PriceHistoryRecord|null}
 */
export function getCurrentRecord(priceHistory) {
  if (!Array.isArray(priceHistory) || priceHistory.length === 0) return null;
  return priceHistory.reduce((latest, record) =>
    record.timestamp >= latest.timestamp ? record : latest
  );
}

/**
 * Compute the stats row's range-dependent numbers, mirroring the backend's
 * `price_stats.compute_window_stats` (see `contracts/README.md`):
 * - only in-stock records count;
 * - `average` is the mean of the in-stock records other than `current`;
 * - `currentVsAverage` compares `current` with that average, and is `null`
 *   when `current` is missing or out of stock, or the average is not > 0;
 * - `lowest` is the cheapest in-stock record (the most recent on ties);
 * - `isAtLowest` is whether an in-stock `current` is not above `lowest`.
 *
 * @param {PriceHistoryRecord[]|null|undefined} filteredHistory - The
 *   selected range, ascending by timestamp.
 * @param {PriceHistoryRecord|null|undefined} current - The newest record of
 *   the full history, see `getCurrentRecord`.
 * @returns {{
 *   lowest: {price: number, timestamp: number}|null,
 *   average: number|null,
 *   currentVsAverage: number|null,
 *   isAtLowest: boolean
 * }}
 */
export function computeRangeStats(filteredHistory, current) {
  const window = Array.isArray(filteredHistory) ? filteredHistory : [];
  const valid = window.filter(
    (record) => record.is_in_stock === true && isFiniteNumber(record.price)
  );
  const baseline = current
    ? valid.filter((record) => record.timestamp !== current.timestamp)
    : valid;
  const average =
    baseline.length > 0
      ? baseline.reduce((sum, record) => sum + record.price, 0) /
        baseline.length
      : null;

  const currentIsUsable =
    Boolean(current) &&
    current.is_in_stock === true &&
    isFiniteNumber(current.price);
  const currentVsAverage =
    currentIsUsable && average !== null && average > 0
      ? ((current.price - average) / average) * 100
      : null;

  let lowest = null;
  // Ascending, so "<=" keeps the most recent record on ties.
  for (const record of valid) {
    if (lowest === null || record.price <= lowest.price) lowest = record;
  }

  return {
    lowest: lowest
      ? { price: lowest.price, timestamp: lowest.timestamp }
      : null,
    average,
    currentVsAverage,
    isAtLowest:
      currentIsUsable && lowest !== null && current.price <= lowest.price
  };
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
