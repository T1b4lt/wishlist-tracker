import { request } from './client';

/**
 * Add a store (offer) to a product.
 * @param {number|string} productId
 * @param {{ url: string, currency: string, store_id?: number }} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The created offer.
 */
export const add = (productId, data, signal) =>
  request(`/products/${productId}/offers`, {
    method: 'POST',
    body: data,
    signal
  });

/**
 * Change an offer's URL (its store is re-resolved by the backend).
 * @param {number|string} offerId
 * @param {{ url: string }} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The updated offer.
 */
export const update = (offerId, data, signal) =>
  request(`/offers/${offerId}`, { method: 'PATCH', body: data, signal });

/**
 * Move an offer into a new standalone product.
 * @param {number|string} offerId
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The new product.
 */
export const unlink = (offerId, signal) =>
  request(`/offers/${offerId}/unlink`, { method: 'POST', signal });

/**
 * Check an offer's price now, replacing today's record if it has one. Waits
 * for the store page to be scraped, which can take a minute or two.
 * @param {number|string} offerId
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ outcome: 'stored', checked_at: number }>}
 * @throws {ApiError} 502 (no valid price), 429 (Gemini quota), 503 (AI
 *   provider unreachable) or 409 (no AI provider configured).
 */
export const check = (offerId, signal) =>
  request(`/offers/${offerId}/check`, { method: 'POST', signal });

/**
 * Delete an offer and its price history.
 * @param {number|string} offerId
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const remove = (offerId, signal) =>
  request(`/offers/${offerId}`, { method: 'DELETE', signal });
