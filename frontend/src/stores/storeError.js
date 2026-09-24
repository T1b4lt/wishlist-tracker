/**
 * Normalizes a caught fetch error into the shape stores keep in their
 * `error` field: enough for a page to make a UI decision (e.g. render a
 * translated "not found" message for a 404) without ever exposing the raw,
 * untranslated `message` (a backend `detail` string or a generic "Request
 * failed with status N", from `src/lib/api/client.js`'s `ApiError`) to the
 * user. Pages must always render their own translated copy and use
 * `status` only to pick which translated copy to show.
 *
 * @param {unknown} err - Typically an `ApiError` (has `.status`), but any
 *   thrown value is handled.
 * @returns {{status: number|null, message: string}}
 */
export function toStoreError(err) {
  return {
    status: typeof err?.status === 'number' ? err.status : null,
    message: err instanceof Error ? err.message : String(err)
  };
}
