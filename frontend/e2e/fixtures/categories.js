/**
 * `GET /categories/` fixtures (`backend/src/schemas/category.py`'s
 * `CategoryResponse`: a plain `Category` plus `product_count`).
 */

/**
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildCategory(overrides = {}) {
  return {
    id: 1,
    name: 'Electronics',
    color: '#3B82F6',
    product_count: 0,
    ...overrides
  };
}

/** One category still in use (by a product fixture) and one that is not. */
export const CATEGORIES_BASIC = [
  buildCategory({
    id: 1,
    name: 'Electronics',
    color: '#3B82F6',
    product_count: 1
  }),
  buildCategory({ id: 2, name: 'Books', color: '#22C55E', product_count: 0 })
];
