/**
 * The historical window options, in days, shared by the settings page and
 * the product chart's range selector. Mirrored by the backend
 * (`backend/src/core/config.py`) and pinned for both sides by
 * `contracts/hist-window.json`.
 * @type {number[]}
 */
export const HIST_WINDOW_OPTIONS = [30, 60, 90, 180];

/** The window used when none (or an unknown one) is configured. */
export const DEFAULT_HIST_WINDOW = 60;

/**
 * @param {unknown} value - A configured `hist_window_size`.
 * @returns {number} `value` when it is one of `HIST_WINDOW_OPTIONS`,
 *   otherwise `DEFAULT_HIST_WINDOW`.
 */
export const resolveHistWindow = (value) =>
  HIST_WINDOW_OPTIONS.includes(value) ? value : DEFAULT_HIST_WINDOW;
