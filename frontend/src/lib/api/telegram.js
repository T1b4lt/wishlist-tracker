import { request } from './client';

/**
 * Fetch the Telegram chat id linked to the configured bot token.
 * The backend responds with a 400 `ApiError` when no bot token is
 * configured, and a 404 when the user has not started a conversation with
 * the bot yet.
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const getChatId = (signal) => request('/telegram-chat-id', { signal });

/**
 * Send a test message to the configured Telegram chat.
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const sendTestMessage = (signal) =>
  request('/telegram-test-message', { method: 'POST', signal });
