/**
 * Telegram daily check report modes offered in Settings. Mirrored by the
 * backend (`backend/src/core/config.py`) and pinned for both sides by
 * `contracts/daily-check-report.json`.
 * @type {string[]}
 */
export const DAILY_CHECK_REPORT_OPTIONS = ['off', 'limit_days', 'every_day'];

/** The mode used when none (or an unknown one) is configured. */
export const DEFAULT_DAILY_CHECK_REPORT = 'limit_days';

/**
 * @param {unknown} value - A configured `daily_check_report`.
 * @returns {string} `value` when it is an offered option, otherwise
 *   `DEFAULT_DAILY_CHECK_REPORT`.
 */
export const resolveDailyCheckReport = (value) =>
  DAILY_CHECK_REPORT_OPTIONS.includes(value)
    ? value
    : DEFAULT_DAILY_CHECK_REPORT;
