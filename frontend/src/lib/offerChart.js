/**
 * Chart data for a product tracked in several stores: one stepped series
 * per offer. Out-of-stock periods are drawn as a dashed stretch of the same
 * line, so each point carries `inStockPrice` (solid line) and
 * `outOfStockPrice` (dashed line). A step (`stepAfter`) from point i to i+1
 * shows point i's state, so a point also carries the value of the line the
 * previous point belongs to; that way both lines reach every transition.
 */

import {
  buildChartPoints,
  computeYDomain,
  filterPriceHistoryByRange
} from './productHistory';

/** Line colors, in offer order (Chakra color tokens as CSS variables). */
export const SERIES_COLORS = [
  'var(--chakra-colors-fg)',
  'var(--chakra-colors-blue-500)',
  'var(--chakra-colors-orange-500)',
  'var(--chakra-colors-green-500)',
  'var(--chakra-colors-purple-500)',
  'var(--chakra-colors-pink-500)'
];

/**
 * @param {Array<{ id: number, store_name?: string|null, store_id?: number|null, store_has_favicon?: boolean, price_history: object[] }>} offers
 * @param {string} range - A `RANGE_OPTIONS` value or `RANGE_ALL`.
 * @param {number} [now] - Seconds since epoch.
 * @returns {Array<object>} One series per offer, in offer order.
 */
export function buildOfferSeries(offers, range, now = Date.now() / 1000) {
  return (offers ?? []).map((offer, index) => {
    const points = buildChartPoints(
      filterPriceHistoryByRange(offer.price_history, range, now)
    );
    return {
      offerId: offer.id,
      storeName: offer.store_name ?? null,
      storeId: offer.store_id ?? null,
      hasFavicon: Boolean(offer.store_has_favicon),
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      points: points.map((point, i) => {
        const previous = points[i - 1];
        const inStock =
          point.isInStock === true || previous?.isInStock === true;
        const outOfStock =
          point.isInStock === false || previous?.isInStock === false;
        return {
          ...point,
          inStockPrice: inStock ? point.price : null,
          outOfStockPrice: outOfStock ? point.price : null
        };
      })
    };
  });
}

/**
 * A padded Y domain covering every series (see `computeYDomain`).
 * @param {Array<{ points: Array<{ price: number }> }>} series
 * @returns {[number, number]|['auto', 'auto']}
 */
export function seriesYDomain(series) {
  return computeYDomain(series.flatMap((s) => s.points));
}
