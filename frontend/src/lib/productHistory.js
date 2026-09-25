/**
 * Pure computations for the product detail page's price history chart and
 * stats row (spec Task 12). Kept separate from the React components so the
 * range filtering, stats and domain/band math can be unit tested without
 * rendering anything.
 *
 * @typedef {object} PriceHistoryRecord
 * @property {number} timestamp - Seconds since epoch.
 * @property {number} price
 * @property {boolean} is_in_stock
 */

/** Seconds in a day, used to turn a range's day count into a cutoff timestamp. */
const SECONDS_PER_DAY = 60 * 60 * 24;

/** Sentinel range value meaning "show every record" (no cutoff). */
export const RANGE_ALL = 'all';

/**
 * The day-count range options offered by the chart's range selector, as
 * strings (matching the values `SegmentedControl` needs and what
 * `resolveDefaultRange` returns), from shortest to longest.
 * @type {string[]}
 */
export const RANGE_OPTIONS = ['30', '60', '90', '180'];

/**
 * @param {unknown} value
 * @returns {value is number} Whether `value` is a finite, usable number.
 */
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Pick the range option (a day count from `RANGE_OPTIONS`) closest to the
 * app's configured `hist_window_size`, so the chart's default range selector
 * value tracks the user's own configuration. Ties resolve to the shorter
 * option (the first minimum found, since `RANGE_OPTIONS` is ascending).
 *
 * @param {number|null|undefined} histWindowSize
 * @param {string[]} [options] - Defaults to `RANGE_OPTIONS`.
 * @returns {string} One of `options`.
 */
export function resolveDefaultRange(histWindowSize, options = RANGE_OPTIONS) {
  const target = isFiniteNumber(histWindowSize)
    ? histWindowSize
    : Number(options[0]);

  let closest = options[0];
  let smallestDiff = Math.abs(target - Number(options[0]));
  for (const option of options) {
    const diff = Math.abs(target - Number(option));
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = option;
    }
  }
  return closest;
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
 * Compute the stats row's range-dependent numbers: the lowest price reached
 * within the filtered range (with its timestamp), the average price, and how
 * the current price compares to that average.
 *
 * @param {PriceHistoryRecord[]} filteredHistory
 * @param {number|null|undefined} currentPrice
 * @returns {{
 *   lowest: {price: number, timestamp: number}|null,
 *   average: number|null,
 *   currentVsAverage: number|null
 * }}
 */
export function computeRangeStats(filteredHistory, currentPrice) {
  if (!Array.isArray(filteredHistory) || filteredHistory.length === 0) {
    return { lowest: null, average: null, currentVsAverage: null };
  }

  let lowest = filteredHistory[0];
  let sum = 0;
  for (const record of filteredHistory) {
    if (record.price < lowest.price) lowest = record;
    sum += record.price;
  }
  const average = sum / filteredHistory.length;

  const currentVsAverage =
    isFiniteNumber(currentPrice) && average !== 0
      ? ((currentPrice - average) / average) * 100
      : null;

  return {
    lowest: { price: lowest.price, timestamp: lowest.timestamp },
    average,
    currentVsAverage
  };
}

/**
 * Compute a Y-axis domain padded around the filtered history's min and max
 * price, so the line never touches the chart's top/bottom edge and never
 * starts at a forced zero baseline.
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
    return [min - padding, max + padding];
  }

  const padding = (max - min) * paddingRatio;
  return [min - padding, max + padding];
}

/**
 * Find every contiguous run of out-of-stock records in the filtered history,
 * as timestamp pairs suitable for a chart's `ReferenceArea` bands. Each band
 * covers the real out-of-stock *period*: it starts at the first out-of-stock
 * record and ends at the timestamp of the record where stock came back (not
 * at the last out-of-stock record itself), so a single out-of-stock check
 * between two in-stock ones still produces a visible band spanning that
 * whole interval, and a multi-sample run is not drawn shorter than the
 * period it actually covers.
 *
 * A run still open at the end of `filteredHistory` (out of stock as of the
 * last check, with no later "back in stock" record to close it at) has no
 * such endpoint to use, so it ends at the last record's own timestamp
 * instead. That collapses to zero width for a *single*-sample trailing run
 * (its start and end are the same record), so that one case starts the band
 * half the gap *before* the last record instead (extending backward, toward
 * the preceding sample) rather than past it - past the last point would
 * fall outside the chart's X domain (`['dataMin', 'dataMax']`, computed only
 * from the plotted points) and be clipped, invisible. With fewer than 2
 * records total there is no neighbouring gap to measure, so a trailing
 * single-sample run in that case is left as a zero-width `{x1, x2}` pair (an
 * unavoidable edge case; the chart itself never renders with fewer than 2
 * points regardless).
 *
 * @param {PriceHistoryRecord[]} filteredHistory - Ascending by timestamp.
 * @returns {Array<{x1: number, x2: number}>}
 */
export function computeOutOfStockBands(filteredHistory) {
  if (!Array.isArray(filteredHistory) || filteredHistory.length === 0) {
    return [];
  }

  const bands = [];
  let runStart = null;

  filteredHistory.forEach((record) => {
    if (record.is_in_stock === false) {
      if (runStart === null) runStart = record.timestamp;
    } else if (runStart !== null) {
      // Stock came back at this record: the period covers up to here.
      bands.push({ x1: runStart, x2: record.timestamp });
      runStart = null;
    }
  });

  if (runStart !== null) {
    const lastTimestamp = filteredHistory[filteredHistory.length - 1].timestamp;
    if (runStart === lastTimestamp) {
      // A single trailing sample: extend backward (toward the preceding
      // point, still inside the X domain) instead of past `lastTimestamp`
      // (outside it, and clipped).
      const previousTimestamp =
        filteredHistory.length > 1
          ? filteredHistory[filteredHistory.length - 2].timestamp
          : null;
      const halfGap =
        previousTimestamp !== null
          ? (lastTimestamp - previousTimestamp) / 2
          : 0;
      bands.push({ x1: lastTimestamp - halfGap, x2: lastTimestamp });
    } else {
      // A multi-sample trailing run already spans real width on its own
      // (from when it started to the last checked record), entirely inside
      // the domain.
      bands.push({ x1: runStart, x2: lastTimestamp });
    }
  }

  return bands;
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
