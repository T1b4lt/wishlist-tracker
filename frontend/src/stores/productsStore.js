import { create } from 'zustand';
import { products as productsApi } from '@/lib/api';
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
    return created;
  },

  /**
   * Update a product, then refetch the dashboard summary.
   * @param {number|string} id
   * @param {object} data
   * @returns {Promise<object>} The updated product.
   */
  async update(id, data) {
    const updated = await productsApi.update(id, data);
    await get().fetchSummary();
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
   * Load a single product's detail (including its full price history) into
   * `details[id]`.
   * @param {number|string} id
   */
  async fetchDetail(id) {
    set((state) => ({
      details: {
        ...state.details,
        [id]: { status: 'loading', error: null, data: null }
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
  }
}));
