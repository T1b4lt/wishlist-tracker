import { API_URL } from '@/lib/api';

/**
 * Error thrown by `request` for any non-2xx response.
 *
 * @property {number} status - The HTTP status code.
 * @property {unknown} [detail] - The `detail` field from the JSON error body, when present.
 * @property {string} message - `detail` when it is a string, otherwise a generic
 *   "Request failed with status <status>" message.
 */
export class ApiError extends Error {
  constructor(message, { status, detail } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Perform an HTTP request against the backend API, serializing `body` as
 * JSON and parsing the response as JSON.
 *
 * @param {string} path - Path appended to `API_URL` (e.g. `/products/`).
 * @param {object} [options]
 * @param {string} [options.method] - HTTP method. Defaults to `GET`.
 * @param {unknown} [options.body] - Request payload, JSON-serialized when present.
 * @param {AbortSignal} [options.signal] - Forwarded to `fetch` for cancellation.
 * @returns {Promise<unknown>} The parsed JSON response body, or `null` when the
 *   response has no body (e.g. a 204).
 * @throws {ApiError} When the response status is not in the 2xx range.
 */
export async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  let payload;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: payload,
    signal
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const detail = data && typeof data === 'object' ? data.detail : undefined;
    const message =
      typeof detail === 'string'
        ? detail
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, { status: response.status, detail });
  }

  return data;
}
