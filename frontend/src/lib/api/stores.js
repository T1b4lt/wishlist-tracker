import { API_URL } from './client';

/**
 * URL of a store's favicon image (`GET /stores/{id}/favicon`). Used directly
 * as an `<img src>`, so the browser caches it (the API sends a week-long
 * `Cache-Control`).
 * @param {number|string} storeId
 * @returns {string}
 */
export const faviconUrl = (storeId) => `${API_URL}/stores/${storeId}/favicon`;
