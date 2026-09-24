import { create } from 'zustand';
import { categories as categoriesApi } from '@/lib/api';
import { toStoreError } from './storeError';

/**
 * The store's state before any action has run. Exported so tests can reset
 * the store between cases with `useCategoriesStore.setState(initialCategoriesState, true)`.
 */
export const initialCategoriesState = {
  /** @type {object[]} `GET /categories/` rows (each with `product_count`). */
  items: [],
  /** @type {'idle'|'loading'|'success'|'error'} Status of the last `fetch()` call. */
  status: 'idle',
  /**
   * Normalized error from the last failed `fetch()` call. `message` is the
   * raw (English, untranslated) error text for logging only; pages must
   * render their own translated copy.
   * @type {{status: number|null, message: string}|null}
   */
  error: null
};

/**
 * Zustand store for the categories list, backed by `src/lib/api/categories.js`.
 */
export const useCategoriesStore = create((set, get) => ({
  ...initialCategoriesState,

  /** Load the categories list. */
  async fetch() {
    set({ status: 'loading', error: null });
    try {
      const items = await categoriesApi.list();
      set({ items, status: 'success', error: null });
    } catch (err) {
      console.error('Error fetching categories:', err);
      set({ status: 'error', error: toStoreError(err) });
    }
  },

  /**
   * Create a category, then refetch the list.
   * @param {object} data
   * @returns {Promise<object>} The created category.
   */
  async create(data) {
    const created = await categoriesApi.create(data);
    await get().fetch();
    return created;
  },

  /**
   * Update a category, then refetch the list.
   * @param {number|string} id
   * @param {object} data
   * @returns {Promise<object>} The updated category.
   */
  async update(id, data) {
    const updated = await categoriesApi.update(id, data);
    await get().fetch();
    return updated;
  },

  /**
   * Delete a category, then refetch the list. When the category is still
   * assigned to products, the backend responds 400 and `categoriesApi.remove`
   * throws an `ApiError` (with `.status === 400`); this is intentionally left
   * to propagate uncaught so callers can branch on it (e.g. show a specific
   * "cannot delete" message) instead of a generic failure toast.
   * @param {number|string} id
   */
  async remove(id) {
    await categoriesApi.remove(id);
    await get().fetch();
  }
}));
