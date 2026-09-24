import { request } from './client';

/**
 * List every category.
 * @param {AbortSignal} [signal]
 * @returns {Promise<object[]>}
 */
export const list = (signal) => request('/categories/', { signal });

/**
 * Create a new category.
 * @param {object} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The created category.
 */
export const create = (data, signal) =>
  request('/categories/', { method: 'POST', body: data, signal });

/**
 * Partially update a category.
 * @param {number|string} id
 * @param {object} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The updated category.
 */
export const update = (id, data, signal) =>
  request(`/categories/${id}`, { method: 'PATCH', body: data, signal });

/**
 * Delete a category. The backend responds with a 400 `ApiError` when the
 * category is still assigned to one or more products.
 * @param {number|string} id
 * @param {AbortSignal} [signal]
 * @returns {Promise<null>}
 */
export const remove = (id, signal) =>
  request(`/categories/${id}`, { method: 'DELETE', signal });
