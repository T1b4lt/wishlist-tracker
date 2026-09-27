/**
 * `GET /config/` / `PATCH /config/` fixtures (`backend/src/schemas/config.py`'s
 * `ConfigResponse`), one per `telegram_status` value the backend can report.
 */

/**
 * @param {object} [overrides]
 * @returns {object} A full `ConfigResponse`-shaped object.
 */
export function buildConfig(overrides = {}) {
  return {
    analysis_hour: 12,
    hist_window_size: 60,
    is_price_drop_alert: false,
    is_stock_change_alert: false,
    daily_check_report: 'limit_days',
    telegram_bot_token: null,
    telegram_bot_chat_id: null,
    selected_language: 'english',
    google_api_key: null,
    ai_provider: 'google_ai_studio',
    ai_provider_options: ['google_ai_studio', 'ollama'],
    ollama_url: null,
    ollama_model: null,
    telegram_status: 'not_configured',
    hist_window_options: [30, 60, 90, 180],
    daily_check_report_options: ['off', 'limit_days', 'every_day'],
    stale_after_days: 3,
    ...overrides
  };
}

/** No Telegram bot token saved yet. */
export const CONFIG_NOT_CONFIGURED = buildConfig();

/** A bot token is saved, but no chat has been linked yet. */
export const CONFIG_TOKEN_ONLY = buildConfig({
  telegram_bot_token: '123456:fake-bot-token',
  telegram_status: 'token_only'
});

/** Bot token and chat both configured; alerts can be enabled. */
export const CONFIG_CONNECTED = buildConfig({
  telegram_bot_token: '123456:fake-bot-token',
  telegram_bot_chat_id: '987654321',
  telegram_status: 'connected',
  is_price_drop_alert: true,
  is_stock_change_alert: true
});
