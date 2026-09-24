import { request } from './client';

/**
 * List every tracked product.
 * @param {AbortSignal} [signal]
 * @returns {Promise<object[]>}
 */
export const list = (signal) => request('/products/', { signal });

/**
 * Fetch the summarized product list used by the dashboard table
 * (current price, price change, stock and category info).
 * @param {AbortSignal} [signal]
 * @returns {Promise<object[]>}
 */
export const dashboardSummary = (signal) =>
  request('/products/dashboard-summary', { signal });

/**
 * Fetch a single product, including its full price history.
 * @param {number|string} id
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const get = (id, signal) => request(`/products/${id}`, { signal });

/**
 * Create a new product.
 * @param {object} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The created product.
 */
export const create = (data, signal) =>
  request('/products/', { method: 'POST', body: data, signal });

/**
 * Partially update a product.
 * @param {number|string} id
 * @param {object} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The updated product.
 */
export const update = (id, data, signal) =>
  request(`/products/${id}`, { method: 'PATCH', body: data, signal });

/**
 * Delete a product and its price history.
 * @param {number|string} id
 * @param {AbortSignal} [signal]
 * @returns {Promise<null>}
 */
export const remove = (id, signal) =>
  request(`/products/${id}`, { method: 'DELETE', signal });

/**
 * Ask the backend to extract product details (name, description, price,
 * currency, ...) from a product page URL.
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The extracted product info.
 */
export const extractInfo = (url, signal) =>
  request('/extract-product-info/', { method: 'POST', body: { url }, signal });
