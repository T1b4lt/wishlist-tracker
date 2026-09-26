/**
 * Pure search, filter and sort logic for the dashboard's product list, plus
 * the (de)serialization of that state to URL query params. Kept free of
 * React so it can be unit tested on its own (see `productFilters.test.js`);
 * `useDashboardFilters` wires it to the URL and `ProductFilterBar` renders
 * the controls.
 *
 * @typedef {'all'|'in'|'out'} StockFilter
 * @typedef {'name_asc'|'price_asc'|'price_desc'|'change_asc'|'priority_desc'|'stock'|'checked_desc'} SortKey
 *
 * @typedef {object} ProductFilters
 * @property {string} query - Free-text search over product and store name.
 * @property {number[]} stores - Selected store ids (empty = any store).
 * @property {number[]} categories - Selected category ids (empty = any).
 * @property {string[]} priorities - Selected lowercase priorities (empty = any).
 * @property {StockFilter} stock
 * @property {number|null} minPrice - Inclusive lower bound on `current_price`.
 * @property {number|null} maxPrice - Inclusive upper bound on `current_price`.
 * @property {boolean} priceDrop - Only products whose `price_change_60d` is negative.
 * @property {boolean} atLowest - Only products at their lowest recent price.
 * @property {SortKey} sort
 */

import { isAtLowestPrice } from './dashboardSummary';

export const STOCK_FILTERS = ['all', 'in', 'out'];
export const PRIORITIES = ['high', 'medium', 'low'];
export const SORT_KEYS = [
  'name_asc',
  'price_asc',
  'price_desc',
  'change_asc',
  'priority_desc',
  'stock',
  'checked_desc'
];

/** @type {Readonly<ProductFilters>} */
export const DEFAULT_FILTERS = Object.freeze({
  query: '',
  stores: [],
  categories: [],
  priorities: [],
  stock: 'all',
  minPrice: null,
  maxPrice: null,
  priceDrop: false,
  atLowest: false,
  sort: 'name_asc'
});

const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Lowercases and strips diacritics so "Cámara" matches "camara".
 * @param {string|null|undefined} text
 * @returns {string}
 */
const normalizeText = (text) =>
  (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const normalizePriority = (priority) => (priority ?? '').toLowerCase();

/**
 * @param {object[]} products - Dashboard-summary rows.
 * @param {ProductFilters} filters
 * @returns {object[]} The products matching every active filter (AND), in
 *   their original order.
 */
export function filterProducts(products, filters) {
  const query = normalizeText(filters.query.trim());

  return products.filter((product) => {
    if (
      query &&
      !normalizeText(product.name).includes(query) &&
      !normalizeText(product.store_name).includes(query)
    ) {
      return false;
    }
    if (
      filters.stores.length > 0 &&
      !filters.stores.includes(product.store_id)
    ) {
      return false;
    }
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(product.category_id)
    ) {
      return false;
    }
    if (
      filters.priorities.length > 0 &&
      !filters.priorities.includes(normalizePriority(product.priority))
    ) {
      return false;
    }
    if (filters.stock === 'in' && product.is_in_stock !== true) return false;
    if (filters.stock === 'out' && product.is_in_stock !== false) return false;

    if (filters.minPrice !== null || filters.maxPrice !== null) {
      if (!isFiniteNumber(product.current_price)) return false;
      if (filters.minPrice !== null && product.current_price < filters.minPrice)
        return false;
      if (filters.maxPrice !== null && product.current_price > filters.maxPrice)
        return false;
    }
    if (
      filters.priceDrop &&
      !(
        isFiniteNumber(product.price_change_60d) && product.price_change_60d < 0
      )
    ) {
      return false;
    }
    if (filters.atLowest && !isAtLowestPrice(product)) return false;

    return true;
  });
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Compares two nullable numbers, always putting missing values last
 * regardless of direction.
 */
const compareNullable = (a, b, direction) => {
  const aMissing = !isFiniteNumber(a);
  const bMissing = !isFiniteNumber(b);
  if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
  return direction * (a - b);
};

const stockRank = (inStock) =>
  inStock === true ? 0 : inStock === false ? 1 : 2;

/** @type {Record<SortKey, (a: object, b: object) => number>} */
const COMPARATORS = {
  name_asc: () => 0,
  price_asc: (a, b) => compareNullable(a.current_price, b.current_price, 1),
  price_desc: (a, b) => compareNullable(a.current_price, b.current_price, -1),
  change_asc: (a, b) =>
    compareNullable(a.price_change_60d, b.price_change_60d, 1),
  priority_desc: (a, b) =>
    compareNullable(
      PRIORITY_RANK[normalizePriority(a.priority)],
      PRIORITY_RANK[normalizePriority(b.priority)],
      1
    ),
  stock: (a, b) => stockRank(a.is_in_stock) - stockRank(b.is_in_stock),
  checked_desc: (a, b) =>
    compareNullable(a.last_checked_at, b.last_checked_at, -1)
};

const compareNames = (a, b) =>
  (a.name ?? '').localeCompare(b.name ?? '', undefined, {
    sensitivity: 'base'
  });

/**
 * @param {object[]} products
 * @param {SortKey|string} sort - Unknown keys fall back to name order.
 * @returns {object[]} A new, sorted array. Ties are broken by name so the
 *   same product tracked in several stores stays grouped together.
 */
export function sortProducts(products, sort) {
  const comparator = COMPARATORS[sort] ?? COMPARATORS.name_asc;
  return [...products].sort((a, b) => comparator(a, b) || compareNames(a, b));
}

/**
 * @param {object[]} products
 * @param {ProductFilters} filters
 * @returns {object[]} The filtered, sorted products.
 */
export function applyProductFilters(products, filters) {
  return sortProducts(filterProducts(products, filters), filters.sort);
}

/**
 * @param {ProductFilters} filters
 * @returns {number} How many filters in the filter panel are active. The
 *   search query and the sort order are not counted, since they are always
 *   visible in the bar itself.
 */
export function countActiveFilters(filters) {
  return [
    filters.stores.length > 0,
    filters.categories.length > 0,
    filters.priorities.length > 0,
    filters.stock !== 'all',
    filters.minPrice !== null || filters.maxPrice !== null,
    filters.priceDrop,
    filters.atLowest
  ].filter(Boolean).length;
}

/**
 * @param {object[]} products
 * @returns {{
 *   stores: Array<{ id: number, name: string }>,
 *   categories: Array<{ id: number, name: string, color: string }>
 * }} The distinct stores and categories present in `products`, sorted by
 *   name, to populate the filter panel's options.
 */
export function getFilterOptions(products) {
  const stores = new Map();
  const categories = new Map();
  for (const product of products) {
    if (product.store_id != null && product.store_name) {
      stores.set(product.store_id, {
        id: product.store_id,
        name: product.store_name
      });
    }
    if (product.category_id != null) {
      categories.set(product.category_id, {
        id: product.category_id,
        name: product.category_name,
        color: product.category_color
      });
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  return {
    stores: [...stores.values()].sort(byName),
    categories: [...categories.values()].sort(byName)
  };
}

const parseIdList = (value) =>
  (value ?? '')
    .split(',')
    .filter((part) => /^\d+$/.test(part))
    .map(Number);

const parsePrice = (value) => {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

/**
 * Reads filters from URL query params, silently dropping invalid values so
 * a hand-edited or stale URL never breaks the dashboard.
 * @param {URLSearchParams} params
 * @returns {ProductFilters}
 */
export function parseFilters(params) {
  const stock = params.get('stock');
  const sort = params.get('sort');
  return {
    query: params.get('q') ?? '',
    stores: parseIdList(params.get('store')),
    categories: parseIdList(params.get('category')),
    priorities: (params.get('priority') ?? '')
      .split(',')
      .filter((priority) => PRIORITIES.includes(priority)),
    stock: STOCK_FILTERS.includes(stock) ? stock : DEFAULT_FILTERS.stock,
    minPrice: parsePrice(params.get('min')),
    maxPrice: parsePrice(params.get('max')),
    priceDrop: params.get('drop') === '1',
    atLowest: params.get('lowest') === '1',
    sort: SORT_KEYS.includes(sort) ? sort : DEFAULT_FILTERS.sort
  };
}

/**
 * Writes filters as URL query params, omitting every value that equals its
 * default so an unfiltered dashboard keeps a clean URL.
 * @param {ProductFilters} filters
 * @returns {string} A query string without the leading `?`.
 */
export function serializeFilters(filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.stores.length) params.set('store', filters.stores.join(','));
  if (filters.categories.length)
    params.set('category', filters.categories.join(','));
  if (filters.priorities.length)
    params.set('priority', filters.priorities.join(','));
  if (filters.stock !== DEFAULT_FILTERS.stock)
    params.set('stock', filters.stock);
  if (filters.minPrice !== null) params.set('min', String(filters.minPrice));
  if (filters.maxPrice !== null) params.set('max', String(filters.maxPrice));
  if (filters.priceDrop) params.set('drop', '1');
  if (filters.atLowest) params.set('lowest', '1');
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort);
  return params.toString();
}
