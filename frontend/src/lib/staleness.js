/**
 * Detection of products whose price has not been updated for a while.
 *
 * The daily cronjob stores one price record per product per day. When no
 * new record shows up for several days, the AI agent is probably failing
 * to read the product page (the site is down, the product was removed from
 * the store, the agent is being blocked...), so the UI warns the user.
 *
 * Products that were never checked are not considered stale: products have
 * no creation date, so there is nothing to measure the delay against.
 */

/** Days without a new price record after which a product is stale. */
export const STALE_AFTER_DAYS = 3;

const SECONDS_PER_DAY = 86400;

/**
 * @returns {number} The current Unix time, in seconds.
 */
export const nowInSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Whole days elapsed since the last price check.
 *
 * @param {number|null|undefined} lastCheckedAt - Unix seconds of the latest
 *   price record, as returned by the backend (`last_checked_at`).
 * @param {number} [now] - Reference Unix time in seconds; defaults to now.
 * @returns {number|null} The number of whole days (never negative), or `null`
 *   when the product was never checked.
 */
export const daysSinceCheck = (lastCheckedAt, now = nowInSeconds()) => {
  if (lastCheckedAt === null || lastCheckedAt === undefined) return null;
  return Math.max(0, Math.floor((now - lastCheckedAt) / SECONDS_PER_DAY));
};

/**
 * Whether a product's price has not been updated for `STALE_AFTER_DAYS` days
 * or more.
 *
 * @param {{ last_checked_at?: number|null }} product
 * @param {number} [now] - Reference Unix time in seconds; defaults to now.
 * @returns {boolean}
 */
export const isStale = (product, now = nowInSeconds()) => {
  const days = daysSinceCheck(product.last_checked_at, now);
  return days !== null && days >= STALE_AFTER_DAYS;
};
