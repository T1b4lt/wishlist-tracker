import { request } from './client';

/**
 * Fetch today's daily price check status (`GET /daily-check/`): the full
 * run's snapshot (nulls before it runs) and how many products are still
 * pending a retry after the AI provider stopped the check (Gemini quota or
 * provider unavailable).
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const get = (signal) => request('/daily-check/', { signal });
