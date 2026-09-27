import { create } from 'zustand';
import { offers as offersApi, products as productsApi } from '@/lib/api';
import { toStoreError } from './storeError';

/**
 * The store's state before any action has run. Exported so tests can reset
 * the store between cases with `useProductsStore.setState(initialProductsState, true)`.
 */
export const initialProductsState = {
  /** @type {object[]} Dashboard summary rows (`GET /products/dashboard-summary`). */
  items: [],
  /** @type {'idle'|'loading'|'success'|'error'} Status of the last `fetchSummary()` call. */
  status: 'idle',
  /**
   * Normalized error from the last failed `fetchSummary()` call. `message`
   * is the raw (English, untranslated) error text for logging only; pages
   * must render their own translated copy and may use `status` (e.g. 404)
   * to pick which one.
   * @type {{status: number|null, message: string}|null}
   */
  error: null,
  /**
   * Product detail records, keyed by id, each shaped like
   * `{ status: 'idle'|'loading'|'success'|'error', error: {status, message}|null, data: object|null }`.
   * @type {Record<string, {status: string, error: {status: number|null, message: string}|null, data: object|null}>}
   */
  details: {}
};

/**
 * After a store is added or its URL changes, the backend checks its price in
 * the background. The product is refetched every `PRICE_CHECK_POLL_MS` until
 * that store gets a new price record, at most `PRICE_CHECK_MAX_POLLS` times
 * (3 minutes): a check that fails leaves no record, so polling just stops.
 */
export const PRICE_CHECK_POLL_MS = 5000;
export const PRICE_CHECK_MAX_POLLS = 36;

/** Pending poll timers, so `cancelPriceChecks` can stop every watch. */
const priceCheckTimers = new Set();

/** Stop every pending price-check poll (used by tests between cases). */
export function cancelPriceChecks() {
  priceCheckTimers.forEach((timer) => clearTimeout(timer));
  priceCheckTimers.clear();
}

/**
 * Wait for `ms`, as a cancellable poll timer.
 * @param {number} ms
 * @returns {Promise<boolean>} True when the wait ended, never settles if cancelled.
 */
function pollDelay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      priceCheckTimers.delete(timer);
      resolve(true);
    }, ms);
    priceCheckTimers.add(timer);
  });
}

/**
 * Find an offer in a product detail record.
 * @param {{ offers?: Array<{ id: number }> }|null|undefined} detail
 * @param {number|string} offerId
 * @returns {object|undefined}
 */
function findOffer(detail, offerId) {
  return detail?.offers?.find((offer) => String(offer.id) === String(offerId));
}

/**
 * Zustand store for the products list (dashboard summary) and per-product
 * detail records, backed by `src/lib/api/products.js`.
 */
export const useProductsStore = create((set, get) => ({
  ...initialProductsState,

  /** Load the dashboard summary list. */
  async fetchSummary() {
    set({ status: 'loading', error: null });
    try {
      const items = await productsApi.dashboardSummary();
      set({ items, status: 'success', error: null });
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      set({ status: 'error', error: toStoreError(err) });
    }
  },

  /**
   * Create a product, then refetch the dashboard summary so `items` stays
   * in sync.
   * @param {object} data
   * @returns {Promise<object>} The created product.
   */
  async create(data) {
    const created = await productsApi.create(data);
    await get().fetchSummary();
    const offerId = created?.offers?.[0]?.id;
    if (offerId !== undefined) get()._watchPriceCheck(created.id, offerId);
    return created;
  },

  /**
   * Update a product, then refetch the dashboard summary and silently
   * refresh its cached detail record (see `_refreshDetailSilently`), so
   * any page or dialog reading `details[id]` (e.g. the product page,
   * Task 12) does not keep showing stale data after an edit made
   * elsewhere (e.g. from the dashboard).
   * @param {number|string} id
   * @param {object} data
   * @returns {Promise<object>} The updated product.
   */
  async update(id, data) {
    const updated = await productsApi.update(id, data);
    await get().fetchSummary();
    await get()._refreshDetailSilently(id);
    return updated;
  },

  /**
   * Delete a product, then refetch the dashboard summary.
   * @param {number|string} id
   */
  async remove(id) {
    await productsApi.remove(id);
    await get().fetchSummary();
  },

  /**
   * Add a store to a product, then refresh the summary and its detail.
   * @param {number|string} productId
   * @param {{ url: string, currency: string, store_id?: number }} data
   * @returns {Promise<object>} The created offer.
   */
  async addOffer(productId, data) {
    const offer = await offersApi.add(productId, data);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
    get()._watchPriceCheck(productId, offer.id);
    return offer;
  },

  /**
   * Change an offer's URL, then refresh the summary and the product detail.
   * @param {number|string} productId
   * @param {number|string} offerId
   * @param {{ url: string }} data
   * @returns {Promise<object>} The updated offer.
   */
  async updateOffer(productId, offerId, data) {
    const previousCheckedAt = findOffer(
      get().details[productId]?.data,
      offerId
    )?.last_checked_at;
    const offer = await offersApi.update(offerId, data);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
    get()._watchPriceCheck(productId, offerId, previousCheckedAt ?? null);
    return offer;
  },

  /**
   * Move an offer into a new product, then refresh.
   * @param {number|string} productId - The product the offer leaves.
   * @param {number|string} offerId
   * @returns {Promise<object>} The new product.
   */
  async unlinkOffer(productId, offerId) {
    const product = await offersApi.unlink(offerId);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
    return product;
  },

  /**
   * Delete an offer, then refresh.
   * @param {number|string} productId
   * @param {number|string} offerId
   */
  async removeOffer(productId, offerId) {
    await offersApi.remove(offerId);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
  },

  /**
   * Merge another product into `targetId`. The response is the merged
   * detail, cached directly; the source product's cached detail is dropped.
   * @param {number|string} targetId
   * @param {{ source_product_id: number, keep: 'target'|'source' }} data
   * @returns {Promise<object>} The merged product's detail.
   */
  async merge(targetId, data) {
    const detail = await productsApi.merge(targetId, data);
    set((state) => {
      const details = { ...state.details };
      delete details[data.source_product_id];
      details[targetId] = { status: 'success', error: null, data: detail };
      return { details };
    });
    await get().fetchSummary();
    return detail;
  },

  /**
   * Load a single product's detail (including its full price history) into
   * `details[id]`. Unlike a first load, revisiting an already-cached product
   * keeps its previous `data` in place while `status` flips to `loading`
   * (never blanks it to `null`), so a page reading `details[id]` (e.g. the
   * product page, Task 12) can keep rendering the stale record instead of
   * flashing back to a loading skeleton, and only needs to show one when
   * there is no data yet.
   * @param {number|string} id
   */
  async fetchDetail(id) {
    set((state) => ({
      details: {
        ...state.details,
        [id]: {
          status: 'loading',
          error: null,
          data: state.details[id]?.data ?? null
        }
      }
    }));
    try {
      const data = await productsApi.get(id);
      set((state) => ({
        details: {
          ...state.details,
          [id]: { status: 'success', error: null, data }
        }
      }));
    } catch (err) {
      console.error(`Error fetching product ${id}:`, err);
      set((state) => ({
        details: {
          ...state.details,
          [id]: { status: 'error', error: toStoreError(err), data: null }
        }
      }));
    }
  },

  /**
   * Poll a product until one of its offers gets a price record newer than
   * `previousCheckedAt` (the backend checks it in the background), then
   * cache the new detail and refresh the dashboard summary. Stops silently
   * when the product or offer is gone, or after `PRICE_CHECK_MAX_POLLS`.
   * Not awaited by the actions that start it.
   * @param {number|string} productId
   * @param {number} offerId
   * @param {number|null} [previousCheckedAt] - The offer's `last_checked_at`
   *   before the change (null for a new offer).
   */
  async _watchPriceCheck(productId, offerId, previousCheckedAt = null) {
    for (let poll = 0; poll < PRICE_CHECK_MAX_POLLS; poll += 1) {
      await pollDelay(PRICE_CHECK_POLL_MS);
      let data;
      try {
        data = await productsApi.get(productId);
      } catch {
        return;
      }
      const offer = findOffer(data, offerId);
      if (!offer) return;
      const checkedAt = offer.last_checked_at ?? null;
      if (checkedAt !== null && checkedAt !== previousCheckedAt) {
        set((state) => ({
          details: {
            ...state.details,
            [productId]: { status: 'success', error: null, data }
          }
        }));
        await get().fetchSummary();
        return;
      }
    }
  },

  /**
   * Refresh a product's cached detail record after a successful `update`,
   * without disturbing what is currently shown for it. Unlike
   * `fetchDetail`, this never flips `details[id]` to `loading`/`data: null`
   * while the request is in flight (so a mounted product page or edit
   * dialog reading it never flashes to a skeleton mid-submit) and never
   * marks it `error` on failure — the update itself already succeeded, so
   * a failed background refresh is logged and otherwise left silent
   * (the existing cached record, if any, is left exactly as it was)
   * rather than contradicting the update's own success with an error
   * state.
   * @param {number|string} id
   */
  async _refreshDetailSilently(id) {
    try {
      const data = await productsApi.get(id);
      set((state) => ({
        details: {
          ...state.details,
          [id]: { status: 'success', error: null, data }
        }
      }));
    } catch (err) {
      console.error(`Error refreshing product ${id} detail after update:`, err);
    }
  }
}));
