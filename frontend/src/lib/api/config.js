import { request } from './client';

/**
 * Fetch the application configuration.
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const get = (signal) => request('/config/', { signal });

/**
 * Partially update the application configuration.
 * @param {object} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The updated configuration.
 */
export const update = (data, signal) =>
  request('/config/', { method: 'PATCH', body: data, signal });
