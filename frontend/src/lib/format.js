/**
 * Map the app's i18n language setting to an `Intl` locale tag.
 *
 * The app's `i18next` instance uses the language keys `english`/`spanish`
 * (see `src/i18n/index.js`), not standard BCP 47 tags, so this cannot be
 * passed straight to `Intl`.
 *
 * @param {string} language - `i18n.language`, i.e. `'english'` or `'spanish'`.
 * @returns {'es-ES'|'en-US'} `'es-ES'` for `'spanish'`, `'en-US'` otherwise.
 */
export const getLocale = (language) =>
  language === 'spanish' ? 'es-ES' : 'en-US';

/**
 * Format a price as a localized currency string.
 *
 * @param {number|null|undefined} value
 * @param {string} currency - ISO 4217 currency code (e.g. `EUR`, `USD`).
 * @param {string} locale - An `Intl` locale tag, see `getLocale`.
 * @returns {string} The formatted price, or `'-'` when `value` is missing.
 */
export const formatPrice = (value, currency, locale) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(value);
};

/**
 * Format a percentage value as a localized percent string, with one decimal
 * place.
 *
 * @param {number|null|undefined} value - A percentage number, e.g. `-3.2` for "-3.2%"
 *   (not a 0-1 fraction).
 * @param {string} locale - An `Intl` locale tag, see `getLocale`.
 * @param {object} [options]
 * @param {Intl.NumberFormatOptions['signDisplay']} [options.signDisplay] - Defaults
 *   to `'auto'` (a sign only for negative values). Use `'exceptZero'` to add a
 *   `+` for positive values while leaving `0%` unsigned, or `'always'` to sign
 *   `0%` too.
 * @returns {string} The formatted percentage, or `'-'` when `value` is missing.
 */
export const formatPercent = (value, locale, { signDisplay = 'auto' } = {}) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    signDisplay,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100);
};

const DATE_STYLE_PRESETS = {
  short: { month: 'short', day: 'numeric', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' }
};

/**
 * Format a unix timestamp (seconds since epoch, as returned by the backend)
 * as a localized date.
 *
 * @param {number|null|undefined} ts - Seconds since epoch.
 * @param {string} locale - An `Intl` locale tag, see `getLocale`.
 * @param {'short'|'long'|Intl.DateTimeFormatOptions} [style] - `'short'` (e.g.
 *   "Mar 5, 2024", the default) or `'long'` (e.g. "5 March 2024"), or an
 *   explicit `Intl.DateTimeFormatOptions` object.
 * @returns {string} The formatted date, or `'-'` when `ts` is missing or invalid.
 */
export const formatDate = (ts, locale, style = 'short') => {
  if (ts === null || ts === undefined || Number.isNaN(ts)) {
    return '-';
  }
  const options =
    typeof style === 'string'
      ? (DATE_STYLE_PRESETS[style] ?? DATE_STYLE_PRESETS.short)
      : style;
  return new Date(ts * 1000).toLocaleDateString(locale, options);
};

/** Units tried from largest to smallest, each with its length in seconds. */
const RELATIVE_UNITS = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1]
];

/**
 * Format a unix timestamp (seconds since epoch) as a localized relative time
 * string (e.g. "2 days ago", "in 3 hours"), via `Intl.RelativeTimeFormat`.
 *
 * @param {number|null|undefined} ts - Seconds since epoch.
 * @param {string} locale - An `Intl` locale tag, see `getLocale`.
 * @param {number} [now] - Seconds since epoch to compare against. Defaults to
 *   the current time; pass an explicit value in tests for deterministic output.
 * @returns {string} The formatted relative time, or `'-'` when `ts` is missing or invalid.
 */
export const formatRelative = (ts, locale, now = Date.now() / 1000) => {
  if (ts === null || ts === undefined || Number.isNaN(ts)) {
    return '-';
  }

  const diffSeconds = ts - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (unit === 'second' || Math.abs(diffSeconds) >= secondsInUnit) {
      const value = Math.round(diffSeconds / secondsInUnit);
      return rtf.format(value, unit);
    }
  }
  // Unreachable: the loop's last entry ('second') always matches.
  return rtf.format(0, 'second');
};

/**
 * Determine the trend direction for a price (or price change) value. A
 * change of exactly `0` is treated as `'flat'`, never as a rise or a drop.
 *
 * @param {number|null|undefined} value
 * @returns {'up'|'down'|'flat'|null} The trend direction, or `null` when no
 *   value is available.
 */
export const getTrend = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
};
