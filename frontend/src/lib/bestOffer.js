/**
 * Best-offer rules for a product tracked in several stores. Mirrors the
 * backend's `best_offer.py`; both are pinned by
 * `contracts/best-offer-cases.json` (see `contracts/README.md`).
 *
 * @typedef {import('./productHistory').PriceHistoryRecord} PriceHistoryRecord
 * @typedef {{ id: number, price_history: PriceHistoryRecord[] }} OfferWithHistory
 */

import { filterPriceHistoryByRange, getCurrentRecord } from './productHistory';

/**
 * Sort key of an offer with history: in stock first, then cheaper, then
 * newer, then lower id.
 */
const rankOf = (id, current) => [
  current.is_in_stock === true ? 0 : 1,
  current.price,
  -current.timestamp,
  id
];

const compareRanks = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

/**
 * @param {OfferWithHistory[]} offers
 * @returns {number|null} The id of the offer that represents the product,
 *   or `null` when no offer has history.
 */
export function selectBestOffer(offers) {
  let best = null;
  for (const offer of offers ?? []) {
    const current = getCurrentRecord(offer.price_history);
    if (!current) continue;
    const rank = rankOf(offer.id, current);
    if (best === null || compareRanks(rank, best) < 0) best = rank;
  }
  return best === null ? null : best[3];
}

/**
 * Product-level results of the best-offer rules.
 *
 * @param {OfferWithHistory[]} offers
 * @param {string} range - A `RANGE_OPTIONS` value or `RANGE_ALL`.
 * @param {number} [now] - Seconds since epoch.
 * @returns {{ bestOfferId: number|null, isInStock: boolean|null, isAtLowest: boolean }}
 */
export function computeProductOfferStats(
  offers,
  range,
  now = Date.now() / 1000
) {
  const currents = new Map(
    (offers ?? []).map((offer) => [
      offer.id,
      getCurrentRecord(offer.price_history)
    ])
  );
  const withHistory = [...currents.values()].filter(Boolean);
  const isInStock =
    withHistory.length === 0
      ? null
      : withHistory.some((current) => current.is_in_stock === true);

  const bestOfferId = selectBestOffer(offers);
  let isAtLowest = false;
  const best = bestOfferId === null ? null : currents.get(bestOfferId);
  if (best && best.is_in_stock === true) {
    const lowest = computeLowestAcrossOffers(offers, range, now);
    isAtLowest = lowest !== null && best.price <= lowest.price;
  }

  return { bestOfferId, isInStock, isAtLowest };
}

/**
 * The cheapest in-stock record of any offer inside the range (the most
 * recent one on ties).
 *
 * @param {OfferWithHistory[]} offers
 * @param {string} range
 * @param {number} [now] - Seconds since epoch.
 * @returns {{ price: number, timestamp: number, offerId: number }|null}
 */
export function computeLowestAcrossOffers(
  offers,
  range,
  now = Date.now() / 1000
) {
  let lowest = null;
  for (const offer of offers ?? []) {
    for (const record of filterPriceHistoryByRange(
      offer.price_history,
      range,
      now
    )) {
      if (record.is_in_stock !== true) continue;
      if (
        lowest === null ||
        record.price < lowest.price ||
        (record.price === lowest.price && record.timestamp >= lowest.timestamp)
      ) {
        lowest = {
          price: record.price,
          timestamp: record.timestamp,
          offerId: offer.id
        };
      }
    }
  }
  return lowest;
}

/**
 * The dashboard row's best offer summary (the first offer when the product
 * has no best offer yet, so "Open in store" always has a URL).
 *
 * @param {{ best_offer_id: number|null, offers: object[] }} product
 * @returns {object|null}
 */
export function findBestOfferSummary(product) {
  const offers = product?.offers ?? [];
  return (
    offers.find((offer) => offer.id === product.best_offer_id) ??
    offers[0] ??
    null
  );
}
