/**
 * Fixture timestamps are built relative to the real current time (computed
 * right before each test mocks its routes) rather than a frozen browser
 * clock: several flows under test (the product form's 500ms debounced
 * extraction, page-transition motion) rely on real timers/animations, and
 * faking the whole clock would fight those. The small delay between
 * building a fixture and the page actually rendering it (well under a
 * second) never crosses a relative-time or short-date bucket boundary for
 * the offsets used below, so assertions built from these same helpers stay
 * deterministic in practice.
 *
 * Dates are formatted with an explicit `timeZone: 'UTC'` so Node (running
 * the test) and the browser (pinned to `timezoneId: 'UTC'` in
 * `playwright.config.js`) always agree, regardless of the host machine's
 * own timezone.
 */

/** Seconds in a day. */
export const DAY_SECONDS = 60 * 60 * 24;

/**
 * When set (in milliseconds since epoch), `nowSeconds()` returns this fixed
 * instant instead of the real current time. Only the visual snapshot spec
 * (`visual.spec.js`) pins it, together with the browser's own clock
 * (`page.clock.setFixedTime`), so every date and relative time it renders
 * is identical on every run. A worker process can go on to run other spec
 * files, so that spec unpins it again after each test (`afterEach`).
 * @type {number|null}
 */
let pinnedNowMs = null;

/**
 * Pins (or, with `null`, unpins) the "current time" fixtures are built
 * from. See `pinnedNowMs`.
 * @param {number|null} ms - Milliseconds since epoch.
 */
export const pinFixtureNow = (ms) => {
  pinnedNowMs = ms;
};

/** Current time (or the pinned one, see `pinFixtureNow`), in Unix seconds
 * (rounded down). */
export const nowSeconds = () => Math.floor((pinnedNowMs ?? Date.now()) / 1000);

/**
 * Formats a Unix timestamp (seconds) the same way `src/lib/format.js`'s
 * `formatDate(ts, locale, 'short')` does for the `'en-US'` locale, pinned to
 * UTC.
 * @param {number} ts - Seconds since epoch.
 * @returns {string} e.g. `"Mar 5, 2024"`.
 */
export const formatShortDateUTC = (ts) =>
  new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
