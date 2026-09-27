/**
 * Test-only stand-in for the fields the backend computes (staleness, best
 * offer, precomputed range statistics), so mocked responses are internally
 * consistent with their own histories. The backend is the source of truth
 * (`backend/src/services/staleness.py`, `best_offer.py`, `price_stats.py`);
 * application code never imports this file.
 */

import { DAY_SECONDS, nowSeconds } from './time';

export const STALE_AFTER_DAYS = 3;
export const RANGE_KEYS = ['30', '60', '90', '180', 'all'];
export const DEFAULT_RANGE = '60';

const ascending = (history) =>
  [...(history ?? [])].sort((a, b) => a.timestamp - b.timestamp);

/** The newest record (the last one in input order on ties), or `null`. */
export const currentRecord = (history) => {
  const sorted = ascending(history);
  return sorted.length === 0 ? null : sorted[sorted.length - 1];
};

/** Records inside the last `days` days (every record when `days` is `null`). */
export const windowRecords = (history, days, now = nowSeconds()) => {
  const sorted = ascending(history);
  if (days === null) return sorted;
  const start = now - days * DAY_SECONDS;
  return sorted.filter((record) => record.timestamp >= start);
};

/** Average, change vs. average, lowest and at-lowest of a window. */
export function windowStats(window, current) {
  const valid = window.filter((record) => record.is_in_stock === true);
  const baseline = current
    ? valid.filter((record) => record.timestamp !== current.timestamp)
    : valid;
  const average =
    baseline.length > 0
      ? baseline.reduce((sum, record) => sum + record.price, 0) /
        baseline.length
      : null;
  const currentInStock = Boolean(current) && current.is_in_stock === true;
  const priceChangePct =
    currentInStock && average !== null && average > 0
      ? ((current.price - average) / average) * 100
      : null;
  let lowest = null;
  for (const record of valid) {
    if (lowest === null || record.price <= lowest.price) lowest = record;
  }
  return {
    average,
    priceChangePct,
    lowest,
    isAtLowest:
      currentInStock && lowest !== null && current.price <= lowest.price
  };
}

/** `days_since_check` and `is_stale` of an offer. */
export function offerStaleFields(lastCheckedAt, now = nowSeconds()) {
  const days =
    lastCheckedAt === null || lastCheckedAt === undefined
      ? null
      : Math.max(0, Math.floor((now - lastCheckedAt) / DAY_SECONDS));
  return {
    days_since_check: days,
    is_stale: days !== null && days >= STALE_AFTER_DAYS
  };
}

/** `is_stale` and `stale_days` of a product, from its offers' fields. */
export function productStaleFields(offers) {
  const days = (offers ?? [])
    .filter((offer) => offer.is_stale)
    .map((offer) => offer.days_since_check);
  return {
    is_stale: days.length > 0,
    stale_days: days.length > 0 ? Math.max(...days) : null
  };
}

const rank = (offer, current) => [
  current.is_in_stock === true ? 0 : 1,
  current.price,
  -current.timestamp,
  offer.id
];

const compareRanks = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

function bestOffer(offers) {
  let best = null;
  for (const offer of offers) {
    const current = currentRecord(offer.price_history);
    if (!current) continue;
    const offerRank = rank(offer, current);
    if (best === null || compareRanks(offerRank, best.rank) < 0) {
      best = { offer, rank: offerRank };
    }
  }
  return best?.offer ?? null;
}

function lowestAcrossOffers(offers, days, now) {
  let lowest = null;
  for (const offer of offers) {
    for (const record of windowRecords(offer.price_history, days, now)) {
      if (record.is_in_stock !== true) continue;
      if (
        lowest === null ||
        record.price < lowest.price ||
        (record.price === lowest.price && record.timestamp >= lowest.timestamp)
      ) {
        lowest = {
          price: record.price,
          timestamp: record.timestamp,
          offer_id: offer.id
        };
      }
    }
  }
  return lowest;
}

/**
 * `best_offer_id`, `is_in_stock`, `default_range` and `ranges` of a product
 * detail, from its offers' histories.
 * @param {object[]} offers - Offers with `price_history`.
 * @param {{ now?: number, defaultRange?: string }} [options]
 * @returns {object}
 */
export function detailFields(
  offers,
  { now = nowSeconds(), defaultRange = DEFAULT_RANGE } = {}
) {
  const currents = (offers ?? [])
    .map((offer) => currentRecord(offer.price_history))
    .filter(Boolean);
  const best = bestOffer(offers ?? []);
  const bestCurrent = best ? currentRecord(best.price_history) : null;
  return {
    best_offer_id: best?.id ?? null,
    is_in_stock:
      currents.length === 0
        ? null
        : currents.some((current) => current.is_in_stock === true),
    default_range: defaultRange,
    ranges: RANGE_KEYS.map((key) => {
      const days = key === 'all' ? null : Number(key);
      const stats = windowStats(
        windowRecords(best?.price_history, days, now),
        bestCurrent
      );
      return {
        key,
        window_start: days === null ? null : now - days * DAY_SECONDS,
        average: stats.average,
        price_change_pct: stats.priceChangePct,
        lowest: lowestAcrossOffers(offers ?? [], days, now)
      };
    })
  };
}
