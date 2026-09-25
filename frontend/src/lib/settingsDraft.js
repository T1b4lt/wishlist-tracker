/**
 * Pure helpers for the Settings page's local draft: the editable subset of
 * the app configuration, kept as plain component state and compared against
 * the config store's `config` to derive `isDirty` and to build the patch
 * sent to `configStore.save()`.
 *
 * Kept separate from `SettingsPage` (and framework-free) so the tricky part
 * -- reconciling a background config refresh (e.g. after obtaining a
 * Telegram chat id) with a draft the user may already be mid-edit on -- can
 * be unit tested directly, without rendering anything.
 */

/** The config fields the Settings form can edit and save. Deliberately
 * excludes `telegram_bot_chat_id` and `telegram_status`: both are set by
 * backend actions (not typed by the user) and are always read live from the
 * config store, never drafted or included in the save patch. */
export const EDITABLE_FIELDS = [
  'selected_language',
  'analysis_hour',
  'hist_window_size',
  'google_api_key',
  'telegram_bot_token',
  'is_price_drop_alert',
  'is_stock_change_alert'
];

/**
 * Builds a draft object (the editable fields only) from a `GET /config/`
 * response. Nullable string fields fall back to `''` so inputs stay
 * controlled.
 * @param {object} config
 * @returns {object}
 */
export function draftFromConfig(config) {
  return {
    selected_language: config.selected_language,
    analysis_hour: config.analysis_hour,
    hist_window_size: config.hist_window_size,
    google_api_key: config.google_api_key || '',
    telegram_bot_token: config.telegram_bot_token || '',
    is_price_drop_alert: config.is_price_drop_alert,
    is_stock_change_alert: config.is_stock_change_alert
  };
}

/**
 * Whether `draft` differs from `baseline` (the config-derived draft) on any
 * editable field.
 * @param {object} draft
 * @param {object} baseline
 * @returns {boolean}
 */
export function isDraftDirty(draft, baseline) {
  return EDITABLE_FIELDS.some((field) => draft[field] !== baseline[field]);
}

/**
 * Reconciles a fresh config-derived baseline into the current draft after
 * the config store refreshes in the background (e.g. `fetch(true)` after a
 * Telegram action), without discarding unsaved edits.
 *
 * For each field: if the draft still matches the *previous* baseline (the
 * user never touched it), it adopts the new baseline's value, picking up
 * whatever changed upstream. Otherwise the draft's value (the user's
 * unsaved edit) is kept as-is. This is what lets "Get chat id" refresh
 * `telegram_status` without silently discarding, say, an in-progress edit
 * to the Google API key field.
 *
 * @param {object} draft - The current draft.
 * @param {object} prevBaseline - The config-derived draft before this refresh.
 * @param {object} nextBaseline - The config-derived draft after this refresh.
 * @returns {object} The reconciled draft.
 */
export function mergeUpstreamChanges(draft, prevBaseline, nextBaseline) {
  const merged = { ...draft };
  for (const field of EDITABLE_FIELDS) {
    if (draft[field] === prevBaseline[field]) {
      merged[field] = nextBaseline[field];
    }
  }
  return merged;
}

/**
 * Builds the `PATCH /config/` payload from a draft. Secret fields are sent
 * as-is, including an empty string when the user cleared a previously
 * configured secret: the backend (`ConfigUpdate`/`update_config`) treats a
 * JSON `null` as "field not provided, leave it alone", so sending `null`
 * for an emptied field would silently keep the old secret instead of
 * clearing it. An empty string, by contrast, is a real value the backend
 * applies (and `telegram_status` correctly recomputes to `"not_configured"`
 * for an empty token).
 * @param {object} draft
 * @returns {object}
 */
export function buildConfigPatch(draft) {
  return {
    selected_language: draft.selected_language,
    analysis_hour: draft.analysis_hour,
    hist_window_size: draft.hist_window_size,
    google_api_key: draft.google_api_key,
    telegram_bot_token: draft.telegram_bot_token,
    is_price_drop_alert: draft.is_price_drop_alert,
    is_stock_change_alert: draft.is_stock_change_alert
  };
}
