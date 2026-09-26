/**
 * `GET /daily-check/` fixtures (`backend/src/schemas/daily_check.py`'s
 * `DailyCheckStatusResponse`).
 */

/**
 * @param {object} [overrides]
 * @returns {object} A full `DailyCheckStatusResponse`-shaped object; by
 *   default today's check has not run yet (no notice is shown).
 */
export function buildDailyCheck(overrides = {}) {
  return {
    day_start: 0,
    started_at: null,
    total_products: null,
    limit_reached_at: null,
    pending_at_limit: null,
    pending_now: 0,
    ...overrides
  };
}
